import { NextResponse } from 'next/server';
import { readDb, sanitizeDbForClient, writeDb } from '@/lib/db';
import {
  processIncomingTrigger,
  verifyFollowAndSendFinalDm,
} from '@/lib/automation-engine';
import {
  checkRealUserFollowStatus,
  sendRealCommentReply,
  sendRealInstagramDm,
} from '@/lib/meta-graph-client';

// 이미 처리한 실제 인스타 댓글 ID 및 DM 메시지 ID 기록 (중복 대댓글/DM 방지)
const processedRealCommentIds = new Set<string>();
const processedRealDmMessageIds = new Set<string>();

/**
 * 로컬 PC 환경에서 Webhook 터널 주소가 바뀌거나 끊기더라도
 * Meta Graph API로 최근 댓글을 직접 조회하여 미처리된 키워드 댓글에 즉시 대댓글 + DM을 발송하는 하이브리드 동기화 엔드포인트
 */
export async function POST() {
  try {
    const db = readDb();
    const realAccounts = db.accounts.filter(
      (a) => a.dataSource === 'REAL_META_API' && a.accessToken
    );

    if (realAccounts.length === 0) {
      return NextResponse.json({
        ok: true,
        triggeredCount: 0,
        db: sanitizeDbForClient(db),
      });
    }

    let triggeredCount = 0;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    for (const account of realAccounts) {
      const token = account.accessToken!;
      const baseGraph = token.startsWith('EAA')
        ? 'https://graph.facebook.com/v21.0'
        : 'https://graph.instagram.com/v21.0';
      const targetNode = token.startsWith('EAA') ? account.igBusinessId : 'me';

      const url = `${baseGraph}/${targetNode}/media?fields=id,caption,comments.limit(5){id,text,username,timestamp,from}&limit=15&access_token=${encodeURIComponent(
        token
      )}`;

      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.data)) continue;

      for (const media of data.data) {
        const mediaId = String(media.id || '');
        const comments = Array.isArray(media.comments?.data)
          ? media.comments.data
          : [];

        for (const cmt of comments) {
          const commentId = String(cmt.id || '');
          const text = String(cmt.text || '');
          const username = String(
            cmt.from?.username || cmt.username || 'ig_user'
          );
          const timestampStr = String(cmt.timestamp || '');

          if (!commentId || processedRealCommentIds.has(commentId)) {
            continue;
          }

          // 최근 60분 이내에 작성된 댓글만 자동 트리거 대상으로 처리 (과거 옛날 댓글 오발송 방지)
          const commentTimeMs = timestampStr
            ? new Date(timestampStr).getTime()
            : Date.now();
          if (Date.now() - commentTimeMs > 60 * 60 * 1000) {
            processedRealCommentIds.add(commentId);
            continue;
          }

          // 봇 자신이 단 대댓글 문구이거나 이미 이벤트 로그에 기록된 댓글인 경우 건너뛰기
          const isBotReply = db.rules.some((r) =>
            r.commentReplyTemplates.some((tpl) =>
              text.includes(tpl.slice(0, 12))
            )
          );
          const alreadyLogged = db.eventLogs.some(
            (e) =>
              e.accountId === account.id &&
              e.igUsername.toLowerCase() === username.toLowerCase() &&
              e.inputText.trim() === text.trim() &&
              Math.abs(new Date(e.timestamp).getTime() - commentTimeMs) <
                60 * 60 * 1000
          );
          if (isBotReply || alreadyLogged) {
            processedRealCommentIds.add(commentId);
            continue;
          }

          processedRealCommentIds.add(commentId);

          const trigRes = processIncomingTrigger({
            accountId: account.id,
            mediaId,
            triggerType: 'POST_COMMENT',
            igUsername: username,
            inputText: text,
            isFollower: false,
            bypassCooldown: true,
            baseUrl,
          });

          if (trigRes.matched && trigRes.rule && trigRes.eventLog) {
            triggeredCount += 1;

            try {
              if (trigRes.publicReplyText) {
                const replyData = await sendRealCommentReply({
                  accessToken: token,
                  commentId,
                  message: trigRes.publicReplyText,
                });
                if (replyData?.id) {
                  processedRealCommentIds.add(String(replyData.id));
                }
              }

              const dmData = await sendRealInstagramDm({
                accessToken: token,
                igBusinessId: account.igBusinessId,
                recipient: { comment_id: commentId },
                rule: trigRes.rule,
                igUsername: username,
                stage: trigRes.requiresFollowStep
                  ? 'FOLLOW_PROMPT'
                  : 'FINAL_BENEFIT',
                eventId: trigRes.eventLog.id,
                baseUrl,
              });

              if (dmData?.error) {
                const latestDb = readDb();
                const logItem = latestDb.eventLogs.find(
                  (e) => e.id === trigRes.eventLog?.id
                );
                if (logItem) {
                  logItem.dmSentPreview = `[대댓글 등록 성공 / DM 응답: ${dmData.error.message}]`;
                  writeDb(latestDb);
                }
              }
            } catch (err) {
              console.error('Sync comment action error:', err);
            }
          }
        }
      }

      // 2단계: 팔로우 대기 중(AWAITING_FOLLOW_CLICK)인 유저가 DM 버튼 클릭/답장을 보냈는지 대화방 확인
      const currentDb = readDb();
      const pendingEvents = currentDb.eventLogs.filter(
        (e) =>
          e.accountId === account.id && e.status === 'AWAITING_FOLLOW_CLICK'
      );

      if (pendingEvents.length > 0) {
        try {
          const convUrl = `${baseGraph}/${targetNode}/conversations?platform=instagram&limit=3&fields=id,participants,messages.limit(2){id,message,from,created_time}&access_token=${encodeURIComponent(
            token
          )}`;
          const convRes = await fetch(convUrl, {
            method: 'GET',
            cache: 'no-store',
          });
          const convData = await convRes.json();

          if (convRes.ok && Array.isArray(convData.data)) {
            for (const conv of convData.data) {
              const latestMsg = conv.messages?.data?.[0];
              if (!latestMsg || !latestMsg.id) continue;

              const msgId = String(latestMsg.id);
              const senderId = String(latestMsg.from?.id || '');
              const senderUsername = String(latestMsg.from?.username || '');

              // 비즈니스 계정 자신이 보낸 메시지가 아니라 상대방 유저가 반응(버튼 클릭/답장)한 경우
              if (
                senderId &&
                senderId !== account.igBusinessId &&
                !processedRealDmMessageIds.has(msgId)
              ) {
                const matchedEvent = pendingEvents.find(
                  (e) =>
                    e.igUsername.toLowerCase() === senderUsername.toLowerCase()
                );

                if (matchedEvent) {
                  processedRealDmMessageIds.add(msgId);
                  let isFollowing = false;
                  try {
                    const followCheck = await checkRealUserFollowStatus({
                      accessToken: token,
                      igScopedUserId: senderId,
                    });
                    isFollowing = followCheck.isFollower;
                  } catch {
                    isFollowing = false;
                  }

                  const verifyResult = verifyFollowAndSendFinalDm({
                    eventId: matchedEvent.id,
                    ruleId: matchedEvent.ruleId,
                    isFollowerNow: isFollowing,
                    baseUrl,
                  });

                  const rule = currentDb.rules.find(
                    (r) => r.id === matchedEvent.ruleId
                  );
                  if (rule) {
                    await sendRealInstagramDm({
                      accessToken: token,
                      igBusinessId: account.igBusinessId,
                      recipient: { id: senderId },
                      rule,
                      igUsername: senderUsername,
                      stage: verifyResult.verified
                        ? 'FINAL_BENEFIT'
                        : 'UNFOLLOWED_RETRY',
                      eventId: matchedEvent.id,
                      baseUrl,
                    });
                    triggeredCount += 1;
                  }
                }
              }
            }
          }
        } catch {
          // 대화방 조회 실패 시 다음 주기에 재시도
        }
      }
    }

    const updatedDb = readDb();
    return NextResponse.json({
      ok: true,
      triggeredCount,
      db: sanitizeDbForClient(updatedDb),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
