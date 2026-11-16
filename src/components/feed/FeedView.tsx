import { useState, useEffect } from 'react';
import { Plus, Image, FileText, BarChart3 } from 'lucide-react';
import { Post, FollowRelationship } from '../../types';
import { listenToPosts, listenToUserFollowing } from '../../services/firestore';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { PostCard } from './PostCard';
import { StoriesBar } from '../stories/StoriesBar';
import { CreatePostInitialMode } from './CreatePostModal';
import { MediaImage } from '../common/MediaImage';

interface FeedViewProps {
  onOpenCreatePost: (mode?: CreatePostInitialMode) => void;
  onSelectAuthor: (authorId: string) => void;
  onSelectPost?: (post: Post) => void;
}

type FeedTab = 'forYou' | 'following' | 'blogs' | 'questions' | 'media';

export function FeedView({ onOpenCreatePost, onSelectAuthor, onSelectPost }: FeedViewProps) {
  const { currentUser, isStaff } = useAuth();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('forYou');
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([]);
  const [loading, setLoading] = useState(true);

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

  const followedIds = new Set(followingList.map((f) => f.followingId));

  const filteredPosts = posts.filter((post) => {
    if (post.visibility === 'followers_only') {
      const canViewPrivatePost =
        Boolean(currentUser?.id && currentUser.id === post.authorId) ||
        followedIds.has(post.authorId) ||
        isStaff;
      if (!canViewPrivatePost) return false;
    }

    if (feedTab === 'following') {
      if (!currentUser?.id) return false;
      return followedIds.has(post.authorId) || post.authorId === currentUser.id;
    }

    if (feedTab === 'blogs') {
      return post.postType === 'blog' || post.postType === 'wiki';
    }

    if (feedTab === 'questions') {
      return post.postType === 'question' || post.postType === 'poll' || post.postType === 'quiz';
    }

    if (feedTab === 'media') {
      return Boolean(
        post.mediaURL ||
          post.videoURL ||
          (post.mediaURLs && post.mediaURLs.length > 0)
      );
    }

    return true;
  });

  const tabs: Array<{ id: FeedTab; label: string }> = [
    { id: 'forYou', label: t('forYou') },
    { id: 'following', label: t('following') },
    { id: 'blogs', label: 'مدونات وويكي' },
    { id: 'questions', label: 'أسئلة واستطلاعات' },
    { id: 'media', label: t('media') },
  ];

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-3.5">
      {/* Top Global Feed Tabs */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-none border-b border-slate-200 dark:border-[#2A2F3A] px-2 pt-0.5 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFeedTab(tab.id)}
            className={`relative pb-1.5 text-xs sm:text-sm font-bold font-tajawal shrink-0 transition-colors cursor-pointer ${
              feedTab === tab.id
                ? 'text-[#3B6DFF]'
                : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            {feedTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-sm shadow-[#3B6DFF]/50" />
            )}
          </button>
        ))}
      </div>

      {/* Quick Create Post Box */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3.5 shadow-sm dark:shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-[#1E1E2E] shrink-0 border border-[#3B6DFF]/40">
            <MediaImage
              src={currentUser?.photoURL}
              alt={currentUser?.displayName || 'Q'}
              variant="avatar"
              fallbackText={currentUser?.displayName || 'Q'}
              containerClassName="w-full h-full rounded-full overflow-hidden"
              className="w-full h-full object-cover"
            />
          </div>

          <button
            onClick={() => onOpenCreatePost('post')}
            className="flex-1 text-start px-4 py-2.5 rounded-full bg-slate-100 dark:bg-[#0B0F19] hover:bg-slate-200/80 dark:hover:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] text-xs font-tajawal transition-colors cursor-pointer"
          >
            ماذا يدور في بالك؟...
          </button>
        </div>

        <div className="flex items-center justify-around pt-2 border-t border-slate-100 dark:border-[#2A2F3A]/60 text-xs font-tajawal text-slate-600 dark:text-[#94A3B8]">
          <button
            onClick={() => onOpenCreatePost('image')}
            className="flex items-center gap-1.5 hover:text-[#3B6DFF] dark:hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E1E2E] cursor-pointer"
          >
            <Image className="w-4 h-4 text-[#3B6DFF] dark:text-[#4F8CFF]" />
            <span>صور / فيديو</span>
          </button>

          <button
            onClick={() => onOpenCreatePost('blog')}
            className="flex items-center gap-1.5 hover:text-[#3B6DFF] dark:hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E1E2E] cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#38BDF8]" />
            <span>مدونة / ويكي</span>
          </button>

          <button
            onClick={() => onOpenCreatePost('poll')}
            className="flex items-center gap-1.5 hover:text-[#3B6DFF] dark:hover:text-[#4F8CFF] transition-colors py-1 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E1E2E] cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-[#818CF8]" />
            <span>استطلاع / سؤال</span>
          </button>
        </div>
      </div>

      {/* Stories Bar Carousel */}
      <div className="pt-0.5">
        <StoriesBar onSelectAuthor={onSelectAuthor} />
      </div>

      {/* Posts Stream */}
      <div className="space-y-3.5 pt-1">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-56 rounded-2xl bg-slate-200/70 dark:bg-[#161B26]/60 animate-pulse border border-slate-200 dark:border-[#2A2F3A]" />
            ))}
          </div>
        ) : filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onSelectAuthor={onSelectAuthor}
              onSelectPost={onSelectPost}
            />
          ))
        ) : (
          <div className="py-14 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6 space-y-2 shadow-sm">
            <h4 className="text-base font-bold text-slate-900 dark:text-white font-tajawal">
              {feedTab === 'following'
                ? 'لا توجد منشورات من الحسابات التي تتابعها'
                : feedTab === 'blogs'
                ? 'لا توجد مدونات أو صفحات ويكي بعد'
                : feedTab === 'questions'
                ? 'لا توجد أسئلة أو استطلاعات بعد'
                : 'مرحباً بك في مجتمع Q'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-xs mx-auto font-tajawal">
              {feedTab === 'following'
                ? 'تابع المستخدمين في تبويب "لك" أو "اكتشف" لتظهر منشوراتهم هنا.'
                : 'كن أول من ينشر في هذه المساحة ويشارك أفكاره مع الجميع.'}
            </p>
            <button
              onClick={() => onOpenCreatePost('post')}
              className="mt-3 px-6 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal shadow-lg shadow-[#3B6DFF]/25 active:scale-95 transition-all cursor-pointer"
            >
              {t('publishPost')}
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 end-4 sm:end-8 z-30">
        <button
          onClick={() => onOpenCreatePost('post')}
          className="w-12 h-12 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center shadow-xl shadow-[#3B6DFF]/40 hover:scale-105 active:scale-90 transition-transform border border-[#4F8CFF]/40 cursor-pointer"
          aria-label={t('publishPost')}
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      </div>
    </div>
  );
}
