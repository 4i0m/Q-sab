import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Heart,
  MessageCircle,
  MessageSquare,
  BookOpen,
  FileText,
  TrendingUp,
  X,
  Compass,
  Play,
  Images,
  Calendar,
  Clock,
  ArrowUpLeft,
  Lock,
  Globe,
  Shield,
  Megaphone,
  ExternalLink
} from 'lucide-react';
import {
  UserProfile,
  Post,
  ChatRoom,
  PlatformAnnouncement,
  PlatformAd
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  getAllUsers,
  toggleFollow,
  checkIsFollowing,
  listenToPosts,
  listenToPlatformAnnouncements,
  listenToPlatformAds
} from '../../services/firestore';
import { listenToChatRooms } from '../../services/chatRooms';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { CommentsModal } from '../feed/CommentsModal';
import { MediaImage } from '../common/MediaImage';
import { formatRelativeTime } from '../../utils/date';
import { stripMarkdownForPreview, estimateReadingMinutes } from '../common/RichBlogContent';
import { useLiveUserProfiles } from '../../hooks/useUserProfiles';
import { matchesSearchQuery } from '../../utils/search';

type ExploreTab = 'all' | 'accounts' | 'rooms' | 'articles' | 'posts';

function getSafeExternalUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

interface ExploreViewProps {
  onSelectUser: (userId: string) => void;
  onSelectPost?: (post: Post) => void;
  onSelectRoom?: (roomId: string) => void;
  onNavigateToEvents?: () => void;
}

