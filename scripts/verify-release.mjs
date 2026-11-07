/**
 * OpenManyLink 오픈소스 배포 전 7단계 자동 검증 스위트 (npm test)
 * 실행 중인 서버(기본 http://localhost:3000)를 대상으로
 * 보안(토큰 마스킹), Meta Webhook 인증, 키워드/초성 매칭, 팔로우 2단계 검증, 단축링크 307 리다이렉트 및 클릭 집계를 전수 테스트합니다.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runVerification() {
  console.log(`\n🔍 OpenManyLink 오픈소스 릴리즈 검증 시작 (${BASE_URL})...\n`);

  // 0. 테스트 전 시드 초기화
  const resetRes = await fetch(`${BASE_URL}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'RESET_SEED' }),
  });
  assert(resetRes.ok, '0. 테스트용 초기 상태 리셋 완료');

  // 1. 보안 검증: GET /api/state 응답에 평문 accessToken 노출 여부 확인
  const stateRes = await fetch(`${BASE_URL}/api/state`);
  const stateData = await stateRes.json();
  const leakedToken = stateData.accounts.some(
    (a) => typeof a.accessToken === 'string' && a.accessToken.length > 0
  );
  assert(
    !leakedToken,
    '1. [보안] 클라이언트 상태 API(/api/state)에서 accessToken 평문 미노출 검증'
  );

  // 2. Meta 공식 Webhook GET hub.challenge 인증 검증
  const challengeStr = `META_VERIFY_${Date.now()}`;
  const whGetRes = await fetch(
    `${BASE_URL}/api/webhook/instagram?hub.mode=subscribe&hub.verify_token=open_manylink_verify_2026&hub.challenge=${challengeStr}`
  );
  const whGetText = await whGetRes.text();
  assert(
    whGetRes.status === 200 && whGetText === challengeStr,
    '2. [Meta Webhook] GET hub.challenge 핸드셰이크 응답 정확성 검증'
  );

  // 3. 댓글 키워드("ㅇ ㅇ 공구") 감지 + 랜덤 대댓글 + 1차 팔로우 확인 DM 대기 검증
  const trigRes = await fetch(`${BASE_URL}/api/simulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'TRIGGER_COMMENT',
      accountId: 'acc-1',
      mediaId: 'media-101',
      triggerType: 'POST_COMMENT',
      igUsername: 'oss_verifier_user',
      inputText: 'ㅇ ㅇ 공구 참여하고 싶어요!',
      isFollower: false,
      bypassCooldown: false,
    }),
  });
  const trigData = await trigRes.json();
  assert(
    trigData.matched === true &&
      Boolean(trigData.publicReplyText) &&
      trigData.requiresFollowStep === true &&
      trigData.eventLog?.status === 'AWAITING_FOLLOW_CLICK',
    '3. [1단계 트리거] 공백 포함 키워드 매칭, 랜덤 대댓글 생성 및 1차 팔로우 확인 DM 발송 검증'
  );

  const eventId = trigData.eventLog.id;
  const ruleId = trigData.rule.id;

  // 4. 동일 유저 중복 댓글 쿨다운 방어 검증
  const dupRes = await fetch(`${BASE_URL}/api/simulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'TRIGGER_COMMENT',
      accountId: 'acc-1',
      mediaId: 'media-101',
      triggerType: 'POST_COMMENT',
      igUsername: 'oss_verifier_user',
      inputText: 'ㅇㅇ 또 달아요',
      isFollower: false,
      bypassCooldown: false,
    }),
  });
  const dupData = await dupRes.json();
  assert(
    dupData.eventLog?.status === 'COOLDOWN_SKIPPED',
    '4. [스팸 방지] 동일 유저 중복 댓글 쿨다운(Cooldown) 자동 차단 검증'
  );

  // 5. 미팔로워 상태에서 [팔로우 확인] 버튼 클릭 시 링크 발송 차단 검증
  const unfollowRes = await fetch(`${BASE_URL}/api/simulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'VERIFY_FOLLOW_POSTBACK',
      eventId,
      ruleId,
      isFollowerNow: false,
    }),
  });
  const unfollowData = await unfollowRes.json();
  assert(
    unfollowData.verified === false &&
      unfollowData.eventLog?.status === 'FOLLOW_FAILED_RETRY',
    '5. [2단계 팔로우 검증] 미팔로워(is_user_follow_business: false) 링크 차단 및 재안내 검증'
  );

  // 6. 팔로우 완료 후 [다시 확인하기] 버튼 클릭 시 최종 혜택 DM 발송 검증
  const followRes = await fetch(`${BASE_URL}/api/simulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'VERIFY_FOLLOW_POSTBACK',
      eventId,
      ruleId,
      isFollowerNow: true,
    }),
  });
  const followData = await followRes.json();
  assert(
    followData.verified === true && followData.eventLog?.status === 'DM_SENT',
    '6. [2단계 팔로우 검증] 팔로워 인증 통과 시 최종 링크/캐러셀 DM 발송 검증'
  );

  // 7. 단축 링크(/r/cica-45) 307 리다이렉트 & UTM 파라미터 & 클릭 수 +1 검증
  const beforeClicks =
    followData.db.trackedLinks.find((t) => t.shortCode === 'cica-45')?.clicks ||
    0;
  const redirectRes = await fetch(`${BASE_URL}/r/cica-45`, {
    redirect: 'manual',
  });
  const locationHeader = redirectRes.headers.get('location') || '';
  const afterStateRes = await fetch(`${BASE_URL}/api/state`);
  const afterState = await afterStateRes.json();
  const afterClicks =
    afterState.trackedLinks.find((t) => t.shortCode === 'cica-45')?.clicks || 0;

  assert(
    redirectRes.status === 307 &&
      locationHeader.includes('utm_source=instagram_dm') &&
      afterClicks === beforeClicks + 1,
    `7. [단축 링크 트래커] HTTP 307 리다이렉트, UTM 부착 및 클릭 수 증가(${beforeClicks} -> ${afterClicks}) 검증`
  );

  // 8. 실제 Meta Webhook POST (comments 이벤트) 규격 수신 검증
  const webhookPostRes = await fetch(`${BASE_URL}/api/webhook/instagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: '17841405829104921',
          time: Date.now(),
          changes: [
            {
              field: 'comments',
              value: {
                id: `cmt_real_${Date.now()}`,
                text: 'ㅇㅇ 공구 링크요',
                from: {
                  id: 'igsid_999888',
                  username: 'real_webhook_tester',
                },
                media: {
                  id: 'media-101',
                  media_product_type: 'REELS',
                },
              },
            },
          ],
        },
      ],
    }),
  });
  const webhookPostData = await webhookPostRes.json();
  assert(
    webhookPostRes.ok &&
      webhookPostData.received === true &&
      webhookPostData.processedCount === 1,
    '8. [Meta Webhook POST] 실제 인스타그램 댓글 웹훅 페이로드 수신 및 처리 검증'
  );

  // 검증 후 시드 다시 정리
  await fetch(`${BASE_URL}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'RESET_SEED' }),
  });

  console.log('\n🎉 모든 8개 핵심 오픈소스 검증 테스트를 통과했습니다!\n');
}

runVerification().catch((err) => {
  console.error('검증 스크립트 실행 오류:', err);
  process.exit(1);
});
