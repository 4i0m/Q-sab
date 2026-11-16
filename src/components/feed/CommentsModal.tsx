import React, { useState, useEffect } from 'react';
import { Send, Trash2, Loader2, MessageSquare, Lock } from 'lucide-react';
import { Post, Comment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { listenToComments, addComment, deleteComment, getUserProfile, checkIsFollowing } from '../../services/firestore';
import { Modal } from '../common/Modal';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from '../common/MediaImage';

interface CommentsModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onSelectAuthor?: (authorId: string) => void;
}

export function CommentsModal({ post, isOpen, onClose, onSelectAuthor }: CommentsModalProps) {
  const { currentUser, isAdmin } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [canComment, setCanComment] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = listenToComments(post.id, (loadedComments) => {
      setComments(loadedComments);
    });
    return () => unsub();
  }, [post.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!currentUser?.id || currentUser.id === post.authorId || isAdmin) {
      setCanComment(true);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const author = await getUserProfile(post.authorId);
        if (!mounted) return;
        const rule = author?.customization?.privacy?.allowComments || 'everyone';
        if (rule === 'followers_only') {
          const following = await checkIsFollowing(currentUser.id, post.authorId);
          if (mounted) setCanComment(following);
        } else {
          setCanComment(true);
        }
      } catch {
        if (mounted) setCanComment(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen, post.authorId, currentUser?.id, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast(language === 'en' ? 'Please sign in to join the discussion.' : 'يرجى تسجيل الدخول للمشاركة في النقاش.', 'info');
      return;
    }
    if (!canComment) {
      showToast(language === 'en' ? 'Only followers can comment on this post.' : 'قصر صاحب المنشور التعليقات على المتابعين فقط.', 'info');
      return;
    }
    if (!commentText.trim() || submitting) return;

    try {
      setSubmitting(true);
      await addComment(
        post.id,
        {
          id: currentUser.id,
          name: currentUser.displayName,
          handle: currentUser.handle,
          photoURL: currentUser.photoURL,
          isVerified: Boolean(currentUser.isVerified),
          verificationCategory: currentUser.verificationCategory || 'blue',
        },
        commentText.trim(),
        post.authorId
      );
      setCommentText('');
      showToast(language === 'en' ? 'Comment published.' : 'تم نشر التعليق.', 'success');
    } catch (err) {
      console.error('Failed to post comment:', err);
      showToast(language === 'en' ? 'Failed to post comment.' : 'تعذر نشر التعليق.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(post.id, commentId);
      showToast(language === 'en' ? 'Comment removed.' : 'تم حذف التعليق.', 'info');
    } catch (err) {
      showToast(language === 'en' ? 'Failed to delete comment.' : 'تعذر حذف التعليق.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'en' ? 'Discussion' : 'التعليقات والنقاش'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 font-tajawal">
        {/* Post Snippet */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-xs text-slate-700 dark:text-slate-300">
          <span className="font-bold text-slate-900 dark:text-white">{post.authorName}: </span>
          <span className="line-clamp-2">{post.content}</span>
        </div>

        {/* Comments List */}
        <div className="max-h-80 overflow-y-auto space-y-3 pe-1">
          {comments.length > 0 ? (
            comments.map((comment) => {
              const canDelete = currentUser?.id === comment.authorId || isAdmin;
              return (
                <div
                  key={comment.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#0B0F19]/60 border border-slate-200 dark:border-[#2A2F3A]"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectAuthor) {
                          onClose();
                          onSelectAuthor(comment.authorId);
                        }
                      }}
                      className="shrink-0 mt-0.5 cursor-pointer"
                    >
                      <MediaImage
                        src={comment.authorPhotoURL}
                        alt={comment.authorName}
                        variant="avatar"
                        fallbackText={comment.authorName}
                        containerClassName="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-[#2A2F3A]"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectAuthor) {
                              onClose();
                              onSelectAuthor(comment.authorId);
                            }
                          }}
                          className="text-xs font-bold text-slate-900 dark:text-white hover:text-[#3B6DFF] transition-colors cursor-pointer"
                        >
                          {comment.authorName}
                        </button>
                        {Boolean(comment.authorIsVerified) && (
                          <VerifiedBadge
                            category={comment.authorVerificationCategory || 'blue'}
                            className="w-3.5 h-3.5"
                          />
                        )}
                        <span className="text-[10px] text-slate-500 font-mono-subtle">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed break-words">
                        {comment.text}
                      </p>
                    </div>
                  </div>

                  {canDelete && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer shrink-0"
                      title={language === 'en' ? 'Delete Comment' : 'حذف التعليق'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center">
              <MessageSquare className="w-6 h-6 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {language === 'en' ? 'No comments yet.' : 'لا توجد تعليقات حتى الآن.'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'en' ? 'Start the conversation below.' : 'كن أول من يبدأ النقاش.'}
              </p>
            </div>
          )}
        </div>

        {/* New Comment Input */}
        {currentUser ? (
          canComment ? (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#2A2F3A]">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={language === 'en' ? 'Write a thoughtful reply...' : 'اكتب تعليقاً أو رداً...'}
                maxLength={500}
                disabled={submitting}
                className="flex-1 bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submitting}
                className="p-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-semibold text-xs disabled:opacity-50 transition-all active:scale-95 cursor-pointer"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <div className="pt-2 border-t border-slate-200 dark:border-[#2A2F3A] flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5" />
              <span>
                {language === 'en'
                  ? 'Only followers can comment on this author’s posts.'
                  : 'التعليقات متاحة لمتابعي صاحب المنشور فقط.'}
              </span>
            </div>
          )
        ) : (
          <div className="pt-2 text-center text-xs text-slate-500">
            {language === 'en' ? 'Sign in to leave a comment.' : 'سجل الدخول لإضافة تعليق.'}
          </div>
        )}
      </div>
    </Modal>
  );
}
