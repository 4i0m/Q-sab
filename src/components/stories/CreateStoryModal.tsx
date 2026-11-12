import React, { useState } from 'react';
import { Image, Loader2, Sparkles, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { createStory } from '../../services/firestore';
import { uploadMedia, validateMediaFile } from '../../services/storage';
import { useToast } from '../../context/ToastContext';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateStoryModal({ isOpen, onClose }: CreateStoryModalProps) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [mediaURL, setMediaURL] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file);
    if (!validation.isValid) {
      showToast(validation.error || 'الملف غير صالح', 'error');
      if (e.target) e.target.value = '';
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      const downloadUrl = await uploadMedia(file, 'stories', (progress) => {
        setUploadProgress(progress);
      });
      setMediaURL(downloadUrl);
      showToast('تم رفع صورة القصة بنجاح', 'success');
    } catch (err: any) {
      console.error('Failed to upload story image:', err);
      showToast(err.message || 'فشل في رفع صورة القصة', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!mediaURL.trim()) {
      showToast('يرجى اختيار صورة للقصة', 'error');
      return;
    }

    try {
      setLoading(true);
      await createStory({
        authorId: currentUser.id,
        authorName: currentUser.displayName,
        authorHandle: currentUser.handle,
        authorPhotoURL: currentUser.photoURL,
        mediaURL: mediaURL.trim(),
        caption: caption.trim() || undefined,
      });

      showToast('تم نشر القصة بنجاح (صالحة لمدة 24 ساعة) ✨', 'success');
      setMediaURL('');
      setCaption('');
      onClose();
    } catch (err: any) {
      console.error('Failed to create story:', err);
      showToast('تعذر نشر القصة', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إضافة قصة (24 ساعة)" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Upload progress */}
        {isUploading && (
          <div className="bg-[#161B26] p-3 rounded-2xl border border-[#3B6DFF]/30 space-y-2">
            <div className="flex items-center justify-between text-xs font-tajawal">
              <span className="text-[#38BDF8] flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                جاري رفع صورة القصة...
              </span>
              <span className="text-white font-bold">{uploadProgress ?? 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#0B0F19] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#3B6DFF] to-[#38BDF8] transition-all duration-300"
                style={{ width: `${uploadProgress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Media Preview or Selector */}
        {mediaURL ? (
          <div className="relative aspect-[9/16] max-h-72 w-full rounded-2xl overflow-hidden bg-black border border-[#2A2F3A]">
            <img src={mediaURL} alt="Story preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setMediaURL('')}
              className="absolute top-3 right-3 px-2 py-1 bg-black/70 hover:bg-black text-xs text-white rounded-lg backdrop-blur-md flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              تغيير الصورة
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#2A2F3A] hover:border-[#3B6DFF]/60 rounded-2xl cursor-pointer bg-[#161B26]/60 transition-colors group">
              <Image className="w-8 h-8 text-[#4F8CFF] mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-white font-tajawal">رفع صورة من جهازك</span>
              <span className="text-[10px] text-[#94A3B8] mt-1 font-tajawal">يدعم JPG, PNG, WEBP حتى 10 ميجابايت</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        {/* Caption */}
        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5 font-tajawal">تعليق توضيحي (اختياري)</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            placeholder="أضف تعليقاً على قصتك..."
            className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || isUploading || !mediaURL}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-xs tracking-wide shadow-lg shadow-[#3B6DFF]/30 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-tajawal"
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
