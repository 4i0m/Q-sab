import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Image, Heart, MessageCircle, UserPlus, Check } from 'lucide-react';
import { UserProfile, Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getAllUsers, toggleFollow, checkIsFollowing, listenToPosts } from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';

interface ExploreViewProps {
  onSelectUser: (userId: string) => void;
  onNavigateToEvents?: () => void;
}

export function ExploreView({ onSelectUser }: ExploreViewProps) {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [trendingTags, setTrendingTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Load real members
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

  // Real-time listen to published posts for trending discovery
  useEffect(() => {
    const unsubPosts = listenToPosts((loadedPosts) => {
      setPosts(loadedPosts);

      // Compute dynamic hashtags
      const counts: Record<string, number> = {};
      const regex = /#[\w\u0600-\u06FF]+/g;
      loadedPosts.forEach((p) => {
        const matches = p.content?.match(regex);
        if (matches) {
          matches.forEach((tag) => {
            counts[tag] = (counts[tag] || 0) + 1;
          });
        }
      });
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      if (sorted.length > 0) {
        setTrendingTags(sorted.slice(0, 8));
      } else {
        setTrendingTags(['#القرآن_الكريم', '#التقنية', '#الذكاء_الاصطناعي', '#التطوير_الذاتي', '#العلوم', '#التصميم']);
      }
    });

    return () => unsubPosts();
  }, []);

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
      showToast(newStatus ? `تمت متابعة ${targetUser.displayName}` : `تم إلغاء متابعة ${targetUser.displayName}`, 'info');
    } catch (err) {
      showToast('تعذر تحديث المتابعة', 'error');
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(query) ||
      u.handle.toLowerCase().includes(query) ||
      (u.bio && u.bio.toLowerCase().includes(query))
    );
  });

  const filteredPosts = posts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.content.toLowerCase().includes(query) ||
      p.authorName.toLowerCase().includes(query) ||
      (p.community && p.community.toLowerCase().includes(query))
    );
  });

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-5">
      {/* Top Bar matching Screen 7 */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F3A]">
        <h1 className="text-lg font-bold text-white font-tajawal">{t('explore')}</h1>
        <button
          className="p-1.5 text-[#94A3B8] hover:text-white rounded-lg transition-colors cursor-pointer"
          aria-label="Filter"
        >
          <SlidersHorizontal className="w-5 h-5 stroke-[2]" />
        </button>
      </div>

      {/* Search Input matching Screen 7: ابحث في Q... */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في Q..."
          className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl px-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal shadow-inner text-start"
        />
        <Search className="absolute end-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
      </div>

      {/* Suggested Members matching Screen 7: "اقتراحات للمتابعة" */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-tajawal">
          <span className="font-bold text-white">اقتراحات للمتابعة</span>
          <span className="text-[#4F8CFF] cursor-pointer">عرض الكل &gt;</span>
        </div>

        {filteredUsers.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filteredUsers.slice(0, 3).map((user) => {
              const isFollowing = !!followingMap[user.id];
              return (
                <div
                  key={user.id}
                  className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3 flex flex-col items-center text-center shadow-lg hover:border-[#3B6DFF]/40 transition-all"
                >
                  <div
                    onClick={() => onSelectUser(user.id)}
                    className="cursor-pointer group flex flex-col items-center"
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover border border-[#3B6DFF]/30 mb-2 group-hover:border-[#3B6DFF] transition-colors"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] mb-2 flex items-center justify-center text-sm font-bold text-[#4F8CFF] font-tajawal">
                        {user.displayName.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white truncate max-w-[80px]">
                        {user.displayName}
                      </span>
                      {user.isVerified && (
                        <VerifiedBadge category={user.verificationCategory || 'blue'} className="w-3 h-3" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#94A3B8] font-mono-subtle truncate max-w-[80px] mb-2.5">
                      @{user.handle}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleFollow(user)}
                    className={`w-full py-1.5 rounded-xl text-[11px] font-tajawal font-bold transition-all active:scale-95 cursor-pointer ${
                      isFollowing
                        ? 'bg-[#1E1E2E] text-[#94A3B8] border border-[#2A2F3A]'
                        : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-md shadow-[#3B6DFF]/25'
                    }`}
                  >
                    {isFollowing ? 'متابع' : t('follow')}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-[#64748B] font-tajawal">
            لا يوجد أعضاء مطابقون للبحث.
          </div>
        )}
      </div>

      {/* Dynamic Trending Topics matching Screen 7: "المواضيع الرائجة" */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-tajawal">
          <span className="font-bold text-white">المواضيع الرائجة</span>
          <span className="text-[#4F8CFF] cursor-pointer">عرض الكل &gt;</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {trendingTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSearchQuery(tag.replace('#', ''))}
              className="px-3.5 py-1.5 rounded-xl bg-[#161B26] border border-[#2A2F3A] hover:border-[#3B6DFF]/50 text-[#CBD5E1] hover:text-white text-xs font-tajawal shrink-0 transition-colors cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Discover Social Media Posts */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between text-xs font-tajawal">
          <span className="font-bold text-white">استكشف منشورات المجتمع</span>
          <span className="text-[#94A3B8] text-[11px]">{filteredPosts.length} منشور</span>
        </div>

        {filteredPosts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredPosts.slice(0, 6).map((post) => (
              <div
                key={post.id}
                onClick={() => onSelectUser(post.authorId)}
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl overflow-hidden hover:border-[#3B6DFF]/40 transition-all cursor-pointer group shadow-md"
              >
                {post.mediaURL ? (
                  <div className="h-32 w-full bg-black overflow-hidden relative">
                    <img
                      src={post.mediaURL}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="p-3 h-24 bg-[#1E1E2E]/60 flex items-center justify-center text-center">
                    <p className="text-[11px] text-[#CBD5E1] font-tajawal line-clamp-3">
                      {post.content}
                    </p>
                  </div>
                )}

                <div className="p-2.5">
                  <div className="flex items-center justify-between text-[10px] text-[#94A3B8] font-tajawal">
                    <span className="font-bold text-white truncate max-w-[100px]">{post.authorName}</span>
                    <span className="font-mono-subtle">{formatRelativeTime(post.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#94A3B8] font-mono-subtle">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3 text-red-400" />
                      {post.likesCount || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-[#4F8CFF]" />
                      {post.commentsCount || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4">
            <p className="text-xs text-[#94A3B8] font-tajawal">لا توجد منشورات مطابقة حتى الآن.</p>
          </div>
        )}
      </div>

      {/* Full Members Directory */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-bold text-white font-tajawal">دليل أعضاء Q</h3>
        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="p-3 rounded-2xl bg-[#161B26] border border-[#2A2F3A] flex items-center justify-between gap-3"
            >
              <div
                onClick={() => onSelectUser(user.id)}
                className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-[#3B6DFF]/30 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] shrink-0 flex items-center justify-center text-xs font-bold text-[#4F8CFF] font-tajawal">
                    {user.displayName.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white font-tajawal truncate">
                      {user.displayName}
                    </span>
                    {user.isVerified && (
                      <VerifiedBadge category={user.verificationCategory || 'blue'} className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="text-[10px] text-[#94A3B8] font-mono-subtle block">
                    @{user.handle}
                  </span>
                </div>
              </div>

              {currentUser?.id !== user.id && (
                <button
                  onClick={() => handleToggleFollow(user)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-tajawal font-bold shrink-0 transition-all active:scale-95 cursor-pointer ${
                    followingMap[user.id]
                      ? 'bg-[#1E1E2E] text-[#94A3B8] border border-[#2A2F3A]'
                      : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-sm'
                  }`}
                >
                  {followingMap[user.id] ? 'متابع' : t('follow')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
