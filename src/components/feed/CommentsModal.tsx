import React, { useState, useEffect } from 'react';
import { Send, Trash2, Loader2, MessageSquare } from 'lucide-react';
import { Post, Comment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { listenToComments, addComment, deleteComment } from '../../services/firestore';
import { Modal } from '../common/Modal';
import { formatRelativeTime } from '../../utils/date';
import { useToast } from '../../context/ToastContext';

interface CommentsModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentsModal({ post, isOpen, onClose }: CommentsModalProps) {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = listenToComments(post.id, (loadedComments) => {
      setComments(loadedComments);
    });
    return () => unsub();
  }, [post.id, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('Please sign in to join the discussion.', 'info');
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
        },
        commentText.trim(),
        post.authorId
      );
      setCommentText('');
      showToast('Comment published.', 'success');
    } catch (err) {
      console.error('Failed to post comment:', err);
      showToast('Failed to post comment.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(post.id, commentId);
      showToast('Comment removed.', 'info');
    } catch (err) {
      showToast('Failed to delete comment.', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Discussion" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Post Snippet */}
        <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-300">
          <span className="font-semibold text-white">{post.authorName}: </span>
          <span className="line-clamp-2">{post.content}</span>
        </div>

        {/* Comments List */}
        <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
          {comments.length > 0 ? (
            comments.map((comment) => {
              const canDelete = currentUser?.id === comment.authorId || isAdmin;
              return (
                <div
                  key={comment.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60"
                >
                  <div className="flex items-start gap-2.5">
                    <img
                      src={comment.authorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.authorName}`}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover border border-neutral-700 shrink-0 mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{comment.authorName}</span>
                        <span className="text-[10px] text-neutral-500 font-mono-subtle">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 mt-1 leading-relaxed break-words">
                        {comment.text}
                      </p>
                    </div>
                  </div>

                  {canDelete && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 text-neutral-500 hover:text-red-400 rounded transition-colors"
                      title="Delete Comment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center">
              <MessageSquare className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
              <p className="text-xs text-neutral-400">No comments yet.</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Start the conversation below.</p>
            </div>
          )}
        </div>

        {/* New Comment Input */}
        {currentUser ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t border-neutral-800">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a thoughtful reply..."
              maxLength={500}
              disabled={submitting}
              className="flex-1 bg-[#121212] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || submitting}
              className="p-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs disabled:opacity-50 transition-all active:scale-95"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          <div className="pt-2 text-center text-xs text-neutral-500">
            Sign in to leave a comment.
          </div>
        )}
      </div>
    </Modal>
  );
}
