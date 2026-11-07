import { NextRequest, NextResponse } from 'next/server';
import { readDb, writeDb } from '@/lib/db';
import {
  fetchRealInstagramMediaList,
  fetchRealInstagramProfile,
} from '@/lib/meta-graph-client';

/**
 * 매니챗·인포크링크와 동일한 '인스타그램 로그인(OAuth 2.0)' 자동 콜백 엔드포인트
 * 사용자가 [Instagram으로 로그인] 버튼을 눌러 인스타그램에서 [허용]을 클릭하면
 * 이 주소(/api/auth/instagram/callback?code=...)로 돌아오며,
 * 서버가 자동으로 1) 단기 토큰 발급 -> 2) 60일 장기 토큰 교환 -> 3) 계정 및 게시물 등록을 수행합니다.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/auth/instagram/callback`;

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/?oauth_error=${encodeURIComponent(
        error || '인스타그램 로그인이 취소되었습니다.'
      )}`
    );
  }

  const clientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
  const clientSecret =
    process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/?oauth_error=${encodeURIComponent(
        '.env 파일에 INSTAGRAM_APP_ID 와 INSTAGRAM_APP_SECRET 이 설정되지 않았습니다.'
      )}`
    );
  }

  try {
    // 1단계: 인가 코드(code)로 단기 액세스 토큰 교환
    const formData = new URLSearchParams();
    formData.append('client_id', clientId);
    formData.append('client_secret', clientSecret);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', redirectUri);
    formData.append('code', code.replace(/#_$/, ''));

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(
        tokenData.error_message || '인스타그램 OAuth 단기 토큰 발급 실패'
      );
    }

    let finalToken = String(tokenData.access_token);

    // 2단계: 60일 장기 토큰(Long-Lived Token)으로 자동 업그레이드
    try {
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
          clientSecret
        )}&access_token=${encodeURIComponent(finalToken)}`
      );
      const longData = await longRes.json();
      if (longRes.ok && longData.access_token) {
        finalToken = String(longData.access_token);
      }
    } catch {
      // 장기 토큰 교환 실패 시 단기 토큰 유지
    }

    // 3단계: 연동된 인스타그램 프로필 및 게시물 자동 조회·저장
    const profile = await fetchRealInstagramProfile({
      accessToken: finalToken,
    });

    const db = readDb();
    const accountId = `acc-${Date.now()}`;

    const existingAcc = db.accounts.find(
      (a) => a.username.toLowerCase() === profile.username.toLowerCase()
    );

    if (existingAcc) {
      existingAcc.igBusinessId = profile.igBusinessId;
      existingAcc.accessToken = finalToken;
      existingAcc.accessTokenMasked = `${finalToken.slice(0, 8)}...${finalToken.slice(-4)}`;
      existingAcc.dataSource = 'REAL_META_API';
      existingAcc.followersCount = profile.followersCount;
      existingAcc.webhookConnected = true;
    } else {
      db.accounts.push({
        id: accountId,
        username: profile.username,
        displayName: profile.displayName,
        category: 'Instagram 로그인 연동',
        igBusinessId: profile.igBusinessId,
        pageId: '',
        accessToken: finalToken,
        accessTokenMasked: `${finalToken.slice(0, 8)}...${finalToken.slice(-4)}`,
        dataSource: 'REAL_META_API',
        webhookConnected: true,
        followersCount: profile.followersCount,
        hourlyQuotaLimit: 200,
        hourlyQuotaUsed: 0,
        avatarBadge: profile.username.slice(0, 2).toUpperCase(),
        profileUrl: `https://instagram.com/${profile.username}`,
      });
    }

    try {
      const targetAccId = existingAcc ? existingAcc.id : accountId;
      const mediaItems = await fetchRealInstagramMediaList({
        accessToken: finalToken,
        igBusinessId: profile.igBusinessId,
        accountId: targetAccId,
      });
      if (mediaItems.length > 0) {
        db.mediaList = [
          ...mediaItems,
          ...db.mediaList.filter((m) => m.accountId !== targetAccId),
        ];
      }
    } catch {
      // 게시물 조회 실패 시 무시
    }

    writeDb(db);
    return NextResponse.redirect(
      `${baseUrl}/?oauth_success=${encodeURIComponent(profile.username)}`
    );
  } catch (err) {
    return NextResponse.redirect(
      `${baseUrl}/?oauth_error=${encodeURIComponent((err as Error).message)}`
    );
  }
}
