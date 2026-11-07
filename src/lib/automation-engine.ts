import {
  AutomationEventLog,
  AutomationRule,
  DatabaseSchema,
  KeywordMatchMode,
  TriggerType,
} from '@/types/automation';
import { readDb, writeDb } from '@/lib/db';

const CHOSEONG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/**
 * 한글 문자열에서 초성만 추출 (예: "공구해요" -> "ㄱㄱㅎㅇ")
 */
export function extractChoseong(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 0xac00;
    if (code > -1 && code < 11172) {
      const choseongIdx = Math.floor(code / 588);
      result += CHOSEONG_LIST[choseongIdx];
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * 공백·특수문자 제거 및 반복 자모 축약 (예: "ㅇ ㅇ ㅇ!!" -> "ㅇㅇ")
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[!?.~❤️🔥✨🙌💌😊🤍]/g, '')
    .replace(/([ㄱ-ㅎㅏ-ㅣ])\1{2,}/g, '$1$1');
}

/**
 * 키워드 매칭 엔진 (정확 일치 / 포함 일치 / 초성·유사어·공백무시 매칭)
 */
export function matchKeyword(
  inputText: string,
  keywords: string[],
  mode: KeywordMatchMode
): { matched: boolean; keyword: string | null } {
  const rawTrimmed = inputText.trim().toLowerCase();
  const normInput = normalizeText(inputText);
  const choseongInput = extractChoseong(normInput);

  for (const kw of keywords) {
    const rawKw = kw.trim().toLowerCase();
    const normKw = normalizeText(kw);
    if (!normKw) continue;

    if (mode === 'EXACT') {
      if (rawTrimmed === rawKw || normInput === normKw) {
        return { matched: true, keyword: kw };
      }
    } else if (mode === 'CONTAINS') {
      if (rawTrimmed.includes(rawKw) || normInput.includes(normKw)) {
        return { matched: true, keyword: kw };
      }
    } else if (mode === 'FUZZY_CHOSEONG') {
      const choseongKw = extractChoseong(normKw);
      if (
        rawTrimmed.includes(rawKw) ||
        normInput.includes(normKw) ||
        (choseongKw.length >= 2 && choseongInput.includes(choseongKw))
      ) {
        return { matched: true, keyword: kw };
      }
    }
  }

  return { matched: false, keyword: null };
}

/**
 * 스팸 필터 방지용 랜덤 댓글 답글 선택기
 */
export function pickRandomCommentReply(
  templates: string[],
  igUsername: string
): string | null {
  if (!templates || templates.length === 0) return null;
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx].replace(/\{\{username\}\}/g, igUsername);
}

/**
 * 본문 템플릿 변수 치환
 */
export function formatDmText(template: string, igUsername: string): string {
  return template.replace(/\{\{username\}\}/g, igUsername);
}

/**
 * Meta 공식 Graph API v21.0 요청 페이로드 빌더 (무료 공식 API 규격)
 */
