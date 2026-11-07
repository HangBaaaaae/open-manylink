import crypto from 'crypto';
import { AutomationRule, InstagramMedia } from '@/types/automation';
import { formatDmText, pickRandomCommentReply } from '@/lib/automation-engine';

const GRAPH_INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0';
const GRAPH_FACEBOOK_BASE = 'https://graph.facebook.com/v21.0';

function getGraphBaseUrl(accessToken: string): string {
  return accessToken.trim().startsWith('EAA')
    ? GRAPH_FACEBOOK_BASE
    : GRAPH_INSTAGRAM_BASE;
}

/**
 * [보안 검증] Meta Webhook X-Hub-Signature-256 HMAC-SHA256 서명 검증
 */
export function verifyMetaWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = params;
  if (!appSecret) return true;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const expectedSig = `sha256=${expectedHex}`;

  const bufA = Buffer.from(signatureHeader, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * [실제 수집 검증 1] 내 인스타그램 프로필 정보 조회
 * - IGAA... (Instagram Login 토큰) 및 EAA... (Unified Login / Facebook Login 토큰) 모두 호환
 * - followers_count 등 노드별로 지원하지 않는 필드로 인해 (#100) 에러가 나지 않도록 최소 안전 필드로 조회 후 선택적 확장 조회 수행
 */
export async function fetchRealInstagramProfile(params: {
  accessToken: string;
  igBusinessId?: string;
}) {
  const token = params.accessToken.trim();
  const igBusinessId = params.igBusinessId?.trim();

  // 1) IGAA... 토큰이거나 graph.instagram.com 대상인 경우
  if (!token.startsWith('EAA')) {
    const safeUrl = `${GRAPH_INSTAGRAM_BASE}/me?fields=id,user_id,username,name,account_type&access_token=${encodeURIComponent(
      token
    )}`;
    const res = await fetch(safeUrl, { method: 'GET', cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || data.error) {
      // 혹시 id,username 만 허용되는 구버전/특수 노드인 경우 2차 폴백
      const minUrl = `${GRAPH_INSTAGRAM_BASE}/me?fields=id,username&access_token=${encodeURIComponent(
        token
      )}`;
      const minRes = await fetch(minUrl, { method: 'GET', cache: 'no-store' });
      const minData = await minRes.json();
      if (!minRes.ok || minData.error) {
        throw new Error(
          minData.error?.message ||
            data.error?.message ||
            `Meta API 프로필 조회 실패 (HTTP ${res.status})`
        );
      }
      return {
        igBusinessId: String(minData.user_id || minData.id),
        username: String(minData.username || 'ig_user'),
        displayName: String(minData.username || 'Instagram 계정'),
        followersCount: 0,
        mediaCount: 0,
      };
    }

    // 선택적 followers_count 조회 (지원 시 반영, 미지원 시 0)
    let followersCount = 0;
    try {
      const extUrl = `${GRAPH_INSTAGRAM_BASE}/me?fields=followers_count,media_count&access_token=${encodeURIComponent(
        token
      )}`;
      const extRes = await fetch(extUrl, { method: 'GET', cache: 'no-store' });
      const extData = await extRes.json();
      if (extRes.ok && !extData.error) {
        followersCount = Number(extData.followers_count ?? 0);
      }
    } catch {
      // 무시
    }

    return {
      igBusinessId: String(data.user_id || data.id),
      username: String(data.username || ''),
      displayName: String(data.name || data.username || ''),
      followersCount,
      mediaCount: 0,
    };
  }

  // 2) EAA... 토큰 (Unified Login / Facebook Graph API 토큰)인 경우
  // 2-A) 먼저 graph.instagram.com/me 로도 동작하는지 시도
  try {
    const igDirectRes = await fetch(
      `${GRAPH_INSTAGRAM_BASE}/me?fields=id,username,name&access_token=${encodeURIComponent(
        token
      )}`,
      { method: 'GET', cache: 'no-store' }
    );
    const igDirectData = await igDirectRes.json();
    if (igDirectRes.ok && !igDirectData.error && igDirectData.username) {
      return {
        igBusinessId: String(igDirectData.user_id || igDirectData.id),
        username: String(igDirectData.username),
        displayName: String(igDirectData.name || igDirectData.username),
        followersCount: 0,
        mediaCount: 0,
      };
    }
  } catch {
    // 다음 단계로 진행
  }

  // 2-B) igBusinessId가 직접 입력된 경우 해당 노드를 조회
  if (igBusinessId) {
    const nodeRes = await fetch(
      `${GRAPH_FACEBOOK_BASE}/${igBusinessId}?fields=id,username,name,followers_count,media_count&access_token=${encodeURIComponent(
        token
      )}`,
      { method: 'GET', cache: 'no-store' }
    );
    const nodeData = await nodeRes.json();
    if (nodeRes.ok && !nodeData.error) {
      return {
        igBusinessId: String(nodeData.id),
        username: String(nodeData.username || nodeData.name || igBusinessId),
        displayName: String(nodeData.name || nodeData.username || igBusinessId),
        followersCount: Number(nodeData.followers_count ?? 0),
        mediaCount: Number(nodeData.media_count ?? 0),
      };
    }

    // 만약 followers_count 필드가 제한된 경우 최소 필드로 재시도
    const fallbackNodeRes = await fetch(
      `${GRAPH_FACEBOOK_BASE}/${igBusinessId}?fields=id,username,name&access_token=${encodeURIComponent(
        token
      )}`,
      { method: 'GET', cache: 'no-store' }
    );
    const fallbackNodeData = await fallbackNodeRes.json();
    if (fallbackNodeRes.ok && !fallbackNodeData.error) {
      return {
        igBusinessId: String(fallbackNodeData.id),
        username: String(
          fallbackNodeData.username || fallbackNodeData.name || igBusinessId
        ),
        displayName: String(
          fallbackNodeData.name || fallbackNodeData.username || igBusinessId
        ),
        followersCount: 0,
        mediaCount: 0,
      };
    }

    throw new Error(
      fallbackNodeData.error?.message ||
        nodeData.error?.message ||
        `입력하신 Instagram 계정 ID(${igBusinessId})를 조회할 수 없습니다.`
    );
  }

  // 2-C) Unified Login / Facebook 토큰에서 연결된 Instagram 비즈니스 계정 자동 탐색
  const meRes = await fetch(
    `${GRAPH_FACEBOOK_BASE}/me?fields=id,name&access_token=${encodeURIComponent(
      token
    )}`,
    { method: 'GET', cache: 'no-store' }
  );
  const meData = await meRes.json();
  if (!meRes.ok || meData.error) {
    throw new Error(
      meData.error?.message || `Meta API 토큰 검증 실패 (HTTP ${meRes.status})`
    );
  }

  // 만약 /me 자체가 IG 계정인 경우 username 추가 확인
  try {
    const igFieldRes = await fetch(
      `${GRAPH_FACEBOOK_BASE}/${meData.id}?fields=id,username,name&access_token=${encodeURIComponent(
        token
      )}`,
      { method: 'GET', cache: 'no-store' }
    );
    const igFieldData = await igFieldRes.json();
    if (igFieldRes.ok && !igFieldData.error && igFieldData.username) {
      return {
        igBusinessId: String(igFieldData.id),
        username: String(igFieldData.username),
        displayName: String(igFieldData.name || igFieldData.username),
        followersCount: 0,
        mediaCount: 0,
      };
    }
  } catch {
    // 무시
  }

  // 연결된 페이지/비즈니스 자산에서 instagram_business_account 탐색
  try {
    const accRes = await fetch(
      `${GRAPH_FACEBOOK_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}&access_token=${encodeURIComponent(
        token
      )}`,
      { method: 'GET', cache: 'no-store' }
    );
    const accData = await accRes.json();
    if (accRes.ok && Array.isArray(accData.data)) {
      for (const page of accData.data) {
        const igObj =
          page.instagram_business_account || page.connected_instagram_account;
        if (igObj?.id) {
          return {
            igBusinessId: String(igObj.id),
            username: String(igObj.username || page.name || 'ig_connected'),
            displayName: String(igObj.name || igObj.username || page.name),
            followersCount: 0,
            mediaCount: 0,
          };
        }
      }
    }
  } catch {
    // 무시
  }

  // System User(SUAT) 토큰인데 igBusinessId를 입력하지 않은 경우 안내 에러 반환
  if (String(meData.name || '').includes('System User')) {
    throw new Error(
      '통합 로그인(System User) 토큰이 확인되었습니다! 바로 아래 [Instagram 비즈니스 계정 ID] 칸에 Meta 콘솔(2. 액세스 토큰 생성) 표의 @아이디 옆에 적힌 숫자 ID(예: 178414...)를 함께 입력해주세요.'
    );
  }

  return {
    igBusinessId: String(igBusinessId || meData.id),
    username: String(meData.username || meData.name || 'ig_connected').replace(
      /\s+/g,
      '_'
    ),
    displayName: String(meData.name || 'Meta 연동 계정'),
    followersCount: 0,
    mediaCount: 0,
  };
}

/**
 * [실제 수집 검증 2] 내 인스타그램 게시물/릴스 목록 실제 동기화
 * (#100) 필드 에러 방지를 위해 확장 필드 실패 시 최소 필드(id,caption,media_type,permalink,timestamp)로 자동 폴백
 */
export async function fetchRealInstagramMediaList(params: {
  accessToken: string;
  igBusinessId: string;
  accountId: string;
}): Promise<InstagramMedia[]> {
  const token = params.accessToken.trim();
  const { igBusinessId, accountId } = params;

  const endpointsToTry = token.startsWith('EAA')
    ? [
        `${GRAPH_FACEBOOK_BASE}/${igBusinessId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(
          token
        )}`,
        `${GRAPH_FACEBOOK_BASE}/me/media?fields=id,caption,media_type,permalink,timestamp&limit=25&access_token=${encodeURIComponent(
          token
        )}`,
        `${GRAPH_INSTAGRAM_BASE}/me/media?fields=id,caption,media_type,permalink,timestamp&limit=25&access_token=${encodeURIComponent(
          token
        )}`,
      ]
    : [
        `${GRAPH_INSTAGRAM_BASE}/me/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(
          token
        )}`,
        `${GRAPH_INSTAGRAM_BASE}/me/media?fields=id,caption,media_type,permalink,timestamp&limit=25&access_token=${encodeURIComponent(
          token
        )}`,
      ];

  for (const url of endpointsToTry) {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await res.json();
      if (res.ok && !data.error && Array.isArray(data.data)) {
        return data.data.map((item: Record<string, unknown>) => {
          const isReels =
            item.media_product_type === 'REELS' || item.media_type === 'VIDEO';
          const captionStr = String(item.caption || '');
          const firstLine =
            captionStr.split('\n')[0]?.slice(0, 42) || '인스타그램 게시물';

          return {
            id: String(item.id),
            accountId,
            mediaType: isReels ? 'REELS' : 'FEED',
            title: `${isReels ? '[릴스]' : '[피드]'} ${firstLine}`,
            caption: captionStr,
            permalink: String(item.permalink || 'https://instagram.com'),
            publishedAt: String(item.timestamp || new Date().toISOString()),
            commentsCount: Number(item.comments_count ?? 0),
            likesCount: Number(item.like_count ?? 0),
            thumbnailTag: isReels ? 'REELS' : 'FEED',
          };
        });
      }
    } catch {
      // 다음 엔드포인트 시도
    }
  }

  return [];
}

/**
 * [실제 수집 검증 3] 특정 유저(IGSID)가 내 비즈니스 계정을 팔로우 중인지 실시간 조회
 */
export async function checkRealUserFollowStatus(params: {
  accessToken: string;
  igScopedUserId: string;
}): Promise<{
  isFollower: boolean;
  username?: string;
  rawResponse: unknown;
}> {
  const { accessToken, igScopedUserId } = params;
  const base = getGraphBaseUrl(accessToken);

  const url = `${base}/${igScopedUserId}?fields=name,username,is_user_follow_business&access_token=${encodeURIComponent(
    accessToken
  )}`;

  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message || `팔로우 상태 조회 실패 (HTTP ${res.status})`
    );
  }

  return {
    isFollower: Boolean(data.is_user_follow_business),
    username: data.username ? String(data.username) : undefined,
    rawResponse: data,
  };
}

