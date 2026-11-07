import { NextRequest, NextResponse } from 'next/server';
import {
  processIncomingTrigger,
  recordShortLinkClick,
  verifyFollowAndSendFinalDm,
} from '@/lib/automation-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const baseUrl = req.nextUrl.origin;

    if (action === 'TRIGGER_COMMENT') {
      const result = processIncomingTrigger({
        accountId: body.accountId,
        mediaId: body.mediaId,
        triggerType: body.triggerType || 'POST_COMMENT',
        igUsername: body.igUsername || 'insta_tester_kr',
        inputText: body.inputText || 'ㅇㅇ',
        isFollower: Boolean(body.isFollower),
        bypassCooldown: Boolean(body.bypassCooldown),
        baseUrl,
      });
      return NextResponse.json(result);
    }

    if (action === 'VERIFY_FOLLOW_POSTBACK') {
      const result = verifyFollowAndSendFinalDm({
        eventId: body.eventId,
        ruleId: body.ruleId,
        isFollowerNow: Boolean(body.isFollowerNow),
        baseUrl,
      });
      return NextResponse.json(result);
    }

    if (action === 'CLICK_SHORT_LINK') {
      const result = recordShortLinkClick({
        shortCode: body.shortCode,
        eventId: body.eventId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { ok: false, error: '지원하지 않는 시뮬레이터 액션입니다.' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