export function buildMetaApiPayloads(params: {
  igBusinessId: string;
  commentId?: string;
  igScopedUserId?: string;
  igUsername: string;
  rule: AutomationRule;
  baseUrl: string;
  eventId: string;
}) {
  const { igBusinessId, commentId, igScopedUserId, igUsername, rule, baseUrl, eventId } =
    params;

  // 1. 대댓글 자동 달기: POST /{comment-id}/replies
  const commentReplyPayload = commentId
    ? {
        endpoint: `POST https://graph.instagram.com/v21.0/${commentId}/replies`,
        body: {
          message:
            pickRandomCommentReply(rule.commentReplyTemplates, igUsername) ||
            'DM을 확인해주세요!',
        },
      }
    : null;

  // 2. 1차 팔로우 유도 Private Reply DM: POST /{ig-user-id}/messages
  const followGateDmPayload = {
    endpoint: `POST https://graph.instagram.com/v21.0/${igBusinessId}/messages`,
    body: {
      recipient: commentId ? { comment_id: commentId } : { id: igScopedUserId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: formatDmText(rule.followPromptMessage, igUsername),
            buttons: [
              {
                type: 'postback',
                title: rule.followVerifyButtonText || '✅ 팔로우 확인하고 링크 받기',
                payload: `VERIFY_FOLLOW:${rule.id}:${eventId}`,
              },
            ],
          },
        },
      },
    },
  };

  // 3. 팔로우 여부 실시간 조회: GET /{IGSID}?fields=name,username,is_user_follow_business
  const followCheckEndpoint = `GET https://graph.instagram.com/v21.0/${
    igScopedUserId || 'IGSID_USER'
  }?fields=name,username,is_user_follow_business`;

  // 4. 최종 혜택 DM (단일 버튼 카드 또는 멀티 카드 캐러셀 Generic Template)
  const finalDmPayload =
    rule.dmTemplateType === 'CAROUSEL' && rule.carouselCards.length > 0
      ? {
          endpoint: `POST https://graph.instagram.com/v21.0/${igBusinessId}/messages`,
          body: {
            recipient: { id: igScopedUserId || 'IGSID_USER' },
            message: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'generic',
                  elements: rule.carouselCards.map((card) => ({
                    title: `[${card.badgeText}] ${card.title}`,
                    subtitle: `${card.subtitle}${card.priceText ? ` | ${card.priceText}` : ''}`,
                    buttons: [
                      {
                        type: 'web_url',
                        url: `${baseUrl}/r/${card.shortCode}`,
                        title: card.buttonLabel,
                      },
                    ],
                  })),
                },
              },
            },
          },
        }
      : {
          endpoint: `POST https://graph.instagram.com/v21.0/${igBusinessId}/messages`,
          body: {
            recipient: commentId && !rule.requireFollow
              ? { comment_id: commentId }
              : { id: igScopedUserId || 'IGSID_USER' },
            message: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'button',
                  text: formatDmText(rule.dmBodyText, igUsername),
                  buttons: rule.buttons.slice(0, 3).map((btn) => ({
                    type: 'web_url',
                    url: `${baseUrl}/r/${btn.shortCode}`,
                    title: btn.label,
                  })),
                },
              },
            },
          },
        };

  return {
    commentReplyPayload,
    followGateDmPayload,
    followCheckEndpoint,
    finalDmPayload,
  };
}

export interface TriggerSimulationInput {
  accountId: string;
  mediaId: string;
  triggerType: TriggerType;
  igUsername: string;
  inputText: string;
  isFollower: boolean;
  bypassCooldown?: boolean;
  baseUrl?: string;
}

export interface TriggerSimulationResult {
  matched: boolean;
  reason?: string;
  rule?: AutomationRule;
  eventLog?: AutomationEventLog;
  publicReplyText?: string | null;
  requiresFollowStep?: boolean;
  initialFollowPromptText?: string;
  followVerifyButtonText?: string;
  finalDmBodyText?: string;
  jitterDelayAppliedSec?: number;
  metaApiPayloads?: ReturnType<typeof buildMetaApiPayloads>;
  db: DatabaseSchema;
}

/**
 * 1단계: 댓글 또는 스토리 답장 유입 시 자동화 규칙 매칭 및 실행
 */
