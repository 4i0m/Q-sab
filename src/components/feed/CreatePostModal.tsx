import React, { useState, useRef } from 'react';
import {
  X,
  Image as ImageIcon,
  Video,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createPost } from '../../services/firestore';
import { uploadMedia, validateMediaFile } from '../../services/storage';
import { useToast } from '../../context/ToastContext';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const COMMUNITIES: readonly string[] = [
  'القرآن الكريم',
  'التقنية والذكاء الاصطناعي',
  'التطوير الذاتي والفكر',
  'العلوم والمعرفة',
  'التصميم والفنون',
  'عام'
] as const;

export function CreatePostModal({ isOpen, onClose }: CreatePostModalProps) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [content, setContent] = useState('');
  const [mediaURL, setMediaURL] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [selectedCommunity, setSelectedCommunity] = useState(COMMUNITIES[0]);
  const [isCommunityDropdownOpen, setIsCommunityDropdownOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
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
      setMediaType(type);

      const downloadUrl = await uploadMedia(file, 'posts', (progress) => {
        setUploadProgress(progress);
      });

      setMediaURL(downloadUrl);
      showToast('تم رفع الملف بنجاح إلى التخزين السحابي', 'success');
    } catch (err: any) {
      console.error('Upload failed:', err);
      showToast(err.message || 'فشل في رفع الوسائط', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveMedia = () => {
    setMediaURL('');
    setUploadProgress(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً لنشر منشور', 'error');
      return;
    }

    if (!content.trim() && !mediaURL) {
      showToast('يرجى كتابة نص أو إرفاق صورة/فيديو لنشر المنشور', 'error');
      return;
    }

    if (isUploading) {
      showToast('يرجى الانتظار حتى يكتمل رفع الملف', 'info');
      return;
    }

    try {
      setSubmitting(true);
      await createPost({
        authorId: currentUser.id,
        authorName: currentUser.displayName,
        authorHandle: currentUser.handle,
        authorPhotoURL: currentUser.photoURL,
        authorRole: currentUser.role,
        authorIsVerified: currentUser.isVerified,
        authorVerificationCategory: currentUser.verificationCategory || 'blue',
        authorLevel: currentUser.level,
        content: content.trim(),
        mediaURL: mediaURL.trim() || undefined,
        community: selectedCommunity,
        createdAt: new Date().toISOString(),
      });

      showToast('تم نشر المنشور في مجتمع Q بنجاح! ✨', 'success');
      setContent('');
      setMediaURL('');
      onClose();
    } catch (err: any) {
      console.error('Failed to create post:', err);
      showToast('تعذر نشر المنشور. تحقق من الاتصال.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#0B0F19] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto animate-scale-up">
        
        {/* Header matching Reference Design */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || isUploading}
              className="p-1 rounded-full text-[#94A3B8] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-white font-tajawal">إنشاء منشور</h2>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#94A3B8] font-tajawal font-medium">
                {currentUser.displayName}
              </span>
              <div className="w-7 h-7 rounded-full overflow-hidden border border-[#3B6DFF]/50">
                <img
                  src={
                    currentUser.photoURL ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`
                  }
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="bg-[#161B26] p-3 rounded-2xl border border-[#3B6DFF]/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-tajawal">
                <span className="text-[#38BDF8] flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  جاري رفع الملف إلى التخزين السحابي...
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

          {/* Attached Media Preview */}
          {mediaURL && !isUploading && (
            <div className="relative rounded-2xl overflow-hidden bg-black border border-[#2A2F3A] aspect-video">
              {mediaType === 'video' ? (
                <video src={mediaURL} controls className="w-full h-full object-cover" />
              ) : (
                <img src={mediaURL} alt="" className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={handleRemoveMedia}
                className="absolute top-2.5 end-2.5 p-1.5 bg-black/80 hover:bg-black text-white rounded-full backdrop-blur-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Text Area */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="ماذا يخطر ببالك؟"
            rows={mediaURL ? 4 : 6}
            maxLength={2000}
            className="w-full bg-transparent border-0 text-white placeholder-[#64748B] font-tajawal text-sm leading-relaxed focus:outline-none resize-none text-start p-1"
            autoFocus
          />

          {/* Attachment Options Toolbar */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => imageInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#161B26] border border-[#2A2F3A] hover:border-[#3B6DFF]/50 hover:bg-[#1E1E2E] transition-all cursor-pointer group disabled:opacity-50"
            >
              <ImageIcon className="w-5 h-5 text-[#4F8CFF] group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">صورة</span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e, 'image')}
                className="hidden"
              />
            </button>

            <button
              type="button"
              disabled={isUploading}
              onClick={() => videoInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#161B26] border border-[#2A2F3A] hover:border-[#3B6DFF]/50 hover:bg-[#1E1E2E] transition-all cursor-pointer group disabled:opacity-50"
            >
              <Video className="w-5 h-5 text-[#38BDF8] group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">فيديو</span>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleFileSelect(e, 'video')}
                className="hidden"
              />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCommunityDropdownOpen(!isCommunityDropdownOpen)}
                className="w-full h-full flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#161B26] border border-[#2A2F3A] hover:border-[#3B6DFF]/50 hover:bg-[#1E1E2E] transition-all cursor-pointer group"
              >
                <Users className="w-5 h-5 text-[#818CF8] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-[#F8FAFC] font-tajawal truncate max-w-[90px]">
                  {selectedCommunity}
                </span>
              </button>

              {isCommunityDropdownOpen && (
                <div className="absolute bottom-full inset-x-0 mb-2 bg-[#1E1E2E] border border-[#2A2F3A] rounded-2xl p-1.5 shadow-2xl z-30 space-y-1">
                  {COMMUNITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedCommunity(c);
                        setIsCommunityDropdownOpen(false);
                      }}
                      className={`w-full text-start px-3 py-2 rounded-xl text-xs font-tajawal transition-colors cursor-pointer ${
                        selectedCommunity === c
                          ? 'bg-[#3B6DFF] text-white font-bold'
                          : 'text-neutral-300 hover:bg-[#161B26]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || isUploading || (!content.trim() && !mediaURL)}
              className="w-full py-3.5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-tajawal font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(59,109,255,0.4)] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>نشر</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
