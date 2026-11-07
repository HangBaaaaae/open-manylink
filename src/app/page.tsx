'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  ExternalLink,
  MessageSquareHeart,
  Play,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { AutomationRule, DatabaseSchema } from '@/types/automation';
import { INITIAL_SEED_DATA } from '@/lib/seed-data';
import CampaignRuleModal from '@/components/CampaignRuleModal';
import InstaSimulator from '@/components/InstaSimulator';
import MetaConnectWizard from '@/components/MetaConnectWizard';

type MainTab = 'campaigns' | 'simulator' | 'connect';

export default function OpenManyLinkApp() {
  const [db, setDb] = useState<DatabaseSchema>(INITIAL_SEED_DATA);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<MainTab>('campaigns');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isRuleModalOpen, setIsRuleModalOpen] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  React.useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data: DatabaseSchema) => {
        if (data && Array.isArray(data.accounts)) {
          setDb(data);
        }
      })
      .catch(() => {});

    // 6초마다 실제 연동 계정의 최신 인스타그램 댓글을 자동 스캔하여 터널 끊김 시에도 즉시 대댓글 + DM 발송
    const timer = setInterval(() => {
      fetch('/api/meta/sync-comments', { method: 'POST' })
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok && res.db) {
            setDb(res.db);
            if (res.triggeredCount > 0) {
              showToast(
                `실제 인스타 댓글 ${res.triggeredCount}건을 감지하여 자동 대댓글 및 DM을 발송했습니다!`
              );
            }
          }
        })
        .catch(() => {});
    }, 6000);

    return () => clearInterval(timer);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const filteredRules = useMemo(() => {
    return db.rules.filter(
      (r) => selectedAccountId === 'ALL' || r.accountId === selectedAccountId
    );
  }, [db.rules, selectedAccountId]);

  const summary = useMemo(() => {
    let comments = 0;
    let dms = 0;
    let clicks = 0;
    for (const r of filteredRules) {
      comments += r.stats.triggerCount;
      dms += r.stats.finalDmSentCount;
      clicks += r.stats.totalLinkClicks;
    }
    return { comments, dms, clicks };
  }, [filteredRules]);

  const hasDemoAccounts = db.accounts.some((a) => a.dataSource !== 'REAL_META_API');

  const handleToggleRuleActive = async (ruleId: string) => {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TOGGLE_ACTIVE', ruleId }),
    });
    const data = await res.json();
    if (data.ok && data.db) {
      setDb(data.db);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DELETE_RULE', ruleId }),
    });
    const data = await res.json();
    if (data.ok && data.db) {
      setDb(data.db);
      showToast('자동화 규칙이 삭제되었습니다.');
    }
  };

  const handleSaveRule = async (rulePayload: Partial<AutomationRule>) => {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'SAVE_RULE', rule: rulePayload }),
    });
    const data = await res.json();
    if (data.ok && data.db) {
      setDb(data.db);
      showToast('저장되었습니다.');
    }
  };

  const handleCopyShortLink = (shortCode: string) => {
    const url = `${
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    }/r/${shortCode}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    setCopiedCode(shortCode);
    setTimeout(() => setCopiedCode(null), 2000);
    showToast(`복사 완료: ${url}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 md:pb-12">
      {/* Clean Single Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5">
          {/* Left: Brand & Account Select */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <MessageSquareHeart className="h-4 w-4" />
            </div>
            <span className="text-base font-extrabold tracking-tight">
              OpenManyLink
            </span>

            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="ml-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">전체 인스타 계정 ({db.accounts.length})</option>
              {db.accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username}{' '}
                  {acc.dataSource === 'REAL_META_API' ? '(실제 연동)' : '(샘플)'}
                </option>
              ))}
            </select>
          </div>

          {/* Center: 3 Clean Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: 'campaigns' as MainTab, label: '자동 DM 관리' },
              { id: 'simulator' as MainTab, label: '댓글 시뮬레이터' },
              { id: 'connect' as MainTab, label: 'Meta API 연동' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  activeTab === t.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Right: Primary Action */}
          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setIsRuleModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            새 자동 DM 만들기
          </button>
        </div>
      </header>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-16 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg md:bottom-6">
          <Check className="h-4 w-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 pt-6 space-y-6">
        {/* Notice Bar if Demo Seed Data is active */}
        {hasDemoAccounts && activeTab === 'campaigns' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900">
            <span>
              현재 화면에는 기능 체험을 위한 <strong>샘플 데이터</strong>가 포함되어 있습니다. 실제 인스타 계정을 연결하거나 샘플을 비울 수 있습니다.
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('connect')}
              className="font-bold text-blue-700 underline"
            >
              실제 계정 연동 / 샘플 비우기 →
            </button>
          </div>
        )}

        {/* TAB 1: CAMPAIGNS */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            {/* Simple 3-Metric Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">
                  누적 댓글/스토리 감지
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">
                  {summary.comments.toLocaleString()}건
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">
                  발송 완료된 링크 DM
                </div>
                <div className="mt-1 text-xl font-extrabold text-blue-600 tabular-nums">
                  {summary.dms.toLocaleString()}건
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">
                  DM 링크 버튼 클릭 수
                </div>
                <div className="mt-1 text-xl font-extrabold text-emerald-600 tabular-nums">
                  {summary.clicks.toLocaleString()}회
                </div>
              </div>
            </div>

            {/* Clean Campaign List */}
            {filteredRules.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-700">
                  등록된 자동 DM 규칙이 없습니다.
                </p>
                <p className="text-xs text-slate-500">
                  우측 상단 [+ 새 자동 DM 만들기] 버튼을 눌러 첫 번째 댓글 자동 응답을 만들어보세요.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRules.map((rule) => {
                  const acc = db.accounts.find((a) => a.id === rule.accountId);
                  const links =
                    rule.dmTemplateType === 'CAROUSEL' &&
                    rule.carouselCards.length > 0
                      ? rule.carouselCards.map((c) => ({
                          id: c.id,
                          label: c.buttonLabel,
                          shortCode: c.shortCode,
                          clicks: c.clicks,
                        }))
                      : rule.buttons;

                  return (
                    <div
                      key={rule.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        {/* Left: Rule Info */}
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">
                              @{acc?.username}
                            </span>
                            {rule.requireFollow && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <UserCheck className="h-3 w-3" />
                                팔로우 확인 후 발송
                              </span>
                            )}
                            {rule.commentReplyEnabled && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                자동 대댓글 ON
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-900">
                            {rule.title}
                          </h3>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-xs text-slate-400 mr-1">
                              반응 키워드:
                            </span>
                            {rule.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Right: Key Stats + Controls */}
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-4 border-r border-slate-100 pr-4 text-xs tabular-nums">
                            <div>
                              <div className="text-slate-400">댓글 감지</div>
                              <div className="font-bold text-slate-800">
                                {rule.stats.triggerCount.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">DM 발송</div>
                              <div className="font-bold text-blue-600">
                                {rule.stats.finalDmSentCount.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">링크 클릭</div>
                              <div className="font-bold text-emerald-600">
                                {rule.stats.totalLinkClicks.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAccountId(rule.accountId);
                                setActiveTab('simulator');
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Play className="h-3 w-3" />
                              테스트
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRule(rule);
                                setIsRuleModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3 w-3" />
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleRuleActive(rule.id)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                rule.isActive
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {rule.isActive ? 'ON' : 'OFF'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bottom compact row: Tracked Links */}
                      {links.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                          {links.map((btn) => (
                            <div
                              key={btn.id}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1 text-xs border border-slate-200/70"
                            >
                              <span className="font-medium text-slate-700">
                                {btn.label}
                              </span>
                              <span className="font-bold text-emerald-700 tabular-nums">
                                {btn.clicks}회 클릭
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyShortLink(btn.shortCode)
                                }
                                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline"
                              >
                                <Copy className="h-3 w-3" />
                                {copiedCode === btn.shortCode
                                  ? '복사됨'
                                  : `/r/${btn.shortCode}`}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SIMULATOR */}
        {activeTab === 'simulator' && (
          <InstaSimulator
            accounts={db.accounts}
            mediaList={db.mediaList}
            rules={db.rules}
            selectedAccountId={
              selectedAccountId === 'ALL'
                ? db.accounts[0]?.id || 'acc-1'
                : selectedAccountId
            }
            onDbUpdate={(newDb) => setDb(newDb)}
          />
        )}

        {/* TAB 3: META API CONNECT & DATA SPEC */}
        {activeTab === 'connect' && (
          <MetaConnectWizard
            accounts={db.accounts}
            onDbUpdate={(newDb, newAcc) => {
              setDb(newDb);
              if (newAcc) {
                setSelectedAccountId(newAcc.id);
              }
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white py-2.5 md:hidden">
        {[
          { id: 'campaigns' as MainTab, label: '자동 DM 관리' },
          { id: 'simulator' as MainTab, label: '댓글 시뮬레이터' },
          { id: 'connect' as MainTab, label: 'Meta API 연동' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`px-4 py-1 text-xs font-bold ${
              activeTab === item.id ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Campaign Modal */}
      <CampaignRuleModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        initialRule={editingRule}
        selectedAccountId={selectedAccountId}
        accounts={db.accounts}
        mediaList={db.mediaList}
        onSave={handleSaveRule}
      />
    </div>
  );
}
