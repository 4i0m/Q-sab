import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Settings,
  Share2,
  MoreVertical,
  MessageCircle,
  Link as LinkIcon,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Camera,
  UserPlus,
  UserCheck,
  Copy,
  Flag,
  Fingerprint,
  AlertTriangle,
  Lock,
  Bookmark,
  Calendar,
  Award,
  Ban,
  RotateCcw,
  Clock,
  Sparkles,
  UserCog,
  UserMinus,
  DoorClosed,
  FileText,
  Trash2,
  X,
  Check,
  CornerDownLeft,
  Shield
} from 'lucide-react';
import {
  UserProfile,
  Post,
  Comment,
  FollowRelationship,
  BookmarkRecord,
  UserCustomization,
  CustomTitle,
  CustomTitlePreset,
  UserRole,
  ChatRoom,
  AuditLog,
  getRoleRank,
  getSortedUserTitles
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getUserProfile,
  toggleFollow,
  checkIsFollowing,
  listenToPosts,
  listenToUserReplies,
  listenToUserFollowers,
  listenToUserFollowing,
  listenToFollowersProfiles,
  listenToFollowingProfiles,
  listenToUserBookmarks,
  getOrCreateConversation,
  submitReport,
  listenToCustomTitlePresets,
  createCustomTitlePreset,
  deleteCustomTitlePreset,
  performProfileGovernanceAction,
  listenToAuditLogs
} from '../../services/firestore';
import { listenToChatRooms } from '../../services/chatRooms';
import { useToast } from '../../context/ToastContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import {
  VerifiedBadge,
  LevelBadge,
  RoleBadge,
  VipBadge,
  CustomTitleBadge
} from '../common/VerifiedBadge';
import { EditProfileModal } from './EditProfileModal';
import { VerificationRequestModal } from '../verification/VerificationRequestModal';
import { AdminVerificationModal } from '../admin/AdminVerificationModal';
import { PostCard } from '../feed/PostCard';
import { MediaImage, isLegacyUnsplashUrl } from '../common/MediaImage';
import { formatRelativeTime } from '../../utils/date';

interface ProfileViewProps {
  userId: string;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onOpenChatWithUser?: (conversationId: string) => void;
  onSelectAuthor?: (authorId: string) => void;
  onSelectPost?: (post: Post) => void;
}

const ACCENT_HEX: Record<NonNullable<UserCustomization['accentColor']>, string> = {
  sapphire: '#3B6DFF',
  gold: '#F59E0B',
  emerald: '#10B981',
  silver: '#94A3B8',
  amethyst: '#A855F7',
  crimson: '#EF4444',
};

const TITLE_COLORS = ['#3B6DFF', '#F59E0B', '#10B981', '#E11D48', '#8B5CF6', '#06B6D4', '#EC4899'];
const TITLE_ICONS = ['Award', 'Crown', 'Flame', 'Sparkles', 'Shield', 'Star', 'Gem'];

