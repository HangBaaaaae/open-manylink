export type MediaType = 'REELS' | 'FEED' | 'STORY';

export type TriggerType = 'POST_COMMENT' | 'STORY_REPLY' | 'ALL_MEDIA_COMMENT';

export type KeywordMatchMode = 'EXACT' | 'CONTAINS' | 'FUZZY_CHOSEONG';

export type DmTemplateType = 'SINGLE_BUTTON' | 'CAROUSEL';

export type EventFunnelStatus =
  | 'AWAITING_FOLLOW_CLICK'
  | 'FOLLOW_FAILED_RETRY'
  | 'DM_SENT'
  | 'LINK_CLICKED'
  | 'COOLDOWN_SKIPPED'
  | 'LIMIT_CLOSED';

export interface InstagramAccount {
  id: string;
  username: string;
  displayName: string;
  category: string;
  igBusinessId: string;
  pageId: string;
  accessToken?: string; // 실제 Meta Graph API 호출용 토큰 (서버 저장)
  accessTokenMasked: string;
  dataSource?: 'REAL_META_API' | 'DEMO_SEED';
  webhookConnected: boolean;
  followersCount: number;
  hourlyQuotaLimit: number; // Meta 공식 무료 API 기본 시간당 200콜
  hourlyQuotaUsed: number;
  avatarBadge: string;
  profileUrl: string;
}

export interface InstagramMedia {
  id: string;
  accountId: string;
  mediaType: MediaType;
  title: string;
  caption: string;
  permalink: string;
  publishedAt: string;
  commentsCount: number;
  likesCount: number;
  thumbnailTag: string;
}

export interface DmButtonItem {
  id: string;
  label: string;
  targetUrl: string;
  shortCode: string;
  clicks: number;
}

export interface DmCarouselCard {
  id: string;
  badgeText: string;
  title: string;
  subtitle: string;
  priceText?: string;
  buttonLabel: string;
  targetUrl: string;
  shortCode: string;
  clicks: number;
}

export interface CampaignLimitConfig {
  enabled: boolean;
  maxClaims: number | null; // 선착순 발송 수량 (null이면 무제한)
  currentClaims: number;
  expiresAt: string | null; // ISO 마감 시간 (null이면 상시)
  closedMessage: string; // 선착순/기한 마감 후 발송될 안내 DM
}

export interface CampaignFunnelStats {
  triggerCount: number; // 댓글/스토리 감지 수
  publicReplyCount: number; // 대댓글 자동 등록 수
  initialDmSentCount: number; // 1차 팔로우 확인 DM 발송 수
  followVerifiedCount: number; // 팔로우 확인 완료 수
  finalDmSentCount: number; // 최종 혜택/링크 DM 발송 수
  totalLinkClicks: number; // DM 내 링크 버튼 총 클릭 수
  cooldownBlockedCount: number; // 중복 댓글 쿨다운 방어 수
}

export interface AutomationRule {
  id: string;
  accountId: string;
  title: string;
  isActive: boolean;
  triggerType: TriggerType;
  targetMediaId: string; // 특정 게시물 ID 또는 'ALL'
  targetMediaTitle: string;
  keywords: string[];
  matchMode: KeywordMatchMode;
  commentReplyEnabled: boolean;
  commentReplyTemplates: string[]; // 스팸 방지용 랜덤 대댓글 로테이션 프리셋
  cooldownMinutes: number; // 동일 유저 중복 발송 방지 (분 단위)
  jitterDelayRangeSec: [number, number]; // 인간 유사 발송 딜레이 (초)
  requireFollow: boolean; // 팔로우 여부 확인 뒤 발송 (Meta 2-Step 검증)
  followPromptMessage: string; // 1차 DM (팔로우 확인 요청 메시지)
  followVerifyButtonText: string; // 1차 DM 포스트백 버튼명
  unfollowedRetryMessage: string; // 미팔로워일 때 재유도 메시지
  dmTemplateType: DmTemplateType;
  dmBodyText: string;
  buttons: DmButtonItem[];
  carouselCards: DmCarouselCard[];
  limitConfig: CampaignLimitConfig;
  stats: CampaignFunnelStats;
  updatedAt: string;
}

export interface TrackedLink {
  shortCode: string;
  ruleId: string;
  accountId: string;
  buttonLabel: string;
  targetUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  clicks: number;
  lastClickedAt: string | null;
}

export interface AutomationEventLog {
  id: string;
  timestamp: string;
  accountId: string;
  ruleId: string;
  ruleTitle: string;
  igUsername: string;
  triggerType: TriggerType;
  inputText: string;
  matchedKeyword: string;
  publicReplyText: string | null;
  isFollower: boolean;
  status: EventFunnelStatus;
  dmSentPreview: string;
  shortCodeClicked: string | null;
}

export interface DatabaseSchema {
  accounts: InstagramAccount[];
  mediaList: InstagramMedia[];
  rules: AutomationRule[];
  trackedLinks: TrackedLink[];
  eventLogs: AutomationEventLog[];
  cooldownHistory: Record<string, string>; // key: `${ruleId}:${igUsername}` -> ISO timestamp
}
