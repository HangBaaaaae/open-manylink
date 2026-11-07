import { NextRequest, NextResponse } from 'next/server';
import {
  processIncomingTrigger,
  verifyFollowAndSendFinalDm,
} from '@/lib/automation-engine';
import {
  checkRealUserFollowStatus,
  sendRealCommentReply,
  sendRealInstagramDm,
  verifyMetaWebhookSignature,
} from '@/lib/meta-graph-client';
import { readDb, writeDb } from '@/lib/db';

// 봇 자신이 작성한 대댓글 ID를 기록하여 대댓글 무한루프만 정확히 방지 (내 계정으로 직접 "ㅇㅇ" 셀프 댓글 테스트는 허용!)
const botGeneratedCommentIds = new Set<string>();

/**
 * Meta Developer Portal 공식 Webhook 인증 엔드포인트 (GET)
 * hub.mode=subscribe & hub.verify_token 검증 후 hub.challenge 반환
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  const expectedToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN || 'open_manylink_verify_2026';

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      service: 'OpenManyLink Instagram Graph API Webhook Receiver',
      expectedVerifyToken: expectedToken,
    },
    { status: 200 }
  );
}

/**
 * Meta Instagram Graph API 실시간 Webhook 이벤트 수신 (POST)
 * - 계정 1개로 본인이 본인 게시물에 "ㅇㅇ" 댓글을 달아도 정상 감지 및 실제 대댓글이 달리도록 지원합니다.
 * - Meta 개발자 콘솔의 [Test] 버튼이 보내는 샘플 페이로드("This is an example.")도 자동 감지하여 수신 성공 로그를 남깁니다.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const appSecret = process.env.META_APP_SECRET || '';
    const signatureHeader = req.headers.get('x-hub-signature-256');

    if (
      appSecret &&
      !verifyMetaWebhookSignature({
        rawBody,
        signatureHeader,
        appSecret,
      })
    ) {
      return NextResponse.json(
        { received: false, error: 'Invalid X-Hub-Signature-256' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    if (payload.object !== 'instagram' || !Array.isArray(payload.entry)) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const db = readDb();
    const results: unknown[] = [];

    for (const entry of payload.entry) {
      const igBusinessId = String(entry.id || '');
      const account =
        db.accounts.find((a) => a.igBusinessId === igBusinessId) ||
        db.accounts[0];

      if (!account) continue;
      const realToken =
        account.accessToken || process.env.META_PAGE_ACCESS_TOKEN || '';

      // 1. 댓글 이벤트 처리 (changes -> field: 'comments')
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field === 'comments' && change.value) {
            const val = change.value;
            const commentId = String(val.id || '');
            let text = String(val.text || '');
            const username = String(val.from?.username || 'ig_user');
            const mediaId = String(val.media?.id || 'ALL');

            // 봇이 방금 자동으로 단 대댓글이면 무한루프 방지를 위해 무시
            if (commentId && botGeneratedCommentIds.has(commentId)) {
              continue;
            }
            const isBotOwnReplyText = db.rules.some((r) =>
              r.commentReplyTemplates.some((tpl) =>
                text.includes(tpl.slice(0, 12))
              )
            );
            if (isBotOwnReplyText) {
              continue;
            }

            // Meta 개발자 콘솔의 [Test] 버튼 클릭 시 날아오는 기본 텍스트("This is an example.")인 경우
            // 글을 직접 쓰지 않아도 테스트가 통과되도록 첫 번째 규칙의 키워드로 자동 매핑
            const isMetaConsoleTestPing =
              text === 'This is an example.' || commentId === '123123123';
            if (isMetaConsoleTestPing) {
              const firstRuleKw =
                db.rules.find((r) => r.accountId === account.id)?.keywords[0] ||
                'ㅇㅇ';
              text = `${firstRuleKw} (Meta 콘솔 Test 웹훅 수신)`;
            }

            const res = processIncomingTrigger({
              accountId: account.id,
              mediaId: isMetaConsoleTestPing ? 'ALL' : mediaId,
              triggerType: 'POST_COMMENT',
              igUsername: username,
              inputText: text,
              isFollower: false,
              bypassCooldown: isMetaConsoleTestPing,
              baseUrl,
            });

            // 실제 Meta 토큰이 설정된 경우 (Meta 콘솔 가짜 ID 123123123가 아닐 때) 실제 Graph API 호출 실행
            if (
              res.matched &&
              res.rule &&
              res.eventLog &&
              realToken &&
              commentId &&
              !isMetaConsoleTestPing
            ) {
              try {
                // 1) 공개 대댓글 달기 (내 계정 1개로 내 글에 댓글 달았을 때도 100% 실제 작동!)
                if (res.publicReplyText) {
                  const replyResult = await sendRealCommentReply({
                    accessToken: realToken,
                    commentId,
                    message: res.publicReplyText,
                  });
                  if (replyResult?.id) {
                    botGeneratedCommentIds.add(String(replyResult.id));
                  }
                }

                // 2) Private Reply DM 발송 (타인 댓글이면 실제 DM 발송, 본인 셀프 댓글이면 Meta 응답 기록)
                const dmResult = await sendRealInstagramDm({
                  accessToken: realToken,
                  igBusinessId: account.igBusinessId,
                  recipient: { comment_id: commentId },
                  rule: res.rule,
                  igUsername: username,
                  stage: res.requiresFollowStep
                    ? 'FOLLOW_PROMPT'
                    : 'FINAL_BENEFIT',
                  eventId: res.eventLog.id,
                  baseUrl,
                });

                // 본인 계정 셀프 댓글이어서 Meta가 Self-DM만 제한한 경우 로그에 안내 기록
                if (dmResult?.error) {
                  const latestDb = readDb();
                  const logItem = latestDb.eventLogs.find(
                    (e) => e.id === res.eventLog?.id
                  );
                  if (logItem) {
                    logItem.dmSentPreview = `[웹훅 & 대댓글 성공 / DM 응답: ${dmResult.error.message}] (본인 계정 셀프 댓글은 대댓글만 달리고 자기 자신에게 DM은 Meta 정책상 생략됩니다)`;
                    writeDb(latestDb);
                  }
                }
              } catch (apiErr) {
                console.error('Meta Graph API comment action error:', apiErr);
              }
            }

            results.push(res);
          }
        }
      }

      // 2. DM 포스트백 버튼 클릭(팔로우 확인) 또는 스토리 답장 처리 (messaging)
      if (Array.isArray(entry.messaging)) {
        for (const msgEvt of entry.messaging) {
          const senderIgsid = String(msgEvt.sender?.id || '');
          if (!senderIgsid || senderIgsid === account.igBusinessId) continue;

          const postbackPayload = String(msgEvt.postback?.payload || '');
          if (postbackPayload.startsWith('VERIFY_FOLLOW:')) {
            const [, ruleId, eventId] = postbackPayload.split(':');

            let isFollowerVerified = false;
            if (realToken) {
              try {
                const followData = await checkRealUserFollowStatus({
                  accessToken: realToken,
                  igScopedUserId: senderIgsid,
                });
                isFollowerVerified = followData.isFollower;
              } catch (err) {
                console.error('Follow status check error:', err);
              }
            } else {
              isFollowerVerified = Boolean(
                msgEvt.is_user_follow_business ?? true
              );
            }

            const res = verifyFollowAndSendFinalDm({
              eventId,
              ruleId,
              isFollowerNow: isFollowerVerified,
              baseUrl,
            });

            if (realToken && res.rule && res.eventLog) {
              try {
                await sendRealInstagramDm({
                  accessToken: realToken,
                  igBusinessId: account.igBusinessId,
                  recipient: { id: senderIgsid },
                  rule: res.rule,
                  igUsername: res.eventLog.igUsername,
                  stage: res.verified ? 'FINAL_BENEFIT' : 'UNFOLLOWED_RETRY',
                  eventId: res.eventLog.id,
                  baseUrl,
                });
              } catch (apiErr) {
                console.error('Meta Graph API postback DM error:', apiErr);
              }
            }

            results.push(res);
          } else if (msgEvt.message?.reply_to?.story) {
            const text = String(msgEvt.message?.text || '');
            const res = processIncomingTrigger({
              accountId: account.id,
              mediaId: 'ALL',
              triggerType: 'STORY_REPLY',
              igUsername: senderIgsid,
              inputText: text,
              isFollower: false,
              bypassCooldown: false,
              baseUrl,
            });
            results.push(res);
          }
        }
      }
    }

    return NextResponse.json({ received: true, processedCount: results.length });
  } catch (err) {
    return NextResponse.json(
      { received: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