export function ProfileView({
  userId,
  onBack,
  onOpenSettings,
  onOpenChatWithUser,
  onSelectAuthor,
  onSelectPost,
}: ProfileViewProps) {
  const {
    currentUser,
    firebaseUser,
    onlineUsers,
    isAdmin,
    isAssistantAdmin,
    isOwner,
    isStaff,
    roleRank,
    refreshProfile,
  } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'reposts' | 'media' | 'saved'>('posts');
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userReplies, setUserReplies] = useState<Comment[]>([]);
  const [savedBookmarks, setSavedBookmarks] = useState<BookmarkRecord[]>([]);
  const [followers, setFollowers] = useState<FollowRelationship[]>([]);
  const [following, setFollowing] = useState<FollowRelationship[]>([]);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [adminModalMode, setAdminModalMode] = useState<'grant' | 'revoke' | 'details' | null>(null);

  // Governance Modals (from ⋮ menu)
  const [modModalType, setModModalType] = useState<
    | 'warn'
    | 'restrict'
    | 'suspend'
    | 'ban'
    | 'change_role'
    | 'kick_from_room'
    | null
  >(null);
  const [modReason, setModReason] = useState('');
  const [restrictHours, setRestrictHours] = useState(24);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>('moderator');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [availableRooms, setAvailableRooms] = useState<ChatRoom[]>([]);
  const [modSubmitting, setModSubmitting] = useState(false);

  // Custom Title Modal (multi-title support)
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [titlePresets, setTitlePresets] = useState<CustomTitlePreset[]>([]);
  const [titleText, setTitleText] = useState('');
  const [titleColor, setTitleColor] = useState(TITLE_COLORS[0]);
  const [titleBgColor, setTitleBgColor] = useState('');
  const [titleBorderColor, setTitleBorderColor] = useState('');
  const [titleGradient, setTitleGradient] = useState('');
  const [titlePriority, setTitlePriority] = useState(1);
  const [titleIcon, setTitleIcon] = useState(TITLE_ICONS[0]);
  const [titleShape, setTitleShape] = useState<'tag' | 'shield' | 'banner'>('tag');
  const [saveAsPreset, setSaveAsPreset] = useState(true);
  const [savingTitle, setSavingTitle] = useState(false);

  // Followers / Following Modal
  const [followListMode, setFollowListMode] = useState<'followers' | 'following' | null>(null);
  const [followListProfiles, setFollowListProfiles] = useState<UserProfile[]>([]);
  const [loadingFollowProfiles, setLoadingFollowProfiles] = useState(false);
  const tabsSectionRef = useRef<HTMLDivElement | null>(null);

  // Audit Log Drawer Modal
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Report Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Three-dot ⋮ menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setShowMenu(false), showMenu);

  const isOwnProfile = currentUser?.id === userId;
  const isUserOnline = onlineUsers.some((u) => u.userId === userId && u.isOnline);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getUserProfile(userId);
      setProfile(data);

      if (currentUser?.id && !isOwnProfile) {
        const followingStatus = await checkIsFollowing(currentUser.id, userId);
        setIsFollowing(followingStatus);
      } else {
        setIsFollowing(false);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    setActiveTab('posts');
  }, [userId, currentUser?.id]);

  // Real-time posts authored by userId
  useEffect(() => {
    const unsub = listenToPosts((allPosts) => {
      const authored = allPosts.filter((p) => p.authorId === userId && !p.isHidden);
      authored.sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));
      setUserPosts(authored);
    });
    return () => unsub();
  }, [userId]);

  // Real-time replies authored by userId
  useEffect(() => {
    const unsub = listenToUserReplies(userId, setUserReplies);
    return () => unsub();
  }, [userId]);

  // Real-time bookmarks for own profile
  useEffect(() => {
    if (!isOwnProfile || !currentUser?.id || firebaseUser?.uid !== currentUser.id) {
      setSavedBookmarks([]);
      return;
    }
    const unsub = listenToUserBookmarks(currentUser.id, setSavedBookmarks);
    return () => unsub();
  }, [isOwnProfile, currentUser?.id, firebaseUser?.uid]);

  // Real-time followers/following counts
  useEffect(() => {
    const unsubFollowers = listenToUserFollowers(userId, setFollowers);
    const unsubFollowing = listenToUserFollowing(userId, setFollowing);
    return () => {
      unsubFollowers();
      unsubFollowing();
    };
  }, [userId]);

  // Load title presets & chat rooms when staff modals open
  useEffect(() => {
    if (!showTitleModal) return;
    return listenToCustomTitlePresets(setTitlePresets);
  }, [showTitleModal]);

  useEffect(() => {
    if (modModalType !== 'kick_from_room') return;
    return listenToChatRooms(currentUser, setAvailableRooms);
  }, [modModalType, currentUser?.id]);

  useEffect(() => {
    if (!showAuditModal) return;
    return listenToAuditLogs((all) => {
      setAuditLogs(all.filter((log) => log.targetId === userId || log.actorId === userId));
    });
  }, [showAuditModal, userId]);

  useEffect(() => {
    if (!followListMode) {
      setFollowListProfiles([]);
      return;
    }
    setLoadingFollowProfiles(true);
    const unsub =
      followListMode === 'followers'
        ? listenToFollowersProfiles(userId, (profiles) => {
            setFollowListProfiles(profiles);
            setLoadingFollowProfiles(false);
          })
        : listenToFollowingProfiles(userId, (profiles) => {
            setFollowListProfiles(profiles);
            setLoadingFollowProfiles(false);
          });
    return () => unsub();
  }, [followListMode, userId]);

  const handleFollow = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً للمتابعة', 'info');
      return;
    }
    if (!profile) return;

    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);

    try {
      const newStatus = await toggleFollow(currentUser.id, profile.id, {
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
      });
      setIsFollowing(newStatus);
      showToast(
        newStatus ? `تمت متابعة ${profile.displayName}` : `تم إلغاء متابعة ${profile.displayName}`,
        'info'
      );
    } catch {
      setIsFollowing(prevStatus);
      showToast('تعذر تحديث حالة المتابعة', 'error');
    }
  };

  const handleDirectMessage = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً لمراسلة الأعضاء', 'info');
      return;
    }
    if (!profile) return;

    const dmRule = profile.customization?.privacy?.directMessages || 'everyone';
    if (dmRule === 'followers_only' && !isFollowing && !isAdmin) {
      showToast(t('dmRestrictedNotice'), 'info');
      return;
    }

    try {
      const convId = await getOrCreateConversation(currentUser, profile);
      onOpenChatWithUser?.(convId);
    } catch {
      showToast('تعذر بدء المحادثة', 'error');
    }
  };

  const handleShareProfile = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator
        .share({
          title: `${profile?.displayName} (@${profile?.handle}) on Q`,
          url,
        })
        .catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      showToast('تم نسخ رابط الملف الشخصي إلى الحافظة', 'success');
    }
    setShowMenu(false);
  };

  const handleQuickGovernance = async (
    action: Parameters<typeof performProfileGovernanceAction>[0]['action'],
    extra: Partial<Parameters<typeof performProfileGovernanceAction>[0]> = {},
    successMsg?: string
  ) => {
    if (!profile) return;
    setShowMenu(false);
    try {
      setModSubmitting(true);
      await performProfileGovernanceAction({
        targetUserId: profile.id,
        action,
        ...extra,
      });
      showToast(successMsg || 'تم تنفيذ الإجراء الإداري وتوثيقه بنجاح.', 'success');
      await loadProfile();
      if (isOwnProfile) await refreshProfile();
    } catch (err: any) {
      showToast(err?.message || 'تعذر تنفيذ الإجراء الإداري.', 'error');
    } finally {
      setModSubmitting(false);
    }
  };

  const handleSubmitModModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !modModalType) return;
    try {
      setModSubmitting(true);
      if (modModalType === 'warn') {
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'warn',
          reason: modReason.trim(),
        });
        showToast(`تم توجيه إنذار رسمي إلى @${profile.handle}`, 'info');
      } else if (modModalType === 'restrict') {
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'restrict',
          durationHours: restrictHours,
          reason: modReason.trim(),
        });
        showToast(`تم تقييد التفاعل مؤقتاً على @${profile.handle}`, 'info');
      } else if (modModalType === 'suspend') {
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'suspend',
          reason: modReason.trim(),
        });
        showToast(`تم تعليق حساب @${profile.handle}`, 'info');
      } else if (modModalType === 'ban') {
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'ban',
          reason: modReason.trim(),
        });
        showToast(`تم حظر حساب @${profile.handle}`, 'info');
      } else if (modModalType === 'change_role') {
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'change_role',
          newRole: selectedNewRole,
          reason: modReason.trim(),
        });
        showToast(`تم تحديث رتبة @${profile.handle}`, 'success');
      } else if (modModalType === 'kick_from_room') {
        if (!selectedRoomId) {
          showToast('يرجى اختيار غرفة الدردشة أولاً', 'error');
          setModSubmitting(false);
          return;
        }
        await performProfileGovernanceAction({
          targetUserId: profile.id,
          action: 'kick_from_room',
          roomId: selectedRoomId,
          reason: modReason.trim(),
        });
        showToast('تمت إزالة العضو من غرفة الدردشة.', 'info');
      }
      setModModalType(null);
      setModReason('');
      await loadProfile();
    } catch (err: any) {
      showToast(err?.message || 'تعذر تنفيذ الإجراء الإداري.', 'error');
    } finally {
      setModSubmitting(false);
    }
  };

  const handleGrantCustomTitle = async (titlePayload: CustomTitle, persistPreset = false) => {
    if (!currentUser || !profile) return;
    try {
      setSavingTitle(true);
      if (persistPreset && titlePayload.text.trim()) {
        await createCustomTitlePreset({
          text: titlePayload.text,
          color: titlePayload.color,
          bgColor: titlePayload.bgColor,
          borderColor: titlePayload.borderColor,
          gradient: titlePayload.gradient,
          icon: titlePayload.icon,
          shape: titlePayload.shape,
          priority: titlePayload.priority,
          createdBy: currentUser.id,
          createdByName: currentUser.displayName,
        }).catch(() => {});
      }
      await performProfileGovernanceAction({
        targetUserId: profile.id,
        action: 'grant_title',
        customTitle: titlePayload,
      });
      setTitleText('');
      setTitleBgColor('');
      setTitleBorderColor('');
      setTitleGradient('');
      showToast(`تم منح اللقب "${titlePayload.text}" بنجاح!`, 'success');
      await loadProfile();
      if (isOwnProfile) await refreshProfile();
    } catch (err: any) {
      showToast(err?.message || 'تعذر منح اللقب.', 'error');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !profile) {
      showToast('يرجى تسجيل الدخول أولاً للإبلاغ عن الحسابات', 'info');
      return;
    }
    if (!reportReason.trim()) return;

    try {
      setReportSubmitting(true);
      await submitReport({
        reporterId: currentUser.id,
        reporterName: currentUser.displayName,
        targetType: 'user',
        targetId: profile.id,
        targetContentSnippet: `@${profile.handle} (${profile.displayName})`,
        reason: reportReason.trim(),
      });
      showToast('تم إرسال البلاغ لفريق الإدارة بنجاح', 'success');
      setIsReportModalOpen(false);
      setReportReason('');
    } catch {
      showToast('تعذر إرسال البلاغ', 'error');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto py-20 flex flex-col items-center justify-center font-ar">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B6DFF] mb-3" />
        <span className="text-xs text-slate-600 dark:text-[#94A3B8]">
          جاري تحميل الملف الشخصي...
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl p-8 font-ar shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">لم يتم العثور على هذا الحساب</h3>
        <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-1">
          قد يكون الحساب غير موجود أو تم حذفه من قاعدة البيانات.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1B2232] border border-slate-200 dark:border-[#242B38] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
          >
            العودة
          </button>
        )}
      </div>
    );
  }

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const targetRank = getRoleRank(profile.role);
  const perms = currentUser?.globalPermissions;
  const canGovernTarget = Boolean(
    currentUser &&
      !isOwnProfile &&
      (isStaff || perms?.manageUsers || perms?.manageRoles || perms?.manageVerifications) &&
      profile.role !== 'owner' &&
      (isOwner || roleRank > targetRank || perms?.manageUsers || perms?.manageRoles)
  );
  const canManageTitles = Boolean(
    currentUser &&
      (isAssistantAdmin || perms?.manageTitles) &&
      (isOwnProfile || profile.role !== 'owner') &&
      (isOwner || isOwnProfile || roleRank > targetRank || perms?.manageTitles)
  );
  const profileTitles = getSortedUserTitles(profile);

  const originalPosts = userPosts.filter((p) => p.postType !== 'repost');
  const repostedPosts = userPosts.filter((p) => p.postType === 'repost');
  const mediaPosts = userPosts.filter((p) =>
    Boolean(p.mediaURL || p.videoURL || (p.mediaURLs && p.mediaURLs.length > 0))
  );

  const followersCount = followers.length;
  const followingCount = following.length;
  const postsCount = userPosts.length;

  const accentHex = ACCENT_HEX[profile.customization?.accentColor || 'sapphire'] || '#3B6DFF';
  const coverSrc = isLegacyUnsplashUrl(profile.bannerURL) ? '' : profile.bannerURL || '';

  const isPrivateRestricted =
    profile.customization?.privacy?.profileVisibility === 'followers_only' &&
    !isOwnProfile &&
    !isFollowing &&
    !isAdmin;

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const allAssignableRoles: Array<{ role: UserRole; label: string }> = [
    { role: 'user', label: 'عضو عادي' },
    { role: 'moderator', label: 'مشرف' },
    { role: 'room_leader', label: 'قائد غرفة' },
    { role: 'assistant_admin', label: 'مساعد إدمن' },
    { role: 'admin', label: 'إدمن' },
  ];
  const assignableRoles = allAssignableRoles.filter(
    (r) => isOwner || getRoleRank(r.role) < roleRank
  );

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-ar">
      {/* X-Inspired Q Profile Card */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl overflow-hidden shadow-sm relative">
        {/* Top Cover Banner */}
        <div className="relative h-36 sm:h-48 w-full overflow-hidden bg-slate-100 dark:bg-[#0B0F19]">
          <MediaImage
            src={coverSrc}
            alt={profile.displayName}
            variant="banner"
            bannerPattern={profile.customization?.themePattern || 'minimal'}
            accentColor={accentHex}
            loading="eager"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25 pointer-events-none" />

          {/* Floating Navigation & Settings */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between z-20">
            {onBack ? (
              <button
                onClick={onBack}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-md border border-white/15 transition-colors cursor-pointer"
                aria-label="رجوع"
              >
                <BackIcon className="w-4 h-4" />
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleShareProfile}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-md border border-white/15 transition-colors cursor-pointer"
                title={t('shareProfile')}
              >
                <Share2 className="w-4 h-4" />
              </button>

              {isOwnProfile && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-md border border-white/15 transition-colors cursor-pointer"
                  title={t('settings')}
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Identity & Actions */}
        <div className="px-4 sm:px-6 pb-5 relative">
          <div className="flex items-end justify-between -mt-10 sm:-mt-12 mb-3 gap-2">
            {/* Circular Avatar */}
            <div
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full p-[3px] shadow-xl shrink-0 bg-white dark:bg-[#111622]"
              style={{ boxShadow: `0 0 0 2px ${accentHex}` }}
            >
              <MediaImage
                src={profile.photoURL}
                alt={profile.displayName}
                variant="avatar"
                fallbackText={profile.displayName}
                accentColor={accentHex}
                loading="eager"
                containerClassName="w-full h-full rounded-full overflow-hidden"
                className="w-full h-full rounded-full object-cover"
              />

              {isUserOnline && (
                <span
                  className="absolute bottom-1 end-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111622]"
                  title={t('activeNow')}
                />
              )}

              {isOwnProfile && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="absolute -bottom-0.5 -start-0.5 w-7 h-7 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-md flex items-center justify-center cursor-pointer"
                  title={t('changeAvatar')}
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Action Buttons Row + Dynamic ⋮ Governance Menu */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pt-2">
              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="min-h-[42px] px-4 sm:px-5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  {t('editProfile')}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleFollow}
                    className={`min-h-[42px] px-4 sm:px-5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      isFollowing
                        ? 'bg-slate-100 dark:bg-[#1B2232] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#2A3242]'
                        : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-sm'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('followingState')}</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{t('follow')}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDirectMessage}
                    className="min-w-[42px] min-h-[42px] rounded-full bg-slate-100 dark:bg-[#1B2232] border border-slate-200 dark:border-[#2A3242] hover:border-[#3B6DFF] text-slate-900 dark:text-white flex items-center justify-center cursor-pointer"
                    title={t('message')}
                  >
                    <MessageCircle className="w-4 h-4 text-[#3B6DFF]" />
                  </button>
                </>
              )}

              {/* ⋮ Three-Dot Governance & Profile Options Menu */}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowMenu((prev) => !prev)}
                  className="min-w-[42px] min-h-[42px] rounded-full bg-slate-100 dark:bg-[#1B2232] border border-slate-200 dark:border-[#2A3242] hover:border-[#3B6DFF] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="خيارات الملف الشخصي والإشراف"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className="absolute end-0 mt-2 w-64 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl shadow-2xl p-1.5 z-40 animate-slide-up text-start max-h-[75vh] overflow-y-auto">
                    <button
                      onClick={handleShareProfile}
                      className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1E2534] rounded-xl cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('copyProfileLink')}</span>
                    </button>

                    {canManageTitles && (
                      <div className="mt-1 pt-1 border-t border-slate-200 dark:border-[#2A2F3A]">
                        <div className="px-3 py-1 text-[10px] font-bold text-[#3B6DFF] flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />
                          <span>إدارة الألقاب</span>
                        </div>
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowTitleModal(true);
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[#3B6DFF] hover:bg-[#3B6DFF]/10 rounded-xl cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>{profileTitles.length > 0 ? 'إدارة ومنح الألقاب' : 'منح لقب مخصص'}</span>
                        </button>
                        {profileTitles.length > 0 && (
                          <button
                            onClick={() =>
                              handleQuickGovernance('revoke_title', {}, 'تمت إزالة جميع الألقاب بنجاح')
                            }
                            className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-amber-600 hover:bg-amber-500/10 rounded-xl cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>سحب جميع الألقاب</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Dynamic Rank-Filtered Governance Controls */}
                    {canGovernTarget && (
                      <div className="mt-1 pt-1 border-t border-slate-200 dark:border-[#2A2F3A]">
                        <div className="px-3 py-1 text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-[#3B6DFF]" />
                          <span>الإشراف والصلاحيات</span>
                        </div>

                        {/* Verification (Admin / Owner / manageVerifications) */}
                        {(isAdmin || perms?.manageVerifications) && (
                          <>
                            <button
                              onClick={() => {
                                setShowMenu(false);
                                setAdminModalMode('grant');
                              }}
                              className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-[#3B6DFF] hover:bg-[#3B6DFF]/10 rounded-xl cursor-pointer font-bold"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>
                                {profile.isVerified ? t('changeVerificationTier') : t('grantVerification')}
                              </span>
                            </button>
                            {profile.isVerified && (
                              <button
                                onClick={() => {
                                  setShowMenu(false);
                                  setAdminModalMode('revoke');
                                }}
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-500/10 rounded-xl cursor-pointer font-bold"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>{t('removeVerification')}</span>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setShowMenu(false);
                                setAdminModalMode('details');
                              }}
                              className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2534] rounded-xl cursor-pointer"
                            >
                              <Fingerprint className="w-3.5 h-3.5 text-slate-500" />
                              <span>{t('accountTechnicalDetails')}</span>
                            </button>
                          </>
                        )}

                        {/* Role Appointments (Assistant Admin Rank 4+ or manageRoles) */}
                        {(isAssistantAdmin || perms?.manageRoles) && (
                          <>
                            <button
                              onClick={() => {
                                setShowMenu(false);
                                setModModalType('change_role');
                              }}
                              className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-xl cursor-pointer font-bold"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              <span>ترقية / تخفيض الرتبة</span>
                            </button>
                            {profile.role !== 'room_leader' && (
                              <button
                                onClick={() =>
                                  handleQuickGovernance(
                                    'appoint_room_leader',
                                    {},
                                    `تم تعيين @${profile.handle} قائد غرفة`
                                  )
                                }
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-xl cursor-pointer"
                              >
                                <Award className="w-3.5 h-3.5" />
                                <span>تعيين قائد غرفة</span>
                              </button>
                            )}
                            {profile.role !== 'moderator' && (
                              <button
                                onClick={() =>
                                  handleQuickGovernance(
                                    'appoint_moderator',
                                    {},
                                    `تم تعيين @${profile.handle} مشرفاً`
                                  )
                                }
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 rounded-xl cursor-pointer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>تعيين مشرف / منسق</span>
                              </button>
                            )}
                            {profile.role !== 'user' && (
                              <button
                                onClick={() =>
                                  handleQuickGovernance(
                                    'remove_staff',
                                    {},
                                    `تمت إزالة صلاحيات الإدارة عن @${profile.handle}`
                                  )
                                }
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-amber-600 hover:bg-amber-500/10 rounded-xl cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                                <span>إزالة صلاحيات الإدارة</span>
                              </button>
                            )}
                          </>
                        )}

                        {/* Kick from Chat Room (Moderator+) */}
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setModModalType('kick_from_room');
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 rounded-xl cursor-pointer"
                        >
                          <DoorClosed className="w-3.5 h-3.5" />
                          <span>طرد من غرفة دردشة</span>
                        </button>

                        {/* Warn & Restrict (Moderator+) */}
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setModModalType('warn');
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 rounded-xl cursor-pointer"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>توجيه إنذار</span>
                        </button>

                        {!profile.isRestricted ? (
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              setModModalType('restrict');
                            }}
                            className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 rounded-xl cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>تقييد التفاعل مؤقتاً</span>
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              handleQuickGovernance('unrestrict', {}, 'تم رفع التقييد عن الحساب')
                            }
                            className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-600 hover:bg-emerald-500/10 rounded-xl cursor-pointer font-bold"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>رفع التقييد المؤقت</span>
                          </button>
                        )}

                        {/* Suspend / Ban / Restore */}
                        {!profile.isSuspended && !profile.isBanned ? (
                          <>
                            {isAssistantAdmin && (
                              <button
                                onClick={() => {
                                  setShowMenu(false);
                                  setModModalType('suspend');
                                }}
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-orange-600 hover:bg-orange-500/10 rounded-xl cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>{t('suspendAccount')}</span>
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setShowMenu(false);
                                  setModModalType('ban');
                                }}
                                className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-500/10 rounded-xl cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>{t('banAccount')}</span>
                              </button>
                            )}
                          </>
                        ) : (
                          isAssistantAdmin && (
                            <button
                              onClick={() =>
                                handleQuickGovernance('unban', {}, `تم فك الحظر واستعادة @${profile.handle}`)
                              }
                              className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-600 hover:bg-emerald-500/10 rounded-xl cursor-pointer font-bold"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>فك الحظر / استعادة الحساب</span>
                            </button>
                          )
                        )}

                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowAuditModal(true);
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2534] rounded-xl cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>سجل الإجراءات الإدارية</span>
                        </button>
                      </div>
                    )}

                    {!isOwnProfile && (
                      <div className="mt-1 pt-1 border-t border-slate-200 dark:border-[#2A2F3A]">
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setIsReportModalOpen(true);
                          }}
                          className="w-full min-h-[38px] flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>{t('reportAccount')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Account Restriction / Suspension / Ban Banners */}
          {(profile.isSuspended || profile.isBanned || profile.isRestricted) && (
            <div className="mb-3 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                {profile.isBanned
                  ? `حساب محظور نهائياً${profile.bannedReason ? `: ${profile.bannedReason}` : ''}`
                  : profile.isSuspended
                  ? `حساب معلق مؤقتاً${profile.suspensionReason ? `: ${profile.suspensionReason}` : ''}`
                  : `تفاعل مقيّد مؤقتاً${profile.restrictionReason ? `: ${profile.restrictionReason}` : ''}`}
              </span>
            </div>
          )}

          {/* Identity Block */}
          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="font-display-en text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {profile.displayName}
                </h1>
                {profile.isVerified && (
                  <VerifiedBadge category={profile.verificationCategory || 'blue'} className="w-4 h-4" />
                )}
                {profile.role && profile.role !== 'user' && <RoleBadge role={profile.role} />}
                {profile.customRoleName && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/35 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold">
                    {profile.customRoleName}
                  </span>
                )}
                {profileTitles.map((titleItem, idx) => (
                  <CustomTitleBadge key={titleItem.id || `${titleItem.text}_${idx}`} title={titleItem} />
                ))}
                {profile.isSpecial && <VipBadge />}
                {profile.level && profile.level > 0 ? <LevelBadge level={profile.level} /> : null}
              </div>

              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="font-handle text-[13px] text-slate-500 dark:text-[#8E9BAB]">
                  @{profile.handle}
                </span>
                {isOwnProfile && !profile.isVerified && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <button
                      type="button"
                      onClick={() => setIsVerificationModalOpen(true)}
                      className="text-xs font-bold text-[#3B6DFF] hover:underline cursor-pointer"
                    >
                      {profile.verificationStatus === 'pending'
                        ? t('statusPending')
                        : t('applyForVerification')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {profile.bio ? (
              <p className="text-[13px] sm:text-sm text-slate-700 dark:text-[#CBD5E1] leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            ) : isOwnProfile ? (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="text-xs text-slate-400 hover:text-[#3B6DFF] italic cursor-pointer"
              >
                {t('bioPlaceholderPrompt')}
              </button>
            ) : null}

            {/* Metadata row: Joined Date + Custom Links */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-[#8E9BAB] pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  انضم في{' '}
                  {profile.createdAt
                    ? new Date(profile.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                      })
                    : 'Q'}
                </span>
              </span>

              {profile.customization?.links?.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#3B6DFF] hover:underline font-medium"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>{link.label}</span>
                </a>
              ))}
            </div>

            {/* Inline X-Style Counts Row (Interactive) */}
            <div className="flex items-center gap-5 flex-wrap pt-2 text-xs sm:text-[13px]">
              <button
                type="button"
                onClick={() => setFollowListMode('following')}
                className="flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCount(followingCount)}
                </span>
                <span className="text-slate-500 dark:text-[#8E9BAB]">{t('followingCount')}</span>
              </button>
              <button
                type="button"
                onClick={() => setFollowListMode('followers')}
                className="flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCount(followersCount)}
                </span>
                <span className="text-slate-500 dark:text-[#8E9BAB]">{t('followers')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('posts');
                  tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCount(postsCount)}
                </span>
                <span className="text-slate-500 dark:text-[#8E9BAB]">{t('posts')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Private Profile Gate */}
      {isPrivateRestricted ? (
        <div className="py-12 px-6 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] flex items-center justify-center text-[#3B6DFF]">
            <Lock className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">{t('privateProfileNotice')}</p>
          <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
            تابع @{profile.handle} لعرض منشوراته ووسائطه.
          </p>
        </div>
      ) : (
        <>
          {/* Organized X-Style Profile Tabs */}
          <div ref={tabsSectionRef} className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-[#232A37] text-xs font-bold scrollbar-hide px-1">
            {[
              { id: 'posts', label: `المنشورات (${originalPosts.length})` },
              { id: 'replies', label: `الردود (${userReplies.length})` },
              { id: 'reposts', label: `إعادات النشر (${repostedPosts.length})` },
              { id: 'media', label: `الوسائط (${mediaPosts.length})` },
              ...(isOwnProfile ? [{ id: 'saved', label: `المحفوظات (${savedBookmarks.length})` }] : []),
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative min-h-[44px] px-3.5 flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-[#3B6DFF]'
                      : 'text-slate-500 dark:text-[#8E9BAB] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  {active && (
                    <span className="absolute bottom-0 inset-x-2 h-0.5 bg-[#3B6DFF] rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="space-y-3">
            {activeTab === 'posts' &&
              (originalPosts.length > 0 ? (
                originalPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onSelectAuthor={onSelectAuthor}
                    onSelectPost={onSelectPost}
                  />
                ))
              ) : (
                <div className="py-10 px-4 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl">
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">{t('noPostsYet')}</p>
                </div>
              ))}

            {activeTab === 'replies' &&
              (userReplies.length > 0 ? (
                <div className="space-y-2.5">
                  {userReplies.map((reply) => (
                    <div
                      key={reply.id}
                      className="p-4 bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1 text-[#3B6DFF] font-bold">
                          <CornerDownLeft className="w-3 h-3" />
                          <span>
                            {reply.replyToAuthorName ? `رد على ${reply.replyToAuthorName}` : 'رد على منشور'}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatRelativeTime(reply.createdAt)}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        {reply.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 px-4 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl">
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">لا توجد ردود حتى الآن.</p>
                </div>
              ))}

            {activeTab === 'reposts' &&
              (repostedPosts.length > 0 ? (
                repostedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onSelectAuthor={onSelectAuthor}
                    onSelectPost={onSelectPost}
                  />
                ))
              ) : (
                <div className="py-10 px-4 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl">
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">لا توجد إعادات نشر بعد.</p>
                </div>
              ))}

            {activeTab === 'media' &&
              (mediaPosts.length > 0 ? (
                mediaPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onSelectAuthor={onSelectAuthor}
                    onSelectPost={onSelectPost}
                  />
                ))
              ) : (
                <div className="py-10 px-4 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl">
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">{t('noMediaYet')}</p>
                </div>
              ))}

            {activeTab === 'saved' &&
              isOwnProfile &&
              (savedBookmarks.length > 0 ? (
                <div className="space-y-2.5">
                  {savedBookmarks.map((bm) => (
                    <div
                      key={bm.postId}
                      className="p-4 bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Bookmark className="w-3.5 h-3.5 text-[#3B6DFF]" />
                          <span>{bm.authorName || 'عضو في Q'}</span>
                          {bm.authorHandle && (
                            <span className="font-handle text-slate-500">@{bm.authorHandle}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          {new Date(bm.savedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {bm.content && (
                        <p className="text-xs text-slate-700 dark:text-[#CBD5E1] leading-relaxed">
                          {bm.content}
                        </p>
                      )}
                      {bm.mediaURL && (
                        <MediaImage
                          src={bm.mediaURL}
                          alt=""
                          variant="post"
                          containerClassName="w-full max-h-56 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232A37]"
                          className="w-full max-h-56 object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 px-4 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl">
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8]">{t('noSavedYet')}</p>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={profile}
          onUpdated={async () => {
            await loadProfile();
            await refreshProfile();
          }}
        />
      )}

      {/* Verification Application Modal */}
      {isOwnProfile && isVerificationModalOpen && currentUser && (
        <VerificationRequestModal
          isOpen={isVerificationModalOpen}
          onClose={() => setIsVerificationModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Admin Verification Modal */}
      {(isAdmin || perms?.manageVerifications) && profile && adminModalMode && (
        <AdminVerificationModal
          isOpen={Boolean(adminModalMode)}
          onClose={() => setAdminModalMode(null)}
          targetUser={profile}
          mode={adminModalMode}
          onSuccess={async () => {
            await loadProfile();
            await refreshProfile();
          }}
        />
      )}

      {/* Followers / Following Modal */}
      {followListMode && (
        <div
          onClick={() => setFollowListMode(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[80dvh] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl flex flex-col overflow-hidden shadow-2xl font-ar"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {followListMode === 'followers'
                  ? `متابعو @${profile.handle} (${followersCount})`
                  : `من يتابعهم @${profile.handle} (${followingCount})`}
              </h3>
              <button
                type="button"
                onClick={() => setFollowListMode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingFollowProfiles ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
                </div>
              ) : followListProfiles.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-8">
                  {followListMode === 'followers'
                    ? 'لا يوجد متابعون حتى الآن.'
                    : 'لا يتابع أي حساب حتى الآن.'}
                </p>
              ) : (
                followListProfiles.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setFollowListMode(null);
                      onSelectAuthor?.(member.id);
                    }}
                    className="w-full p-2.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] hover:border-[#3B6DFF]/50 flex items-center gap-3 text-start cursor-pointer"
                  >
                    <MediaImage
                      src={member.photoURL}
                      alt={member.displayName}
                      variant="avatar"
                      fallbackText={member.displayName}
                      containerClassName="w-10 h-10 rounded-full overflow-hidden shrink-0"
                      className="w-full h-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {member.displayName}
                        </span>
                        {member.isVerified && (
                          <VerifiedBadge category={member.verificationCategory || 'blue'} className="w-3.5 h-3.5" interactive={false} />
                        )}
                      </div>
                      <span className="font-handle text-[11px] text-slate-500 block truncate">
                        @{member.handle}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Cosmetic Title Management Modal */}
      {showTitleModal && canManageTitles && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl max-h-[88dvh] overflow-y-auto font-ar">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-[#3B6DFF]" />
                <span>منح لقب مخصص لـ @{profile.handle}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTitleModal(false)}
                className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
              الألقاب المخصصة عناصر تجميلية مميزة تظهر بجانب الاسم ولا تمنح صلاحيات إدارية، ويمكن ترتيبها بالأولوية ومنح أكثر من لقب.
            </p>

            {/* Currently Assigned Titles with individual revoke */}
            {profileTitles.length > 0 && (
              <div className="space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38]">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  الألقاب النشطة على الحساب ({profileTitles.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {profileTitles.map((tItem, idx) => (
                    <div
                      key={tItem.id || `${tItem.text}_${idx}`}
                      className="inline-flex items-center gap-1.5 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-2 py-1"
                    >
                      <CustomTitleBadge title={tItem} />
                      <button
                        type="button"
                        disabled={modSubmitting}
                        onClick={() =>
                          handleQuickGovernance(
                            'revoke_title',
                            { titleId: tItem.id || tItem.text },
                            `تمت إزالة اللقب "${tItem.text}"`
                          )
                        }
                        className="text-slate-400 hover:text-red-500 cursor-pointer"
                        title="سحب هذا اللقب"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Saved Title Presets */}
            {titlePresets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ألقاب محفوظة جاهزة للمنح الفوري:
                </p>
                <div className="flex flex-wrap gap-2">
                  {titlePresets.map((preset) => (
                    <div key={preset.id} className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={savingTitle}
                        onClick={() =>
                          handleGrantCustomTitle({
                            id: preset.id,
                            text: preset.text,
                            color: preset.color,
                            bgColor: preset.bgColor,
                            borderColor: preset.borderColor,
                            gradient: preset.gradient,
                            icon: preset.icon,
                            shape: preset.shape,
                            priority: preset.priority,
                          })
                        }
                        className="cursor-pointer hover:opacity-85"
                      >
                        <CustomTitleBadge title={preset} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteCustomTitlePreset(preset.id)}
                          className="text-slate-400 hover:text-red-500 cursor-pointer"
                          title="حذف القالب"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create & Grant New Title */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#2A2F3A]">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  نص اللقب (حتى 32 حرفاً)
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value)}
                  placeholder="مثال: كاتب مميز، مصمم القمة..."
                  className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  لون اللقب الأساسي
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {TITLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setTitleColor(c);
                        setTitleGradient('');
                      }}
                      className={`w-7 h-7 rounded-full cursor-pointer border-2 ${
                        titleColor === c && !titleGradient ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Background, Border & Gradient Styling */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    أولوية العرض
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={titlePriority}
                    onChange={(e) => setTitlePriority(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full min-h-[36px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-2 text-xs text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    لون الخلفية
                  </label>
                  <input
                    type="text"
                    value={titleBgColor}
                    onChange={(e) => setTitleBgColor(e.target.value)}
                    placeholder="#1E293B"
                    dir="ltr"
                    className="w-full min-h-[36px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-2 text-[11px] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    لون الإطار
                  </label>
                  <input
                    type="text"
                    value={titleBorderColor}
                    onChange={(e) => setTitleBorderColor(e.target.value)}
                    placeholder="#3B6DFF"
                    dir="ltr"
                    className="w-full min-h-[36px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-2 text-[11px] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  تدرج لوني اختياري
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: 'بدون تدرج', val: '' },
                    { label: 'أزرق ملكي', val: 'linear-gradient(135deg, #2563EB, #06B6D4)' },
                    { label: 'ذهبي فاخر', val: 'linear-gradient(135deg, #D97706, #F59E0B)' },
                    { label: 'بنفسجي نجمي', val: 'linear-gradient(135deg, #7C3AED, #EC4899)' },
                  ].map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      onClick={() => setTitleGradient(g.val)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                        titleGradient === g.val
                          ? 'border-[#3B6DFF] bg-[#3B6DFF]/10 text-[#3B6DFF]'
                          : 'border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الأيقونة
                  </label>
                  <select
                    value={titleIcon}
                    onChange={(e) => setTitleIcon(e.target.value)}
                    className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-2 text-xs text-slate-900 dark:text-white"
                  >
                    {TITLE_ICONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الشكل
                  </label>
                  <select
                    value={titleShape}
                    onChange={(e) => setTitleShape(e.target.value as any)}
                    className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="tag">شارة أنيقة</option>
                    <option value="shield">درع</option>
                    <option value="banner">شريط</option>
                  </select>
                </div>
              </div>

              {titleText.trim() && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19] flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">المعاينة:</span>
                  <CustomTitleBadge
                    title={{
                      text: titleText,
                      color: titleColor,
                      bgColor: titleBgColor || undefined,
                      borderColor: titleBorderColor || undefined,
                      gradient: titleGradient || undefined,
                      icon: titleIcon,
                      shape: titleShape,
                      priority: titlePriority,
                    }}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsPreset}
                  onChange={(e) => setSaveAsPreset(e.target.checked)}
                />
                <span>حفظ اللقب في قائمة الألقاب الجاهزة</span>
              </label>

              <button
                type="button"
                disabled={savingTitle || !titleText.trim()}
                onClick={() =>
                  handleGrantCustomTitle(
                    {
                      text: titleText.trim(),
                      color: titleColor,
                      bgColor: titleBgColor.trim() || undefined,
                      borderColor: titleBorderColor.trim() || undefined,
                      gradient: titleGradient || undefined,
                      icon: titleIcon,
                      shape: titleShape,
                      priority: titlePriority,
                    },
                    saveAsPreset
                  )
                }
                className="w-full min-h-[42px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>تطبيق ومنح اللقب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Governance Action Modal (Warn / Restrict / Suspend / Ban / Change Role / Kick From Room) */}
      {modModalType && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitModModal}
            className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {modModalType === 'warn' && `إنذار رسمي (@${profile.handle})`}
                {modModalType === 'restrict' && `تقييد تفاعل (@${profile.handle})`}
                {modModalType === 'suspend' && `تعليق حساب (@${profile.handle})`}
                {modModalType === 'ban' && `حظر حساب (@${profile.handle})`}
                {modModalType === 'change_role' && `تعديل الرتبة (@${profile.handle})`}
                {modModalType === 'kick_from_room' && `طرد من غرفة دردشة (@${profile.handle})`}
              </h3>
              <button
                type="button"
                onClick={() => setModModalType(null)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modModalType === 'restrict' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  مدة التقييد
                </label>
                <select
                  value={restrictHours}
                  onChange={(e) => setRestrictHours(Number(e.target.value))}
                  className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
                >
                  <option value={1}>ساعة واحدة</option>
                  <option value={6}>6 ساعات</option>
                  <option value={24}>24 ساعة</option>
                  <option value={72}>3 أيام</option>
                  <option value={168}>أسبوع واحد</option>
                </select>
              </div>
            )}

            {modModalType === 'change_role' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الرتبة الجديدة
                </label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as UserRole)}
                  className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
                >
                  {assignableRoles.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {modModalType === 'kick_from_room' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اختر غرفة الدردشة
                </label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  required
                  className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">-- اختر الغرفة --</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <textarea
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              rows={3}
              required={modModalType === 'warn' || modModalType === 'suspend' || modModalType === 'ban'}
              placeholder="اكتب السبب الإداري الموثق (يُسجل في سجل التدقيق)..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setModModalType(null);
                  setModReason('');
                }}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={modSubmitting}
                className="py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {modSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('confirm')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Audit Logs Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[80dvh] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl flex flex-col overflow-hidden shadow-2xl font-ar">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                سجل الإجراءات المرتبطة بـ @{profile.handle}
              </h3>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {auditLogs.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-8">
                  لا توجد سجلات إدارية مسجلة لهذا الحساب.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#3B6DFF]">{log.actionType}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {formatRelativeTime(log.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{log.targetDetails}</p>
                    {log.reason && <p className="text-[11px] text-slate-500">السبب: {log.reason}</p>}
                    <p className="text-[10px] text-slate-400">بواسطة: {log.actorName}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Account Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitReport}
            className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar"
          >
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Flag className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('reportAccount')} (@{profile.handle})
              </h3>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder="وضح سبب الإبلاغ لمراجعته من فريق Q..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsReportModalOpen(false);
                  setReportReason('');
                }}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={reportSubmitting || !reportReason.trim()}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {reportSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('confirm')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
