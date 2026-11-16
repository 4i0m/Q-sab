import React, { useState, useEffect } from 'react';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  MoreHorizontal,
  Trash2,
  Edit3,
  Copy,
  Flag,
  Pin,
  Check,
  AlertTriangle,
  Loader2,
  BarChart3,
  Award,
  BookOpen,
  FileText,
  HelpCircle,
  X,
  Users
} from 'lucide-react';
import { Post, getSortedUserTitles } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  togglePostLike,
  checkUserLiked,
  deletePost,
  submitReport,
  checkUserBookmarked,
  toggleBookmark,
  updatePostContent,
  incrementPostShare,
  togglePostPinned,
  repostPost,
  getPostById
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { VerifiedBadge, LevelBadge, CustomTitleBadge } from '../common/VerifiedBadge';
import { CommentsModal } from './CommentsModal';
import { formatRelativeTime } from '../../utils/date';
import { stripMarkdownForPreview, estimateReadingMinutes } from '../common/RichBlogContent';
import { MediaImage } from '../common/MediaImage';

interface PostCardProps {
  post: Post;
  onSelectAuthor?: (authorId: string) => void;
  onSelectPost?: (post: Post) => void;
}

export function PostCard({ post, onSelectAuthor, onSelectPost }: PostCardProps) {
  const { currentUser, isAdmin, refreshProfile } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [expandedText, setExpandedText] = useState(false);

  // Repost / Quote modal
  const [showRepostModal, setShowRepostModal] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [isReposting, setIsReposting] = useState(false);

  // Edit post state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dropdown menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setShowMenu(false), showMenu);

  useEffect(() => {
    if (!currentUser?.id) {
      setIsLiked(false);
      setIsBookmarked(false);
      return;
    }
    checkUserLiked(post.id, currentUser.id).then(setIsLiked).catch(() => {});
    checkUserBookmarked(currentUser.id, post.id).then(setIsBookmarked).catch(() => {});
  }, [post.id, currentUser?.id]);

  useEffect(() => {
    setLikesCount(post.likesCount || 0);
    setRepostsCount(post.repostsCount || 0);
  }, [post.likesCount, post.repostsCount]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast(language === 'en' ? 'Please sign in to like posts.' : 'يرجى تسجيل الدخول للإعجاب', 'info');
      return;
    }
    if (isLiking) return;

    const previousState = isLiked;
    const previousCount = likesCount;
    setIsLiked(!previousState);
    setLikesCount(previousState ? Math.max(0, previousCount - 1) : previousCount + 1);

    try {
      setIsLiking(true);
      const newStatus = await togglePostLike(
        post.id,
        currentUser.id,
        { displayName: currentUser.displayName, photoURL: currentUser.photoURL },
        post.authorId
      );
      setIsLiked(newStatus);
    } catch {
      setIsLiked(previousState);
      setLikesCount(previousCount);
      showToast('تعذر تحديث الإعجاب.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleExecuteRepost = async (withQuote: boolean) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لإعادة النشر', 'info');
      return;
    }
    if (isReposting) return;
    try {
      setIsReposting(true);
      const targetPost = post.repostOf
        ? ((await getPostById(post.repostOf.id)) || post)
        : post;
      await repostPost(targetPost, currentUser, withQuote ? quoteText : '');
      setRepostsCount((c) => c + 1);
      setShowRepostModal(false);
      setQuoteText('');
      showToast(withQuote ? 'تم نشر الاقتباس بنجاح!' : 'تمت إعادة النشر بنجاح!', 'success');
    } catch {
      showToast('تعذر إعادة النشر حالياً.', 'error');
    } finally {
      setIsReposting(false);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast(language === 'en' ? 'Sign in to save posts.' : 'يرجى تسجيل الدخول لحفظ المنشورات', 'info');
      return;
    }
    if (isBookmarkLoading) return;

    const prevBookmarked = isBookmarked;
    setIsBookmarked(!prevBookmarked);

    try {
      setIsBookmarkLoading(true);
      const newStatus = await toggleBookmark(currentUser.id, post.id, {
        content: post.content,
        authorName: post.authorName,
        authorHandle: post.authorHandle,
        mediaURL: post.mediaURL,
      });
      setIsBookmarked(newStatus);
      showToast(newStatus ? 'تم حفظ المنشور في المحفوظات' : 'تمت إزالة المنشور من المحفوظات', 'info');
    } catch {
      setIsBookmarked(prevBookmarked);
      showToast('تعذر تحديث حالة الحفظ', 'error');
    } finally {
      setIsBookmarkLoading(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${post.authorName} · Q`,
          text: post.content || post.title || '',
          url: window.location.href,
        });
        shared = true;
      } catch {}
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('تم نسخ رابط المنشور', 'success');
        shared = true;
      } catch {}
    }
    if (shared && currentUser) {
      void incrementPostShare(post.id).catch(() => {});
    }
  };

  const handleTogglePin = async () => {
    setShowMenu(false);
    if (!currentUser || !isAuthor) return;
    try {
      const nextPinned = !post.isPinned;
      await togglePostPinned(post.id, currentUser.id, nextPinned);
      await refreshProfile();
      showToast(nextPinned ? 'تم تثبيت المنشور في ملفك الشخصي' : 'تم إلغاء تثبيت المنشور', 'success');
    } catch {
      showToast('تعذر تحديث حالة التثبيت', 'error');
    }
  };

  const isAuthor = currentUser?.id === post.authorId;
  const canDelete = isAuthor || isAdmin;

  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      showToast('لا يمكن ترك المنشور فارغاً', 'error');
      return;
    }
    try {
      setIsSavingEdit(true);
      await updatePostContent(post.id, editContent.trim());
      post.content = editContent.trim();
      setIsEditing(false);
      showToast('تم تحديث المنشور بنجاح', 'success');
    } catch {
      showToast('تعذر حفظ تعديل المنشور', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDeletePost = async () => {
    try {
      setIsDeleting(true);
      await deletePost(post.id, post.authorId);
      setShowDeleteConfirm(false);
      showToast('تم حذف المنشور.', 'info');
    } catch {
      showToast('تعذر حذف المنشور.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReport = async () => {
    setShowMenu(false);
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول للإبلاغ', 'info');
      return;
    }
    try {
      await submitReport({
        reporterId: currentUser.id,
        reporterName: currentUser.displayName,
        targetType: 'post',
        targetId: post.id,
        targetContentSnippet: post.content.slice(0, 100),
        reason: 'محتوى مخالف لشروط المجتمع',
      });
      showToast('تم إرسال البلاغ لفريق الإشراف للمراجعة.', 'info');
    } catch {
      showToast('تعذر إرسال البلاغ.', 'error');
    }
  };

  const rawBodyText =
    post.postType === 'blog' || post.postType === 'wiki'
      ? stripMarkdownForPreview(post.content)
      : post.content;
  const isLongBody = Boolean(rawBodyText && (rawBodyText.length > 320 || rawBodyText.split('\n').length > 6));

  return (
    <>
      <article className="w-full bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-[#232A37] rounded-2xl p-4 sm:p-[18px] transition-colors hover:border-[#3B6DFF]/35 font-ar">
        {/* Pinned or Repost Context Banner */}
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#3B6DFF] dark:text-[#60A5FA] mb-2">
            <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
            <span>منشور مثبت</span>
          </div>
        )}

        {post.postType === 'repost' && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-2">
            <Repeat2 className="w-3.5 h-3.5" />
            <span>أعاد {post.authorName} النشر</span>
          </div>
        )}

        {/* Author Header */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div
            onClick={() => onSelectAuthor && onSelectAuthor(post.authorId)}
            className="flex items-center gap-2.5 cursor-pointer group min-w-0"
          >
            <MediaImage
              src={post.authorPhotoURL}
              alt={post.authorName}
              variant="avatar"
              fallbackText={post.authorName}
              containerClassName="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-[#2A3242] shrink-0"
              className="w-full h-full rounded-full object-cover"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-display-en text-[15px] font-bold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] dark:group-hover:text-[#60A5FA] transition-colors truncate">
                  {post.authorName}
                </span>
                {Boolean(post.authorIsVerified) && (
                  <VerifiedBadge category={post.authorVerificationCategory || 'blue'} className="w-4 h-4" />
                )}
                {getSortedUserTitles({
                  customTitle: post.authorCustomTitle,
                  customTitles: post.authorCustomTitles,
                })
                  .slice(0, 3)
                  .map((titleItem, tIdx) => (
                    <CustomTitleBadge key={titleItem.id || `${titleItem.text}_${tIdx}`} title={titleItem} compact />
                  ))}
                {Boolean(post.authorLevel && post.authorLevel > 0) && (
                  <LevelBadge level={post.authorLevel!} />
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8E9BAB] mt-0.5 flex-wrap">
                <span className="font-handle">@{post.authorHandle || 'user'}</span>
                <span>·</span>
                <span className="tabular-nums">{formatRelativeTime(post.createdAt)}</span>
                {post.visibility === 'followers_only' && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      <Users className="w-3 h-3" />
                      <span>للمتابعين</span>
                    </span>
                  </>
                )}
                {(post.postType === 'blog' || post.postType === 'wiki') && post.content && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {estimateReadingMinutes(post.content)} د قراءة
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Menu */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B2232] rounded-full transition-colors cursor-pointer"
              aria-label="خيارات المنشور"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute end-0 mt-1 w-44 bg-white dark:bg-[#1B2232] border border-slate-200 dark:border-[#2A3242] rounded-xl shadow-2xl p-1 z-30 animate-slide-up">
                {isAuthor && (
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setIsEditing(true);
                        setEditContent(post.content);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#111622] rounded-lg text-start cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#3B6DFF]" />
                      <span>تعديل المنشور</span>
                    </button>

                    <button
                      onClick={handleTogglePin}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#111622] rounded-lg text-start cursor-pointer"
                    >
                      <Pin className="w-3.5 h-3.5 text-[#3B6DFF]" />
                      <span>{post.isPinned ? 'إلغاء التثبيت' : 'تثبيت في الملف'}</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setShowMenu(false);
                    navigator.clipboard?.writeText(window.location.href);
                    showToast('تم نسخ الرابط', 'success');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#111622] rounded-lg text-start cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>نسخ الرابط</span>
                </button>

                {canDelete && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-start cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف المنشور</span>
                  </button>
                )}

                {!isAuthor && (
                  <button
                    onClick={handleReport}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-[#94A3B8] hover:text-[#3B6DFF] hover:bg-slate-100 dark:hover:bg-[#111622] rounded-lg text-start cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>إبلاغ عن محتوى</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body Content or Edit Form */}
        {isEditing ? (
          <div className="space-y-2 mb-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-[#3B6DFF]/60 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-1.5 rounded-lg bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>حفظ التعديل</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => onSelectPost?.(post)}
            className={onSelectPost ? 'cursor-pointer' : ''}
          >
            {post.postType && post.postType !== 'post' && post.postType !== 'repost' && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded-md bg-[#3B6DFF]/10 border border-[#3B6DFF]/25 text-[#3B6DFF] dark:text-[#60A5FA] text-[11px] font-bold">
                {post.postType === 'blog' && <FileText className="w-3 h-3" />}
                {post.postType === 'wiki' && <BookOpen className="w-3 h-3" />}
                {post.postType === 'question' && <HelpCircle className="w-3 h-3" />}
                {post.postType === 'poll' && <BarChart3 className="w-3 h-3" />}
                {post.postType === 'quiz' && <Award className="w-3 h-3" />}
                <span>
                  {post.postType === 'blog'
                    ? 'مدونة'
                    : post.postType === 'wiki'
                    ? 'ويكي'
                    : post.postType === 'question'
                    ? 'سؤال'
                    : post.postType === 'poll'
                    ? 'استطلاع'
                    : 'اختبار'}
                </span>
              </div>
            )}

            {post.title && (
              <h3 className="text-[16px] font-extrabold text-slate-900 dark:text-white mb-1.5 text-start leading-snug">
                {post.title}
              </h3>
            )}

            {rawBodyText && (
              <div className="mb-3">
                <p
                  className={`text-[14px] sm:text-[15px] text-slate-800 dark:text-[#F1F5F9] leading-[1.7] whitespace-pre-line break-words text-start ${
                    !expandedText && isLongBody ? 'line-clamp-6' : ''
                  }`}
                >
                  {rawBodyText}
                </p>
                {isLongBody && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedText((v) => !v);
                    }}
                    className="mt-1 text-xs font-bold text-[#3B6DFF] hover:underline cursor-pointer"
                  >
                    {expandedText ? 'إظهار أقل' : 'قراءة المزيد...'}
                  </button>
                )}
              </div>
            )}

            {/* Embedded Repost / Quote Original Card */}
            {post.repostOf && (
              <div
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!onSelectPost) return;
                  const orig = await getPostById(post.repostOf!.id).catch(() => null);
                  if (orig) onSelectPost(orig);
                }}
                className="mb-3 p-3.5 rounded-2xl bg-slate-50/90 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] hover:border-[#3B6DFF]/40 transition-colors cursor-pointer space-y-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MediaImage
                    src={post.repostOf.authorPhotoURL}
                    alt={post.repostOf.authorName}
                    variant="avatar"
                    fallbackText={post.repostOf.authorName}
                    containerClassName="w-6 h-6 rounded-full overflow-hidden shrink-0"
                    className="w-full h-full object-cover"
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {post.repostOf.authorName}
                  </span>
                  {post.repostOf.authorIsVerified && (
                    <VerifiedBadge
                      category={post.repostOf.authorVerificationCategory || 'blue'}
                      className="w-3.5 h-3.5"
                      interactive={false}
                    />
                  )}
                  <span className="font-handle text-[11px] text-slate-400 truncate">
                    @{post.repostOf.authorHandle}
                  </span>
                </div>
                {post.repostOf.title && (
                  <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {post.repostOf.title}
                  </p>
                )}
                {post.repostOf.content && (
                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-4 whitespace-pre-line">
                    {post.repostOf.content}
                  </p>
                )}
                {(post.repostOf.mediaURLs?.[0] || post.repostOf.mediaURL) && (
                  <div className="rounded-xl overflow-hidden aspect-[16/9] border border-slate-200 dark:border-[#242B38]">
                    <MediaImage
                      src={post.repostOf.mediaURLs?.[0] || post.repostOf.mediaURL}
                      alt=""
                      variant="post"
                      containerClassName="w-full h-full overflow-hidden"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            )}

            {post.poll && (
              <div className="mb-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-1.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>{post.poll.question}</span>
                  <span className="text-[11px] text-[#3B6DFF] tabular-nums">{post.poll.totalVotes || 0} صوت</span>
                </div>
                {post.poll.options.slice(0, 3).map((opt) => (
                  <div
                    key={opt.id}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#161B26] border border-slate-200/70 dark:border-[#2A2F3A] text-xs text-slate-700 dark:text-slate-200"
                  >
                    {opt.text}
                  </div>
                ))}
                <span className="block text-[11px] text-[#3B6DFF] font-bold pt-0.5">
                  اضغط للمشاركة في التصويت →
                </span>
              </div>
            )}

            {post.quiz && (
              <div className="mb-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{post.quiz.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                    {post.quiz.questions.length} أسئلة · {post.quiz.attemptsCount || 0} محاولة
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-[#3B6DFF] text-white text-[11px] font-bold">
                  ابدأ الاختبار
                </span>
              </div>
            )}
          </div>
        )}

        {/* Media (Video or 1-4 Image Gallery) */}
        {(() => {
          const gallery =
            post.mediaURLs && post.mediaURLs.length > 0
              ? post.mediaURLs
              : post.mediaURL
              ? [post.mediaURL]
              : [];
          const isVideo =
            Boolean(post.videoURL) ||
            (post.mediaURL && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.mediaURL));

          if (isVideo) {
            return (
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 mb-3 border border-slate-200 dark:border-[#242B38] aspect-[16/10]">
                <video
                  src={post.videoURL || post.mediaURL}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover bg-black"
                />
              </div>
            );
          }

          if (gallery.length === 1) {
            return (
              <div
                onClick={() => onSelectPost?.(post)}
                className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#141A26] mb-3 border border-slate-200 dark:border-[#242B38] aspect-[16/10] cursor-pointer"
              >
                <MediaImage
                  src={gallery[0]}
                  alt=""
                  variant="post"
                  containerClassName="w-full h-full overflow-hidden"
                  className="w-full h-full object-cover"
                />
              </div>
            );
          }

          if (gallery.length > 1) {
            return (
              <div
                onClick={() => onSelectPost?.(post)}
                className="grid grid-cols-2 gap-1.5 rounded-2xl overflow-hidden mb-3 cursor-pointer"
              >
                {gallery.slice(0, 4).map((url, idx) => (
                  <div
                    key={idx}
                    className={`bg-slate-100 dark:bg-[#141A26] overflow-hidden ${
                      gallery.length === 3 && idx === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'
                    }`}
                  >
                    <MediaImage
                      src={url}
                      alt=""
                      variant="post"
                      containerClassName="w-full h-full overflow-hidden"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            );
          }

          return null;
        })()}

        {/* Bottom Interaction Bar (Strictly Real Counts) */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-[#232A37]/70 text-slate-500 dark:text-[#8E9BAB]">
          <div className="flex items-center gap-4 sm:gap-6 tabular-nums">
            <button
              onClick={handleLike}
              className={`min-h-[36px] flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-90 cursor-pointer ${
                isLiked ? 'text-rose-500' : 'hover:text-rose-500'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              <span>{likesCount}</span>
            </button>

            <button
              onClick={() => {
                if (onSelectPost) onSelectPost(post);
                else setShowComments(true);
              }}
              className="min-h-[36px] flex items-center gap-1.5 text-xs font-semibold hover:text-[#3B6DFF] transition-colors active:scale-90 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post.commentsCount || 0}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!currentUser) {
                  showToast('يرجى تسجيل الدخول لإعادة النشر', 'info');
                  return;
                }
                setShowRepostModal(true);
              }}
              className="min-h-[36px] flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-500 transition-colors active:scale-90 cursor-pointer"
              title="إعادة نشر أو اقتباس"
            >
              <Repeat2 className="w-4 h-4" />
              <span>{repostsCount}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBookmark}
              disabled={isBookmarkLoading}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isBookmarked ? 'text-[#3B6DFF]' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="حفظ"
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-[#3B6DFF]' : ''}`} />
            </button>

            <button
              onClick={handleShare}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="مشاركة"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </article>

      {/* Repost / Quote Modal */}
      {showRepostModal && (
        <div
          onClick={() => setShowRepostModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                إعادة نشر المنشور
              </h3>
              <button
                type="button"
                onClick={() => setShowRepostModal(false)}
                className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={isReposting}
              onClick={() => handleExecuteRepost(false)}
              className="w-full min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Repeat2 className="w-4 h-4" />
              <span>إعادة نشر فورية</span>
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#2A2F3A]">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                أو إضافة تعليق (اقتباس):
              </label>
              <textarea
                rows={3}
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                placeholder="أضف تعليقك مع هذا المنشور..."
                className="w-full rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
              />
              <button
                type="button"
                disabled={isReposting || !quoteText.trim()}
                onClick={() => handleExecuteRepost(true)}
                className="w-full min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                نشر مع الاقتباس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Post Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">
                {language === 'en' ? 'Delete Post' : 'تأكيد حذف المنشور'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#CBD5E1] leading-relaxed">
              {language === 'en'
                ? 'Are you sure you want to permanently delete this post?'
                : 'هل تريد بالتأكيد حذف هذا المنشور نهائياً؟ لا يمكن التراجع عن هذا الإجراء.'}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-800 dark:text-white text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                {language === 'en' ? 'Cancel' : 'إلغاء'}
              </button>
              <button
                type="button"
                onClick={confirmDeletePost}
                disabled={isDeleting}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{language === 'en' ? 'Delete' : 'حذف'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments Thread */}
      {showComments && (
        <CommentsModal
          post={post}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          onSelectAuthor={onSelectAuthor}
        />
      )}
    </>
  );
}