export function processIncomingTrigger(
  input: TriggerSimulationInput
): TriggerSimulationResult {
  const db = readDb();
  const baseUrl = input.baseUrl || 'http://localhost:3000';

  const account = db.accounts.find((a) => a.id === input.accountId);
  if (!account) {
    return { matched: false, reason: '연결된 인스타그램 계정을 찾을 수 없습니다.', db };
  }

  // 계정의 활성화된 규칙 중 미디어 및 트리거 타입이 일치하는 규칙 탐색
  const candidateRules = db.rules.filter(
    (r) =>
      r.accountId === input.accountId &&
      r.isActive &&
      (r.targetMediaId === 'ALL' || r.targetMediaId === input.mediaId) &&
      (r.triggerType === 'ALL_MEDIA_COMMENT' || r.triggerType === input.triggerType)
  );

  let matchedRule: AutomationRule | undefined;
  let matchedKeyword: string | null = null;

  for (const rule of candidateRules) {
    const res = matchKeyword(input.inputText, rule.keywords, rule.matchMode);
    if (res.matched && res.keyword) {
      matchedRule = rule;
      matchedKeyword = res.keyword;
      break;
    }
  }

  if (!matchedRule || !matchedKeyword) {
    return {
      matched: false,
      reason: '입력된 댓글/메시지에 매칭되는 활성 키워드 규칙이 없습니다.',
      db,
    };
  }

  // 트리거 감지 카운트 증가
  matchedRule.stats.triggerCount += 1;

  // 시간당 무료 API 쿼터 체크 (기본 200건/시간)
  if (account.hourlyQuotaUsed >= account.hourlyQuotaLimit) {
    writeDb(db);
    return {
      matched: false,
      reason: `Meta 무료 API 시간당 호출 한도(${account.hourlyQuotaLimit}건/시간)에 도달하여 안전 큐에 대기 중입니다.`,
      db,
    };
  }

  // 동일 유저 중복 발송 쿨다운 체크
  const cooldownKey = `${matchedRule.id}:${input.igUsername.toLowerCase()}`;
  const lastTriggeredIso = db.cooldownHistory[cooldownKey];
  if (!input.bypassCooldown && lastTriggeredIso && matchedRule.cooldownMinutes > 0) {
    const elapsedMs = Date.now() - new Date(lastTriggeredIso).getTime();
    const cooldownMs = matchedRule.cooldownMinutes * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      matchedRule.stats.cooldownBlockedCount += 1;
      const blockedLog: AutomationEventLog = {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toISOString(),
        accountId: account.id,
        ruleId: matchedRule.id,
        ruleTitle: matchedRule.title,
        igUsername: input.igUsername,
        triggerType: input.triggerType,
        inputText: input.inputText,
        matchedKeyword,
        publicReplyText: null,
        isFollower: input.isFollower,
        status: 'COOLDOWN_SKIPPED',
        dmSentPreview: `[중복 방지 쿨다운 작동] 동일 유저(${input.igUsername}) 중복 댓글 발송 생략`,
        shortCodeClicked: null,
      };
      db.eventLogs.unshift(blockedLog);
      writeDb(db);
      return {
        matched: true,
        reason: '동일 유저 중복 발송 방지(쿨다운)가 작동하여 중복 DM을 생략했습니다.',
        rule: matchedRule,
        eventLog: blockedLog,
        db,
      };
    }
  }

  // 선착순 수량 / 마감 기한 체크
  if (matchedRule.limitConfig.enabled) {
    const isMaxReached =
      matchedRule.limitConfig.maxClaims !== null &&
      matchedRule.limitConfig.currentClaims >= matchedRule.limitConfig.maxClaims;
    const isExpired =
      matchedRule.limitConfig.expiresAt !== null &&
      new Date(matchedRule.limitConfig.expiresAt).getTime() < Date.now();

    if (isMaxReached || isExpired) {
      const closedLog: AutomationEventLog = {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toISOString(),
        accountId: account.id,
        ruleId: matchedRule.id,
        ruleTitle: matchedRule.title,
        igUsername: input.igUsername,
        triggerType: input.triggerType,
        inputText: input.inputText,
        matchedKeyword,
        publicReplyText: null,
        isFollower: input.isFollower,
        status: 'LIMIT_CLOSED',
        dmSentPreview: matchedRule.limitConfig.closedMessage,
        shortCodeClicked: null,
      };
      account.hourlyQuotaUsed += 1;
      db.eventLogs.unshift(closedLog);
      writeDb(db);
      return {
        matched: true,
        reason: '선착순 수량 또는 마감 기한이 종료되어 마감 안내 DM을 발송했습니다.',
        rule: matchedRule,
        eventLog: closedLog,
        finalDmBodyText: matchedRule.limitConfig.closedMessage,
        db,
      };
    }
  }

  // 랜덤 대댓글 생성 (게시물 댓글 트리거인 경우)
  let publicReplyText: string | null = null;
  if (matchedRule.commentReplyEnabled && input.triggerType === 'POST_COMMENT') {
    publicReplyText = pickRandomCommentReply(
      matchedRule.commentReplyTemplates,
      input.igUsername
    );
    if (publicReplyText) {
      matchedRule.stats.publicReplyCount += 1;
      account.hourlyQuotaUsed += 1;
    }
  }

  // 랜덤 딜레이 계산
  const [minSec, maxSec] = matchedRule.jitterDelayRangeSec;
  const jitterDelayAppliedSec =
    Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;

  const eventId = `evt-${Date.now()}`;
  const metaApiPayloads = buildMetaApiPayloads({
    igBusinessId: account.igBusinessId,
    commentId: `cmt_${Date.now()}`,
    igScopedUserId: `igsid_${input.igUsername}`,
    igUsername: input.igUsername,
    rule: matchedRule,
    baseUrl,
    eventId,
  });

  db.cooldownHistory[cooldownKey] = new Date().toISOString();

  // Case A: 팔로우 확인 뒤 발송 (Meta 공식 2-Step 플로우)
  if (matchedRule.requireFollow) {
    matchedRule.stats.initialDmSentCount += 1;
    account.hourlyQuotaUsed += 1;

    const initialPrompt = formatDmText(
      matchedRule.followPromptMessage,
      input.igUsername
    );

    const newLog: AutomationEventLog = {
      id: eventId,
      timestamp: new Date().toISOString(),
      accountId: account.id,
      ruleId: matchedRule.id,
      ruleTitle: matchedRule.title,
      igUsername: input.igUsername,
      triggerType: input.triggerType,
      inputText: input.inputText,
      matchedKeyword,
      publicReplyText,
      isFollower: input.isFollower,
      status: 'AWAITING_FOLLOW_CLICK',
      dmSentPreview: initialPrompt,
      shortCodeClicked: null,
    };

    db.eventLogs.unshift(newLog);
    writeDb(db);

    return {
      matched: true,
      rule: matchedRule,
      eventLog: newLog,
      publicReplyText,
      requiresFollowStep: true,
      initialFollowPromptText: initialPrompt,
      followVerifyButtonText: matchedRule.followVerifyButtonText,
      jitterDelayAppliedSec,
      metaApiPayloads,
      db,
    };
  }

  // Case B: 팔로우 확인 없이 즉시 최종 링크 DM 발송
  matchedRule.stats.initialDmSentCount += 1;
  matchedRule.stats.followVerifiedCount += 1;
  matchedRule.stats.finalDmSentCount += 1;
  if (matchedRule.limitConfig.enabled) {
    matchedRule.limitConfig.currentClaims += 1;
  }
  account.hourlyQuotaUsed += 1;

  const finalDmBody = formatDmText(matchedRule.dmBodyText, input.igUsername);

  const newLog: AutomationEventLog = {
    id: eventId,
    timestamp: new Date().toISOString(),
    accountId: account.id,
    ruleId: matchedRule.id,
    ruleTitle: matchedRule.title,
    igUsername: input.igUsername,
    triggerType: input.triggerType,
    inputText: input.inputText,
    matchedKeyword,
    publicReplyText,
    isFollower: input.isFollower,
    status: 'DM_SENT',
    dmSentPreview: finalDmBody,
    shortCodeClicked: null,
  };

  db.eventLogs.unshift(newLog);
  writeDb(db);

  return {
    matched: true,
    rule: matchedRule,
    eventLog: newLog,
    publicReplyText,
    requiresFollowStep: false,
    finalDmBodyText: finalDmBody,
    jitterDelayAppliedSec,
    metaApiPayloads,
    db,
  };
}

