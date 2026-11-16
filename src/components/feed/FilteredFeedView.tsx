import { useEffect, useState } from 'react';
import {
  FileText,
  BookOpen,
  Repeat2,
  Bookmark,
  ArrowRight,
  ArrowLeft,
  Plus,
  Loader2
} from 'lucide-react';
import { BookmarkRecord, Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { listenToPosts, listenToUserBookmarks } from '../../services/firestore';
import { PostCard } from './PostCard';
import { CreatePostInitialMode } from './CreatePostModal';

export type FilteredFeedMode = 'blogs' | 'wiki' | 'reposts' | 'saved';

interface FilteredFeedViewProps {
  mode: FilteredFeedMode;
  onBack?: () => void;
  onSelectAuthor: (authorId: string) => void;
  onSelectPost?: (post: Post) => void;
  onOpenCreatePost?: (mode?: CreatePostInitialMode) => void;
}

export function FilteredFeedView({
  mode,
  onBack,
  onSelectAuthor,
  onSelectPost,
  onOpenCreatePost,
}: FilteredFeedViewProps) {
  const { currentUser } = useAuth();
  const { isRTL } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const unsubPosts = listenToPosts((loaded) => {
      setPosts(loaded);
      setLoading(false);
    });
    return () => unsubPosts();
  }, []);

  useEffect(() => {
    if (mode !== 'saved' || !currentUser?.id) {
      setBookmarks([]);
      return;
    }
    const unsub = listenToUserBookmarks(currentUser.id, (items) => {
      setBookmarks(items);
    });
    return () => unsub();
  }, [mode, currentUser?.id]);

  const savedPostIds = new Set(bookmarks.map((b) => b.postId));
  const filteredPosts = posts.filter((p) => {
    if (mode === 'blogs') return p.postType === 'blog';
    if (mode === 'wiki') return p.postType === 'wiki';
    if (mode === 'reposts') return p.postType === 'repost' || Boolean(p.repostOf);
    if (mode === 'saved') return savedPostIds.has(p.id);
    return false;
  });

  const metaMap: Record<
    FilteredFeedMode,
    {
      title: string;
      subtitle: string;
      emptyTitle: string;
      emptyDesc: string;
      icon: React.ComponentType<{ className?: string }>;
      createMode?: CreatePostInitialMode;
      createLabel?: string;
    }
  > = {
    blogs: {
      title: 'المدونات',
      subtitle: 'مقالات وتدوينات منشورة من أعضاء منصة Q',
      emptyTitle: 'لا توجد مدونات منشورة بعد',
      emptyDesc: 'ابدأ بكتابة أول مدونة طويلة ومنسقة لمشاركتها مع المتابعين.',
      icon: FileText,
      createMode: 'blog',
      createLabel: 'كتابة مدونة جديدة',
    },
    wiki: {
      title: 'الويكي والمعرفة',
      subtitle: 'مقالات مرجعية وشروحات موثقة من مجتمع Q',
      emptyTitle: 'لا توجد صفحات ويكي بعد',
      emptyDesc: 'أضف أول صفحة معرفية أو دليل مرجعي ليستفيد منه الجميع.',
      icon: BookOpen,
      createMode: 'blog',
      createLabel: 'إضافة صفحة ويكي',
    },
    reposts: {
      title: 'إعادات النشر',
      subtitle: 'المنشورات المعاد نشرها والمقتبسة عبر الشبكة',
      emptyTitle: 'لا توجد إعادات نشر بعد',
      emptyDesc: 'عند إعادة نشر أي منشور من الصفحة الرئيسية سيظهر هنا تلقائياً.',
      icon: Repeat2,
    },
    saved: {
      title: 'المحفوظات',
      subtitle: 'المنشورات والمقالات التي قمت بحفظها للرجوع إليها',
      emptyTitle: 'قائمة المحفوظات فارغة',
      emptyDesc: 'اضغط على أيقونة الحفظ في أي منشور لإضافته إلى محفوظاتك.',
      icon: Bookmark,
    },
  };

  const info = metaMap[mode];
  const Icon = info.icon;

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 font-ar">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-[#2A2F3A] pb-3">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#161B26] cursor-pointer"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Icon className="w-5 h-5 text-[#3B6DFF]" />
              <span>{info.title}</span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">{info.subtitle}</p>
          </div>
        </div>

        {info.createMode && onOpenCreatePost && currentUser && (
          <button
            type="button"
            onClick={() => onOpenCreatePost(info.createMode)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
        </div>
      ) : filteredPosts.length > 0 ? (
        <div className="space-y-3.5">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onSelectAuthor={onSelectAuthor}
              onSelectPost={onSelectPost}
            />
          ))}
        </div>
      ) : (
        <div className="py-14 px-6 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#3B6DFF]/10 text-[#3B6DFF] flex items-center justify-center mx-auto">
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{info.emptyTitle}</h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-xs mx-auto leading-relaxed">
            {info.emptyDesc}
          </p>
          {info.createMode && onOpenCreatePost && currentUser && (
            <button
              type="button"
              onClick={() => onOpenCreatePost(info.createMode)}
              className="mt-2 min-h-[42px] px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{info.createLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
