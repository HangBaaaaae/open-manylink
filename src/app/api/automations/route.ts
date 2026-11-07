import { NextRequest, NextResponse } from 'next/server';
import { readDb, writeDb } from '@/lib/db';
import { AutomationRule } from '@/types/automation';

export async function GET(req: NextRequest) {
  const db = readDb();
  const accountId = req.nextUrl.searchParams.get('accountId');
  const rules = accountId
    ? db.rules.filter((r) => r.accountId === accountId)
    : db.rules;
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = readDb();

    if (action === 'TOGGLE_ACTIVE') {
      const rule = db.rules.find((r) => r.id === body.ruleId);
      if (!rule) {
        return NextResponse.json(
          { ok: false, error: '해당 자동화 규칙을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      rule.isActive = !rule.isActive;
      rule.updatedAt = new Date().toISOString();
      writeDb(db);
      return NextResponse.json({ ok: true, rule, db });
    }

    if (action === 'DELETE_RULE') {
      db.rules = db.rules.filter((r) => r.id !== body.ruleId);
      db.trackedLinks = db.trackedLinks.filter((t) => t.ruleId !== body.ruleId);
      writeDb(db);
      return NextResponse.json({ ok: true, db });
    }

    if (action === 'SAVE_RULE') {
      const payload = body.rule as Partial<AutomationRule>;
      const existingIdx = db.rules.findIndex((r) => r.id === payload.id);

      const targetMedia = db.mediaList.find((m) => m.id === payload.targetMediaId);
      const targetMediaTitle =
        payload.targetMediaId === 'ALL'
          ? '전체 게시물 및 릴스 (상시 감지)'
          : targetMedia?.title || payload.targetMediaTitle || '선택된 게시물';

      const ruleId = payload.id || `rule-${Date.now()}`;
      const existingRule = existingIdx >= 0 ? db.rules[existingIdx] : null;

      const validAccId = db.accounts.some((a) => a.id === payload.accountId)
        ? payload.accountId!
        : db.accounts[0]?.id || 'acc-1';

      const savedRule: AutomationRule = {
        id: ruleId,
        accountId: validAccId,
        title: payload.title || '신규 댓글 자동 DM 캠페인',
        isActive: payload.isActive ?? true,
        triggerType: payload.triggerType || 'POST_COMMENT',
        targetMediaId: payload.targetMediaId || 'ALL',
        targetMediaTitle,
        keywords:
          payload.keywords && payload.keywords.length > 0
            ? payload.keywords
            : ['ㅇㅇ'],
        matchMode: payload.matchMode || 'FUZZY_CHOSEONG',
        commentReplyEnabled: payload.commentReplyEnabled ?? true,
        commentReplyTemplates:
          payload.commentReplyTemplates && payload.commentReplyTemplates.length > 0
            ? payload.commentReplyTemplates
            : [
                '안녕하세요! 요청하신 링크를 DM으로 보내드렸어요 😊 메시지함을 확인해주세요!',
                '방금 DM으로 안내 링크 발송 완료했습니다! 💌 확인 부탁드려요 ✨',
              ],
        cooldownMinutes: payload.cooldownMinutes ?? 1440,
        jitterDelayRangeSec: payload.jitterDelayRangeSec || [3, 10],
        requireFollow: payload.requireFollow ?? true,
        followPromptMessage:
          payload.followPromptMessage ||
          '안녕하세요 @{{username}}님! 팔로워 전용 혜택 링크입니다. 아래 버튼을 눌러 팔로우 여부를 확인해주세요 👇',
        followVerifyButtonText:
          payload.followVerifyButtonText || '✅ 팔로우 확인하고 링크 받기',
        unfollowedRetryMessage:
          payload.unfollowedRetryMessage ||
          '앗, 아직 팔로우가 확인되지 않았어요 😢 프로필 팔로우 후 아래 버튼을 다시 눌러주세요!',
        dmTemplateType: payload.dmTemplateType || 'SINGLE_BUTTON',
        dmBodyText:
          payload.dmBodyText ||
          '🎉 @{{username}}님 감사합니다! 요청하신 링크를 아래 버튼에서 바로 확인해보세요.',
        buttons: payload.buttons || [],
        carouselCards: payload.carouselCards || [],
        limitConfig: payload.limitConfig || {
          enabled: false,
          maxClaims: null,
          currentClaims: 0,
          expiresAt: null,
          closedMessage: '준비된 수량이 마감되었습니다.',
        },
        stats: existingRule?.stats || {
          triggerCount: 0,
          publicReplyCount: 0,
          initialDmSentCount: 0,
          followVerifiedCount: 0,
          finalDmSentCount: 0,
          totalLinkClicks: 0,
          cooldownBlockedCount: 0,
        },
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        db.rules[existingIdx] = savedRule;
      } else {
        db.rules.unshift(savedRule);
      }

      // 단축 링크 테이블 동기화
      for (const btn of savedRule.buttons) {
        const existingLink = db.trackedLinks.find(
          (t) => t.shortCode === btn.shortCode
        );
        if (existingLink) {
          existingLink.buttonLabel = btn.label;
          existingLink.targetUrl = btn.targetUrl;
        } else {
          db.trackedLinks.unshift({
            shortCode: btn.shortCode,
            ruleId: savedRule.id,
            accountId: savedRule.accountId,
            buttonLabel: btn.label,
            targetUrl: btn.targetUrl,
            utmSource: 'instagram_dm',
            utmMedium: 'auto_reply',
            utmCampaign: savedRule.id,
            clicks: btn.clicks || 0,
            lastClickedAt: null,
          });
        }
      }

      for (const card of savedRule.carouselCards) {
        const existingLink = db.trackedLinks.find(
          (t) => t.shortCode === card.shortCode
        );
        if (existingLink) {
          existingLink.buttonLabel = card.buttonLabel;
          existingLink.targetUrl = card.targetUrl;
        } else {
          db.trackedLinks.unshift({
            shortCode: card.shortCode,
            ruleId: savedRule.id,
            accountId: savedRule.accountId,
            buttonLabel: card.buttonLabel,
            targetUrl: card.targetUrl,
            utmSource: 'instagram_dm',
            utmMedium: 'carousel_dm',
            utmCampaign: savedRule.id,
            clicks: card.clicks || 0,
            lastClickedAt: null,
          });
        }
      }

      writeDb(db);
      return NextResponse.json({ ok: true, rule: savedRule, db });
    }

    return NextResponse.json(
      { ok: false, error: '유효하지 않은 action입니다.' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