/**
 * 2단계: 유저가 1차 DM의 [팔로우 확인하고 링크 받기] 포스트백 버튼을 눌렀을 때 실행
 */
export function verifyFollowAndSendFinalDm(params: {
  eventId: string;
  ruleId: string;
  isFollowerNow: boolean;
  baseUrl?: string;
}): {
  verified: boolean;
  messageText: string;
  rule?: AutomationRule;
  eventLog?: AutomationEventLog;
  metaApiPayloads?: ReturnType<typeof buildMetaApiPayloads>;
  db: DatabaseSchema;
} {
  const db = readDb();
  const baseUrl = params.baseUrl || 'http://localhost:3000';

  const rule = db.rules.find((r) => r.id === params.ruleId);
  const eventLog = db.eventLogs.find((e) => e.id === params.eventId);

  if (!rule || !eventLog) {
    return {
      verified: false,
      messageText: '해당 자동화 이벤트 또는 규칙을 찾을 수 없습니다.',
      db,
    };
  }

  const account = db.accounts.find((a) => a.id === rule.accountId);
  if (account) {
    account.hourlyQuotaUsed = Math.min(
      account.hourlyQuotaLimit,
      account.hourlyQuotaUsed + 1
    );
  }

  eventLog.isFollower = params.isFollowerNow;

  const metaApiPayloads = buildMetaApiPayloads({
    igBusinessId: account?.igBusinessId || '17841400000',
    igScopedUserId: `igsid_${eventLog.igUsername}`,
    igUsername: eventLog.igUsername,
    rule,
    baseUrl,
    eventId: eventLog.id,
  });

  // 미팔로워인 경우 -> 팔로우 요청 안내 및 프로필 버튼 재발송
  if (!params.isFollowerNow) {
    eventLog.status = 'FOLLOW_FAILED_RETRY';
    const retryMsg =
      rule.unfollowedRetryMessage ||
      '앗, 아직 팔로우가 확인되지 않았어요 😢 프로필 팔로우 후 아래 버튼을 다시 눌러주세요!';
    eventLog.dmSentPreview = retryMsg;
    writeDb(db);

    return {
      verified: false,
      messageText: retryMsg,
      rule,
      eventLog,
      metaApiPayloads,
      db,
    };
  }

  // 팔로우 확인 완료! -> 최종 링크 버튼/캐러셀 DM 즉시 발송
  rule.stats.followVerifiedCount += 1;
  rule.stats.finalDmSentCount += 1;
  if (rule.limitConfig.enabled) {
    rule.limitConfig.currentClaims += 1;
  }

  const finalMsg = formatDmText(rule.dmBodyText, eventLog.igUsername);
  eventLog.status = 'DM_SENT';
  eventLog.dmSentPreview = finalMsg;
  writeDb(db);

  return {
    verified: true,
    messageText: finalMsg,
    rule,
    eventLog,
    metaApiPayloads,
    db,
  };
}

