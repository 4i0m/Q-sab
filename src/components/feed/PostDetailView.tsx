import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  Pin,
  Trash2,
  CheckCircle2,
  Send,
  Loader2,
  Award,
  BarChart3,
  BookOpen,
  FileText,
  HelpCircle,
  CornerDownLeft,
  X,
  Edit3,
  Users
} from 'lucide-react';
import { Post, Comment, getSortedUserTitles } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToPost,
  listenToComments,
  addComment,
  deleteComment,
  togglePostLike,
  checkUserLiked,
  toggleBookmark,
  checkUserBookmarked,
  incrementPostShare,
  togglePostPinned,
  deletePost,
  voteOnGlobalPoll,
  getUserGlobalPollVote,
  submitGlobalQuizAttempt,
  toggleBestAnswerComment,
  repostPost,
  updateWikiPost
} from '../../services/firestore';
import { VerifiedBadge, LevelBadge, CustomTitleBadge, RoleBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';
import { RichBlogContent, RichBlogEditor, estimateReadingMinutes } from '../common/RichBlogContent';
import { MediaImage } from '../common/MediaImage';

interface PostDetailViewProps {
  post: Post;
  onBack: () => void;
  onSelectAuthor: (authorId: string) => void;
}

export function PostDetailView({ post: initialPost, onBack, onSelectAuthor }: PostDetailViewProps) {
  const { currentUser, isAdmin, refreshProfile } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [post, setPost] = useState<Post>(initialPost);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sendingComment, setSendingComment] = useState(false);

  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showRepostModal, setShowRepostModal] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [isReposting, setIsReposting] = useState(false);

  // Poll state
  const [myPollChoices, setMyPollChoices] = useState<string[]>([]);
  const [votingPoll, setVotingPoll] = useState(false);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmittedResult, setQuizSubmittedResult] = useState<{ score: number; total: number } | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  // Wiki Edit state
  const [showWikiEditModal, setShowWikiEditModal] = useState(false);
  const [wikiEditTitle, setWikiEditTitle] = useState(initialPost.title || '');
  const [wikiEditContent, setWikiEditContent] = useState(initialPost.content || '');
  const [wikiEditTags, setWikiEditTags] = useState((initialPost.tags || []).join(' '));
  const [savingWikiEdit, setSavingWikiEdit] = useState(false);

  useEffect(() => {
    const unsubPost = listenToPost(initialPost.id, (live) => {
      if (live) setPost(live);
    });
    const unsubComments = listenToComments(initialPost.id, (list) => {
      setComments(list);
      setLoadingComments(false);
    });
    return () => {
      unsubPost();
      unsubComments();
    };
  }, [initialPost.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    checkUserLiked(initialPost.id, currentUser.id).then(setIsLiked).catch(() => {});
    checkUserBookmarked(currentUser.id, initialPost.id).then(setIsBookmarked).catch(() => {});
    if (initialPost.poll) {
      getUserGlobalPollVote(initialPost.id, currentUser.id).then(setMyPollChoices).catch(() => {});
    }
  }, [initialPost.id, currentUser?.id]);

  const gallery =
    post.mediaURLs && post.mediaURLs.length > 0
      ? post.mediaURLs
      : post.mediaURL
      ? [post.mediaURL]
      : [];

  const isAuthor = currentUser?.id === post.authorId;
  const canDeletePost = isAuthor || isAdmin;
  const canEditWiki =
    post.postType === 'wiki' &&
    Boolean(currentUser && (isAuthor || isAdmin || currentUser.globalPermissions?.manageWiki));

  const openWikiEditModal = () => {
    setWikiEditTitle(post.title || '');
    setWikiEditContent(post.content || '');
    setWikiEditTags((post.tags || []).join(' '));
    setShowWikiEditModal(true);
  };

  const handleSaveWikiEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canEditWiki) return;
    if (!wikiEditTitle.trim() || !wikiEditContent.trim()) {
      showToast('يرجى كتابة عنوان ومحتوى صفحة الويكي.', 'error');
      return;
    }
    try {
      setSavingWikiEdit(true);
      const parsedTags = Array.from(
        new Set(
          wikiEditTags
            .split(/[\s,،]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => (t.startsWith('#') ? t : `#${t}`))
        )
      );
      await updateWikiPost(
        post.id,
        {
          title: wikiEditTitle.trim(),
          content: wikiEditContent.trim(),
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        },
        currentUser
      );
      setShowWikiEditModal(false);
      showToast('تم تحديث صفحة الويكي وتوثيق التعديل بنجاح.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر حفظ تعديل الويكي.', 'error');
    } finally {
      setSavingWikiEdit(false);
    }
  };

  const handleToggleLike = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول للإعجاب', 'info');
      return;
    }
    const prev = isLiked;
    setIsLiked(!prev);
    try {
      const next = await togglePostLike(
        post.id,
        currentUser.id,
        { displayName: currentUser.displayName, photoURL: currentUser.photoURL },
        post.authorId
      );
      setIsLiked(next);
    } catch {
      setIsLiked(prev);
    }
  };

  const handleExecuteRepost = async (withQuote: boolean) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لإعادة النشر', 'info');
      return;
    }
    try {
      setIsReposting(true);
      await repostPost(post, currentUser, withQuote ? quoteText : '');
      setShowRepostModal(false);
      setQuoteText('');
      showToast(withQuote ? 'تم نشر الاقتباس بنجاح!' : 'تمت إعادة النشر بنجاح!', 'success');
    } catch {
      showToast('تعذر إعادة النشر.', 'error');
    } finally {
      setIsReposting(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لحفظ المنشور', 'info');
      return;
    }
    const prev = isBookmarked;
    setIsBookmarked(!prev);
    try {
      const next = await toggleBookmark(currentUser.id, post.id, {
        content: post.content,
        authorName: post.authorName,
        authorHandle: post.authorHandle,
        mediaURL: gallery[0],
      });
      setIsBookmarked(next);
      showToast(next ? 'تم الحفظ في المحفوظات' : 'تمت الإزالة من المحفوظات', 'info');
    } catch {
      setIsBookmarked(prev);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title || post.authorName,
          text: post.content,
          url: window.location.href,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        showToast('تم نسخ رابط المنشور', 'success');
      }
      if (currentUser) void incrementPostShare(post.id).catch(() => {});
    } catch {}
  };

  const handleDeletePost = async () => {
    if (!canDeletePost) return;
    try {
      await deletePost(post.id, post.authorId);
      showToast('تم حذف المنشور.', 'info');
      onBack();
    } catch {
      showToast('تعذر حذف المنشور.', 'error');
    }
  };

  const handleVotePoll = async (optionId: string) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول للتصويت.', 'info');
      return;
    }
    if (!post.poll || votingPoll) return;

    const nextChoices = post.poll.allowMultiple
      ? myPollChoices.includes(optionId)
        ? myPollChoices.filter((id) => id !== optionId)
        : [...myPollChoices, optionId]
      : [optionId];

    setMyPollChoices(nextChoices);
    try {
      setVotingPoll(true);
      await voteOnGlobalPoll(post.id, currentUser.id, nextChoices);
      showToast('تم تسجيل صوتك!', 'success');
    } catch {
      showToast('تعذر تسجيل التصويت.', 'error');
    } finally {
      setVotingPoll(false);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!post.quiz) return;
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لإرسال الإجابات.', 'info');
      return;
    }
    let score = 0;
    post.quiz.questions.forEach((q) => {
      if (quizAnswers[q.id] === q.correctIndex) score += 1;
    });
    const total = post.quiz.questions.length;
    try {
      setSubmittingQuiz(true);
      await submitGlobalQuizAttempt(post.id, currentUser.id, score, total);
      setQuizSubmittedResult({ score, total });
      showToast(`نتيجتك: ${score} من ${total}`, 'success');
    } catch {
      showToast('تعذر حفظ نتيجة الاختبار.', 'error');
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لإضافة تعليق', 'info');
      return;
    }
    if (!commentText.trim() || sendingComment) return;

    try {
      setSendingComment(true);
      await addComment(
        post.id,
        {
          id: currentUser.id,
          name: currentUser.displayName,
          handle: currentUser.handle,
          photoURL: currentUser.photoURL,
          isVerified: currentUser.isVerified,
          verificationCategory: currentUser.verificationCategory,
        },
        commentText.trim(),
        post.authorId,
        replyingTo
          ? {
              parentCommentId: replyingTo.parentCommentId || replyingTo.id,
              replyToAuthorName: replyingTo.authorName,
            }
          : undefined
      );
      setCommentText('');
      setReplyingTo(null);
    } catch {
      showToast('تعذر إرسال التعليق.', 'error');
    } finally {
      setSendingComment(false);
    }
  };

  const rootComments = comments.filter((c) => !c.parentCommentId);
  const repliesByParent: Record<string, Comment[]> = {};
  comments.forEach((c) => {
    if (c.parentCommentId) {
      if (!repliesByParent[c.parentCommentId]) repliesByParent[c.parentCommentId] = [];
      repliesByParent[c.parentCommentId].push(c);
    }
  });

  const typeBadge =
    post.postType === 'blog'
      ? { label: 'مدونة', icon: <FileText className="w-3.5 h-3.5" /> }
      : post.postType === 'wiki'
      ? { label: 'ويكي', icon: <BookOpen className="w-3.5 h-3.5" /> }
      : post.postType === 'question'
      ? { label: 'سؤال', icon: <HelpCircle className="w-3.5 h-3.5" /> }
      : post.postType === 'poll'
      ? { label: 'استطلاع', icon: <BarChart3 className="w-3.5 h-3.5" /> }
      : post.postType === 'quiz'
      ? { label: 'اختبار', icon: <Award className="w-3.5 h-3.5" /> }
      : null;

  const isArticle = post.postType === 'blog' || post.postType === 'wiki';

  return (
    <div className={`w-full ${isArticle ? 'max-w-2xl' : 'max-w-xl'} mx-auto pb-28 font-ar`}>
      {/* Top Sticky Detail Header */}
      <div className="sticky top-14 z-20 -mx-2 px-3 py-2.5 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#242B38] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-[#161B26] text-slate-800 dark:text-white cursor-pointer"
            aria-label="رجوع"
          >
            <ArrowRight className={`w-5 h-5 ${!isRTL ? 'rotate-180' : ''}`} />
          </button>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">تفاصيل المنشور</h2>
        </div>

        <div className="flex items-center gap-1">
          {canEditWiki && (
            <button
              type="button"
              onClick={openWikiEditModal}
              className="min-h-[38px] px-3 rounded-xl bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/20 text-[#3B6DFF] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="تعديل صفحة الويكي"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>تعديل الويكي</span>
            </button>
          )}
          {isAuthor && (
            <button
              type="button"
              onClick={async () => {
                if (!currentUser) return;
                await togglePostPinned(post.id, currentUser.id, !post.isPinned);
                await refreshProfile();
                showToast(post.isPinned ? 'تم إلغاء التثبيت' : 'تم تثبيت المنشور', 'info');
              }}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full cursor-pointer ${
                post.isPinned ? 'text-[#3B6DFF]' : 'text-slate-500 dark:text-[#94A3B8]'
              }`}
              title="تثبيت"
            >
              <Pin className="w-4 h-4" />
            </button>
          )}
          {canDeletePost && (
            <button
              type="button"
              onClick={handleDeletePost}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 cursor-pointer"
              title="حذف المنشور"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Post Body */}
      <article className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl p-4 sm:p-5 mt-3 space-y-4 shadow-sm">
        {/* Author */}
        <div
          onClick={() => onSelectAuthor(post.authorId)}
          className="flex items-center gap-3 cursor-pointer"
        >
          <MediaImage
            src={post.authorPhotoURL}
            alt={post.authorName}
            variant="avatar"
            fallbackText={post.authorName}
            containerClassName="w-11 h-11 rounded-full overflow-hidden border border-slate-200 dark:border-[#2A3242] shrink-0"
            className="w-full h-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display-en text-[15px] font-bold text-slate-900 dark:text-white truncate">
                {post.authorName}
              </span>
              {Boolean(post.authorIsVerified) && (
                <VerifiedBadge category={post.authorVerificationCategory || 'blue'} />
              )}
              {post.authorRole && post.authorRole !== 'user' && (
                <RoleBadge role={post.authorRole} />
              )}
              {getSortedUserTitles({
                customTitle: post.authorCustomTitle,
                customTitles: post.authorCustomTitles,
              }).map((titleItem, tIdx) => (
                <CustomTitleBadge key={titleItem.id || `${titleItem.text}_${tIdx}`} title={titleItem} compact />
              ))}
              {Boolean(post.authorLevel && post.authorLevel > 0) && (
                <LevelBadge level={post.authorLevel!} />
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-[#8E9BAB] flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="font-handle">@{post.authorHandle}</span>
              <span>·</span>
              <span className="tabular-nums">{formatRelativeTime(post.createdAt)}</span>
              {post.visibility === 'followers_only' && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    <Users className="w-3 h-3" />
                    <span>للمتابعين فقط</span>
                  </span>
                </>
              )}
              {isArticle && post.content && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">{estimateReadingMinutes(post.content)} د قراءة</span>
                </>
              )}
            </div>
            {post.editedAt && (
              <p className="text-[10px] text-slate-400 mt-1">
                آخر تعديل {formatRelativeTime(post.editedAt)}
                {post.editedByName ? ` بواسطة ${post.editedByName}` : ''}
              </p>
            )}
          </div>

          {typeBadge && (
            <span className="px-2.5 py-1 rounded-lg bg-[#3B6DFF]/10 border border-[#3B6DFF]/25 text-[#3B6DFF] dark:text-[#60A5FA] text-[11px] font-bold flex items-center gap-1 whitespace-nowrap">
              {typeBadge.icon}
              <span>{typeBadge.label}</span>
            </span>
          )}
        </div>

        {/* Title */}
        {post.title && (
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
            {post.title}
          </h1>
        )}

        {/* Formatted Content */}
        {post.content && (
          <div className={isArticle ? 'pt-2 border-t border-slate-100 dark:border-[#242B38]' : ''}>
            <RichBlogContent
              content={post.content}
              onImageClick={(url) => setLightboxImage(url)}
            />
          </div>
        )}

        {/* Quoted / Reposted Original Post */}
        {post.repostOf && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-2">
            <div className="flex items-center gap-2">
              <MediaImage
                src={post.repostOf.authorPhotoURL}
                alt={post.repostOf.authorName}
                variant="avatar"
                fallbackText={post.repostOf.authorName}
                containerClassName="w-6 h-6 rounded-full overflow-hidden shrink-0"
                className="w-full h-full object-cover"
              />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {post.repostOf.authorName}
              </span>
              <span className="font-handle text-[11px] text-slate-400">
                @{post.repostOf.authorHandle}
              </span>
            </div>
            {post.repostOf.content && (
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
                {post.repostOf.content}
              </p>
            )}
          </div>
        )}

        {/* Media Gallery (1-4 images) or Video */}
        {post.videoURL && (
          <div className="rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-[#242B38]">
            <video src={post.videoURL} controls playsInline className="w-full max-h-[420px]" />
          </div>
        )}

        {gallery.length > 0 && (
          <div className={`grid gap-2 ${gallery.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {gallery.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setLightboxImage(imgUrl)}
                className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#242B38] cursor-pointer"
              >
                <MediaImage
                  src={imgUrl}
                  alt=""
                  variant="post"
                  containerClassName="w-full h-64 sm:h-80 overflow-hidden"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Interactive Poll */}
        {post.poll && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#3B6DFF]" />
                <span>{post.poll.question}</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-[#94A3B8] tabular-nums">
                {post.poll.totalVotes || 0} صوت
              </span>
            </div>
            <div className="space-y-2">
              {post.poll.options.map((opt) => {
                const total = Math.max(1, post.poll?.totalVotes || 0);
                const pct = post.poll?.totalVotes ? Math.round((opt.votesCount / total) * 100) : 0;
                const selected = myPollChoices.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={votingPoll}
                    onClick={() => handleVotePoll(opt.id)}
                    className={`w-full relative overflow-hidden rounded-xl border p-3 text-start transition-all cursor-pointer ${
                      selected
                        ? 'border-[#3B6DFF] bg-[#3B6DFF]/10'
                        : 'border-slate-200 dark:border-[#242B38] bg-white dark:bg-[#161B26] hover:border-[#3B6DFF]/50'
                    }`}
                  >
                    <div
                      className="absolute inset-y-0 start-0 bg-[#3B6DFF]/15 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                      <span className="flex items-center gap-1.5">
                        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-[#3B6DFF]" />}
                        <span>{opt.text}</span>
                      </span>
                      <span className="font-mono tabular-nums">{pct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Interactive Quiz */}
        {post.quiz && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-[#3B6DFF]" />
                <span>{post.quiz.title}</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-[#94A3B8] tabular-nums">
                {post.quiz.attemptsCount || 0} محاولة
              </span>
            </div>

            {post.quiz.questions.map((q, qIdx) => (
              <div key={q.id} className="space-y-2">
                <p className="text-xs font-bold text-slate-800 dark:text-white">
                  {qIdx + 1}. {q.prompt}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {q.options.map((opt, oIdx) => {
                    const isPicked = quizAnswers[q.id] === oIdx;
                    const isCorrect = quizSubmittedResult && oIdx === q.correctIndex;
                    const isWrong = quizSubmittedResult && isPicked && oIdx !== q.correctIndex;
                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={Boolean(quizSubmittedResult)}
                        onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-start transition-colors cursor-pointer ${
                          isCorrect
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-300'
                            : isWrong
                            ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-300'
                            : isPicked
                            ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF] dark:text-[#60A5FA]'
                            : 'bg-white dark:bg-[#161B26] border-slate-200 dark:border-[#242B38] text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {quizSubmittedResult ? (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-center text-xs font-bold text-emerald-600 dark:text-emerald-300">
                أتممت الاختبار! نتيجتك: {quizSubmittedResult.score} / {quizSubmittedResult.total}
              </div>
            ) : (
              <button
                type="button"
                disabled={submittingQuiz}
                onClick={handleSubmitQuiz}
                className="w-full py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {submittingQuiz ? 'جاري التحقق...' : 'إرسال الإجابات'}
              </button>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#232A37] text-slate-500 dark:text-[#8E9BAB]">
          <div className="flex items-center gap-6 tabular-nums">
            <button
              type="button"
              onClick={handleToggleLike}
              className={`min-h-[40px] flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                isLiked ? 'text-rose-500' : 'hover:text-rose-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{post.likesCount || 0}</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <MessageCircle className="w-5 h-5 text-[#3B6DFF]" />
              <span>{comments.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRepostModal(true)}
              className="min-h-[40px] flex items-center gap-1.5 text-xs font-bold hover:text-emerald-500 cursor-pointer"
            >
              <Repeat2 className="w-5 h-5" />
              <span>{post.repostsCount || 0}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleBookmark}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full cursor-pointer ${
                isBookmarked ? 'text-[#3B6DFF]' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-[#3B6DFF]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </article>

      {/* Threaded Comments Section */}
      <section className="mt-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white px-1">
          التعليقات ({comments.length})
        </h3>

        {loadingComments ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
          </div>
        ) : rootComments.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] text-center text-xs text-slate-500 dark:text-[#94A3B8]">
            لا توجد تعليقات حتى الآن. ابدأ النقاش أولاً!
          </div>
        ) : (
          <div className="space-y-2.5">
            {rootComments.map((cmt) => {
              const isBest = post.bestAnswerCommentId === cmt.id || cmt.isBestAnswer;
              const childReplies = repliesByParent[cmt.id] || [];
              const canDeleteCmt = currentUser?.id === cmt.authorId || isAdmin;
              return (
                <div
                  key={cmt.id}
                  className={`p-3.5 rounded-2xl border ${
                    isBest
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-white dark:bg-[#111622] border-slate-200 dark:border-[#232A37]'
                  } space-y-2.5`}
                >
                  {isBest && (
                    <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>أفضل إجابة</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2.5">
                    <div
                      onClick={() => onSelectAuthor(cmt.authorId)}
                      className="cursor-pointer shrink-0"
                    >
                      <MediaImage
                        src={cmt.authorPhotoURL}
                        alt={cmt.authorName}
                        variant="avatar"
                        fallbackText={cmt.authorName}
                        containerClassName="w-8 h-8 rounded-full overflow-hidden"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            onClick={() => onSelectAuthor(cmt.authorId)}
                            className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer truncate"
                          >
                            {cmt.authorName}
                          </span>
                          {Boolean(cmt.authorIsVerified) && (
                            <VerifiedBadge category={cmt.authorVerificationCategory || 'blue'} className="w-3 h-3" />
                          )}
                          <span className="font-handle text-[11px] text-slate-400">
                            @{cmt.authorHandle}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(cmt.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {post.postType === 'question' && isAuthor && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleBestAnswerComment(post.id, cmt.id, !isBest)
                              }
                              className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                            >
                              {isBest ? 'إلغاء التمييز' : 'تعيين كأفضل إجابة'}
                            </button>
                          )}
                          {canDeleteCmt && (
                            <button
                              type="button"
                              onClick={() => deleteComment(post.id, cmt.id)}
                              className="text-slate-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs sm:text-[13px] text-slate-800 dark:text-slate-100 mt-1 leading-relaxed whitespace-pre-line">
                        {cmt.text}
                      </p>

                      <button
                        type="button"
                        onClick={() => setReplyingTo(cmt)}
                        className="mt-1.5 text-[11px] font-bold text-[#3B6DFF] flex items-center gap-1 cursor-pointer"
                      >
                        <CornerDownLeft className="w-3 h-3" />
                        <span>رد</span>
                      </button>
                    </div>
                  </div>

                  {/* Nested Replies */}
                  {childReplies.length > 0 && (
                    <div className="ms-7 ps-3 border-s-2 border-slate-200 dark:border-[#242B38] space-y-2 pt-1">
                      {childReplies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2">
                          <div
                            onClick={() => onSelectAuthor(reply.authorId)}
                            className="cursor-pointer shrink-0"
                          >
                            <MediaImage
                              src={reply.authorPhotoURL}
                              alt={reply.authorName}
                              variant="avatar"
                              fallbackText={reply.authorName}
                              containerClassName="w-6 h-6 rounded-full overflow-hidden"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                onClick={() => onSelectAuthor(reply.authorId)}
                                className="text-[11px] font-bold text-slate-900 dark:text-white cursor-pointer"
                              >
                                {reply.authorName}
                              </span>
                              {(currentUser?.id === reply.authorId || isAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => deleteComment(post.id, reply.id)}
                                  className="text-slate-400 hover:text-red-500 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                              {reply.replyToAuthorName && (
                                <span className="text-[#3B6DFF] font-bold me-1">
                                  @{reply.replyToAuthorName}
                                </span>
                              )}
                              {reply.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Fixed Bottom Comment Composer */}
      <form
        onSubmit={handleSendComment}
        className="fixed bottom-16 lg:bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#242B38] p-3"
      >
        <div className="max-w-xl mx-auto space-y-2">
          {replyingTo && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#3B6DFF]/10 text-xs text-[#3B6DFF]">
              <span>
                الرد على <strong>{replyingTo.authorName}</strong>
              </span>
              <button type="button" onClick={() => setReplyingTo(null)} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                currentUser ? 'أضف تعليقك أو ردك...' : 'سجّل الدخول لإضافة تعليق'
              }
              disabled={!currentUser || sendingComment}
              className="flex-1 min-h-[44px] bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] focus:border-[#3B6DFF] rounded-2xl px-4 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={!currentUser || !commentText.trim() || sendingComment}
              className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
              aria-label="إرسال التعليق"
            >
              {sendingComment ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

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

      {/* Wiki Edit Modal */}
      {showWikiEditModal && canEditWiki && (
        <div
          onClick={() => setShowWikiEditModal(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center sm:p-4"
        >
          <form
            onSubmit={handleSaveWikiEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl bg-white dark:bg-[#0B0F19] sm:border border-slate-200 dark:border-[#2A2F3A] rounded-none sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl font-ar"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between bg-slate-50 dark:bg-[#161B26]">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#3B6DFF]" />
                <span>تحرير صفحة الويكي</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowWikiEditModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان صفحة الويكي
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={wikiEditTitle}
                  onChange={(e) => setWikiEditTitle(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] px-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الوسوم (افصل بينها بمسافة)
                </label>
                <input
                  type="text"
                  value={wikiEditTags}
                  onChange={(e) => setWikiEditTags(e.target.value)}
                  placeholder="#موسوعة #قواعد"
                  className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المحتوى المنسق
                </label>
                <RichBlogEditor
                  value={wikiEditContent}
                  onChange={setWikiEditContent}
                  maxLength={10000}
                  rows={10}
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#2A2F3A] flex items-center justify-end gap-2 bg-slate-50 dark:bg-[#161B26]">
              <button
                type="button"
                onClick={() => setShowWikiEditModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingWikiEdit}
                className="px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingWikiEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ تعديلات الويكي</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 end-4 min-w-[44px] min-h-[44px] rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl max-h-[85vh] w-full flex items-center justify-center">
            <MediaImage
              src={lightboxImage}
              alt=""
              variant="post"
              containerClassName="w-full max-h-[85vh] rounded-2xl overflow-hidden"
              className="w-full h-full max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
