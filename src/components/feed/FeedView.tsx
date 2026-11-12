import { useState, useEffect } from 'react';
import { Plus, Image, Video, Users, Sparkles, Filter } from 'lucide-react';
import { Post, FollowRelationship } from '../../types';
import { listenToPosts, listenToUserFollowing } from '../../services/firestore';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { PostCard } from './PostCard';
import { StoriesBar } from '../stories/StoriesBar';

interface FeedViewProps {
  onOpenCreatePost: () => void;
  onSelectAuthor: (authorId: string) => void;
}

type FeedTab = 'forYou' | 'following' | 'communities' | 'media';

const COMMUNITIES = [
  'الكل',
  'القرآن الكريم',
  'التقنية والذكاء الاصطناعي',
  'التطوير الذاتي والفكر',
  'العلوم والمعرفة',
  'التصميم والفنون',
  'عام',
];

export function FeedView({ onOpenCreatePost, onSelectAuthor }: FeedViewProps) {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('forYou');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('الكل');
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen to all posts in real-time
  useEffect(() => {
    const unsub = listenToPosts((loadedPosts) => {
      setPosts(loadedPosts);
      setLoading(false);
    });
    const timer = setTimeout(() => setLoading(false), 1200);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Listen to current user's followed accounts for "المتابعون" filter
  useEffect(() => {
    if (!currentUser?.id) {
      setFollowingList([]);
      return;
    }
    const unsub = listenToUserFollowing(currentUser.id, (records) => {
      setFollowingList(records);
    });
    return () => unsub();
  }, [currentUser?.id]);

  // Compute filtered posts based on active tab
  const filteredPosts = posts.filter((post) => {
    if (feedTab === 'following') {
      if (!currentUser?.id) return false;
      const followedIds = new Set(followingList.map((f) => f.followingId));
      // Show user's own posts + followed accounts
      return followedIds.has(post.authorId) || post.authorId === currentUser.id;
    }

    if (feedTab === 'communities') {
      if (selectedCommunity === 'الكل') return true;
      return post.community === selectedCommunity;
    }

    if (feedTab === 'media') {
      return Boolean(post.mediaURL);
    }

    return true; // 'forYou'
  });

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-3.5">
      
      {/* 1. Top Tabs: لك | المتابعون | المجتمعات | الوسائط */}
      <div className="flex items-center justify-between border-b border-[#2A2F3A] px-2 pt-0.5 pb-2">
        <button
          onClick={() => setFeedTab('forYou')}
          className={`relative pb-1.5 text-xs sm:text-sm font-bold font-tajawal transition-colors cursor-pointer ${
            feedTab === 'forYou' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>{t('forYou')}</span>
          {feedTab === 'forYou' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-sm shadow-[#3B6DFF]/50" />
          )}
        </button>

        <button
          onClick={() => setFeedTab('following')}
          className={`relative pb-1.5 text-xs sm:text-sm font-bold font-tajawal transition-colors cursor-pointer ${
            feedTab === 'following' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>{t('following')}</span>
          {feedTab === 'following' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-sm shadow-[#3B6DFF]/50" />
          )}
        </button>

        <button
          onClick={() => setFeedTab('communities')}
          className={`relative pb-1.5 text-xs sm:text-sm font-bold font-tajawal transition-colors cursor-pointer ${
            feedTab === 'communities' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>المجتمعات</span>
          {feedTab === 'communities' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-sm shadow-[#3B6DFF]/50" />
          )}
        </button>

        <button
          onClick={() => setFeedTab('media')}
          className={`relative pb-1.5 text-xs sm:text-sm font-bold font-tajawal transition-colors cursor-pointer ${
            feedTab === 'media' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>الوسائط</span>
          {feedTab === 'media' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-sm shadow-[#3B6DFF]/50" />
          )}
        </button>
      </div>

      {/* Community Pills Selector (Visible when 'المجتمعات' is active) */}
      {feedTab === 'communities' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
          {COMMUNITIES.map((comm) => (
            <button
              key={comm}
              onClick={() => setSelectedCommunity(comm)}
              className={`px-3 py-1 rounded-xl text-xs font-tajawal font-bold shrink-0 transition-all cursor-pointer ${
                selectedCommunity === comm
                  ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                  : 'bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-white'
              }`}
            >
              {comm}
            </button>
          ))}
        </div>
      )}

      {/* 2. "ماذا يدور في بالك؟" Quick Create Post Box matching Reference Images */}
      <div className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3.5 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-[#1E1E2E] shrink-0 border border-[#3B6DFF]/40">
            <img
              src={
                currentUser?.photoURL ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  currentUser?.displayName || 'Q User'
                )}`
              }
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          <button
            onClick={onOpenCreatePost}
            className="flex-1 text-start px-4 py-2.5 rounded-full bg-[#0B0F19] hover:bg-[#1E1E2E] border border-[#2A2F3A] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-tajawal transition-colors cursor-pointer"
          >
            ماذا يدور في بالك؟...
          </button>
        </div>

        {/* Quick action buttons: صورة | فيديو | مجتمع */}
        <div className="flex items-center justify-around pt-2 border-t border-[#2A2F3A]/60 text-xs font-tajawal text-[#94A3B8]">
          <button
            onClick={onOpenCreatePost}
            className="flex items-center gap-1.5 hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-[#1E1E2E] cursor-pointer"
          >
            <Image className="w-4 h-4 text-[#4F8CFF]" />
            <span>صورة</span>
          </button>

          <button
            onClick={onOpenCreatePost}
            className="flex items-center gap-1.5 hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-[#1E1E2E] cursor-pointer"
          >
            <Video className="w-4 h-4 text-[#38BDF8]" />
            <span>فيديو</span>
          </button>

          <button
            onClick={() => {
              setFeedTab('communities');
            }}
            className="flex items-center gap-1.5 hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-[#1E1E2E] cursor-pointer"
          >
            <Users className="w-4 h-4 text-[#818CF8]" />
            <span>مجتمع</span>
          </button>
        </div>
      </div>

      {/* 3. Stories Bar Carousel */}
      <div className="pt-0.5">
        <StoriesBar />
      </div>

      {/* 4. Posts Stream */}
      <div className="space-y-3.5 pt-1">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-56 rounded-2xl bg-[#161B26]/60 animate-pulse border border-[#2A2F3A]" />
            ))}
          </div>
        ) : filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} onSelectAuthor={onSelectAuthor} />
          ))
        ) : (
          <div className="py-14 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6 space-y-2">
            <h4 className="text-base font-bold text-white font-tajawal">
              {feedTab === 'following'
                ? 'لا توجد منشورات من الحسابات التي تتابعها'
                : feedTab === 'communities'
                ? `لا توجد منشورات في مجتمع "${selectedCommunity}" حالياً`
                : 'مرحباً بك في مجتمع Q'}
            </h4>
            <p className="text-xs text-[#94A3B8] max-w-xs mx-auto font-tajawal">
              {feedTab === 'following'
                ? 'تابع المستخدمين في تبويب "لك" أو "اكتشف" لتظهر منشوراتهم هنا في هذه الخلاصة.'
                : 'كن أول من ينشر في هذه المساحة ويشارك أفكاره وتجاربه مع الآخرين.'}
            </p>
            <button
              onClick={onOpenCreatePost}
              className="mt-3 px-6 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal shadow-lg shadow-[#3B6DFF]/25 active:scale-95 transition-all cursor-pointer"
            >
              {t('publishPost')}
            </button>
          </div>
        )}
      </div>

      {/* 5. Floating Action Button matching reference images */}
      <div className="fixed bottom-20 end-4 sm:end-8 z-30">
        <button
          onClick={onOpenCreatePost}
          className="w-12 h-12 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center shadow-xl shadow-[#3B6DFF]/40 hover:scale-105 active:scale-90 transition-transform border border-[#4F8CFF]/40 cursor-pointer"
          aria-label={t('publishPost')}
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

    </div>
  );
}
