import { NextRequest, NextResponse } from 'next/server';
import { recordShortLinkClick } from '@/lib/automation-engine';

/**
 * 단축 링크 클릭 집계 및 리다이렉트 엔드포인트 (/r/[code])
 * - ?preview=1 파라미터가 있으면 리다이렉트 대신 JSON 클릭 통계 반환
 * - 일반 접속 시 클릭 카운트 +1 후 UTM 파라미터가 포함된 목적지 URL로 307 리다이렉트
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const eventId = req.nextUrl.searchParams.get('eventId') || undefined;
  const isPreview = req.nextUrl.searchParams.get('preview') === '1';

  const result = recordShortLinkClick({
    shortCode: code,
    eventId,
  });

  if (isPreview) {
    return NextResponse.json({
      ok: true,
      shortCode: result.shortCode,
      redirectUrl: result.redirectUrl,
      totalClicks: result.totalClicks,
      ruleTitle: result.ruleTitle,
      buttonLabel: result.buttonLabel,
    });
  }

  return NextResponse.redirect(result.redirectUrl, { status: 307 });
}
