import type { MediaMetadata } from './storage';
export type { MediaMetadata } from './storage';

export type UserRole =
  | 'user'
  | 'moderator'
  | 'room_leader'
  | 'assistant_admin'
  | 'admin'
  | 'owner';

export const ROLE_RANK: Record<UserRole, number> = {
  user: 1,
  moderator: 2,
  room_leader: 3,
  assistant_admin: 4,
  admin: 5,
  owner: 6,
};

export function getRoleRank(role?: UserRole): number {
  return ROLE_RANK[role || 'user'] || 1;
}

export type VerificationCategory = 'blue' | 'silver' | 'institution' | 'blood_red';
export type VerificationStatus = 'not_verified' | 'pending' | 'verified' | 'rejected';

export interface CustomTitle {
  id?: string;
  text: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
  gradient?: string;
  icon?: string;
  shape?: 'tag' | 'shield' | 'banner';
  priority?: number;
  grantedBy?: string;
  grantedByName?: string;
  grantedAt?: string;
}

export interface CustomTitlePreset {
  id: string;
  text: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
  gradient?: string;
  icon?: string;
  shape?: 'tag' | 'shield' | 'banner';
  priority?: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export type GlobalPermissionKey =
  | 'manageUsers'
  | 'manageRoles'
  | 'manageTitles'
  | 'manageEvents'
  | 'manageAnnouncements'
  | 'manageAds'
  | 'manageVerifications'
  | 'manageRooms'
  | 'manageWiki'
  | 'manageStickers'
  | 'manageLive'
  | 'viewAuditLogs';

export interface GlobalAdminRole {
  id: string;
  name: string;
  description?: string;
  color?: string;
  permissions: Partial<Record<GlobalPermissionKey, boolean>>;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserCustomization {
  accentColor?: 'gold' | 'emerald' | 'crimson' | 'silver' | 'amethyst' | 'sapphire';
  themePattern?: 'castle' | 'stars' | 'minimal' | 'carbon';
  pinnedPostId?: string;
  links?: Array<{ label: string; url: string }>;
  privacy?: {
    profileVisibility?: 'public' | 'followers_only';
    directMessages?: 'everyone' | 'followers_only';
    allowComments?: 'everyone' | 'followers_only';
  };
  notifications?: {
    likes?: boolean;
    comments?: boolean;
    follows?: boolean;
    messages?: boolean;
    showMessagePreview?: boolean;
    announcements?: boolean;
    sound?: boolean;
  };
  chatPreferences?: {
    useRoomTheme?: boolean;
    bubbleTheme?: 'classic' | 'glass' | 'minimal' | 'gold';
    accentColor?: string;
    compactMode?: boolean;
    defaultDmBgPresetId?: string;
    defaultDmBgImageURL?: string;
    dmBackgrounds?: Record<string, { presetId?: string; imageURL?: string }>;
    roomBackgroundOverrides?: Record<string, { presetId?: string; imageURL?: string }>;
  };
  savedStickerPackIds?: string[];
  recentStickers?: Array<{ packId: string; stickerId: string; url: string; label?: string }>;
}

export interface UserProfile {
  id: string; // Firebase UID
  displayName: string;
  handle: string;
  email?: string;
  photoURL?: string;
  photoPath?: string;
  bannerURL?: string;
  bannerPath?: string;
  bio?: string;
  role: UserRole;
  customRoleId?: string;
  customRoleName?: string;
  globalPermissions?: Partial<Record<GlobalPermissionKey, boolean>>;
  isVerified: boolean;
  verificationCategory?: VerificationCategory;
  verificationStatus?: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  level: number;
  xp: number;
  dailyXpDate?: string;
  dailyXpEarned?: number;
  lastDailyCheckinDate?: string;
  lastDailyCheckinAt?: string;
  xpActionLastAt?: Record<string, string>;
  customTitle?: CustomTitle | null;
  customTitles?: CustomTitle[];
  isSpecial?: boolean;
  achievements?: string[];
  isOnline: boolean;
  lastActiveAt: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  customization?: UserCustomization;
  isRestricted?: boolean;
  restrictedUntil?: string;
  restrictionReason?: string;
  isSuspended?: boolean;
  isBanned?: boolean;
  warningCount?: number;
  suspensionReason?: string;
  bannedReason?: string;
}

export type GlobalPostType = 'post' | 'blog' | 'wiki' | 'question' | 'poll' | 'quiz' | 'repost';

export interface PostRepostPreview {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorPhotoURL?: string;
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  content: string;
  title?: string;
  mediaURL?: string;
  mediaURLs?: string[];
  createdAt: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorPhotoURL?: string;
  authorRole?: UserRole;
  authorCustomTitle?: CustomTitle | null;
  authorCustomTitles?: CustomTitle[];
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  authorLevel?: number;
  postType?: GlobalPostType;
  visibility?: 'public' | 'followers_only';
  title?: string;
  content: string;
  mediaURL?: string;
  mediaURLs?: string[];
  videoURL?: string;
  mediaMetadata?: MediaMetadata[];
  storageProvider?: 'supabase';
  tags?: string[];
  repostOf?: PostRepostPreview;
  poll?: {
    question: string;
    options: Array<{ id: string; text: string; votesCount: number }>;
    allowMultiple?: boolean;
    totalVotes: number;
  };
  quiz?: {
    title: string;
    description?: string;
    questions: Array<{ id: string; prompt: string; options: string[]; correctIndex: number }>;
    attemptsCount: number;
  };
  bestAnswerCommentId?: string;
  likesCount: number;
  commentsCount: number;
  repostsCount?: number;
  sharesCount?: number;
  bookmarksCount?: number;
  community?: string;
  isPinned?: boolean;
  isHidden?: boolean;
  editedAt?: string;
  editedBy?: string;
  editedByName?: string;
  createdAt: string;
  updatedAt?: string;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorPhotoURL?: string;
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  authorLevel?: number;
  text: string;
  parentCommentId?: string;
  replyToAuthorName?: string;
  isBestAnswer?: boolean;
  createdAt: string;
}

export interface FollowRelationship {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantDetails?: Record<string, {
    displayName: string;
    handle: string;
    photoURL?: string;
    isVerified?: boolean;
    verificationCategory?: VerificationCategory;
  }>;
  isGroup?: boolean;
  groupName?: string;
  groupDescription?: string;
  groupAvatar?: string;
  createdBy?: string;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageTimestamp?: string;
  updatedAt?: string;
  createdAt: string;
  unreadCount?: number;
  readBy?: Record<string, string>;
  typingUsers?: Record<string, string>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'sticker';
  text: string;
  mediaURL?: string;
  mediaType?: 'image' | 'video';
  mediaPath?: string;
  mediaMetadata?: MediaMetadata;
  audioURL?: string;
  audioDurationSec?: number;
  stickerId?: string;
  stickerUrl?: string;
  stickerPackId?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions?: Record<string, string[]>;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  mediaURL: string;
  mediaType?: 'image' | 'video';
  mediaPath?: string;
  mediaMetadata?: MediaMetadata;
  mediaScale?: number;
  mediaOffsetX?: number;
  mediaOffsetY?: number;
  overlayText?: string;
  textColor?: string;
  bgStyle?: string;
  textPosition?: 'top' | 'center' | 'bottom';
  durationSec?: number;
  caption?: string;
  visibility?: 'followers';
  viewCount?: number;
  viewers?: string[]; // Legacy field only; viewer details live in stories/{storyId}/viewers
  createdAt: string;
  expiresAt: string;
}

export interface StoryViewerRecord {
  viewerId: string;
  displayName?: string;
  handle?: string;
  photoURL?: string;
  viewedAt: string;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'repost'
  | 'follow'
  | 'message'
  | 'event'
  | 'badge'
  | 'title'
  | 'room_invite'
  | 'room_announcement'
  | 'announcement'
  | 'verification'
  | 'moderation';

export interface NotificationItem {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  type: NotificationType;
  targetId?: string;
  roomId?: string;
  roomName?: string;
  message: string;
  postThumbnail?: string;
  read: boolean;
  createdAt: string;
}

export type EventLifecycleStatus = 'upcoming' | 'ongoing' | 'ended' | 'cancelled';

export interface CommunityEvent {
  id: string;
  title: string;
  subtitle: string;
  category: 'all' | 'official' | 'challenge' | 'competitions' | 'general';
  badgeText: string;
  dateStr: string;
  timeStr: string;
  endDateStr?: string;
  endTimeStr?: string;
  locationType?: 'online' | 'in_person';
  locationDetails?: string;
  organizerId?: string;
  organizerName?: string;
  status?: EventLifecycleStatus;
  requireApproval?: boolean;
  pendingUserIds?: string[];
  imageURL: string;
  coverPath?: string;
  participantsCount: number;
  registeredUserIds: string[];
  creatorId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* =========================================================================
   REAL STANDALONE CHAT ROOMS (Amino-Inspired Experience, No Communities)
   ========================================================================= */

export type ChatRoomVisibility = 'public' | 'private' | 'staff';

export interface RoomPermissions {
  deleteMessages?: boolean;
  pinMessages?: boolean;
  muteMembers?: boolean;
  kickMembers?: boolean;
  banMembers?: boolean;
  manageAnnouncements?: boolean;
  manageAppearance?: boolean;
  inviteMembers?: boolean;
}

export interface ChatRoomAppearance {
  bgColor?: string;
  bgPresetId?: string;
  bgImageURL?: string;
  bgScrimOpacity?: number;
  accentColor?: string;
  bubbleTheme?: 'classic' | 'glass' | 'minimal' | 'gold';
}

export interface ChatRoom {
  id: string;
  title: string;
  description: string;
  topic?: string;
  imageURL?: string;
  coverURL?: string;
  coverPath?: string;
  visibility: ChatRoomVisibility;
  ownerId: string;
  ownerName: string;
  leaderIds: string[];
  moderatorIds: string[];
  deputyIds?: string[];
  allowedUserIds: string[];
  bannedUserIds: string[];
  mutedUserIds?: string[];
  pinnedMessageIds?: string[];
  appearance?: ChatRoomAppearance;
  isReadOnly?: boolean;
  memberCount: number;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatRoomMember {
  userId: string;
  roomId: string;
  displayName: string;
  handle: string;
  photoURL?: string;
  role: 'owner' | 'room_leader' | 'moderator' | 'deputy_moderator' | 'member';
  permissions?: RoomPermissions;
  isVerified?: boolean;
  verificationCategory?: VerificationCategory;
  customTitle?: CustomTitle | null;
  customTitles?: CustomTitle[];
  isMuted?: boolean;
  isNotificationsMuted?: boolean;
  lastReadAt?: string;
  joinedAt: string;
}

export interface ChatRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderHandle: string;
  senderPhotoURL?: string;
  senderRole?: UserRole;
  senderRoomRole?: ChatRoomMember['role'];
  senderCustomTitle?: CustomTitle | null;
  senderCustomTitles?: CustomTitle[];
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'sticker';
  text: string;
  mediaURL?: string;
  mediaType?: 'image' | 'video';
  mediaMetadata?: MediaMetadata;
  audioURL?: string;
  audioDurationSec?: number;
  stickerId?: string;
  stickerUrl?: string;
  stickerPackId?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions?: Record<string, string[]>;
  isPinned?: boolean;
  pinnedBy?: string;
  pinnedByName?: string;
  pinnedAt?: string;
  editedAt?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedByName?: string;
  createdAt: string;
}

export interface ChatRoomAnnouncement {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  imageURL?: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatRoomModerationLog {
  id: string;
  roomId: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string;
  targetName?: string;
  reason?: string;
  createdAt: string;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  content: string;
  bannerURL?: string;
  targetUrl?: string;
  isPaused?: boolean;
  playSound?: boolean;
  publishAt: string;
  expiresAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlatformAd {
  id: string;
  title: string;
  content: string;
  mediaURL?: string;
  ctaLabel?: string;
  targetUrl?: string;
  sponsorName?: string;
  isPaused?: boolean;
  publishAt: string;
  expiresAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface XpLogEntry {
  id: string;
  userId: string;
  action:
    | 'post_create'
    | 'comment_create'
    | 'repost_create'
    | 'like_given'
    | 'daily_checkin'
    | 'event_join'
    | 'room_message'
    | 'live_watch'
    | 'live_host'
    | 'admin_adjust';
  amount: number;
  label: string;
  createdAt: string;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'user' | 'comment' | 'room' | 'room_message' | 'dm_message';
  targetId: string;
  roomId?: string;
  conversationId?: string;
  targetContentSnippet?: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  actionTaken?: string;
  moderatorId?: string;
  moderatorNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  userHandle: string;
  userDisplayName: string;
  userPhotoURL?: string;
  category: VerificationCategory;
  status: 'pending' | 'approved' | 'rejected' | 'more_info_needed';
  legalName?: string;
  documentType?: string;
  documentURL?: string;
  organizationName?: string;
  officialWebsite?: string;
  evidenceDetails: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface AdminVerificationNote {
  userId: string;
  note: string;
  status: VerificationStatus;
  updatedBy: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface BookmarkRecord {
  userId: string;
  postId: string;
  savedAt: string;
  content?: string;
  authorName?: string;
  authorHandle?: string;
  mediaURL?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  actionType:
    | 'verify_approve'
    | 'verify_reject'
    | 'verify_revoke'
    | 'user_warn'
    | 'user_restrict'
    | 'user_unrestrict'
    | 'user_suspend'
    | 'user_ban'
    | 'user_restore'
    | 'role_change'
    | 'title_grant'
    | 'title_revoke'
    | 'room_kick'
    | 'room_ban'
    | 'room_promote'
    | 'announcement_publish'
    | 'ad_publish'
    | 'wiki_edit'
    | 'event_create'
    | 'event_update'
    | 'event_cancel'
    | 'post_delete'
    | 'post_restore'
    | 'report_resolve'
    | 'appeal_decide'
    | 'xp_adjust'
    | 'room_delete'
    | 'sticker_approve'
    | 'sticker_reject'
    | 'sticker_disable'
    | 'sticker_enable'
    | 'sticker_delete'
    | 'live_start'
    | 'live_end';
  targetType:
    | 'user'
    | 'post'
    | 'report'
    | 'verification'
    | 'appeal'
    | 'room'
    | 'event'
    | 'title'
    | 'role'
    | 'announcement'
    | 'ad'
    | 'sticker_pack'
    | 'live_broadcast';
  targetId: string;
  targetDetails?: string;
  reason?: string;
  createdAt: string;
}

export interface StickerItem {
  id: string;
  url: string;
  label?: string;
  storagePath?: string;
  contentType?: string;
  sizeBytes?: number;
}

export type StickerPackStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface StickerPack {
  id: string;
  title: string;
  description?: string;
  coverURL: string;
  authorId: string;
  authorName: string;
  status: StickerPackStatus;
  isEnabled: boolean;
  moderationNote?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  stickers: StickerItem[];
  installsCount: number;
  createdAt: string;
  updatedAt?: string;
}

export type LiveBroadcastMode = 'youtube_embed' | 'external_stream' | 'camera_webrtc';
export type LiveBroadcastStatus = 'live' | 'ended';
export type LivePlaybackState = 'playing' | 'paused';

export interface LiveBroadcast {
  id: string;
  title: string;
  description?: string;
  coverURL?: string;
  mode: LiveBroadcastMode;
  sourceUrl?: string;
  youtubeVideoId?: string;
  roomId?: string;
  hostId: string;
  hostName: string;
  hostPhotoURL?: string;
  status: LiveBroadcastStatus;
  playbackState: LivePlaybackState;
  playbackPositionSec: number;
  playbackUpdatedAt: string;
  isChatEnabled: boolean;
  mutedUserIds: string[];
  bannedUserIds: string[];
  viewerCount: number;
  startedAt: string;
  endedAt?: string;
  updatedAt: string;
}

export interface LiveBroadcastMessage {
  id: string;
  broadcastId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text: string;
  createdAt: string;
}

export interface LiveBroadcastReaction {
  id: string;
  broadcastId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface LiveBroadcastSignal {
  id: string;
  broadcastId: string;
  fromUserId: string;
  toUserId: string;
  type: 'offer' | 'answer' | 'ice';
  payload: string;
  createdAt: string;
}

export interface ModerationAppeal {
  id: string;
  userId: string;
  userHandle: string;
  userDisplayName: string;
  actionAppealed: string;
  targetContentSnippet?: string;
  appealReason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId?: string;
  decisionNotes?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface PresenceRecord {
  userId: string;
  displayName: string;
  photoURL?: string;
  isOnline: boolean;
  lastSeen: string;
}

export type ActiveTab =
  | 'feed'
  | 'explore'
  | 'rooms'
  | 'live'
  | 'events'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'moderation'
  | 'level'
  | 'blogs'
  | 'wiki'
  | 'reposts'
  | 'saved';

export function xpRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.round(100 * lv * lv * 0.45);
}

export function computeLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < 100 && safeXp >= xpRequiredForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function getSortedUserTitles(user?: {
  customTitle?: CustomTitle | null;
  customTitles?: CustomTitle[];
} | null): CustomTitle[] {
  if (!user) return [];
  const list = Array.isArray(user.customTitles) && user.customTitles.length > 0
    ? [...user.customTitles]
    : user.customTitle
    ? [user.customTitle]
    : [];
  return list
    .filter((item): item is CustomTitle => Boolean(item && item.text && item.text.trim()))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
