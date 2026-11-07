'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { DatabaseSchema, InstagramAccount } from '@/types/automation';

interface MetaConnectWizardProps {
  accounts: InstagramAccount[];
  onDbUpdate: (newDb: DatabaseSchema, newAccount?: InstagramAccount) => void;
}

export default function MetaConnectWizard({
  accounts,
  onDbUpdate,
}: MetaConnectWizardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string>(
    'open_manylink_verify_2026'
  );
  const [webhookTesting, setWebhookTesting] = useState<boolean>(false);
  const [webhookResult, setWebhookResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [accessToken, setAccessToken] = useState<string>('');
  const [igBusinessId, setIgBusinessId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [instagramAppId, setInstagramAppId] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [connectResult, setConnectResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const originUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://your-domain.com';
  const callbackUrl = `${originUrl}/api/webhook/instagram`;
  const oauthRedirectUri = `${originUrl}/api/auth/instagram/callback`;

  const handleStartInstagramOAuth = () => {
    const appId = instagramAppId.trim();
    if (!appId) {
      setConnectResult({
        ok: false,
        message:
          '인스타그램 로그인 팝업을 띄우려면 아래 칸에 Meta 콘솔의 Instagram 앱 ID를 먼저 입력해주세요.',
      });
      return;
    }
    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ].join(',');
    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(
      oauthRedirectUri
    )}&response_type=code&scope=${encodeURIComponent(scopes)}`;
    window.location.href = authUrl;
  };

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    try {
      const res = await fetch('/api/meta/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TEST_WEBHOOK_CHALLENGE',
          verifyToken,
        }),
      });
      const data = await res.json();
      setWebhookResult({
        ok: Boolean(data.ok),
        message: data.message,
      });
    } catch (e) {
      setWebhookResult({
        ok: false,
        message: `진단 실패: ${(e as Error).message}`,
      });
    } finally {
      setWebhookTesting(false);
    }
  };

  const handleConnectAccount = async (allowDemoFallback: boolean) => {
    if (!allowDemoFallback && !accessToken.trim()) {
      setConnectResult({
        ok: false,
        message: 'Meta에서 발급받은 Access Token을 입력해주세요.',
      });
      return;
    }

    setConnecting(true);
    setConnectResult(null);

    try {
      const res = await fetch('/api/meta/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VERIFY_AND_CONNECT_TOKEN',
          accessToken:
            accessToken.trim() || 'DEMO_SANDBOX_TOKEN_OPEN_MANYLINK',
          igBusinessId: igBusinessId.trim(),
          username: username.trim() || 'demo_creator_kr',
          allowDemoFallback,
        }),
      });
      const data = await res.json();
      if (data.ok && data.db) {
        setConnectResult({
          ok: true,
          message:
            data.apiMode === 'LIVE_GRAPH_API'
              ? `실제 Meta Graph API 연동 완료! @${data.account.username} 계정 및 게시물 ${data.syncedMediaCount}개를 불러왔습니다.`
              : `테스트용 계정(@${data.account.username})이 추가되었습니다.`,
        });
        onDbUpdate(data.db, data.account);
      } else {
        setConnectResult({
          ok: false,
          message: data.error || '연동에 실패했습니다.',
        });
      }
    } catch (err) {
      setConnectResult({
        ok: false,
        message: (err as Error).message,
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleClearDemoData = async () => {
    const res = await fetch('/api/meta/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLEAR_DEMO_DATA' }),
    });
    const data = await res.json();
    if (data.ok && data.db) {
      onDbUpdate(data.db);
      setConnectResult({
        ok: true,
        message: '모든 샘플 데이터를 지웠습니다. 이제 실제 Meta 토큰만 연결하여 사용할 수 있습니다.',
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Section 0: ManyChat / Inpock Style 1-Click Instagram OAuth Login */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6">
        <h2 className="text-base font-bold text-slate-900">
          매니챗·인포크링크 방식: &lsquo;Instagram으로 로그인&rsquo; 버튼 연동 (OAuth 2.0)
        </h2>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          서비스 운영자(본인)가 Meta 콘솔에서 최초 1회 앱을 만들어 <strong>Instagram 앱 ID</strong>만 발급해 두면, 이후 나나 다른 유저들은 토큰을 복사할 필요 없이 아래 버튼 하나로 인스타그램 로그인 창을 띄워 3초 만에 연동할 수 있습니다.
        </p>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Instagram 앱 ID 입력 (Meta 콘솔 발급)"
            value={instagramAppId}
            onChange={(e) => setInstagramAppId(e.target.value)}
            className="w-full sm:w-72 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-mono text-slate-900"
          />
          <button
            type="button"
            onClick={handleStartInstagramOAuth}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-pink-600 to-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:opacity-95"
          >
            Instagram 아이디로 로그인하여 연동하기
          </button>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          OAuth 리디렉션 URI: <code className="font-mono text-slate-700">{oauthRedirectUri}</code>
        </div>
      </div>

      {/* Section 1: Meta Token Connection */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              1. 인스타그램 계정 연결 (Meta 공식 무료 Graph API)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Meta 개발자 콘솔에서 발급받은 무료 액세스 토큰(<code>IGAA...</code> 또는 <code>EAAG...</code>)을 입력하면 실제 내 프로필과 게시물 목록을 불러옵니다.
            </p>
          </div>
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Meta 개발자 콘솔
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700">
              Meta Access Token (필수)
            </label>
            <input
              type="password"
              placeholder="IGAA... 또는 EAAG... 로 시작하는 실제 토큰 입력"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Instagram 계정 ID (Meta 콘솔 &lsquo;2. 액세스 토큰 생성&rsquo; 표에서 @아이디 옆의 숫자 복사)
            </label>
            <input
              type="text"
              placeholder="예: 17841405829104921 (필수 권장)"
              value={igBusinessId}
              onChange={(e) => setIgBusinessId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              인스타그램 @아이디 (테스트 계정 생성 시 사용)
            </label>
            <input
              type="text"
              placeholder="예: my_official_kr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={connecting}
            onClick={() => handleConnectAccount(false)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            실제 Meta API 토큰 검증 및 게시물 불러오기
          </button>

          <button
            type="button"
            disabled={connecting}
            onClick={() => handleConnectAccount(true)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            토큰 없이 가상 테스트 계정 추가
          </button>

          <button
            type="button"
            onClick={handleClearDemoData}
            className="ml-auto inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            샘플(데모) 데이터 모두 비우기
          </button>
        </div>

        {connectResult && (
          <div
            className={`mt-4 rounded-xl border p-3.5 text-xs font-medium ${
              connectResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {connectResult.message}
          </div>
        )}
      </div>

      {/* Section 2: Webhook Configuration */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900">
          2. Meta Webhook 콜백 주소 설정
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Meta 개발자 콘솔의 <strong>[Instagram → API 설정 → Webhooks]</strong>에 아래 URL과 확인 토큰을 등록하고 <code>comments</code>, <code>messages</code>, <code>messaging_postbacks</code> 필드를 구독하세요.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600">
              콜백 URL (Callback URL)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                readOnly
                value={callbackUrl}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(callbackUrl, 'cb')}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              확인 토큰 (Verify Token)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(verifyToken, 'vt')}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {copiedKey && (
          <div className="mt-2 text-xs font-semibold text-blue-600">
            ✓ 클립보드에 복사되었습니다.
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            내 서버 웹훅 응답 정상 여부 확인
          </span>
          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={webhookTesting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Play className="h-3.5 w-3.5" />
            웹훅 응답 테스트
          </button>
        </div>

        {webhookResult && (
          <div
            className={`mt-3 rounded-xl border p-3 text-xs ${
              webhookResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {webhookResult.message}
          </div>
        )}
      </div>

      {/* Section 3: Data Collection Verification Spec Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900">
          3. 실제 수집 가능한 데이터 vs 자체 서버 집계 항목 명세 (Meta 공식 API 기준)
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          실제 운영 시 어떤 데이터가 Meta에서 내려오고 어떤 데이터가 자체 서버에서 집계되는지 명확히 구분했습니다.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-3 font-bold">기능 / 데이터 항목</th>
                <th className="py-2.5 px-3 font-bold">수집 출처</th>
                <th className="py-2.5 px-3 font-bold">실제 동작 방식 및 제약사항</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">
                  게시물/릴스 댓글 감지
                </td>
                <td className="py-2.5 px-3">
                  <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                    Meta Webhook (comments)
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <code>comment_id</code>, <code>text</code>(댓글 내용), <code>from.username</code>, <code>media.id</code>가 실시간 전달됨
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">
                  팔로우 여부 확인
                </td>
                <td className="py-2.5 px-3">
                  <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                    Meta Graph API (is_user_follow_business)
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  댓글 시점에는 조회 불가. 1차 DM의 <code>[팔로우 확인]</code> 버튼을 유저가 누른 직후(<code>messaging_postbacks</code>) <code>GET /&#123;IGSID&#125;</code>로 실제 조회됨
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">
                  DM 링크 버튼 클릭 수
                </td>
                <td className="py-2.5 px-3">
                  <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                    자체 서버 단축링크 (/r/[code])
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  Meta API는 DM 내부 외부링크 클릭 수를 제공하지 않으므로, 자체 리다이렉트 주소(<code>/r/코드</code>)를 거쳐 갈 때 DB에서 정확히 +1 카운트함
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-900">
                  등록된 계정 목록 ({accounts.length}개)
                </td>
                <td className="py-2.5 px-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                    구분 표시됨
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  상단 <code>[샘플 데이터 모두 비우기]</code> 버튼을 누르면 체험용 계정이 모두 삭제되고 실제 연결한 계정만 남습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
