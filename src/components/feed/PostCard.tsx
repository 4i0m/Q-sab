import React, { useState, useEffect } from 'react';
import {
  Heart,
  MessageCircle,
  Repeat,
  Bookmark,
  Share2,
  MoreHorizontal,
  Trash2,
  Edit3,
  Copy,
  Flag,
  Pin,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  togglePostLike,
  checkUserLiked,
  deletePost,
  submitReport,
  checkUserBookmarked,
  toggleBookmark,
  updatePostContent
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { VerifiedBadge, LevelBadge } from '../common/VerifiedBadge';
import { CommentsModal } from './CommentsModal';
import { formatRelativeTime } from '../../utils/date';

interface PostCardProps {
  post: Post;
  onSelectAuthor?: (authorId: string) => void;
}

export function PostCard({ post, onSelectAuthor }: PostCardProps) {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // Edit post state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Dropdown menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setShowMenu(false), showMenu);

  useEffect(() => {
    if (!currentUser?.id) {
      setIsLiked(false);
      setIsBookmarked(false);
      return;
    }
    checkUserLiked(post.id, currentUser.id).then((liked) => {
      setIsLiked(liked);
    }).catch(() => {});

    checkUserBookmarked(currentUser.id, post.id).then((bookmarked) => {
      setIsBookmarked(bookmarked);
    }).catch(() => {});
  }, [post.id, currentUser?.id]);

  useEffect(() => {
    setLikesCount(post.likesCount || 0);
  }, [post.likesCount]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول للإعجاب', 'info');
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
    } catch (err) {
      setIsLiked(previousState);
      setLikesCount(previousCount);
      showToast('تعذر تحديث الإعجاب.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لحفظ المنشورات في المفضلة', 'info');
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
      showToast(newStatus ? 'تم حفظ المنشور في المفضلة ✨' : 'تمت إزالة المنشور من المفضلة', 'info');
    } catch (err) {
      setIsBookmarked(prevBookmarked);
      showToast('تعذر تحديث حالة الحفظ', 'error');
    } finally {
      setIsBookmarkLoading(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `منشور ${post.authorName} على Q`,
          text: post.content,
          url: window.location.href,
        });
      } catch (err) {}
    } else {
      navigator.clipboard?.writeText(window.location.href);
      showToast('تم نسخ الرابط إلى الحافظة', 'success');
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
    } catch (err) {
      showToast('تعذر حفظ تعديل المنشور', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setShowMenu(false);
    if (!confirm('هل تريد بالتأكيد حذف هذا المنشور؟')) return;
    try {
      await deletePost(post.id, post.authorId);
      showToast('تم حذف المنشور.', 'info');
    } catch (err) {
      showToast('تعذر حذف المنشور.', 'error');
    }
  };

  const handleReport = async () => {
    setShowMenu(false);
    if (!currentUser) return;
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
    } catch (err) {
      showToast('تم تسجيل البلاغ.', 'info');
    }
  };

  return (
    <>
      <article className="w-full bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 shadow-xl transition-all hover:border-[#3B6DFF]/40">
        
        {/* Pinned Indicator */}
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-xs text-[#4F8CFF] font-tajawal mb-2 px-1">
            <Pin className="w-3.5 h-3.5 fill-[#4F8CFF] rotate-45" />
            <span>مثبت</span>
          </div>
        )}

        {/* Author Header matching Screen 2 */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div
            onClick={() => onSelectAuthor && onSelectAuthor(post.authorId)}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="relative w-10 h-10 rounded-full p-[1.5px] bg-gradient-to-tr from-[#3B6DFF] to-[#4F8CFF] overflow-hidden shrink-0 shadow-sm">
              <img
                src={post.authorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${post.authorName}`}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-white group-hover:text-[#4F8CFF] transition-colors font-tajawal">
                  {post.authorName}
                </span>
                {Boolean(post.authorIsVerified) && (
                  <VerifiedBadge category={post.authorVerificationCategory || 'blue'} />
                )}
                {Boolean(post.authorLevel && post.authorLevel > 0) && (
                  <LevelBadge level={post.authorLevel!} />
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] font-mono-subtle mt-0.5 flex-wrap">
                <span>@{post.authorHandle || 'user'}</span>
                <span>•</span>
                <span>{formatRelativeTime(post.createdAt)}</span>
                {post.community && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.2 rounded-full bg-[#3B6DFF]/15 border border-[#3B6DFF]/30 text-[#4F8CFF] text-[10px] font-tajawal">
                      {post.community}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-[#94A3B8] hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {showMenu && (
              <div className="absolute left-0 mt-1.5 w-44 bg-[#1E1E2E] border border-[#2A2F3A] rounded-xl shadow-2xl p-1 z-30 animate-slide-up">
                {isAuthor && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setIsEditing(true);
                      setEditContent(post.content);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#161B26] rounded-lg text-start cursor-pointer font-tajawal"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#4F8CFF]" />
                    <span>تعديل المنشور</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMenu(false);
                    navigator.clipboard?.writeText(window.location.origin);
                    showToast('تم نسخ الرابط', 'success');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:text-white hover:bg-[#161B26] rounded-lg text-start cursor-pointer font-tajawal"
                >
                  <Copy className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span>نسخ الرابط</span>
                </button>

                {canDelete && (
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 rounded-lg text-start cursor-pointer font-tajawal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف المنشور</span>
                  </button>
                )}

                {!isAuthor && (
                  <button
                    onClick={handleReport}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#94A3B8] hover:text-[#4F8CFF] hover:bg-[#161B26] rounded-lg text-start cursor-pointer font-tajawal"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>إبلاغ عن محتوى</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content or Edit Form */}
        {isEditing ? (
          <div className="space-y-2 mb-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="w-full bg-[#0B0F19] border border-[#3B6DFF]/60 rounded-xl p-3 text-sm text-white font-tajawal focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-white transition-colors cursor-pointer font-tajawal"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-1.5 rounded-lg bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>حفظ التعديل</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#F8FAFC] font-tajawal leading-relaxed mb-3 whitespace-pre-line text-start">
            {post.content}
          </p>
        )}

        {/* Media */}
        {post.mediaURL && (
          <div className="relative rounded-2xl overflow-hidden bg-black mb-3 border border-[#2A2F3A] aspect-[16/10]">
            <img
              src={post.mediaURL}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Bottom Interaction Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[#2A2F3A]/60 text-[#94A3B8]">
          <div className="flex items-center gap-5">
            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-xs font-mono-subtle transition-all active:scale-90 cursor-pointer ${
                isLiked ? 'text-red-400' : 'hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-400' : ''}`} />
              <span>{likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}K` : likesCount}</span>
            </button>

            {/* Comment */}
            <button
              onClick={() => setShowComments(true)}
              className="flex items-center gap-1.5 text-xs font-mono-subtle hover:text-[#4F8CFF] transition-colors active:scale-90 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post.commentsCount || 0}</span>
            </button>

            {/* Repost/Share */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs font-mono-subtle hover:text-[#4F8CFF] transition-colors active:scale-90 cursor-pointer"
            >
              <Repeat className="w-4 h-4" />
              <span>{post.sharesCount || 0}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Bookmark */}
            <button
              onClick={handleBookmark}
              disabled={isBookmarkLoading}
              className={`p-1 transition-colors cursor-pointer ${
                isBookmarked ? 'text-[#3B6DFF]' : 'hover:text-white'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-[#3B6DFF]' : ''}`} />
            </button>

            {/* Share link */}
            <button onClick={handleShare} className="p-1 hover:text-white transition-colors cursor-pointer">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </article>

      {/* Comments Thread */}
      {showComments && (
        <CommentsModal
          post={post}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </>
  );
}
