import React, { useState, useRef, useEffect } from 'react';
import {
  Image,
  Video,
  Type,
  Loader2,
  Sparkles,
  X,
  RefreshCw,
  AlertCircle,
  Camera,
  Lock,
  RotateCcw,
  ZoomIn
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { MediaImage } from '../common/MediaImage';
import { useAuth } from '../../context/AuthContext';
import { createStory } from '../../services/firestore';
import {
  uploadMediaWithControl,
  validateMediaFile,
  createLocalPreview,
  revokeLocalPreview,
  isPersistentMediaUrl,
  UploadControlHandle
} from '../../services/storage';
import { useToast } from '../../context/ToastContext';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BG_PRESETS = [
  { id: 'q-blue', label: 'أزرق Q', css: 'linear-gradient(135deg, #0B1636 0%, #2563EB 55%, #38BDF8 100%)' },
  { id: 'midnight', label: 'منتصف الليل', css: 'linear-gradient(135deg, #090D16 0%, #1E293B 100%)' },
  { id: 'emerald', label: 'زمردي', css: 'linear-gradient(135deg, #064E3B 0%, #10B981 100%)' },
  { id: 'sunset', label: 'غروب', css: 'linear-gradient(135deg, #7C2D12 0%, #DB2777 100%)' },
  { id: 'royal', label: 'ملكي', css: 'linear-gradient(135deg, #311042 0%, #6D28D9 100%)' },
];

const TEXT_COLORS = ['#FFFFFF', '#60A5FA', '#FDE047', '#34D399', '#FB7185', '#0F172A'];

export function CreateStoryModal({ isOpen, onClose }: CreateStoryModalProps) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'media' | 'text'>('media');
  const [mediaURL, setMediaURL] = useState('');
  const [mediaMetadata, setMediaMetadata] = useState<import('../../types').MediaMetadata | undefined>(undefined);
  const [localPreviewURL, setLocalPreviewURL] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaScale, setMediaScale] = useState(1);
  const [mediaOffsetX, setMediaOffsetX] = useState(0);
  const [mediaOffsetY, setMediaOffsetY] = useState(0);
  const [overlayText, setOverlayText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [bgStyle, setBgStyle] = useState(BG_PRESETS[0].css);
  const [textPosition, setTextPosition] = useState<'top' | 'center' | 'bottom'>('center');
  const [caption, setCaption] = useState('');

  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadHandleRef = useRef<UploadControlHandle | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    return () => {
      uploadHandleRef.current?.cancel();
      revokeLocalPreview(localPreviewURL);
    };
  }, []);

  const clearMedia = () => {
    uploadHandleRef.current?.cancel();
    uploadHandleRef.current = null;
    revokeLocalPreview(localPreviewURL);
    setLocalPreviewURL(null);
    setMediaURL('');
    setMediaScale(1);
    setMediaOffsetX(0);
    setMediaOffsetY(0);
    setIsUploading(false);
    setUploadProgress(null);
    setUploadError(null);
  };

  const startUpload = async (file: File) => {
    const validation = validateMediaFile(file, { allowImages: true, allowVideos: true, allowAudio: false });
    if (!validation.isValid) {
      setUploadError(validation.error || 'الملف غير صالح');
      showToast(validation.error || 'الملف غير صالح', 'error');
      return;
    }

    lastFileRef.current = file;
    revokeLocalPreview(localPreviewURL);
    const localUrl = createLocalPreview(file);
    setLocalPreviewURL(localUrl);
    setMediaType(validation.kind === 'video' ? 'video' : 'image');
    setMediaURL('');
    setMediaScale(1);
    setMediaOffsetX(0);
    setMediaOffsetY(0);
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    setMediaMetadata(undefined);
    const handle = uploadMediaWithControl(file, 'stories', {
      timeoutMs: 20000,
      onProgress: (pct) => setUploadProgress(pct),
      onMetadata: (meta) => setMediaMetadata(meta),
    });
    uploadHandleRef.current = handle;

    try {
      const downloadUrl = await handle.promise;
      setMediaURL(downloadUrl);
      setUploadError(null);
      showToast('تم رفع ملف القصة بنجاح', 'success');
    } catch (err: any) {
      const msg = err?.message || 'فشل في رفع ملف القصة';
      setUploadError(msg);
      showToast(msg, 'error');
    } finally {
      uploadHandleRef.current = null;
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    await startUpload(file);
  };

  const handleClose = () => {
    clearMedia();
    setOverlayText('');
    setCaption('');
    setTextColor('#FFFFFF');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول لإضافة قصة.', 'error');
      return;
    }

    if (mode === 'media') {
      if (isUploading) {
        showToast('يرجى الانتظار حتى يكتمل رفع القصة.', 'info');
        return;
      }
      if (!isPersistentMediaUrl(mediaURL)) {
        showToast('يرجى رفع صورة أو فيديو صالح للقصة، أو التبديل إلى قصة نصية.', 'error');
        return;
      }
    } else if (!overlayText.trim()) {
      showToast('يرجى كتابة نص القصة.', 'error');
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);
      await createStory({
        authorId: currentUser.id,
        authorName: currentUser.displayName,
        authorHandle: currentUser.handle,
        authorPhotoURL: currentUser.photoURL,
        authorIsVerified: currentUser.isVerified,
        authorVerificationCategory: currentUser.verificationCategory,
        mediaURL: mode === 'media' ? mediaURL.trim() : '',
        mediaType: mode === 'media' ? mediaType : 'image',
        mediaPath: mode === 'media' ? mediaMetadata?.path : undefined,
        mediaMetadata: mode === 'media' ? mediaMetadata : undefined,
        mediaScale: mode === 'media' && mediaScale !== 1 ? mediaScale : undefined,
        mediaOffsetX: mode === 'media' && mediaOffsetX !== 0 ? mediaOffsetX : undefined,
        mediaOffsetY: mode === 'media' && mediaOffsetY !== 0 ? mediaOffsetY : undefined,
        overlayText: overlayText.trim() || undefined,
        textColor,
        bgStyle: mode === 'text' ? bgStyle : undefined,
        textPosition,
        durationSec: mediaType === 'video' ? 15 : 5,
        caption: caption.trim() || undefined,
      });

      showToast('تم نشر القصة بنجاح (صالحة لمدة 24 ساعة)', 'success');
      handleClose();
    } catch (err: any) {
      console.error('Failed to create story:', err);
      showToast(err?.message || 'تعذر نشر القصة', 'error');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const activeMediaSrc = mediaURL || localPreviewURL;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="إضافة قصة (24 ساعة)" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 font-tajawal">
        {/* Privacy Notice Banner */}
        <div className="px-3 py-2 rounded-xl bg-[#3B6DFF]/10 border border-[#3B6DFF]/25 text-[#3B6DFF] dark:text-[#60A5FA] text-[11px] font-bold flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>قصصك مرئية لمتابعيك فقط وتختفي تلقائياً بعد 24 ساعة</span>
        </div>

        {/* Story Type Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A]">
          <button
            type="button"
            onClick={() => setMode('media')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'media'
                ? 'bg-[#3B6DFF] text-white shadow'
                : 'text-slate-600 dark:text-[#94A3B8]'
            }`}
          >
            <Image className="w-4 h-4" />
            <span>صورة أو فيديو</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'text'
                ? 'bg-[#3B6DFF] text-white shadow'
                : 'text-slate-600 dark:text-[#94A3B8]'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>قصة نصية</span>
          </button>
        </div>

        {mode === 'media' ? (
          <>
            {activeMediaSrc ? (
              <div className="space-y-3">
                <div className="relative aspect-[9/14] max-h-72 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-center">
                  {mediaType === 'video' ? (
                    <video
                      src={activeMediaSrc}
                      controls
                      playsInline
                      className="w-full h-full object-cover"
                      style={{
                        transform: `translate(${mediaOffsetX}%, ${mediaOffsetY}%) scale(${mediaScale})`,
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        transform: `translate(${mediaOffsetX}%, ${mediaOffsetY}%) scale(${mediaScale})`,
                      }}
                    >
                      <MediaImage
                        src={activeMediaSrc}
                        alt="Story preview"
                        variant="story"
                        containerClassName="w-full h-full"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {overlayText.trim() && (
                    <div
                      className={`absolute inset-x-4 pointer-events-none flex justify-center ${
                        textPosition === 'top'
                          ? 'top-10'
                          : textPosition === 'bottom'
                          ? 'bottom-10'
                          : 'top-1/2 -translate-y-1/2'
                      }`}
                    >
                      <span
                        className="px-3 py-1.5 rounded-xl bg-black/60 text-sm font-bold text-center backdrop-blur-sm"
                        style={{ color: textColor }}
                      >
                        {overlayText}
                      </span>
                    </div>
                  )}

                  {isUploading && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 z-20 p-4">
                      <Loader2 className="w-6 h-6 animate-spin text-[#4F8CFF]" />
                      <span className="text-xs text-white font-mono font-bold tabular-nums">
                        {uploadProgress ?? 0}%
                      </span>
                      <button
                        type="button"
                        onClick={clearMedia}
                        className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
                      >
                        إلغاء الرفع
                      </button>
                    </div>
                  )}

                  {uploadError && !isUploading && (
                    <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center gap-2 p-4 text-center z-20">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                      <p className="text-xs text-red-100 leading-relaxed">{uploadError}</p>
                      <div className="flex items-center gap-2">
                        {lastFileRef.current && (
                          <button
                            type="button"
                            onClick={() => lastFileRef.current && startUpload(lastFileRef.current)}
                            className="px-3 py-1.5 rounded-xl bg-white text-red-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>إعادة المحاولة</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={clearMedia}
                          className="px-3 py-1.5 rounded-xl bg-black/50 text-white text-xs font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={clearMedia}
                    className="absolute top-3 end-3 px-2.5 py-1 bg-black/75 hover:bg-black text-xs text-white rounded-lg backdrop-blur-md flex items-center gap-1 cursor-pointer z-30"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>تغيير</span>
                  </button>
                </div>

                {/* Zoom & Pan Crop Controls */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <ZoomIn className="w-3.5 h-3.5 text-[#3B6DFF]" />
                      <span>تكبير وتمركز الصورة / الإطار</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaScale(1);
                        setMediaOffsetX(0);
                        setMediaOffsetY(0);
                      }}
                      className="text-[#3B6DFF] flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>إعادة ضبط</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                    <label className="space-y-1">
                      <span>التكبير ({mediaScale.toFixed(1)}x)</span>
                      <input
                        type="range"
                        min={1}
                        max={2.4}
                        step={0.1}
                        value={mediaScale}
                        onChange={(e) => setMediaScale(Number(e.target.value))}
                        className="w-full accent-[#3B6DFF]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span>أفقي ({mediaOffsetX}%)</span>
                      <input
                        type="range"
                        min={-25}
                        max={25}
                        step={1}
                        value={mediaOffsetX}
                        onChange={(e) => setMediaOffsetX(Number(e.target.value))}
                        className="w-full accent-[#3B6DFF]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span>عمودي ({mediaOffsetY}%)</span>
                      <input
                        type="range"
                        min={-25}
                        max={25}
                        step={1}
                        value={mediaOffsetY}
                        onChange={(e) => setMediaOffsetY(Number(e.target.value))}
                        className="w-full accent-[#3B6DFF]"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/60 rounded-2xl cursor-pointer bg-slate-50 dark:bg-[#161B26]/60 transition-colors">
                  <div className="flex items-center gap-2 text-[#3B6DFF] mb-2">
                    <Image className="w-6 h-6" />
                    <Video className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white text-center">
                    رفع من المعرض
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-1 text-center">
                    صورة 10MB • فيديو 30MB
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/60 rounded-2xl cursor-pointer bg-slate-50 dark:bg-[#161B26]/60 transition-colors text-center">
                  <Camera className="w-6 h-6 text-[#3B6DFF] mb-2" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">التقاط كاميرا</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div
              className="relative aspect-[9/12] max-h-64 w-full rounded-2xl overflow-hidden flex items-center justify-center p-6 text-center shadow-inner"
              style={{ background: bgStyle }}
            >
              <textarea
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                maxLength={220}
                rows={4}
                placeholder="اكتب قصتك هنا..."
                className="w-full bg-transparent border-0 placeholder-white/60 text-lg font-bold text-center focus:outline-none resize-none"
                style={{ color: textColor }}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setBgStyle(preset.css)}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold text-white shrink-0 cursor-pointer transition-transform ${
                    bgStyle === preset.css ? 'border-white scale-105 shadow' : 'border-transparent opacity-80'
                  }`}
                  style={{ background: preset.css }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Overlay Text for Media Story & Text Color Picker */}
        <div className="space-y-2">
          {mode === 'media' && (
            <input
              type="text"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              maxLength={120}
              placeholder="نص يظهر فوق الصورة/الفيديو (اختياري)..."
              className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          )}

          {(mode === 'text' || overlayText.trim()) && (
            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-[#94A3B8]">لون النص:</span>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTextColor(c)}
                    className={`w-5 h-5 rounded-full border cursor-pointer ${
                      textColor === c ? 'ring-2 ring-[#3B6DFF] scale-110' : 'border-slate-300 dark:border-[#2A2F3A]'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`لون ${c}`}
                  />
                ))}
              </div>

              {mode === 'media' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-[#94A3B8]">الموضع:</span>
                  {(['top', 'center', 'bottom'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setTextPosition(pos)}
                      className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                        textPosition === pos
                          ? 'bg-[#3B6DFF] text-white'
                          : 'bg-slate-100 dark:bg-[#161B26] text-slate-600 dark:text-[#94A3B8]'
                      }`}
                    >
                      {pos === 'top' ? 'أعلى' : pos === 'center' ? 'وسط' : 'أسفل'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Caption */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-[#94A3B8] mb-1">
            تعليق توضيحي (اختياري)
          </label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            placeholder="أضف تعليقاً أسفل القصة..."
            className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={
            loading ||
            isUploading ||
            (mode === 'media' ? !isPersistentMediaUrl(mediaURL) : !overlayText.trim())
          }
          className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-xs shadow-lg shadow-[#3B6DFF]/30 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>مشاركة في القصص</span>
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
