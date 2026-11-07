'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  MousePointerClick,
  Send,
  Sparkles,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  AutomationRule,
  DatabaseSchema,
  InstagramAccount,
  InstagramMedia,
} from '@/types/automation';

interface InstaSimulatorProps {
  accounts: InstagramAccount[];
  mediaList: InstagramMedia[];
  rules: AutomationRule[];
  selectedAccountId: string;
  onDbUpdate: (newDb: DatabaseSchema) => void;
}

interface ChatMessage {
  id: string;
  sender: 'USER_COMMENT' | 'BOT_PUBLIC_REPLY' | 'BOT_DM' | 'SYSTEM_NOTICE';
  text: string;
  timestamp: string;
  verifyAction?: {
    eventId: string;
    ruleId: string;
    buttonLabel: string;
  };
  buttons?: {
    label: string;
    shortCode: string;
    targetUrl: string;
    clicks: number;
  }[];
  carousel?: {
    badgeText: string;
    title: string;
    subtitle: string;
    priceText?: string;
    buttonLabel: string;
    shortCode: string;
    clicks: number;
  }[];
}

export default function InstaSimulator({
  accounts,
  mediaList,
  rules,
  selectedAccountId,
  onDbUpdate,
}: InstaSimulatorProps) {
  const activeAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const accountMedias = mediaList.filter(
    (m) => m.accountId === activeAccount?.id
  );
  const [selectedMediaId, setSelectedMediaId] = useState<string>(
    accountMedias[0]?.id || mediaList[0]?.id || 'media-101'
  );

  const currentMedia =
    mediaList.find((m) => m.id === selectedMediaId) ||
    accountMedias[0] ||
    mediaList[0];

  const [igUsername, setIgUsername] = useState<string>('mina_seoul');
  const [isFollower, setIsFollower] = useState<boolean>(false);
  const [commentInput, setCommentInput] = useState<string>('ㅇㅇ');
  const [loading, setLoading] = useState<boolean>(false);
  const [clickNotice, setClickNotice] = useState<string | null>(null);
  const [showApiJson, setShowApiJson] = useState<boolean>(false);
  const [lastApiPayloads, setLastApiPayloads] = useState<unknown>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'SYSTEM_NOTICE',
      text: '아래에서 "ㅇㅇ" 댓글을 입력하면 대댓글 → 팔로우 확인 버튼 → 링크 DM 발송 과정을 테스트할 수 있습니다.',
      timestamp: '안내',
    },
  ]);

  if (!activeAccount) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        연결된 계정이 없습니다. [Meta API 연동] 탭에서 계정을 먼저 연결해주세요.
      </div>
    );
  }

  const handleSendComment = async (customText?: string) => {
    const textToSend = (customText ?? commentInput).trim();
    if (!textToSend || !currentMedia) return;

    setLoading(true);
    const nowTime = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'USER_COMMENT',
      text: `@${igUsername}: "${textToSend}"`,
      timestamp: nowTime,
    };

    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TRIGGER_COMMENT',
          accountId: activeAccount.id,
          mediaId: currentMedia.id,
          triggerType:
            currentMedia.mediaType === 'STORY' ? 'STORY_REPLY' : 'POST_COMMENT',
          igUsername,
          inputText: textToSend,
          isFollower,
          bypassCooldown: true,
        }),
      });
      const data = await res.json();

      if (data.db) onDbUpdate(data.db);
      if (data.metaApiPayloads) setLastApiPayloads(data.metaApiPayloads);

      const nextMessages: ChatMessage[] = [userMsg];

      if (!data.matched) {
        nextMessages.push({
          id: `sys-${Date.now()}`,
          sender: 'SYSTEM_NOTICE',
          text: data.reason || '일치하는 키워드 규칙이 없습니다.',
          timestamp: nowTime,
        });
      } else {
        if (data.publicReplyText) {
          nextMessages.push({
            id: `rep-${Date.now()}`,
            sender: 'BOT_PUBLIC_REPLY',
            text: `💬 [자동 대댓글] @${activeAccount.username}: "${data.publicReplyText}"`,
            timestamp: nowTime,
          });
        }

        if (data.requiresFollowStep && data.eventLog && data.rule) {
          nextMessages.push({
            id: `dm-follow-${Date.now()}`,
            sender: 'BOT_DM',
            text: data.initialFollowPromptText,
            timestamp: nowTime,
            verifyAction: {
              eventId: data.eventLog.id,
              ruleId: data.rule.id,
              buttonLabel:
                data.followVerifyButtonText || '✅ 팔로우 확인하고 링크 받기',
            },
          });
        } else if (data.finalDmBodyText && data.rule) {
          const ruleObj = data.rule as AutomationRule;
          nextMessages.push({
            id: `dm-final-${Date.now()}`,
            sender: 'BOT_DM',
            text: data.finalDmBodyText,
            timestamp: nowTime,
            buttons:
              ruleObj.dmTemplateType === 'SINGLE_BUTTON'
                ? ruleObj.buttons
                : undefined,
            carousel:
              ruleObj.dmTemplateType === 'CAROUSEL'
                ? ruleObj.carouselCards
                : undefined,
          });
        }
      }

      setChatHistory((prev) => [...prev, ...nextMessages]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyFollowClick = async (eventId: string, ruleId: string) => {
    setLoading(true);
    const nowTime = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VERIFY_FOLLOW_POSTBACK',
          eventId,
          ruleId,
          isFollowerNow: isFollower,
        }),
      });
      const data = await res.json();
      if (data.db) onDbUpdate(data.db);
      if (data.metaApiPayloads) setLastApiPayloads(data.metaApiPayloads);

      const ruleObj = data.rule as AutomationRule | undefined;

      if (!data.verified) {
        setChatHistory((prev) => [
          ...prev,
          {
            id: `retry-${Date.now()}`,
            sender: 'BOT_DM',
            text: data.messageText,
            timestamp: nowTime,
            verifyAction: {
              eventId,
              ruleId,
              buttonLabel: '🔄 팔로우 완료! 다시 확인하기',
            },
          },
        ]);
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            id: `verified-${Date.now()}`,
            sender: 'BOT_DM',
            text: data.messageText,
            timestamp: nowTime,
            buttons:
              ruleObj?.dmTemplateType === 'SINGLE_BUTTON'
                ? ruleObj.buttons
                : undefined,
            carousel:
              ruleObj?.dmTemplateType === 'CAROUSEL'
                ? ruleObj.carouselCards
                : undefined,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLinkClick = async (shortCode: string, label: string) => {
    const res = await fetch('/api/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CLICK_SHORT_LINK',
        shortCode,
      }),
    });
    const data = await res.json();
    if (data.db) onDbUpdate(data.db);
    setClickNotice(
      `[${label}] 클릭 수 +1 반영됨 (현재 총 ${data.totalClicks}회 클릭)`
    );
    setTimeout(() => setClickNotice(null), 3500);
  };

  const activeRules = rules.filter(
    (r) => r.accountId === activeAccount.id && r.isActive
  );

  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Simple Settings Panel (5 cols) */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              시뮬레이션 조건 설정
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              실제 인스타그램에서 유저가 댓글을 달았을 때의 흐름을 그대로 재현합니다.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              1. 대상 게시물 선택
            </label>
            <select
              value={currentMedia?.id || ''}
              onChange={(e) => setSelectedMediaId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900"
            >
              {accountMedias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              2. 댓글 작성자의 팔로우 상태
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsFollower(false)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition ${
                  !isFollower
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <UserX className="h-3.5 w-3.5" />
                미팔로워
              </button>
              <button
                type="button"
                onClick={() => setIsFollower(true)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition ${
                  isFollower
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                팔로워
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              미팔로워로 두고 댓글을 단 뒤, DM 버튼을 눌러 차단되는 것을 보고 팔로워로 전환해 다시 눌러보세요.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-700">
              현재 활성화된 키워드
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeRules.flatMap((r) => r.keywords).map((kw, i) => (
                <button
                  key={`${kw}-${i}`}
                  type="button"
                  onClick={() => {
                    setCommentInput(kw);
                    handleSendComment(kw);
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
                >
                  &ldquo;{kw}&rdquo; 눌러서 바로 테스트
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowApiJson(!showApiJson)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
            >
              {showApiJson
                ? 'Meta Graph API 요청 JSON 닫기'
                : '실제 전송되는 Meta API JSON 전문 보기'}
            </button>
            {showApiJson && (
              <pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
                {lastApiPayloads
                  ? JSON.stringify(lastApiPayloads, null, 2)
                  : '// 댓글을 입력하면 실제 Meta API 페이로드가 표시됩니다.'}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Right: Clean Mobile Preview Screen (7 cols) */}
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <span className="text-xs font-bold text-slate-900">
                @{activeAccount.username}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {currentMedia?.title}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setChatHistory([])}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              초기화
            </button>
          </div>

          {clickNotice && (
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 border-b border-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {clickNotice}
            </div>
          )}

          {/* Message Stream */}
          <div className="h-[400px] space-y-3 overflow-y-auto bg-slate-50 p-4">
            {chatHistory.map((msg) => {
              if (msg.sender === 'SYSTEM_NOTICE') {
                return (
                  <div
                    key={msg.id}
                    className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center text-xs text-slate-500"
                  >
                    {msg.text}
                  </div>
                );
              }

              if (msg.sender === 'USER_COMMENT') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-blue-600 px-3.5 py-2 text-xs font-medium text-white">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              if (msg.sender === 'BOT_PUBLIC_REPLY') {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-900">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="w-full max-w-[88%] space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-800 shadow-2xs">
                    <div className="text-[11px] font-bold text-blue-600">
                      📩 발송된 자동 DM
                    </div>
                    <div className="whitespace-pre-line leading-relaxed">
                      {msg.text}
                    </div>

                    {msg.verifyAction && (
                      <button
                        type="button"
                        onClick={() =>
                          handleVerifyFollowClick(
                            msg.verifyAction!.eventId,
                            msg.verifyAction!.ruleId
                          )
                        }
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {msg.verifyAction.buttonLabel}
                      </button>
                    )}

                    {msg.buttons && msg.buttons.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {msg.buttons.map((b) => (
                          <button
                            key={b.shortCode}
                            type="button"
                            onClick={() =>
                              handleLinkClick(b.shortCode, b.label)
                            }
                            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 hover:border-blue-400 hover:bg-blue-50/40"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <MousePointerClick className="h-3.5 w-3.5 text-blue-600" />
                              {b.label}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              클릭 {b.clicks}회
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {msg.carousel && msg.carousel.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                        {msg.carousel.map((card) => (
                          <div
                            key={card.shortCode}
                            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div>
                              <span className="text-[10px] font-bold text-blue-600">
                                {card.badgeText}
                              </span>
                              <div className="mt-0.5 font-bold text-slate-900">
                                {card.title}
                              </div>
                              {card.priceText && (
                                <div className="mt-1 text-xs font-bold text-emerald-700">
                                  {card.priceText}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleLinkClick(
                                  card.shortCode,
                                  card.buttonLabel
                                )
                              }
                              className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              <span>{card.buttonLabel}</span>
                              <span className="text-[10px] opacity-80 tabular-nums">
                                {card.clicks}회
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Bar */}
          <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
            <input
              type="text"
              value={igUsername}
              onChange={(e) => setIgUsername(e.target.value)}
              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
              placeholder="아이디"
            />
            <input
              type="text"
              placeholder='댓글 입력 (예: "ㅇㅇ")'
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSendComment()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Send className="h-3.5 w-3.5" />
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
