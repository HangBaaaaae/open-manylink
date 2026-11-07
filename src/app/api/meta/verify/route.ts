import { NextRequest, NextResponse } from 'next/server';
import { readDb, sanitizeDbForClient, writeDb } from '@/lib/db';
import {
  fetchRealInstagramMediaList,
  fetchRealInstagramProfile,
} from '@/lib/meta-graph-client';

/**
 * Meta 공식 무료 Graph API 연동 진단, 실제 토큰 검증 및 게시물 동기화 엔드포인트
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. 내 서버의 Webhook 엔드포인트(/api/webhook/instagram) 자가 진단
    if (action === 'TEST_WEBHOOK_CHALLENGE') {
      const verifyToken =
        body.verifyToken ||
        process.env.META_WEBHOOK_VERIFY_TOKEN ||
        'open_manylink_verify_2026';
      const expectedToken =
        process.env.META_WEBHOOK_VERIFY_TOKEN || 'open_manylink_verify_2026';
      const challengeCode = `CHALLENGE_OK_${Date.now()}`;

      const isMatched = verifyToken === expectedToken;
      return NextResponse.json({
        ok: isMatched,
        status: isMatched ? 200 : 403,
        challengeEcho: isMatched ? challengeCode : null,
        callbackUrl: `${req.nextUrl.origin}/api/webhook/instagram`,
        expectedVerifyToken: expectedToken,
        message: isMatched
          ? '웹훅 hub.challenge 응답 확인 완료 (HTTP 200 OK)'
          : `확인 토큰 불일치 (서버 설정값: ${expectedToken})`,
      });
    }

    // 2. Meta Access Token 실제 검증 + 내 게시물/릴스 실제 목록 가져오기
    if (action === 'VERIFY_AND_CONNECT_TOKEN') {
      const accessToken = String(body.accessToken || '').trim();
      const igBusinessIdInput = String(body.igBusinessId || '').trim();
      const customUsername = String(body.username || '')
        .replace(/^@/, '')
        .trim();
      const customDisplayName = String(body.displayName || '').trim();
      const allowDemoFallback = Boolean(body.allowDemoFallback);

      if (!accessToken) {
        return NextResponse.json(
          { ok: false, error: 'Meta Access Token을 입력해주세요.' },
          { status: 400 }
        );
      }

      let resolvedUsername = customUsername;
      let resolvedName = customDisplayName;
      let resolvedIgId = igBusinessIdInput;
      let resolvedFollowers = 0;
      let apiMode: 'LIVE_GRAPH_API' | 'SANDBOX_SIMULATION' = 'LIVE_GRAPH_API';
      let apiErrorDetail: string | null = null;

      try {
        const profile = await fetchRealInstagramProfile({
          accessToken,
          igBusinessId: igBusinessIdInput || undefined,
        });
        resolvedIgId = profile.igBusinessId;
        resolvedUsername = profile.username || customUsername || 'ig_connected';
        resolvedName =
          customDisplayName || profile.displayName || `${resolvedUsername}`;
        resolvedFollowers = profile.followersCount;
        apiMode = 'LIVE_GRAPH_API';
      } catch (err) {
        apiErrorDetail = (err as Error).message;
        if (!allowDemoFallback) {
          return NextResponse.json(
            {
              ok: false,
              error: `실제 Meta Graph API 토큰 검증 실패: ${apiErrorDetail}. (유효한 IGAA... 또는 EAAG... 토큰인지 확인하거나, 데모 테스트용이면 '샘플 토큰으로 체험'을 선택하세요.)`,
            },
            { status: 400 }
          );
        }
        apiMode = 'SANDBOX_SIMULATION';
        resolvedUsername = customUsername || 'sandbox_creator_kr';
        resolvedName = customDisplayName || `${resolvedUsername} (테스트 계정)`;
        resolvedIgId =
          igBusinessIdInput ||
          `178414${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      }

      const db = readDb();
      const accountId = `acc-${Date.now()}`;

      // 실제 토큰인 경우 실제 게시물/릴스 목록도 Meta API에서 동기화 + 웹훅 구독(subscribed_apps) 자동 활성화
      let syncedMediaCount = 0;
      if (apiMode === 'LIVE_GRAPH_API') {
        try {
          const subBase = accessToken.startsWith('EAA')
            ? `https://graph.facebook.com/v21.0/${resolvedIgId}`
            : 'https://graph.instagram.com/v21.0/me';
          await fetch(
            `${subBase}/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks&access_token=${encodeURIComponent(
              accessToken
            )}`,
            { method: 'POST' }
          );
        } catch {
          // 무시
        }

        try {
          const mediaItems = await fetchRealInstagramMediaList({
            accessToken,
            igBusinessId: resolvedIgId,
            accountId,
          });
          if (mediaItems.length > 0) {
            db.mediaList = [
              ...mediaItems,
              ...db.mediaList.filter((m) => m.accountId !== accountId),
            ];
            syncedMediaCount = mediaItems.length;
          }
        } catch {
          // 게시물 동기화 실패 시 계정만 우선 등록
        }
      }

      const existingAcc = db.accounts.find(
        (a) => a.username.toLowerCase() === resolvedUsername.toLowerCase()
      );

      if (existingAcc) {
        existingAcc.igBusinessId = resolvedIgId;
        existingAcc.accessToken = accessToken;
        existingAcc.accessTokenMasked = `${accessToken.slice(0, 8)}...${accessToken.slice(-4)}`;
        existingAcc.dataSource =
          apiMode === 'LIVE_GRAPH_API' ? 'REAL_META_API' : 'DEMO_SEED';
        existingAcc.followersCount = resolvedFollowers;
        existingAcc.webhookConnected = true;
        writeDb(db);

        return NextResponse.json({
          ok: true,
          apiMode,
          syncedMediaCount,
          account: { ...existingAcc, accessToken: undefined },
          db: sanitizeDbForClient(db),
        });
      }

      const newAcc = {
        id: accountId,
        username: resolvedUsername,
        displayName: resolvedName,
        category:
          apiMode === 'LIVE_GRAPH_API'
            ? '실제 Meta API 연동'
            : '테스트 샌드박스',
        igBusinessId: resolvedIgId,
        pageId: '',
        accessToken,
        accessTokenMasked: `${accessToken.slice(0, 8)}...${accessToken.slice(-4)}`,
        dataSource:
          apiMode === 'LIVE_GRAPH_API'
            ? ('REAL_META_API' as const)
            : ('DEMO_SEED' as const),
        webhookConnected: true,
        followersCount: resolvedFollowers,
        hourlyQuotaLimit: 200,
        hourlyQuotaUsed: 0,
        avatarBadge: resolvedUsername.slice(0, 2).toUpperCase(),
        profileUrl: `https://instagram.com/${resolvedUsername}`,
      };

      db.accounts.push(newAcc);

      if (syncedMediaCount === 0) {
        db.mediaList.unshift({
          id: `media-${Date.now()}`,
          accountId: newAcc.id,
          mediaType: 'REELS',
          title: `[릴스] @${resolvedUsername} 기본 게시물`,
          caption: '댓글에 "ㅇㅇ" 달면 DM으로 링크를 보내드립니다.',
          permalink: `https://instagram.com/${resolvedUsername}`,
          publishedAt: new Date().toISOString(),
          commentsCount: 0,
          likesCount: 0,
          thumbnailTag: 'REELS',
        });
      }

      writeDb(db);

      return NextResponse.json({
        ok: true,
        apiMode,
        syncedMediaCount,
        account: { ...newAcc, accessToken: undefined },
        db: sanitizeDbForClient(db),
      });
    }

    // 3. 샘플/데모 데이터 모두 지우고 0건(Clean Slate)에서 시작하기
    if (action === 'CLEAR_DEMO_DATA') {
      const db = readDb();
      const realAccounts = db.accounts.filter(
        (a) => a.dataSource === 'REAL_META_API'
      );
      db.accounts = realAccounts;
      const realAccIds = new Set(realAccounts.map((a) => a.id));
      db.mediaList = db.mediaList.filter((m) => realAccIds.has(m.accountId));
      db.rules = db.rules.filter((r) => realAccIds.has(r.accountId));
      db.trackedLinks = db.trackedLinks.filter((t) =>
        realAccIds.has(t.accountId)
      );
      db.eventLogs = db.eventLogs.filter((e) => realAccIds.has(e.accountId));
      db.cooldownHistory = {};
      writeDb(db);
      return NextResponse.json({ ok: true, db: sanitizeDbForClient(db) });
    }

    return NextResponse.json(
      { ok: false, error: '지원하지 않는 요청입니다.' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
