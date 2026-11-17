import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Eye,
  Trash2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Send,
  Lock
} from 'lucide-react';
import { Story, StoryViewerRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  recordStoryView,
  deleteStory,
  getUserProfile,
  listenToStoryViewers,
  getOrCreateConversation,
  sendMessage
} from '../../services/firestore';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from '../common/MediaImage';
import { useLiveUserProfile, useLiveUserProfiles } from '../../hooks/useUserProfiles';

interface StoryViewerModalProps {
  stories: Story[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectAuthor?: (authorId: string) => void;
  onStoryViewed?: (storyId: string) => void;
}

const STORY_QUICK_REACTIONS = ['❤️', '🔥', '👏', '😂'];

export function StoryViewerModal({
  stories,
  initialIndex,
  isOpen,
  onClose,
  onSelectAuthor,
  onStoryViewed,
}: StoryViewerModalProps) {
  const { currentUser, isAdmin } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showViewersList, setShowViewersList] = useState(false);
  const [viewerRecords, setViewerRecords] = useState<StoryViewerRecord[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [isTypingReply, setIsTypingReply] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recordedIdsRef = useRef<Set<string>>(new Set());

  const currentStory = stories[currentIndex];
  const isAuthor = Boolean(currentUser?.id && currentStory && currentUser.id === currentStory.authorId);
  const canSeeViewers = Boolean(currentStory && (isAuthor || isAdmin));

  const liveAuthor = useLiveUserProfile(
    currentStory?.authorId,
    currentStory
      ? {
          displayName: currentStory.authorName,
          handle: currentStory.authorHandle,
          photoURL: currentStory.authorPhotoURL,
          isVerified: currentStory.authorIsVerified,
          verificationCategory: currentStory.authorVerificationCategory,
        }
      : undefined
  );

  const liveViewersMap = useLiveUserProfiles(viewerRecords.map((rec) => rec.viewerId));

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setProgress(0);
    setShowViewersList(false);
    setReplyText('');
  }, [initialIndex]);

  const authorStories = currentStory
    ? stories.filter((s) => s.authorId === currentStory.authorId)
    : [];
  const authorStoryLocalIndex = currentStory
    ? authorStories.findIndex((s) => s.id === currentStory.id)
    : 0;

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
      setShowViewersList(false);
      setReplyText('');
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
      setShowViewersList(false);
      setReplyText('');
    }
  };

  // Record view once per story open
  useEffect(() => {
    if (!isOpen || !currentStory || !currentUser?.id) return;
    if (recordedIdsRef.current.has(currentStory.id)) return;
    recordedIdsRef.current.add(currentStory.id);
    onStoryViewed?.(currentStory.id);
    void recordStoryView(currentStory.id, {
      id: currentUser.id,
      displayName: currentUser.displayName,
      handle: currentUser.handle,
      photoURL: currentUser.photoURL,
    });
  }, [isOpen, currentStory?.id, currentUser?.id]);

  // Owner-only real-time viewers list subscription
  useEffect(() => {
    if (!isOpen || !currentStory || !canSeeViewers) {
      setViewerRecords([]);
      return;
    }
    return listenToStoryViewers(currentStory.id, setViewerRecords);
  }, [isOpen, currentStory?.id, canSeeViewers]);

  // Animated progress countdown for image & text stories
  useEffect(() => {
    if (!isOpen || !currentStory) return;
    if (currentStory.mediaType === 'video' && currentStory.mediaURL) return;
    if (isPaused || showViewersList || isTypingReply || sendingReply) return;

    const durationMs = (currentStory.durationSec || 5) * 1000;
    const stepMs = 50;
    const incrementPct = (stepMs / durationMs) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + incrementPct;
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(goNext, 0);
          return 100;
        }
        return next;
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, [
    isOpen,
    currentStory?.id,
    currentStory?.mediaType,
    isPaused,
    showViewersList,
    isTypingReply,
    sendingReply,
    currentIndex,
    stories.length,
  ]);

  // Sync video pause/play
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPaused || showViewersList || isTypingReply) {
      vid.pause();
    } else {
      void vid.play().catch(() => {});
    }
  }, [isPaused, showViewersList, isTypingReply, currentStory?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (isTypingReply) return;
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.key === 'ArrowRight') {
        if (isRTL) goPrev();
        else goNext();
      } else if (e.key === 'ArrowLeft') {
        if (isRTL) goNext();
        else goPrev();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, stories.length, isRTL, isTypingReply]);

  if (!isOpen || !currentStory) return null;

  const canDelete = isAuthor || isAdmin;
  const isVideo = currentStory.mediaType === 'video' && Boolean(currentStory.mediaURL);
  const effectiveViewCount = Math.max(
    currentStory.viewCount || 0,
    viewerRecords.length,
    currentStory.viewers?.length || 0
  );

  const mediaScale = currentStory.mediaScale && currentStory.mediaScale >= 1 ? currentStory.mediaScale : 1;
  const mediaOffsetX = currentStory.mediaOffsetX || 0;
  const mediaOffsetY = currentStory.mediaOffsetY || 0;

  const handleDelete = async () => {
    try {
      await deleteStory(currentStory.id);
      showToast('تم حذف القصة.', 'info');
      if (stories.length <= 1) onClose();
      else if (currentIndex >= stories.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
    } catch {
      showToast('تعذر حذف القصة.', 'error');
    }
  };

  const handleSendStoryReply = async (textOverride?: string) => {
    const body = (textOverride ?? replyText).trim();
    if (!body || !currentUser || isAuthor || sendingReply) return;
    try {
      setSendingReply(true);
      const authorProfile = await getUserProfile(currentStory.authorId);
      if (!authorProfile) {
        showToast('تعذر الوصول إلى حساب صاحب القصة.', 'error');
        return;
      }
      const convId = await getOrCreateConversation(currentUser, authorProfile);
      await sendMessage(
        convId,
        currentUser,
        currentStory.authorId,
        `رد على قصتك: ${body}`
      );
      if (!textOverride) setReplyText('');
      setIsTypingReply(false);
      showToast('تم إرسال ردك عبر الرسائل الخاصة.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر إرسال الرد على القصة.', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in sm:p-4 font-tajawal">
      <div
        className="relative w-full h-[100dvh] sm:h-auto sm:max-w-sm sm:aspect-[9/16] bg-[#0B0F19] sm:rounded-3xl overflow-hidden border-0 sm:border sm:border-[#2A2F3A] shadow-2xl flex flex-col justify-between select-none"
        onPointerDown={() => setIsPaused(true)}
        onPointerUp={() => setIsPaused(false)}
        onPointerCancel={() => setIsPaused(false)}
        style={currentStory.bgStyle && !currentStory.mediaURL ? { background: currentStory.bgStyle } : undefined}
      >
        {/* Story Media with Saved Crop/Zoom Transform */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={currentStory.mediaURL}
            autoPlay
            playsInline
            muted={isMuted}
            onTimeUpdate={(e) => {
              const vid = e.currentTarget;
              if (vid.duration > 0) {
                setProgress(Math.min(100, (vid.currentTime / vid.duration) * 100));
              }
            }}
            onEnded={goNext}
            className="absolute inset-0 w-full h-full object-cover transition-transform"
            style={{
              transform: `translate(${mediaOffsetX}%, ${mediaOffsetY}%) scale(${mediaScale})`,
            }}
          />
        ) : currentStory.mediaURL ? (
          <div
            className="absolute inset-0 w-full h-full overflow-hidden"
            style={{
              transform: `translate(${mediaOffsetX}%, ${mediaOffsetY}%) scale(${mediaScale})`,
            }}
          >
            <MediaImage
              src={currentStory.mediaURL}
              alt=""
              variant="story"
              loading="eager"
              containerClassName="w-full h-full overflow-hidden"
              className="w-full h-full object-cover"
            />
          </div>
        ) : null}

        {/* Overlay Text */}
        {currentStory.overlayText && (
          <div
            className={`relative z-10 px-6 flex justify-center pointer-events-none ${
              !currentStory.mediaURL
                ? 'my-auto'
                : currentStory.textPosition === 'top'
                ? 'mt-24 mb-auto'
                : currentStory.textPosition === 'bottom'
                ? 'mt-auto mb-28'
                : 'my-auto'
            }`}
          >
            <p
              className={`text-center font-bold leading-relaxed ${
                !currentStory.mediaURL
                  ? 'text-xl drop-shadow-md'
                  : 'px-4 py-2 rounded-2xl bg-black/55 text-base backdrop-blur-sm'
              }`}
              style={{ color: currentStory.textColor || '#FFFFFF' }}
            >
              {currentStory.overlayText}
            </p>
          </div>
        )}

        {/* RTL-Aware Tap Zones (Left / Right) */}
        <div className="absolute inset-0 z-10 flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isRTL) goNext();
              else goPrev();
            }}
            aria-label={isRTL ? 'التالي' : 'السابق'}
            className="w-1/3 h-full cursor-pointer focus:outline-none"
          />
          <div className="w-1/3 h-full" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isRTL) goPrev();
              else goNext();
            }}
            aria-label={isRTL ? 'السابق' : 'التالي'}
            className="w-1/3 h-full cursor-pointer focus:outline-none"
          />
        </div>

        {/* Top Progress Bars & Clickable Author Header */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="relative z-20 p-4 bg-gradient-to-b from-black/80 via-black/35 to-transparent"
        >
          <div className="flex gap-1 mb-3">
            {authorStories.map((s, idx) => (
              <div
                key={s.id}
                className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden"
              >
                <div
                  className="h-full bg-[#3B6DFF] transition-[width] duration-75"
                  style={{
                    width:
                      idx < authorStoryLocalIndex
                        ? '100%'
                        : idx === authorStoryLocalIndex
                        ? `${progress}%`
                        : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectAuthor) {
                  onClose();
                  onSelectAuthor(currentStory.authorId);
                }
              }}
              className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer group"
            >
              <MediaImage
                src={liveAuthor.photoURL}
                alt={liveAuthor.displayName}
                variant="avatar"
                fallbackText={liveAuthor.displayName}
                containerClassName="w-9 h-9 rounded-full border-2 border-[#3B6DFF] overflow-hidden shrink-0"
                className="w-full h-full object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-white drop-shadow truncate group-hover:text-[#60A5FA] transition-colors">
                    {liveAuthor.displayName}
                  </span>
                  {Boolean(liveAuthor.isVerified) && (
                    <VerifiedBadge category={liveAuthor.verificationCategory || 'blue'} className="w-3.5 h-3.5" interactive={false} />
                  )}
                </div>
                <div className="text-[10px] text-neutral-300 drop-shadow flex items-center gap-1">
                  <span>{formatRelativeTime(currentStory.createdAt)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-[#93C5FD]">
                    <Lock className="w-2.5 h-2.5" />
                    للمتابعين
                  </span>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused((p) => !p);
                }}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md cursor-pointer"
                aria-label={isPaused ? 'تشغيل' : 'إيقاف مؤقت'}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>

              {isVideo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted((m) => !m);
                  }}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md cursor-pointer"
                  aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-black/50 hover:bg-red-600/80 text-neutral-200 hover:text-white backdrop-blur-md cursor-pointer"
                  title="حذف القصة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Caption, Quick Reply/Reactions, and Owner-Only Viewers Bar */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="relative z-20 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent space-y-2.5"
        >
          {currentStory.caption && (
            <p className="text-xs text-white drop-shadow-md leading-relaxed">
              {currentStory.caption}
            </p>
          )}

          {/* Non-author quick reaction & DM reply */}
          {!isAuthor && currentUser && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {STORY_QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    disabled={sendingReply}
                    onClick={() => void handleSendStoryReply(emoji)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-md flex items-center justify-center text-base transition-transform active:scale-90 cursor-pointer disabled:opacity-50"
                  >
                    {emoji}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendStoryReply();
                  }}
                  className="flex-1 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={replyText}
                    onFocus={() => setIsTypingReply(true)}
                    onBlur={() => setIsTypingReply(false)}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`رد على ${liveAuthor.displayName}...`}
                    maxLength={240}
                    className="flex-1 min-h-[38px] bg-white/15 border border-white/20 focus:border-[#4F8CFF] rounded-full px-3.5 text-xs text-white placeholder-white/60 focus:outline-none backdrop-blur-md"
                  />
                  {replyText.trim() && (
                    <button
                      type="submit"
                      disabled={sendingReply}
                      className="w-9 h-9 rounded-full bg-[#3B6DFF] text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                      aria-label="إرسال رد"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {canSeeViewers ? (
              <button
                type="button"
                onClick={() => setShowViewersList(!showViewersList)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs text-white cursor-pointer hover:border-[#3B6DFF]/60"
              >
                <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span className="tabular-nums">{effectiveViewCount} مشاهدة</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2 text-neutral-300 text-[11px]">
              <button
                type="button"
                onClick={isRTL ? goNext : goPrev}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums">
                {currentIndex + 1} / {stories.length}
              </span>
              <button
                type="button"
                onClick={isRTL ? goPrev : goNext}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Owner-Only Real-Time Viewers Drawer */}
          {canSeeViewers && showViewersList && (
            <div className="mt-2 p-3 bg-[#111827]/95 border border-[#2A2F3A] rounded-2xl max-h-48 overflow-y-auto space-y-2 animate-slide-up">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>المشاهدون ({effectiveViewCount})</span>
                <button
                  type="button"
                  onClick={() => setShowViewersList(false)}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {viewerRecords.length > 0 ? (
                <div className="space-y-2">
                  {viewerRecords.map((rec) => {
                    const liveViewer = liveViewersMap[rec.viewerId];
                    const viewerName = liveViewer ? liveViewer.displayName : (rec.displayName || 'مستخدم Q');
                    const viewerHandle = liveViewer ? liveViewer.handle : (rec.handle || rec.viewerId.slice(0, 8));
                    const viewerPhoto = liveViewer ? liveViewer.photoURL : rec.photoURL;
                    return (
                    <button
                      key={rec.viewerId}
                      type="button"
                      onClick={() => {
                        if (onSelectAuthor) {
                          onClose();
                          onSelectAuthor(rec.viewerId);
                        }
                      }}
                      className="w-full flex items-center justify-between gap-2.5 text-start hover:bg-white/5 p-1 rounded-xl cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MediaImage
                          src={viewerPhoto}
                          alt={viewerName}
                          variant="avatar"
                          fallbackText={viewerName || rec.viewerId.slice(0, 2)}
                          containerClassName="w-7 h-7 rounded-full overflow-hidden border border-[#3B6DFF]/40 shrink-0"
                          className="w-full h-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {viewerName}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-mono truncate">
                            @{viewerHandle}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-neutral-400 shrink-0 tabular-nums">
                        {formatRelativeTime(rec.viewedAt)}
                      </span>
                    </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-neutral-400">لا توجد مشاهدات حتى الآن.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
