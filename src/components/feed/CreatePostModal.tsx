import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Image as ImageIcon,
  Video,
  Tag,
  Loader2,
  AlertCircle,
  BookOpen,
  FileText,
  HelpCircle,
  BarChart3,
  Award,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Globe,
  Users
} from 'lucide-react';
import { GlobalPostType, MediaMetadata } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { createPost } from '../../services/firestore';
import {
  uploadMediaWithControl,
  validateMediaFile,
  createLocalPreview,
  revokeLocalPreview,
  isPersistentMediaUrl,
  UploadControlHandle
} from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { RichBlogEditor } from '../common/RichBlogContent';
import { MediaImage } from '../common/MediaImage';

export type CreatePostInitialMode = 'post' | 'image' | 'video' | 'blog' | 'poll';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: CreatePostInitialMode;
}

export const GLOBAL_TOPICS: readonly string[] = [
  'عام',
  'التقنية والذكاء الاصطناعي',
  'التصميم والفنون',
  'العلوم والمعرفة',
  'التطوير الذاتي والفكر',
  'القرآن الكريم',
] as const;

interface AttachmentItem {
  id: string;
  file: File;
  localUrl: string;
  remoteUrl?: string;
  metadata?: MediaMetadata;
  kind: 'image' | 'video';
  status: 'uploading' | 'ready' | 'error';
  progress: number;
  error?: string;
  handle?: UploadControlHandle;
}

const POST_TYPES: Array<{ id: GlobalPostType; label: string; icon: React.ReactNode }> = [
  { id: 'post', label: 'منشور', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'blog', label: 'مدونة', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'wiki', label: 'ويكي', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'question', label: 'سؤال', icon: <HelpCircle className="w-3.5 h-3.5" /> },
  { id: 'poll', label: 'استطلاع', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'quiz', label: 'اختبار', icon: <Award className="w-3.5 h-3.5" /> },
];

