import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Settings,
  Share2,
  MoreHorizontal,
  MessageCircle,
  Link as LinkIcon,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Camera,
  Check,
  UserPlus,
  UserCheck,
  Copy,
  Flag,
  Fingerprint,
  AlertTriangle,
  Globe,
  ExternalLink,
  Bookmark
} from 'lucide-react';
import { UserProfile, Post, FollowRelationship } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getUserProfile,
  toggleFollow,
  checkIsFollowing,
  listenToPosts,
  listenToUserFollowers,
  listenToUserFollowing,
  getOrCreateConversation,
  warnUser
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { VerifiedBadge, LevelBadge, RoleBadge, VipBadge } from '../common/VerifiedBadge';
import { EditProfileModal } from './EditProfileModal';
import { AdminVerificationModal } from '../admin/AdminVerificationModal';
import { PostCard } from '../feed/PostCard';

interface ProfileViewProps {
  userId: string;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onOpenChatWithUser?: (conversationId: string) => void;
}

export function ProfileView({
  userId,
  onBack,
  onOpenSettings,
  onOpenChatWithUser,
}: ProfileViewProps) {
  const { currentUser, onlineUsers, isStaff, isAdmin, refreshProfile } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'photos' | 'likes'>('posts');
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState<FollowRelationship[]>([]);
  const [following, setFollowing] = useState<FollowRelationship[]>([]);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [adminModalMode, setAdminModalMode] = useState<'grant' | 'revoke' | 'details' | null>(null);

  // Three-dot menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setShowMenu(false), showMenu);

  const isOwnProfile = currentUser?.id === userId;

  // Real-time online presence verification: active heartbeat within 2 minutes
  const isUserOnline = onlineUsers.some(
    (u) => u.userId === userId && u.isOnline
  );

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getUserProfile(userId);
      setProfile(data);

      if (currentUser?.id && !isOwnProfile) {
        const followingStatus = await checkIsFollowing(currentUser.id, userId);
        setIsFollowing(followingStatus);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [userId, currentUser?.id]);

  // Real-time listener for user posts authored by this userId
  useEffect(() => {
    const unsub = listenToPosts((allPosts) => {
      setUserPosts(allPosts.filter((p) => p.authorId === userId));
    });
    return () => unsub();
  }, [userId]);

  // Real-time listeners for exact followers and following relationships
  useEffect(() => {
    const unsubFollowers = listenToUserFollowers(userId, (records) => {
      setFollowers(records);
    });
    const unsubFollowing = listenToUserFollowing(userId, (records) => {
      setFollowing(records);
    });

    return () => {
      unsubFollowers();
      unsubFollowing();
    };
  }, [userId]);

  const handleFollow = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً للمتابعة', 'info');
      return;
    }
    if (!profile) return;

    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);

    try {
      const newStatus = await toggleFollow(
        currentUser.id,
        profile.id,
        { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
      );
      setIsFollowing(newStatus);
      showToast(
        newStatus
          ? `تمت متابعة ${profile.displayName}`
          : `تم إلغاء متابعة ${profile.displayName}`,
        'info'
      );
    } catch (err) {
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

    try {
      const convId = await getOrCreateConversation(currentUser, profile);
      if (onOpenChatWithUser) onOpenChatWithUser(convId);
    } catch (err) {
      showToast('تعذر بدء المحادثة', 'error');
    }
  };

  const handleShareProfile = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `${profile?.displayName} (@${profile?.handle}) on Q`,
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      showToast('تم نسخ رابط الملف الشخصي إلى الحافظة', 'success');
    }
    setShowMenu(false);
  };

  const handleWarnUser = async () => {
    setShowMenu(false);
    if (!currentUser || !profile) return;
    const reason = prompt(`أدخل سبب توجيه الإنذار للمستخدم @${profile.handle}:`);
    if (!reason || !reason.trim()) return;

    try {
      await warnUser(profile.id, reason.trim(), {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      showToast(`تم توجيه إنذار رسمي للمستخدم @${profile.handle}`, 'info');
      await loadProfile();
    } catch (err) {
      showToast('فشل في توجيه الإنذار', 'error');
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto py-20 flex flex-col items-center justify-center font-tajawal">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B6DFF] mb-3" />
        <span className="text-xs text-[#94A3B8]">جاري تحميل الملف الشخصي المعتمد...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full max-w-md mx-auto py-16 text-center bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-8 font-tajawal shadow-xl">
        <h3 className="text-sm font-bold text-white">لم يتم العثور على هذا الحساب</h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          قد يكون الحساب غير موجود أو تم حذفه من قاعدة البيانات.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-5 py-2 rounded-xl bg-[#1E1E2E] border border-[#2A2F3A] text-white text-xs font-bold hover:bg-[#2A2F3A] transition-colors cursor-pointer"
          >
            العودة
          </button>
        )}
      </div>
    );
  }

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const followersCount = followers.length;
  const followingCount = following.length;
  const postsCount = userPosts.length;

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4">
      
      {/* PROFILE CARD: Amino/Kyodo-Inspired Luxury Layout */}
      <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl relative">
        
        {/* Full-Bleed Cover Image with Gradient Fade */}
        <div className="relative h-44 sm:h-48 w-full bg-black overflow-hidden">
          <img
            src={profile.bannerURL || 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80'}
            alt="Profile cover"
            className="w-full h-full object-cover"
          />
          {/* Subtle gradient vignette to blend cover smoothly into the dark profile card */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#161B26] via-[#161B26]/30 to-black/40" />

          {/* Floating Top Bar on Cover */}
          <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-20">
            {onBack ? (
              <button
                onClick={onBack}
                className="p-2 rounded-full bg-black/60 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                aria-label="Back"
              >
                <BackIcon className="w-4 h-4" />
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                onClick={handleShareProfile}
                className="p-2 rounded-full bg-black/60 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                title="مشاركة الملف الشخصي"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {/* Three-Dot Menu (with Requirement 6 Admin Controls) */}
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-full bg-black/60 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className="absolute end-0 mt-2 w-56 bg-[#161B26] border border-[#2A2F3A] rounded-2xl shadow-2xl p-1.5 z-40 animate-slide-up font-tajawal text-start">
                    
                    {/* Common actions */}
                    <button
                      onClick={handleShareProfile}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#1E1E2E] rounded-xl transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#94A3B8]" />
                      <span>نسخ رابط الحساب</span>
                    </button>

                    {isOwnProfile && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setIsEditModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#1E1E2E] rounded-xl transition-colors cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>تعديل الملف الشخصي</span>
                      </button>
                    )}

                    {/* CRITICAL Requirement 6: Administration section when Admin views another user */}
                    {isStaff && !isOwnProfile && (
                      <div className="mt-1 pt-1 border-t border-[#2A2F3A]">
                        <div className="px-3 py-1 text-[10px] font-bold text-[#3B6DFF] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <ShieldCheck className="w-3 h-3" />
                          <span>إدارة Q (Administration)</span>
                        </div>

                        {profile.isVerified ? (
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              setAdminModalMode('revoke');
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-950/30 rounded-xl transition-colors cursor-pointer font-bold"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>سحب شارة التوثيق</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              setAdminModalMode('grant');
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#38BDF8] hover:bg-[#3B6DFF]/10 rounded-xl transition-colors cursor-pointer font-bold"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>منح شارة التوثيق ✨</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setAdminModalMode('details');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#94A3B8] hover:text-white hover:bg-[#1E1E2E] rounded-xl transition-colors cursor-pointer"
                        >
                          <Fingerprint className="w-3.5 h-3.5 text-[#94A3B8]" />
                          <span>تفاصيل الحساب الفنية</span>
                        </button>

                        <button
                          onClick={handleWarnUser}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-amber-950/30 rounded-xl transition-colors cursor-pointer"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>توجيه إنذار رسمي</span>
                        </button>
                      </div>
                    )}

                    {!isOwnProfile && (
                      <div className="mt-1 pt-1 border-t border-[#2A2F3A]">
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            showToast('تم استلام بلاغك وسيقوم فريق الإشراف بالتحقق منه', 'info');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-950/20 rounded-xl transition-colors cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>إبلاغ عن حساب</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isOwnProfile && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="p-2 rounded-full bg-black/60 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                  title="الإعدادات العامة"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Identity & Avatar Row */}
        <div className="px-5 pb-5 pt-0 relative font-tajawal">
          <div className="flex items-end justify-between -mt-12 mb-3">
            
            {/* Modern Squircle Avatar Frame (Reference Style) */}
            <div className="relative w-22 h-22 rounded-3xl p-[2px] bg-gradient-to-tr from-[#3B6DFF] via-[#38BDF8] to-[#93C5FD] shadow-2xl shrink-0">
              <div className="w-full h-full rounded-3xl overflow-hidden bg-[#0B0F19] p-[1.5px]">
                <img
                  src={
                    profile.photoURL ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.displayName)}`
                  }
                  alt={profile.displayName}
                  className="w-full h-full rounded-3xl object-cover"
                />
              </div>

              {/* Live presence beacon */}
              {isUserOnline && (
                <span
                  className="absolute bottom-0.5 end-0.5 w-4 h-4 rounded-full bg-[#10B981] border-2 border-[#161B26] shadow-sm"
                  title="متصل الآن"
                />
              )}

              {/* Owner quick edit icon */}
              {isOwnProfile && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="absolute -bottom-1 -start-1 p-1.5 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-lg cursor-pointer transition-transform active:scale-90"
                  title="تعديل الصورة الشخصية"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Action Buttons Row */}
            <div className="flex items-center gap-2">
              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-5 py-2.5 rounded-2xl bg-[#1E1E2E] border border-[#2A2F3A] hover:border-[#3B6DFF] text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  تعديل الملف الشخصي
                </button>
              ) : (
                <>
                  <button
                    onClick={handleFollow}
                    className={`px-6 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md ${
                      isFollowing
                        ? 'bg-[#1E1E2E] text-[#94A3B8] border border-[#2A2F3A]'
                        : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-[#3B6DFF]/30'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>متابع</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>متابعة</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDirectMessage}
                    className="p-2.5 rounded-2xl bg-[#1E1E2E] border border-[#2A2F3A] hover:border-[#3B6DFF] text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                    title="إرسال رسالة مباشرة"
                  >
                    <MessageCircle className="w-4 h-4 text-[#38BDF8]" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* User Name & Verification Badge */}
          <div className="space-y-1.5">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  {profile.displayName}
                </h1>
                {profile.isVerified && (
                  <VerifiedBadge category={profile.verificationCategory || 'blue'} />
                )}
                {profile.role && profile.role !== 'user' && (
                  <RoleBadge role={profile.role} />
                )}
                {profile.level && profile.level > 0 ? (
                  <LevelBadge level={profile.level} />
                ) : null}
              </div>
              <span className="text-xs text-[#94A3B8] font-mono block mt-0.5">
                @{profile.handle}
              </span>
            </div>

            {/* Biography */}
            {profile.bio ? (
              <p className="text-xs text-[#CBD5E1] leading-relaxed pt-1">
                {profile.bio}
              </p>
            ) : isOwnProfile ? (
              <p
                onClick={() => setIsEditModalOpen(true)}
                className="text-xs text-[#64748B] hover:text-[#38BDF8] italic pt-1 cursor-pointer transition-colors"
              >
                + أضف نبذة تعريفية لتعريف مجتمع Q بك...
              </p>
            ) : null}

            {/* Custom Links */}
            {Boolean(profile.customization?.links && profile.customization.links.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap pt-2">
                {profile.customization?.links?.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0B0F19] border border-[#2A2F3A] hover:border-[#3B6DFF] text-[11px] text-[#38BDF8] hover:text-white transition-all"
                  >
                    <LinkIcon className="w-3 h-3 text-[#3B6DFF]" />
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Real Statistics Row: Posts | Following | Followers */}
            <div className="flex items-center justify-around py-3.5 border-y border-[#2A2F3A] my-3 text-center">
              <div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatCount(postsCount)}
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">{t('posts')}</div>
              </div>

              <div className="h-5 w-px bg-[#2A2F3A]" />

              <div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatCount(followingCount)}
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">يتابع</div>
              </div>

              <div className="h-5 w-px bg-[#2A2F3A]" />

              <div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatCount(followersCount)}
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">{t('followers')}</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Profile Tabs: المنشورات | الوسائط | الإعجابات */}
      <div className="flex items-center justify-around border-b border-[#2A2F3A] text-xs font-bold font-tajawal pb-2">
        <button
          onClick={() => setActiveTab('posts')}
          className={`relative pb-1.5 transition-colors cursor-pointer ${
            activeTab === 'posts' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>المنشورات ({postsCount})</span>
          {activeTab === 'posts' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-[0_2px_8px_rgba(59,109,255,0.6)]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`relative pb-1.5 transition-colors cursor-pointer ${
            activeTab === 'photos' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>الوسائط ({userPosts.filter((p) => Boolean(p.mediaURL)).length})</span>
          {activeTab === 'photos' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-[0_2px_8px_rgba(59,109,255,0.6)]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('likes')}
          className={`relative pb-1.5 transition-colors cursor-pointer ${
            activeTab === 'likes' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>الإعجابات</span>
          {activeTab === 'likes' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-[0_2px_8px_rgba(59,109,255,0.6)]" />
          )}
        </button>
      </div>

      {/* Tab Feed Content */}
      <div className="space-y-3 font-tajawal">
        {activeTab === 'posts' && (
          userPosts.length > 0 ? (
            userPosts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="py-10 px-4 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl">
              <p className="text-xs text-[#94A3B8]">لا توجد منشورات لهذا الحساب حتى الآن.</p>
              {isOwnProfile && (
                <p className="text-[11px] text-[#38BDF8] mt-1">
                  شارك أفكارك وتصاميمك مع مجتمع Q عبر زر النشر (+)
                </p>
              )}
            </div>
          )
        )}

        {activeTab === 'photos' && (
          userPosts.filter((p) => Boolean(p.mediaURL)).length > 0 ? (
            userPosts
              .filter((p) => Boolean(p.mediaURL))
              .map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="py-10 px-4 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl">
              <p className="text-xs text-[#94A3B8]">لا توجد وسائط صور أو فيديو منشورة حتى الآن.</p>
            </div>
          )
        )}

        {activeTab === 'likes' && (
          <div className="py-10 px-4 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl">
            <p className="text-xs text-[#94A3B8]">الإعجابات والتفاعلات خاصة بصاحب الحساب.</p>
          </div>
        )}
      </div>

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

      {/* Admin Verification Modal (Triggered directly from 3-dot menu by Admins) */}
      {profile && adminModalMode && (
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
    </div>
  );
}
