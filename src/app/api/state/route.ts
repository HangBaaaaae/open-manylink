import { NextRequest, NextResponse } from 'next/server';
import { readDb, resetDbToSeed, sanitizeDbForClient, writeDb } from '@/lib/db';
import { InstagramAccount } from '@/types/automation';

export async function GET() {
  const db = readDb();
  return NextResponse.json(sanitizeDbForClient(db));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'RESET_SEED') {
      const db = resetDbToSeed();
      return NextResponse.json({ ok: true, db: sanitizeDbForClient(db) });
    }

    if (action === 'ADD_ACCOUNT') {
      const db = readDb();
      const username = String(body.username || '')
        .replace(/^@/, '')
        .trim();
      if (!username) {
        return NextResponse.json(
          { ok: false, error: '인스타그램 아이디(@username)를 입력해주세요.' },
          { status: 400 }
        );
      }

      const newAcc: InstagramAccount = {
        id: `acc-${Date.now()}`,
        username,
        displayName: body.displayName || `${username} 공식 계정`,
        category: body.category || '크리에이터 · 브랜드',
        igBusinessId: body.igBusinessId || `178414${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        pageId: body.pageId || `10${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        accessTokenMasked: body.accessToken
          ? `${String(body.accessToken).slice(0, 10)}... (Meta Graph API v21.0)`
          : 'EAAGm0PX4ZCps...FreeAPI (Meta Graph API v21.0)',
        webhookConnected: true,
        followersCount: Number(body.followersCount) || 12500,
        hourlyQuotaLimit: 200,
        hourlyQuotaUsed: 0,
        avatarBadge: username.slice(0, 2).toUpperCase(),
        profileUrl: `https://instagram.com/${username}`,
      };

      db.accounts.push(newAcc);
      db.mediaList.unshift({
        id: `media-${Date.now()}`,
        accountId: newAcc.id,
        mediaType: 'REELS',
        title: `[릴스] @${username} 신규 업로드 릴스 게시물`,
        caption: '댓글에 "ㅇㅇ" 달아주시면 안내 링크를 DM으로 보내드릴게요!',
        permalink: `https://instagram.com/p/New_${username}`,
        publishedAt: new Date().toISOString(),
        commentsCount: 12,
        likesCount: 145,
        thumbnailTag: 'REELS · 신규 연동',
      });

      writeDb(db);
      return NextResponse.json({ ok: true, account: newAcc, db });
    }

    if (action === 'RESET_QUOTA') {
      const db = readDb();
      const acc = db.accounts.find((a) => a.id === body.accountId);
      if (acc) {
        acc.hourlyQuotaUsed = 0;
        writeDb(db);
      }
      return NextResponse.json({ ok: true, db });
    }

    return NextResponse.json({ ok: false, error: '알 수 없는 요청입니다.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
