'use client';

import React, { useState } from 'react';
import {
  Check,
  Clock,
  Layers,
  Link2,
  MessageSquarePlus,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  AutomationRule,
  DmButtonItem,
  DmCarouselCard,
  DmTemplateType,
  InstagramAccount,
  InstagramMedia,
  KeywordMatchMode,
  TriggerType,
} from '@/types/automation';

interface CampaignRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRule: AutomationRule | null;
  selectedAccountId: string;
  accounts: InstagramAccount[];
  mediaList: InstagramMedia[];
  onSave: (rulePayload: Partial<AutomationRule>) => Promise<void>;
}

export default function CampaignRuleModal({
  isOpen,
  onClose,
  initialRule,
  selectedAccountId,
  accounts,
  mediaList,
  onSave,
}: CampaignRuleModalProps) {
  const defaultAccountId =
    initialRule?.accountId ||
    (selectedAccountId !== 'ALL' ? selectedAccountId : accounts[0]?.id || 'acc-1');

  const [accountId, setAccountId] = useState<string>(defaultAccountId);
  const [title, setTitle] = useState<string>(
    initialRule?.title || '신규 릴스 "ㅇㅇ" 댓글 → 팔로우 확인 후 링크 DM 발송'
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialRule?.triggerType || 'POST_COMMENT'
  );
  const [targetMediaId, setTargetMediaId] = useState<string>(
    initialRule?.targetMediaId || 'ALL'
  );
  const [keywordsInput, setKeywordsInput] = useState<string>(
    initialRule?.keywords.join(', ') || 'ㅇㅇ, 링크, 공구, 정보'
  );
  const [matchMode, setMatchMode] = useState<KeywordMatchMode>(
    initialRule?.matchMode || 'FUZZY_CHOSEONG'
  );

  // Comment Auto-Reply Rotation
  const [commentReplyEnabled, setCommentReplyEnabled] = useState<boolean>(
    initialRule?.commentReplyEnabled ?? true
  );
  const [replyTemplates, setReplyTemplates] = useState<string[]>(
    initialRule?.commentReplyTemplates &&
      initialRule.commentReplyTemplates.length > 0
      ? initialRule.commentReplyTemplates
      : [
          '안녕하세요! 요청하신 시크릿 링크를 DM으로 보내드렸어요 😊 메시지함을 확인해주세요!',
          '방금 DM으로 안내 링크 발송 완료했습니다! 💌 확인 부탁드려요 ✨',
          '댓글 감사합니다 🤍 DM 메시지함으로 구매 좌표 보내드렸으니 확인해보세요!',
        ]
  );
  const [newReplyInput, setNewReplyInput] = useState<string>('');

  // Cooldown & Follow Gate
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(
    initialRule?.cooldownMinutes ?? 1440
  );
  const [requireFollow, setRequireFollow] = useState<boolean>(
    initialRule?.requireFollow ?? true
  );
  const [followPromptMessage, setFollowPromptMessage] = useState<string>(
    initialRule?.followPromptMessage ||
      '안녕하세요 @{{username}}님! 🌿 요청하신 시크릿 혜택 링크는 **팔로워분들께만** 단독 공개하고 있어요.\n\n아래 버튼을 눌러 팔로우 여부를 확인하시면 1초 만에 링크가 열립니다! 👇'
  );
  const [followVerifyButtonText, setFollowVerifyButtonText] = useState<string>(
    initialRule?.followVerifyButtonText || '✅ 팔로우 확인하고 링크 받기'
  );
  const [unfollowedRetryMessage, setUnfollowedRetryMessage] = useState<string>(
    initialRule?.unfollowedRetryMessage ||
      '앗, 아직 팔로우가 확인되지 않았어요 😢 프로필에서 [팔로우]를 누르신 뒤 아래 [다시 확인하기] 버튼을 눌러주세요!'
  );

  // DM Template & Buttons / Carousel
  const [dmTemplateType, setDmTemplateType] = useState<DmTemplateType>(
    initialRule?.dmTemplateType || 'SINGLE_BUTTON'
  );
  const [dmBodyText, setDmBodyText] = useState<string>(
    initialRule?.dmBodyText ||
      '🎉 @{{username}}님 팔로우 확인 완료! 요청하신 시크릿 링크를 아래 버튼에서 바로 확인해보세요.'
  );
  const [buttons, setButtons] = useState<DmButtonItem[]>(
    initialRule?.buttons && initialRule.buttons.length > 0
      ? initialRule.buttons
      : [
          {
            id: `btn-${Date.now()}`,
            label: '🔥 시크릿 혜택 링크 바로가기',
            targetUrl: 'https://smartstore.naver.com/my-brand/products/100',
            shortCode: `link-${Math.floor(100 + Math.random() * 900)}`,
            clicks: 0,
          },
        ]
  );
  const [carouselCards, setCarouselCards] = useState<DmCarouselCard[]>(
    initialRule?.carouselCards && initialRule.carouselCards.length > 0
      ? initialRule.carouselCards
      : [
          {
            id: `card-${Date.now()}-1`,
            badgeText: 'BEST · 단독특가',
            title: '[시크릿공구] 대표 인기 상품 본품 세트',
            subtitle: '무료배송 + 사은품 증정 이벤트',
            priceText: '29,900원 (45% 할인)',
            buttonLabel: '⚡ 시크릿 특가로 구매하기',
            targetUrl: 'https://smartstore.naver.com/my-brand/products/101',
            shortCode: `card-${Math.floor(100 + Math.random() * 900)}`,
            clicks: 0,
          },
        ]
  );

  // Limit / Deadline Timer
  const [limitEnabled, setLimitEnabled] = useState<boolean>(
    initialRule?.limitConfig.enabled ?? false
  );
  const [maxClaims, setMaxClaims] = useState<string>(
    initialRule?.limitConfig.maxClaims
      ? String(initialRule.limitConfig.maxClaims)
      : '500'
  );
  const [closedMessage, setClosedMessage] = useState<string>(
    initialRule?.limitConfig.closedMessage ||
      '아쉽게도 준비된 선착순 혜택 수량이 모두 마감되었습니다 🙏 다음 오픈 알림을 신청해주세요!'
  );

  const [saving, setSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const accountMedias = mediaList.filter((m) => m.accountId === accountId);

  const handleAddReplyTemplate = () => {
    const trimmed = newReplyInput.trim();
    if (!trimmed) return;
    setReplyTemplates([...replyTemplates, trimmed]);
    setNewReplyInput('');
  };

  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    setButtons([
      ...buttons,
      {
        id: `btn-${Date.now()}`,
        label: '📎 추가 안내 링크 보기',
        targetUrl: 'https://instagram.com',
        shortCode: `btn-${Math.floor(100 + Math.random() * 900)}`,
        clicks: 0,
      },
    ]);
  };

  const handleAddCarouselCard = () => {
    if (carouselCards.length >= 4) return;
    setCarouselCards([
      ...carouselCards,
      {
        id: `card-${Date.now()}`,
        badgeText: '추천 구성',
        title: '추가 구성 상품 세트',
        subtitle: '팔로워 전용 추가 할인 적용',
        priceText: '39,000원',
        buttonLabel: '🛒 상품 보러가기',
        targetUrl: 'https://smartstore.naver.com',
        shortCode: `crd-${Math.floor(100 + Math.random() * 900)}`,
        clicks: 0,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedKeywords = keywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      await onSave({
        id: initialRule?.id,
        accountId,
        title,
        isActive: initialRule?.isActive ?? true,
        triggerType,
        targetMediaId,
        keywords: parsedKeywords.length > 0 ? parsedKeywords : ['ㅇㅇ'],
        matchMode,
        commentReplyEnabled,
        commentReplyTemplates: replyTemplates,
        cooldownMinutes,
        jitterDelayRangeSec: [3, 10],
        requireFollow,
        followPromptMessage,
        followVerifyButtonText,
        unfollowedRetryMessage,
        dmTemplateType,
        dmBodyText,
        buttons,
        carouselCards,
        limitConfig: {
          enabled: limitEnabled,
          maxClaims: limitEnabled ? Number(maxClaims) || 500 : null,
          currentClaims: initialRule?.limitConfig.currentClaims || 0,
          expiresAt: initialRule?.limitConfig.expiresAt || null,
          closedMessage,
        },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
              <Sparkles className="h-3 w-3" />
              Meta 공식 무료 API 기반 자동화 빌더
            </span>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {initialRule ? '자동 DM 캠페인 규칙 수정' : '새 댓글→자동 DM 캠페인 만들기'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6"
        >
          {/* 1. 계정 & 대상 게시물/트리거 선택 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. 인스타 계정 및 감지할 게시물 선택
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  연동된 인스타그램 계정
                </label>
                <select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setTargetMediaId('ALL');
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      @{acc.username} ({acc.displayName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  트리거 유형 (댓글 vs 스토리 답장)
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="POST_COMMENT">게시물 · 릴스 댓글 감지</option>
                  <option value="STORY_REPLY">스토리 답장 메시지 감지</option>
                  <option value="ALL_MEDIA_COMMENT">모든 게시물/스토리 통합 감지</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                캠페인 관리 제목
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                적용할 특정 게시물 / 릴스 선택
              </label>
              <select
                value={targetMediaId}
                onChange={(e) => setTargetMediaId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="ALL">✨ 계정의 전체 게시물 · 릴스에 모두 적용</option>
                {accountMedias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.thumbnailTag})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. 키워드 및 초성/유사어 매칭 설정 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. 댓글 트리거 키워드 설정 (&ldquo;ㅇㅇ&rdquo; 달면 발송)
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700">
                  반응할 키워드 목록 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: ㅇㅇ, 공구, 링크, 정보"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  키워드 매칭 방식
                </label>
                <select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as KeywordMatchMode)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="FUZZY_CHOSEONG">
                    초성·공백무시·포함 허용 (추천)
                  </option>
                  <option value="CONTAINS">단어 포함 시 발송 (Contains)</option>
                  <option value="EXACT">정확히 일치할 때만 발송 (Exact)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. 댓글 자동 답글 달기 & 스팸 방지 랜덤 로테이션 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-900">
                  3. 댓글에 자동 대댓글 달기 (랜덤 문구 로테이션으로 스팸 차단 방지)
                </span>
              </div>
              <input
                type="checkbox"
                checked={commentReplyEnabled}
                onChange={(e) => setCommentReplyEnabled(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </div>

            {commentReplyEnabled && (
              <div className="space-y-2 pt-1">
                {replyTemplates.map((tpl, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                  >
                    <span>
                      <strong className="mr-1.5 text-blue-600">
                        프리셋 #{idx + 1}
                      </strong>
                      {tpl}
                    </span>
                    {replyTemplates.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setReplyTemplates(
                            replyTemplates.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="새로운 랜덤 대댓글 문구를 입력하세요..."
                    value={newReplyInput}
                    onChange={(e) => setNewReplyInput(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddReplyTemplate}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    문구 추가
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. 팔로우 여부 확인 뒤 발송 (Meta 2-Step Verification) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900">
                    4. 계정 팔로우 여부 확인 뒤 링크 발송하기 (팔로워 전환 유도)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    1차 DM의 확인 버튼 클릭 시 Meta <code>is_user_follow_business</code> API로 팔로우를 검증합니다.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={requireFollow}
                onChange={(e) => setRequireFollow(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </div>

            {requireFollow && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    1차 팔로우 확인 요청 DM 메시지
                  </label>
                  <textarea
                    rows={2}
                    value={followPromptMessage}
                    onChange={(e) => setFollowPromptMessage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      팔로우 확인 버튼 텍스트
                    </label>
                    <input
                      type="text"
                      value={followVerifyButtonText}
                      onChange={(e) => setFollowVerifyButtonText(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      동일 유저 중복 발송 방지 쿨다운 (분)
                    </label>
                    <input
                      type="number"
                      value={cooldownMinutes}
                      onChange={(e) =>
                        setCooldownMinutes(Number(e.target.value) || 0)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. 최종 발송될 DM 본문 & 링크 버튼 / 멀티 카드 캐러셀 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-900">
                  5. 최종 혜택 DM 메시지 & 클릭 수 트래킹 링크 버튼
                </span>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDmTemplateType('SINGLE_BUTTON')}
                  className={`rounded-lg px-2.5 py-1 font-bold transition ${
                    dmTemplateType === 'SINGLE_BUTTON'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  단일 카드 + 링크 버튼
                </button>
                <button
                  type="button"
                  onClick={() => setDmTemplateType('CAROUSEL')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                    dmTemplateType === 'CAROUSEL'
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  멀티 카드 캐러셀
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                본문 안내 메시지 (<code>{'@{{username}}'}</code> 자동 치환)
              </label>
              <textarea
                rows={2}
                value={dmBodyText}
                onChange={(e) => setDmBodyText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            {dmTemplateType === 'SINGLE_BUTTON' ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    DM 링크 버튼 (최대 3개 · 클릭 수 실시간 자동 집계)
                  </span>
                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddButton}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      + 버튼 추가
                    </button>
                  )}
                </div>
                {buttons.map((btn, idx) => (
                  <div
                    key={btn.id}
                    className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-500">
                        버튼 이름 #{idx + 1}
                      </label>
                      <input
                        type="text"
                        value={btn.label}
                        onChange={(e) => {
                          const next = [...buttons];
                          next[idx] = { ...btn, label: e.target.value };
                          setButtons(next);
                        }}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-500">
                        이동할 실제 URL
                      </label>
                      <input
                        type="url"
                        value={btn.targetUrl}
                        onChange={(e) => {
                          const next = [...buttons];
                          next[idx] = { ...btn, targetUrl: e.target.value };
                          setButtons(next);
                        }}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-end gap-1.5">
                      <div className="flex-1">
                        <label className="block text-[11px] font-semibold text-slate-500">
                          단축코드 (/r/...)
                        </label>
                        <input
                          type="text"
                          value={btn.shortCode}
                          onChange={(e) => {
                            const next = [...buttons];
                            next[idx] = { ...btn, shortCode: e.target.value };
                            setButtons(next);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                        />
                      </div>
                      {buttons.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setButtons(buttons.filter((_, i) => i !== idx))
                          }
                          className="rounded-lg p-2 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    슬라이드형 캐러셀 카드 목록 ({carouselCards.length}개)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCarouselCard}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    + 캐러셀 카드 추가
                  </button>
                </div>
                {carouselCards.map((card, idx) => (
                  <div
                    key={card.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="배지 (예: BEST·45%)"
                        value={card.badgeText}
                        onChange={(e) => {
                          const next = [...carouselCards];
                          next[idx] = { ...card, badgeText: e.target.value };
                          setCarouselCards(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="카드 상품 제목"
                        value={card.title}
                        onChange={(e) => {
                          const next = [...carouselCards];
                          next[idx] = { ...card, title: e.target.value };
                          setCarouselCards(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:col-span-2"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="버튼명"
                        value={card.buttonLabel}
                        onChange={(e) => {
                          const next = [...carouselCards];
                          next[idx] = { ...card, buttonLabel: e.target.value };
                          setCarouselCards(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="url"
                        placeholder="이동할 URL"
                        value={card.targetUrl}
                        onChange={(e) => {
                          const next = [...carouselCards];
                          next[idx] = { ...card, targetUrl: e.target.value };
                          setCarouselCards(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                      <input
                        type="text"
                        placeholder="단축코드"
                        value={card.shortCode}
                        onChange={(e) => {
                          const next = [...carouselCards];
                          next[idx] = { ...card, shortCode: e.target.value };
                          setCarouselCards(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. 선착순 수량 마감 옵션 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold text-slate-900">
                  6. 선착순 발송 수량 제한 및 마감 후 안내 DM 자동 전환
                </span>
              </div>
              <input
                type="checkbox"
                checked={limitEnabled}
                onChange={(e) => setLimitEnabled(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </div>

            {limitEnabled && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    선착순 최대 발송 인원(명)
                  </label>
                  <input
                    type="number"
                    value={maxClaims}
                    onChange={(e) => setMaxClaims(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700">
                    마감 도달 시 발송할 대체 DM 문구
                  </label>
                  <input
                    type="text"
                    value={closedMessage}
                    onChange={(e) => setClosedMessage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saving ? '저장 중...' : '자동화 규칙 저장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