/**
 * [실제 발송 검증 4] 댓글에 공개 대댓글 자동 달기
 */
export async function sendRealCommentReply(params: {
  accessToken: string;
  commentId: string;
  message: string;
}) {
  const { accessToken, commentId, message } = params;
  const base = getGraphBaseUrl(accessToken);

  const res = await fetch(`${base}/${commentId}/replies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  return res.json();
}

/**
 * [실제 발송 검증 5] 댓글 작성자에게 1차 DM(Private Reply) 또는 최종 링크 버튼/캐러셀 DM 발송
 */
export async function sendRealInstagramDm(params: {
  accessToken: string;
  igBusinessId: string;
  recipient: { comment_id: string } | { id: string };
  rule: AutomationRule;
  igUsername: string;
  stage: 'FOLLOW_PROMPT' | 'UNFOLLOWED_RETRY' | 'FINAL_BENEFIT';
  eventId: string;
  baseUrl: string;
}) {
  const {
    accessToken,
    igBusinessId,
    recipient,
    rule,
    igUsername,
    stage,
    eventId,
    baseUrl,
  } = params;
  const base = getGraphBaseUrl(accessToken);

  const isLocalhost =
    baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  let messagePayload: Record<string, unknown>;
  let plainTextFallback = '';

  if (stage === 'FOLLOW_PROMPT') {
    const promptText = formatDmText(rule.followPromptMessage, igUsername);
    plainTextFallback = `${promptText}\n\n👉 팔로우 후 아래 버튼을 누르거나 '확인'이라고 답장해 주세요!`;
    messagePayload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: promptText,
          buttons: [
            {
              type: 'postback',
              title: rule.followVerifyButtonText || '팔로우 확인하고 링크 받기',
              payload: `VERIFY_FOLLOW:${rule.id}:${eventId}`,
            },
          ],
        },
      },
    };
  } else if (stage === 'UNFOLLOWED_RETRY') {
    const retryText =
      rule.unfollowedRetryMessage ||
      '아직 팔로우가 확인되지 않았어요. 프로필 팔로우 후 아래 버튼을 다시 눌러주세요!';
    plainTextFallback = retryText;
    messagePayload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: retryText,
          buttons: [
            {
              type: 'postback',
              title: '팔로우 완료! 다시 확인하기',
              payload: `VERIFY_FOLLOW:${rule.id}:${eventId}`,
            },
          ],
        },
      },
    };
  } else if (
    rule.dmTemplateType === 'CAROUSEL' &&
    rule.carouselCards.length > 0
  ) {
    const resolveCardUrl = (c: { targetUrl: string; shortCode: string }) =>
      isLocalhost && c.targetUrl.startsWith('http')
        ? c.targetUrl
        : `${baseUrl}/r/${c.shortCode}`;
    const linksText = rule.carouselCards
      .map((c) => `• ${c.title}: ${resolveCardUrl(c)}`)
      .join('\n');
    plainTextFallback = `${formatDmText(rule.dmBodyText, igUsername)}\n\n${linksText}`;
    messagePayload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: rule.carouselCards.slice(0, 10).map((card) => ({
            title: card.title,
            subtitle: `${card.subtitle}${
              card.priceText ? ` · ${card.priceText}` : ''
            }`,
            buttons: [
              {
                type: 'web_url',
                url: resolveCardUrl(card),
                title: card.buttonLabel,
              },
            ],
          })),
        },
      },
    };
  } else {
    const resolveBtnUrl = (b: { targetUrl: string; shortCode: string }) =>
      isLocalhost && b.targetUrl.startsWith('http')
        ? b.targetUrl
        : `${baseUrl}/r/${b.shortCode}`;
    const linksText = rule.buttons
      .map((b) => `👉 ${b.label}: ${resolveBtnUrl(b)}`)
      .join('\n');
    plainTextFallback = `${formatDmText(rule.dmBodyText, igUsername)}\n\n${linksText}`;
    messagePayload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: formatDmText(rule.dmBodyText, igUsername),
          buttons: rule.buttons.slice(0, 3).map((btn) => ({
            type: 'web_url',
            url: resolveBtnUrl(btn),
            title: btn.label,
          })),
        },
      },
    };
  }

  const endpoint = `${base}/${igBusinessId}/messages`;
  const primaryRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient,
      message: messagePayload,
    }),
  });

  const primaryData = await primaryRes.json();

  if (!primaryRes.ok && primaryData?.error && plainTextFallback) {
    const fallbackRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient,
        message: { text: plainTextFallback },
      }),
    });
    return fallbackRes.json();
  }

  return primaryData;
}

export { pickRandomCommentReply };
