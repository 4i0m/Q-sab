export type UserRole = 'user' | 'moderator' | 'admin' | 'owner';

export type VerificationCategory = 'blue' | 'silver' | 'institution' | 'blood_red';
export type VerificationStatus = 'not_verified' | 'pending' | 'verified' | 'rejected';

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
}

export interface UserProfile {
  id: string; // Firebase UID
  displayName: string;
  handle: string;
  email?: string;
  photoURL?: string;
  bannerURL?: string;
  bio?: string;
  role: UserRole;
  isVerified: boolean;
  verificationCategory?: VerificationCategory;
  verificationStatus?: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationNote?: string;
  level: number;
  xp: number;
  isSpecial?: boolean; // مميز 💎
  achievements?: string[];
  isOnline: boolean;
  lastActiveAt: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  customization?: UserCustomization;
  isSuspended?: boolean;
  isBanned?: boolean;
  warningCount?: number;
  suspensionReason?: string;
  bannedReason?: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorPhotoURL?: string;
  authorRole?: UserRole;
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  authorLevel?: number;
  content: string;
  mediaURL?: string;
  videoURL?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount?: number;
  bookmarksCount?: number;
  community?: string;
  isPinned?: boolean;
  isHidden?: boolean;
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
  groupAvatar?: string;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageTimestamp?: string;
  updatedAt?: string;
  createdAt: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text: string;
  mediaURL?: string;
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
  caption?: string;
  viewers: string[];
  createdAt: string;
  expiresAt: string;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'event' | 'badge' | 'verification' | 'moderation';
  targetId?: string;
  message: string;
  postThumbnail?: string;
  read: boolean;
  createdAt: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  subtitle: string;
  category: 'all' | 'official' | 'challenge' | 'competitions' | 'general';
  badgeText: string;
  dateStr: string;
  timeStr: string;
  imageURL: string;
  participantsCount: number;
  registeredUserIds: string[];
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'user' | 'comment';
  targetId: string;
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
  reviewerNotes?: string;
  reviewedAt?: string;
  createdAt: string;
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
    | 'user_suspend'
    | 'user_ban'
    | 'user_restore'
    | 'post_delete'
    | 'post_restore'
    | 'report_resolve'
    | 'appeal_decide';
  targetType: 'user' | 'post' | 'report' | 'verification' | 'appeal';
  targetId: string;
  targetDetails?: string;
  reason?: string;
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
  | 'events'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'moderation';