export function CreatePostModal({ isOpen, onClose, initialMode = 'post' }: CreatePostModalProps) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [postType, setPostType] = useState<GlobalPostType>('post');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(GLOBAL_TOPICS[0]);
  const [isTopicMenuOpen, setIsTopicMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'followers_only'>('public');
  const [submitting, setSubmitting] = useState(false);

  // Poll fields
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // Quiz fields
  const [quizTitle, setQuizTitle] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<
    Array<{ prompt: string; options: string[]; correctIndex: number }>
  >([{ prompt: '', options: ['', ''], correctIndex: 0 }]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (initialMode === 'blog') setPostType('blog');
      else if (initialMode === 'poll') setPostType('poll');
      else setPostType('post');
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        att.handle?.cancel();
        revokeLocalPreview(att.localUrl);
      });
    };
  }, []);

  if (!isOpen) return null;

  const isUploadingAny = attachments.some((a) => a.status === 'uploading');
  const hasFailedUploads = attachments.some((a) => a.status === 'error');

  const startAttachmentUpload = (item: AttachmentItem) => {
    const handle = uploadMediaWithControl(item.file, 'posts', {
      timeoutMs: 20000,
      onProgress: (pct) => {
        setAttachments((prev) =>
          prev.map((att) => (att.id === item.id ? { ...att, progress: pct } : att))
        );
      },
      onMetadata: (metadata) => {
        setAttachments((prev) =>
          prev.map((att) => (att.id === item.id ? { ...att, metadata } : att))
        );
      },
    });

    setAttachments((prev) =>
      prev.map((att) =>
        att.id === item.id ? { ...att, status: 'uploading', error: undefined, progress: 0, handle } : att
      )
    );

    handle.promise
      .then((url) => {
        setAttachments((prev) =>
          prev.map((att) =>
            att.id === item.id
              ? { ...att, status: 'ready', remoteUrl: url, progress: 100, handle: undefined }
              : att
          )
        );
      })
      .catch((err: any) => {
        const msg = err?.message || 'فشل رفع الملف';
        setAttachments((prev) =>
          prev.map((att) =>
            att.id === item.id ? { ...att, status: 'error', error: msg, handle: undefined } : att
          )
        );
        showToast(msg, 'error');
      });
  };

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'video') => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (files.length === 0) return;

    if (kind === 'video') {
      const file = files[0];
      const check = validateMediaFile(file, { allowImages: false, allowVideos: true, allowAudio: false });
      if (!check.isValid) {
        showToast(check.error || 'ملف الفيديو غير صالح', 'error');
        return;
      }
      attachments.forEach((a) => {
        a.handle?.cancel();
        revokeLocalPreview(a.localUrl);
      });
      const item: AttachmentItem = {
        id: `att_${Date.now()}`,
        file,
        localUrl: createLocalPreview(file),
        kind: 'video',
        status: 'uploading',
        progress: 0,
      };
      setAttachments([item]);
      setTimeout(() => startAttachmentUpload(item), 0);
      return;
    }

    // Images (up to 4 total, replaces video if any)
    const currentImages = attachments.filter((a) => a.kind === 'image');
    const availableSlots = Math.max(0, 4 - currentImages.length);
    if (availableSlots === 0) {
      showToast('الحد الأقصى 4 صور في المنشور الواحد.', 'info');
      return;
    }

    const toAdd = files.slice(0, availableSlots);
    const newItems: AttachmentItem[] = [];
    for (const file of toAdd) {
      const check = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
      if (!check.isValid) {
        showToast(check.error || 'الصورة غير صالحة', 'error');
        continue;
      }
      newItems.push({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        localUrl: createLocalPreview(file),
        kind: 'image',
        status: 'uploading',
        progress: 0,
      });
    }

    if (newItems.length === 0) return;

    // Clear any existing video
    attachments
      .filter((a) => a.kind === 'video')
      .forEach((a) => {
        a.handle?.cancel();
        revokeLocalPreview(a.localUrl);
      });

    setAttachments([...currentImages, ...newItems]);
    newItems.forEach((item) => {
      setTimeout(() => startAttachmentUpload(item), 0);
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) {
        target.handle?.cancel();
        revokeLocalPreview(target.localUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const resetFormAndClose = () => {
    attachments.forEach((att) => {
      att.handle?.cancel();
      revokeLocalPreview(att.localUrl);
    });
    setAttachments([]);
    setTitle('');
    setContent('');
    setPollQuestion('');
    setPollOptions(['', '']);
    setQuizTitle('');
    setQuizQuestions([{ prompt: '', options: ['', ''], correctIndex: 0 }]);
    setPostType('post');
    setVisibility('public');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً لنشر منشور.', 'error');
      return;
    }
    if (isUploadingAny) {
      showToast('يرجى الانتظار حتى يكتمل رفع الوسائط أو إلغاؤها.', 'info');
      return;
    }
    if (hasFailedUploads) {
      showToast('يوجد ملف فشل رفعه. أعد المحاولة أو أزله قبل النشر.', 'error');
      return;
    }

    const readyImages = attachments
      .filter((a) => a.kind === 'image' && a.status === 'ready' && isPersistentMediaUrl(a.remoteUrl))
      .map((a) => a.remoteUrl as string);
    const readyVideo = attachments.find(
      (a) => a.kind === 'video' && a.status === 'ready' && isPersistentMediaUrl(a.remoteUrl)
    )?.remoteUrl;

    if ((postType === 'blog' || postType === 'wiki' || postType === 'question') && !title.trim()) {
      showToast('يرجى كتابة عنوان واضح لهذا المحتوى.', 'error');
      return;
    }

    if (postType === 'poll') {
      const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (!pollQuestion.trim() || validOpts.length < 2) {
        showToast('يرجى كتابة سؤال الاستطلاع وخيارين على الأقل.', 'error');
        return;
      }
    }

    if (postType === 'quiz') {
      const validQs = quizQuestions.filter(
        (q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2
      );
      if (!quizTitle.trim() || validQs.length === 0) {
        showToast('يرجى إدخال عنوان الاختبار وسؤال واحد بخيارين على الأقل.', 'error');
        return;
      }
    }

    if (
      postType === 'post' &&
      !content.trim() &&
      readyImages.length === 0 &&
      !readyVideo
    ) {
      showToast('يرجى كتابة نص أو إرفاق صورة/فيديو للنشر.', 'error');
      return;
    }

    const extractedTags = Array.from(
      new Set((content.match(/#[\w\u0600-\u06FF]+/g) || []).map((t) => t.trim()))
    );

    const validPollOpts = pollOptions
      .map((o) => o.trim())
      .filter(Boolean)
      .map((text, idx) => ({
        id: `opt_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        votesCount: 0,
      }));

    const validQuizQs = quizQuestions
      .filter((q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2)
      .map((q, idx) => {
        const cleanOpts = q.options.map((o) => o.trim()).filter(Boolean);
        return {
          id: `qq_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          prompt: q.prompt.trim(),
          options: cleanOpts,
          correctIndex: Math.min(q.correctIndex, cleanOpts.length - 1),
        };
      });

    try {
      submittingRef.current = true;
      setSubmitting(true);
      await createPost({
        authorId: currentUser.id,
        authorName: currentUser.displayName,
        authorHandle: currentUser.handle,
        authorPhotoURL: currentUser.photoURL,
        authorRole: currentUser.role,
        authorCustomTitle: currentUser.customTitle || null,
        authorCustomTitles:
          currentUser.customTitles && currentUser.customTitles.length > 0
            ? currentUser.customTitles
            : currentUser.customTitle
            ? [currentUser.customTitle]
            : undefined,
        authorIsVerified: currentUser.isVerified,
        authorVerificationCategory: currentUser.verificationCategory || 'blue',
        authorLevel: currentUser.level,
        postType,
        visibility,
        title: title.trim() || undefined,
        content: content.trim() || (postType === 'poll' ? pollQuestion.trim() : quizTitle.trim()),
        mediaURL: readyImages[0] || undefined,
        mediaURLs: readyImages.length > 0 ? readyImages : undefined,
        videoURL: readyVideo || undefined,
        mediaMetadata:
          attachments.filter((a) => a.status === 'ready' && a.metadata).length > 0
            ? attachments
                .filter((a) => a.status === 'ready' && a.metadata)
                .map((a) => a.metadata as MediaMetadata)
            : undefined,
        storageProvider:
          readyImages.length > 0 || readyVideo ? 'supabase' : undefined,
        tags: extractedTags.length > 0 ? extractedTags : undefined,
        poll:
          postType === 'poll'
            ? {
                question: pollQuestion.trim(),
                options: validPollOpts,
                allowMultiple: pollAllowMultiple,
                totalVotes: 0,
              }
            : undefined,
        quiz:
          postType === 'quiz'
            ? {
                title: quizTitle.trim(),
                questions: validQuizQs,
                attemptsCount: 0,
              }
            : undefined,
        community: selectedTopic,
        createdAt: new Date().toISOString(),
      });

      showToast('تم النشر بنجاح في Q!', 'success');
      resetFormAndClose();
    } catch (err: any) {
      console.error('Failed to create post:', err);
      showToast(err?.message || 'تعذر نشر المحتوى. تحقق من الاتصال.', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/85 backdrop-blur-md flex items-center justify-center sm:p-4 overflow-y-auto font-tajawal">
      <div
        className={`w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] flex flex-col ${
          postType === 'blog' || postType === 'wiki' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        } bg-white dark:bg-[#0B0F19] sm:border border-slate-200 dark:border-[#2A2F3A] rounded-none sm:rounded-3xl overflow-hidden shadow-2xl sm:my-auto animate-scale-up transition-all`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between bg-slate-50 dark:bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFormAndClose}
              disabled={submitting}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">إنشاء محتوى جديد</h2>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-[#94A3B8] font-medium truncate max-w-[140px]">
                {currentUser.displayName}
              </span>
              <div className="w-8 h-8 rounded-full overflow-hidden border border-[#3B6DFF]/50 shrink-0">
                <MediaImage
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  variant="avatar"
                  fallbackText={currentUser.displayName}
                  containerClassName="w-full h-full rounded-full overflow-hidden"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        {/* Global Content Type Selector */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-[#2A2F3A]/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {POST_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPostType(item.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                postType === item.id
                  ? 'bg-[#3B6DFF] text-white shadow-sm shadow-[#3B6DFF]/30'
                  : 'bg-slate-100 dark:bg-[#161B26] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 flex-1 overflow-y-auto">
          {/* Title for Blog / Wiki / Question */}
          {(postType === 'blog' || postType === 'wiki' || postType === 'question') && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder={
                postType === 'blog'
                  ? 'عنوان المقال أو المدونة...'
                  : postType === 'wiki'
                  ? 'عنوان صفحة الويكي...'
                  : 'اكتب سؤالك باختصار...'
              }
              className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
            />
          )}

          {/* Main text body (Rich Editor for Blog / Wiki, clean textarea for other types) */}
          {postType === 'blog' || postType === 'wiki' ? (
            <RichBlogEditor
              value={content}
              onChange={setContent}
              maxLength={9500}
              rows={9}
              placeholder={
                postType === 'blog'
                  ? 'اكتب مقالك باستخدام أدوات التنسيق: العناوين، الاقتباسات، القوائم، التمييز، والصور...'
                  : 'أضف المعلومات والمراجع المنسقة لموسوعة Q...'
              }
            />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                postType === 'question'
                  ? 'اشرح تفاصيل سؤالك ليتمكن الأعضاء من إجابتك...'
                  : 'ماذا يخطر ببالك؟... أضف #وسماً للوصول لأوسع جمهور'
              }
              rows={4}
              maxLength={5000}
              className="w-full bg-transparent border border-slate-200/70 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] text-sm leading-relaxed focus:outline-none resize-none text-start p-3"
            />
          )}

          {/* Poll Builder */}
          {postType === 'poll' && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-2.5">
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="سؤال الاستطلاع..."
                maxLength={160}
                className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
              />
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...pollOptions];
                        next[idx] = e.target.value;
                        setPollOptions(next);
                      }}
                      placeholder={`الخيار ${idx + 1}`}
                      maxLength={80}
                      className="flex-1 bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                {pollOptions.length < 6 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="text-xs font-bold text-[#3B6DFF] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة خيار</span>
                  </button>
                ) : (
                  <span />
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pollAllowMultiple}
                    onChange={(e) => setPollAllowMultiple(e.target.checked)}
                    className="accent-[#3B6DFF]"
                  />
                  <span>السماح باختيار أكثر من إجابة</span>
                </label>
              </div>
            </div>
          )}

          {/* Quiz Builder */}
          {postType === 'quiz' && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-3">
              <input
                type="text"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder="عنوان الاختبار التفاعلي..."
                maxLength={120}
                className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
              />
              {quizQuestions.map((qq, qIdx) => (
                <div
                  key={qIdx}
                  className="p-3 rounded-xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#3B6DFF]">السؤال {qIdx + 1}</span>
                    {quizQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuizQuestions(quizQuestions.filter((_, i) => i !== qIdx))
                        }
                        className="text-red-500 text-xs cursor-pointer"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={qq.prompt}
                    onChange={(e) => {
                      const next = [...quizQuestions];
                      next[qIdx].prompt = e.target.value;
                      setQuizQuestions(next);
                    }}
                    placeholder="نص السؤال..."
                    className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                  <div className="space-y-1.5">
                    {qq.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_${qIdx}`}
                          checked={qq.correctIndex === oIdx}
                          onChange={() => {
                            const next = [...quizQuestions];
                            next[qIdx].correctIndex = oIdx;
                            setQuizQuestions(next);
                          }}
                          className="accent-[#3B6DFF]"
                          title="الإجابة الصحيحة"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...quizQuestions];
                            next[qIdx].options[oIdx] = e.target.value;
                            setQuizQuestions(next);
                          }}
                          placeholder={`خيار ${oIdx + 1}${qq.correctIndex === oIdx ? ' (الصحيح)' : ''}`}
                          className="flex-1 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  {qq.options.length < 4 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...quizQuestions];
                        next[qIdx].options.push('');
                        setQuizQuestions(next);
                      }}
                      className="text-[11px] font-bold text-[#3B6DFF] cursor-pointer"
                    >
                      + إضافة خيار
                    </button>
                  )}
                </div>
              ))}
              {quizQuestions.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    setQuizQuestions([
                      ...quizQuestions,
                      { prompt: '', options: ['', ''], correctIndex: 0 },
                    ])
                  }
                  className="text-xs font-bold text-[#3B6DFF] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة سؤال جديد</span>
                </button>
              )}
            </div>
          )}

          {/* Attachments Preview Grid (Local preview instant + progress/error/cancel) */}
          {attachments.length > 0 && (
            <div
              className={`grid gap-2 ${
                attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              }`}
            >
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#2A2F3A] aspect-video"
                >
                  {att.kind === 'video' ? (
                    <video src={att.localUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <MediaImage
                      src={att.remoteUrl || att.localUrl}
                      alt=""
                      variant="post"
                      containerClassName="w-full h-full overflow-hidden"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Remove / Cancel button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="absolute top-2 end-2 min-w-[32px] min-h-[32px] flex items-center justify-center bg-black/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-colors cursor-pointer z-20"
                    title="إزالة"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Upload progress overlay */}
                  {att.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-3 z-10">
                      <Loader2 className="w-5 h-5 animate-spin text-[#4F8CFF]" />
                      <span className="text-xs text-white font-mono font-bold tabular-nums">
                        {att.progress}%
                      </span>
                      <div className="w-2/3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3B6DFF] transition-all"
                          style={{ width: `${att.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Ready badge */}
                  {att.status === 'ready' && (
                    <div className="absolute bottom-2 start-2 px-2 py-0.5 rounded-full bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>جاهز</span>
                    </div>
                  )}

                  {/* Error overlay with retry */}
                  {att.status === 'error' && (
                    <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center gap-2 p-3 text-center z-10">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-[11px] text-red-100 leading-snug line-clamp-3">
                        {att.error}
                      </p>
                      <button
                        type="button"
                        onClick={() => startAttachmentUpload(att)}
                        className="px-3 py-1.5 rounded-xl bg-white text-red-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>إعادة المحاولة</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Toolbar: Images (up to 4), Video, Topic */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              disabled={isUploadingAny}
              onClick={() => imageInputRef.current?.click()}
              className="min-h-[56px] flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4 text-[#3B6DFF] dark:text-[#4F8CFF]" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-[#F8FAFC]">
                صور (حتى 4)
              </span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFilesSelect(e, 'image')}
                className="hidden"
              />
            </button>

            <button
              type="button"
              disabled={isUploadingAny}
              onClick={() => videoInputRef.current?.click()}
              className="min-h-[56px] flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <Video className="w-4 h-4 text-[#38BDF8]" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-[#F8FAFC]">فيديو</span>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleFilesSelect(e, 'video')}
                className="hidden"
              />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTopicMenuOpen(!isTopicMenuOpen)}
                className="w-full h-full min-h-[56px] flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/50 transition-all cursor-pointer"
              >
                <Tag className="w-4 h-4 text-[#818CF8]" />
                <span className="text-[11px] font-bold text-slate-800 dark:text-[#F8FAFC] truncate max-w-[92px]">
                  {selectedTopic}
                </span>
              </button>

              {isTopicMenuOpen && (
                <div className="absolute bottom-full inset-x-0 mb-2 bg-white dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-1.5 shadow-2xl z-30 space-y-1">
                  {GLOBAL_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        setSelectedTopic(topic);
                        setIsTopicMenuOpen(false);
                      }}
                      className={`w-full text-start px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        selectedTopic === topic
                          ? 'bg-[#3B6DFF] text-white font-bold'
                          : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#161B26]'
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Post Visibility Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                visibility === 'public'
                  ? 'bg-[#3B6DFF]/12 border-[#3B6DFF] text-[#3B6DFF] dark:text-[#60A5FA]'
                  : 'bg-slate-50 dark:bg-[#161B26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>عام للجميع</span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('followers_only')}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                visibility === 'followers_only'
                  ? 'bg-amber-500/12 border-amber-500 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-50 dark:bg-[#161B26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>للمتابعين فقط</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting || isUploadingAny || hasFailedUploads}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(59,109,255,0.35)] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>نشر الآن</span>}
          </button>
        </form>
      </div>
    </div>
  );
}