/**
 * 3단계: DM 내 링크 버튼(/r/[shortCode]) 클릭 시 클릭 수 집계 및 UTM 리다이렉트 URL 생성
 */
export function recordShortLinkClick(params: {
  shortCode: string;
  eventId?: string;
}): {
  found: boolean;
  redirectUrl: string;
  shortCode: string;
  totalClicks: number;
  ruleTitle?: string;
  buttonLabel?: string;
  db: DatabaseSchema;
} {
  const db = readDb();
  const { shortCode, eventId } = params;

  let tracked = db.trackedLinks.find((t) => t.shortCode === shortCode);
  let matchedRule: AutomationRule | undefined;
  let buttonLabel = '';
  let targetUrl = 'https://instagram.com';

  for (const rule of db.rules) {
    let hit = false;
    for (const btn of rule.buttons) {
      if (btn.shortCode === shortCode) {
        btn.clicks += 1;
        buttonLabel = btn.label;
        targetUrl = btn.targetUrl;
        hit = true;
      }
    }
    for (const card of rule.carouselCards) {
      if (card.shortCode === shortCode) {
        card.clicks += 1;
        buttonLabel = card.buttonLabel;
        targetUrl = card.targetUrl;
        hit = true;
      }
    }
    if (hit) {
      rule.stats.totalLinkClicks += 1;
      matchedRule = rule;
    }
  }

  if (tracked) {
    tracked.clicks += 1;
    tracked.lastClickedAt = new Date().toISOString();
    targetUrl = tracked.targetUrl;
    buttonLabel = tracked.buttonLabel;
  } else if (matchedRule) {
    tracked = {
      shortCode,
      ruleId: matchedRule.id,
      accountId: matchedRule.accountId,
      buttonLabel: buttonLabel || shortCode,
      targetUrl,
      utmSource: 'instagram_dm',
      utmMedium: 'auto_reply',
      utmCampaign: matchedRule.id,
      clicks: 1,
      lastClickedAt: new Date().toISOString(),
    };
    db.trackedLinks.push(tracked);
  }

  // 관련 이벤트 로그 상태를 LINK_CLICKED로 업데이트
  if (eventId) {
    const evt = db.eventLogs.find((e) => e.id === eventId);
    if (evt) {
      evt.status = 'LINK_CLICKED';
      evt.shortCodeClicked = shortCode;
    }
  } else if (matchedRule) {
    const latestEvt = db.eventLogs.find(
      (e) => e.ruleId === matchedRule.id && e.status === 'DM_SENT'
    );
    if (latestEvt) {
      latestEvt.status = 'LINK_CLICKED';
      latestEvt.shortCodeClicked = shortCode;
    }
  }

  writeDb(db);

  // UTM 파라미터 부착
  let finalRedirectUrl = targetUrl;
  try {
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set('utm_source', tracked?.utmSource || 'instagram_dm');
    urlObj.searchParams.set('utm_medium', tracked?.utmMedium || 'auto_reply');
    urlObj.searchParams.set('utm_campaign', tracked?.utmCampaign || shortCode);
    finalRedirectUrl = urlObj.toString();
  } catch {
    finalRedirectUrl = targetUrl;
  }

  return {
    found: Boolean(tracked || matchedRule),
    redirectUrl: finalRedirectUrl,
    shortCode,
    totalClicks: tracked?.clicks || 1,
    ruleTitle: matchedRule?.title,
    buttonLabel,
    db,
  };
}