export function ExploreView({
  onSelectUser,
  onSelectPost,
  onSelectRoom,
  onNavigateToEvents,
}: ExploreViewProps) {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [ads, setAds] = useState<PlatformAd[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ExploreTab>('all');
  const [trendingTags, setTrendingTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);

  const livePostAuthors = useLiveUserProfiles(posts.map((p) => p.authorId));
  const liveRoomOwners = useLiveUserProfiles(rooms.map((r) => r.ownerId));

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const allUsers = await getAllUsers(50);
        setUsers(allUsers);

        if (currentUser?.id) {
          const map: Record<string, boolean> = {};
          for (const u of allUsers) {
            if (u.id !== currentUser.id) {
              const following = await checkIsFollowing(currentUser.id, u.id);
              map[u.id] = following;
            }
          }
          setFollowingMap(map);
        }
      } catch (err) {
        console.error('Failed to load explore users:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [currentUser?.id]);

  useEffect(() => {
    const unsubPosts = listenToPosts((loadedPosts) => {
      const canSeePrivate = currentUser?.role === 'admin' || currentUser?.role === 'owner';
      const exploreVisiblePosts = loadedPosts.filter((p) => {
        if (p.visibility !== 'followers_only') return true;
        if (canSeePrivate) return true;
        if (currentUser?.id && p.authorId === currentUser.id) return true;
        return Boolean(followingMap[p.authorId]);
      });

      setPosts(exploreVisiblePosts);

      const counts: Record<string, number> = {};
      const regex = /#[\w\u0600-\u06FF]+/g;
      exploreVisiblePosts.forEach((p) => {
        const matches = p.content?.match(regex);
        if (matches) {
          matches.forEach((tag) => {
            counts[tag] = (counts[tag] || 0) + 1;
          });
        }
        (p.tags || []).forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      });
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      setTrendingTags(sorted.slice(0, 12));
    });

    const unsubRooms = listenToChatRooms(currentUser, setRooms);
    const unsubAnnouncements = listenToPlatformAnnouncements(setAnnouncements);
    const unsubAds = listenToPlatformAds(setAds);

    return () => {
      unsubPosts();
      unsubRooms();
      unsubAnnouncements();
      unsubAds();
    };
  }, [currentUser?.id, currentUser?.role, followingMap]);

  const handleToggleFollow = async (targetUser: UserProfile) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً للمتابعة', 'info');
      return;
    }

    try {
      const currentStatus = !!followingMap[targetUser.id];
      setFollowingMap((prev) => ({ ...prev, [targetUser.id]: !currentStatus }));

      const newStatus = await toggleFollow(
        currentUser.id,
        targetUser.id,
        { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
      );
      setFollowingMap((prev) => ({ ...prev, [targetUser.id]: newStatus }));
      showToast(
        newStatus ? `تمت متابعة ${targetUser.displayName}` : `تم إلغاء متابعة ${targetUser.displayName}`,
        'info'
      );
    } catch {
      showToast('تعذر تحديث المتابعة', 'error');
    }
  };

  const qLower = searchQuery.trim().toLowerCase();

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        matchesSearchQuery(searchQuery, u.displayName, u.handle, u.bio)
      ),
    [users, searchQuery]
  );

  const filteredPosts = useMemo(
    () =>
      posts.filter((p) => {
        const liveName = livePostAuthors[p.authorId]?.displayName || p.authorName;
        const liveHandle = livePostAuthors[p.authorId]?.handle || p.authorHandle;
        return matchesSearchQuery(searchQuery, p.content, p.title, liveName, liveHandle);
      }),
    [posts, searchQuery, livePostAuthors]
  );

  const filteredRooms = useMemo(
    () =>
      rooms.filter((r) => {
        const ownerName = liveRoomOwners[r.ownerId]?.displayName || r.ownerName;
        return matchesSearchQuery(searchQuery, r.title, r.description, r.topic, ownerName);
      }),
    [rooms, searchQuery, liveRoomOwners]
  );

  const featuredArticles = useMemo(
    () => filteredPosts.filter((p) => p.postType === 'blog' || p.postType === 'wiki'),
    [filteredPosts]
  );

  const activeAnnouncements = useMemo(() => {
    const nowIso = new Date().toISOString();
    return announcements.filter(
      (a) =>
        !a.isPaused &&
        (!a.publishAt || a.publishAt <= nowIso) &&
        (!a.expiresAt || a.expiresAt >= nowIso)
    );
  }, [announcements]);

  const activeAds = useMemo(() => {
    const nowIso = new Date().toISOString();
    return ads.filter(
      (a) =>
        !a.isPaused &&
        (!a.publishAt || a.publishAt <= nowIso) &&
        (!a.expiresAt || a.expiresAt >= nowIso)
    );
  }, [ads]);

  const openPost = (post: Post) => {
    if (onSelectPost) onSelectPost(post);
    else setSelectedPostForComments(post);
  };

  const filterTabs: Array<{ id: ExploreTab; label: string; count?: number }> = [
    { id: 'all', label: 'الكل' },
    { id: 'accounts', label: 'الحسابات', count: filteredUsers.length },
    { id: 'rooms', label: 'غرف الدردشة', count: filteredRooms.length },
    { id: 'articles', label: 'مدونات وويكي', count: featuredArticles.length },
    { id: 'posts', label: 'المنشورات', count: filteredPosts.length },
  ];

  const showAccounts = activeFilter === 'all' || activeFilter === 'accounts';
  const showRooms = activeFilter === 'all' || activeFilter === 'rooms';
  const showArticles = activeFilter === 'all' || activeFilter === 'articles';
  const showPosts = activeFilter === 'all' || activeFilter === 'posts';

  return (
    <div className="w-full max-w-3xl mx-auto pb-28 space-y-5 font-ar">
      {/* Header + Search */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#3B6DFF]/10 border border-[#3B6DFF]/25 flex items-center justify-center text-[#3B6DFF] shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                {t('explore')}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                استكشف الحسابات وغرف الدردشة والمدونات والمنشورات الحقيقية
              </p>
            </div>
          </div>

          {onNavigateToEvents && (
            <button
              type="button"
              onClick={onNavigateToEvents}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] hover:border-[#3B6DFF]/50 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-[#3B6DFF]" />
              <span>الفعاليات</span>
            </button>
          )}
        </div>

        {/* Global Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-[#64748B] absolute start-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن حسابات، غرف دردشة، منشورات، مدونات، أو وسوم..."
            className="w-full min-h-[46px] bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] focus:border-[#3B6DFF] rounded-2xl ps-11 pe-11 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none shadow-sm text-start transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
              className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-[#0B0F19] text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center absolute end-2 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {filterTabs.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] text-slate-600 dark:text-[#94A3B8]'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      active ? 'text-white/85' : 'text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real Platform Official Announcements & Real Sponsored Ads (rendered strictly when real active records exist) */}
      {activeFilter === 'all' && !qLower && (activeAnnouncements.length > 0 || activeAds.length > 0) && (
        <section className="space-y-2.5">
          {activeAnnouncements.slice(0, 2).map((ann) => {
            const safeUrl = getSafeExternalUrl(ann.targetUrl);
            return (
              <div
                key={ann.id}
                className="rounded-2xl bg-gradient-to-l from-[#3B6DFF]/10 via-white to-white dark:from-[#3B6DFF]/15 dark:via-[#111622] dark:to-[#111622] border border-[#3B6DFF]/30 p-3.5 shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-[#3B6DFF] text-white flex items-center justify-center shrink-0">
                      <Megaphone className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="text-[10px] font-extrabold text-[#3B6DFF] block">
                        إعلان رسمي من إدارة Q
                      </span>
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                        {ann.title}
                      </h3>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                    {formatRelativeTime(ann.publishAt || ann.createdAt)}
                  </span>
                </div>
                {ann.bannerURL && (
                  <MediaImage
                    src={ann.bannerURL}
                    alt={ann.title}
                    variant="post"
                    containerClassName="w-full h-36 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232A37]"
                    className="w-full h-full object-cover"
                  />
                )}
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {ann.content}
                </p>
                {safeUrl && (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#3B6DFF] hover:underline"
                  >
                    <span>عرض التفاصيل</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })}

          {activeAds.slice(0, 2).map((ad) => {
            const safeUrl = getSafeExternalUrl(ad.targetUrl);
            return (
              <div
                key={ad.id}
                className="rounded-2xl bg-white dark:bg-[#111622] border border-amber-500/30 p-3.5 shadow-sm flex flex-col sm:flex-row gap-3 items-start"
              >
                {ad.mediaURL && (
                  <MediaImage
                    src={ad.mediaURL}
                    alt={ad.title}
                    variant="post"
                    containerClassName="w-full sm:w-32 h-28 sm:h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232A37] shrink-0"
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                      إعلان مموّل {ad.sponsorName ? `• ${ad.sponsorName}` : ''}
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {formatRelativeTime(ad.publishAt || ad.createdAt)}
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    {ad.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed line-clamp-2">
                    {ad.content}
                  </p>
                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl bg-[#3B6DFF] text-white text-[11px] font-bold hover:bg-[#2B5BE5] transition-colors"
                    >
                      <span>{ad.ctaLabel || 'زيارة الرابط'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Dynamic Trending Hashtags */}
      {trendingTags.length > 0 && activeFilter === 'all' && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-[#3B6DFF]" />
            <span className="font-bold text-slate-900 dark:text-white">{t('trendingTopics')}</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {trendingTags.map((tag) => {
              const cleanTag = tag.replace('#', '');
              const isSelected = qLower === cleanTag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSearchQuery(isSelected ? '' : cleanTag)}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#3B6DFF] text-white border border-[#3B6DFF]'
                      : 'bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] text-slate-700 dark:text-[#CBD5E1]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Suggested Accounts Spotlight */}
      {showAccounts && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white">{t('suggestedForYou')}</span>
            {activeFilter === 'all' && filteredUsers.length > 4 && (
              <button
                type="button"
                onClick={() => setActiveFilter('accounts')}
                className="text-[11px] font-bold text-[#3B6DFF] hover:underline cursor-pointer"
              >
                عرض الكل
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-2xl bg-slate-200/70 dark:bg-[#111622]/60 animate-pulse border border-slate-200 dark:border-[#232A37]"
                />
              ))}
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredUsers.slice(0, activeFilter === 'accounts' ? 12 : 4).map((user) => {
                const isFollowing = !!followingMap[user.id];
                return (
                  <div
                    key={user.id}
                    className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl p-3 flex flex-col items-center text-center shadow-sm hover:border-[#3B6DFF]/40 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectUser(user.id)}
                      className="cursor-pointer group flex flex-col items-center w-full"
                    >
                      <MediaImage
                        src={user.photoURL}
                        alt={user.displayName}
                        variant="avatar"
                        fallbackText={user.displayName}
                        containerClassName="w-14 h-14 rounded-full overflow-hidden border border-[#3B6DFF]/30 mb-2"
                        className="w-full h-full object-cover"
                      />
                      <div className="flex items-center justify-center gap-1 max-w-full">
                        <span className="font-display-en text-xs font-bold text-slate-900 dark:text-white truncate max-w-[110px]">
                          {user.displayName}
                        </span>
                        {user.isVerified && (
                          <VerifiedBadge category={user.verificationCategory || 'blue'} className="w-3 h-3 shrink-0" interactive={false} />
                        )}
                      </div>
                      <span className="font-handle text-[11px] text-slate-500 dark:text-[#8E9BAB] truncate max-w-full mb-1">
                        @{user.handle}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-[#94A3B8] line-clamp-1 min-h-[15px] mb-2.5">
                        {user.bio || 'عضو في Q'}
                      </p>
                    </button>

                    {currentUser?.id !== user.id && (
                      <button
                        type="button"
                        onClick={() => handleToggleFollow(user)}
                        className={`w-full min-h-[34px] py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                          isFollowing
                            ? 'bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-[#242B38]'
                            : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-sm'
                        }`}
                      >
                        {isFollowing ? t('followingState') : t('follow')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl text-xs text-slate-500">
              لا يوجد أعضاء مطابقون للبحث.
            </div>
          )}
        </section>
      )}

      {/* Real Standalone Chat Rooms */}
      {showRooms && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#3B6DFF]" />
              <span>غرف الدردشة المتاحة</span>
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">{filteredRooms.length}</span>
          </div>

          {filteredRooms.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredRooms.slice(0, activeFilter === 'rooms' ? 20 : 4).map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom?.(room.id)}
                  className="text-start p-3.5 rounded-2xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] hover:border-[#3B6DFF]/50 cursor-pointer transition-all flex items-center gap-3 shadow-sm"
                >
                  <MediaImage
                    src={room.imageURL}
                    alt={room.title}
                    variant="avatar"
                    fallbackText={room.title}
                    containerClassName="w-12 h-12 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#242B38] shrink-0"
                    className="w-full h-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        {room.title}
                        {room.visibility === 'private' ? (
                          <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                        ) : room.visibility === 'staff' ? (
                          <Shield className="w-3 h-3 text-[#3B6DFF] shrink-0" />
                        ) : (
                          <Globe className="w-3 h-3 text-emerald-500 shrink-0" />
                        )}
                      </span>
                      <ArrowUpLeft className="w-3.5 h-3.5 text-[#3B6DFF] shrink-0" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-[#8E9BAB] truncate mt-0.5">
                      {room.description || `بقيادة ${room.ownerName}`}
                    </p>
                    <p className="text-[10px] text-slate-400 tabular-nums mt-1">
                      {room.memberCount || 1} عضو
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl text-xs text-slate-500">
              لا توجد غرف دردشة متاحة مطابقة للبحث حالياً.
            </div>
          )}
        </section>
      )}

      {/* Global Blogs & Wiki Showcase */}
      {showArticles && featuredArticles.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#3B6DFF]" />
              <span className="font-bold text-slate-900 dark:text-white">مدونات وصفحات ويكي</span>
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">{featuredArticles.length}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {featuredArticles.slice(0, activeFilter === 'articles' ? 16 : 4).map((article) => {
              const cover = article.mediaURLs?.[0] || article.mediaURL;
              const readMins = estimateReadingMinutes(article.content);
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => openPost(article)}
                  className="text-start p-3.5 rounded-2xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] hover:border-[#3B6DFF]/50 cursor-pointer transition-all flex items-start gap-3 shadow-sm"
                >
                  {cover ? (
                    <MediaImage
                      src={cover}
                      alt=""
                      variant="thumbnail"
                      containerClassName="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-[#242B38]"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#3B6DFF]/10 text-[#3B6DFF] flex items-center justify-center shrink-0">
                      {article.postType === 'wiki' ? (
                        <BookOpen className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#3B6DFF] tabular-nums">
                      <span>{article.postType === 'wiki' ? 'ويكي' : 'مدونة'}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5 text-slate-500 font-normal">
                        <Clock className="w-3 h-3" />
                        {readMins} د قراءة
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white line-clamp-1">
                      {article.title || stripMarkdownForPreview(article.content).slice(0, 60)}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] line-clamp-2 leading-snug">
                      {stripMarkdownForPreview(article.content)}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate pt-0.5">
                      بقلم {livePostAuthors[article.authorId]?.displayName || article.authorName} · {formatRelativeTime(article.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Discover Global Posts & Media */}
      {showPosts && (
        <section className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white">استكشف منشورات Q</span>
            <span className="text-slate-500 text-[11px] tabular-nums">{filteredPosts.length}</span>
          </div>

          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredPosts.slice(0, activeFilter === 'posts' ? 18 : 6).map((post) => {
                const gallery =
                  post.mediaURLs && post.mediaURLs.length > 0
                    ? post.mediaURLs
                    : post.mediaURL
                    ? [post.mediaURL]
                    : [];
                const previewImg = gallery[0];
                const isVideo = Boolean(post.videoURL);
                const cleanSnippet = stripMarkdownForPreview(post.content);

                return (
                  <div
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl overflow-hidden hover:border-[#3B6DFF]/40 transition-all cursor-pointer group shadow-sm flex flex-col"
                  >
                    {isVideo ? (
                      <div className="h-36 w-full bg-slate-900 overflow-hidden relative">
                        <video
                          src={post.videoURL}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-2 end-2 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </span>
                      </div>
                    ) : previewImg ? (
                      <div className="h-36 w-full bg-slate-100 dark:bg-[#141A26] overflow-hidden relative">
                        <MediaImage
                          src={previewImg}
                          alt=""
                          variant="post"
                          containerClassName="w-full h-full overflow-hidden"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {gallery.length > 1 && (
                          <span className="absolute top-2 end-2 px-1.5 py-0.5 rounded-lg bg-black/65 text-white text-[10px] font-bold flex items-center gap-1 tabular-nums">
                            <Images className="w-3 h-3" />
                            {gallery.length}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="p-3.5 h-36 bg-slate-50 dark:bg-[#0B0F19] flex flex-col justify-center text-start">
                        {post.title && (
                          <p className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1 mb-1">
                            {post.title}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-700 dark:text-[#CBD5E1] line-clamp-4 leading-relaxed">
                          {cleanSnippet}
                        </p>
                      </div>
                    )}

                    <div className="p-2.5 mt-auto border-t border-slate-100 dark:border-[#232A37]">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectUser(post.authorId);
                          }}
                          className="font-bold text-slate-900 dark:text-white hover:text-[#3B6DFF] truncate max-w-[105px] cursor-pointer text-start"
                        >
                          {livePostAuthors[post.authorId]?.displayName || post.authorName}
                        </button>
                        <span className="tabular-nums">{formatRelativeTime(post.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 tabular-nums">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3 text-rose-500" />
                          {post.likesCount || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-[#3B6DFF]" />
                          {post.commentsCount || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-2xl p-4">
              <p className="text-xs text-slate-500">لا توجد منشورات مطابقة حتى الآن.</p>
            </div>
          )}
        </section>
      )}

      {/* Full Members Directory */}
      {showAccounts && filteredUsers.length > 0 && (
        <section className="space-y-2 pt-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">دليل أعضاء Q</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] flex items-center justify-between gap-3 shadow-sm hover:border-[#3B6DFF]/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onSelectUser(user.id)}
                  className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0 text-start"
                >
                  <MediaImage
                    src={user.photoURL}
                    alt={user.displayName}
                    variant="avatar"
                    fallbackText={user.displayName}
                    containerClassName="w-10 h-10 rounded-full overflow-hidden border border-[#3B6DFF]/30 shrink-0"
                    className="w-full h-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-display-en text-xs font-bold text-slate-900 dark:text-white truncate">
                        {user.displayName}
                      </span>
                      {user.isVerified && (
                        <VerifiedBadge category={user.verificationCategory || 'blue'} className="w-3.5 h-3.5 shrink-0" interactive={false} />
                      )}
                    </div>
                    <span className="font-handle text-[11px] text-slate-500 block truncate">
                      @{user.handle}
                    </span>
                  </div>
                </button>

                {currentUser?.id !== user.id && (
                  <button
                    type="button"
                    onClick={() => handleToggleFollow(user)}
                    className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap cursor-pointer ${
                      followingMap[user.id]
                        ? 'bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-[#94A3B8] border border-slate-200 dark:border-[#242B38]'
                        : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-sm'
                    }`}
                  >
                    {followingMap[user.id] ? t('followingState') : t('follow')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedPostForComments && (
        <CommentsModal
          post={selectedPostForComments}
          isOpen={Boolean(selectedPostForComments)}
          onClose={() => setSelectedPostForComments(null)}
          onSelectAuthor={onSelectUser}
        />
      )}
    </div>
  );
}
