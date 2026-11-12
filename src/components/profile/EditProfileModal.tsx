import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  Link as LinkIcon,
  Globe,
  Sparkles,
  Save,
  AlertTriangle
} from 'lucide-react';
import { UserProfile, UserCustomization } from '../../types';
import { updateUserProfile, checkHandleAvailability } from '../../services/firestore';
import { uploadMedia, validateMediaFile } from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdated: () => Promise<void> | void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  profile,
  onUpdated,
}: EditProfileModalProps) {
  const { showToast } = useToast();
  const { isRTL, t } = useLanguage();

  // Core profile fields
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [handle, setHandle] = useState(profile.handle || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [bannerURL, setBannerURL] = useState(profile.bannerURL || '');

  // Links
  const existingCustom = profile.customization || {};
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>(
    existingCustom.links ? [...existingCustom.links] : []
  );

  // Upload and loading states
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [bannerProgress, setBannerProgress] = useState<number | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Validation states
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [handleError, setHandleError] = useState<string | null>(null);

  // Unsaved changes confirmation
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Check if form has unsaved modifications
  const isDirty =
    displayName !== (profile.displayName || '') ||
    handle !== (profile.handle || '') ||
    bio !== (profile.bio || '') ||
    photoURL !== (profile.photoURL || '') ||
    bannerURL !== (profile.bannerURL || '') ||
    JSON.stringify(links) !== JSON.stringify(existingCustom.links || []);

  // Validate handle when changed
  useEffect(() => {
    const clean = handle.trim().replace(/^@/, '');
    if (!clean) {
      setHandleStatus('invalid');
      setHandleError('اسم المستخدم مطلوب');
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(clean)) {
      setHandleStatus('invalid');
      setHandleError('يجب أن يتكون اسم المستخدم من 3 إلى 30 حرفاً إنجليزياً أو أرقام أو _');
      return;
    }

    if (clean === profile.handle) {
      setHandleStatus('available');
      setHandleError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setHandleStatus('checking');
      const isAvailable = await checkHandleAvailability(clean, profile.id);
      if (isAvailable) {
        setHandleStatus('available');
        setHandleError(null);
      } else {
        setHandleStatus('taken');
        setHandleError('اسم المستخدم هذا مستخدم بالفعل من قبل عضو آخر');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [handle, profile.handle, profile.id]);

  if (!isOpen) return null;

  const handleBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file);
    if (!validation.isValid) {
      showToast(validation.error || 'الملف غير صالح', 'error');
      if (e.target) e.target.value = '';
      return;
    }

    try {
      setIsUploadingBanner(true);
      setBannerProgress(0);
      const url = await uploadMedia(file, 'banners', (progress) => {
        setBannerProgress(progress);
      });
      setBannerURL(url);
      showToast('تم رفع صورة الغلاف بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل في رفع الغلاف', 'error');
    } finally {
      setIsUploadingBanner(false);
      setBannerProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file);
    if (!validation.isValid) {
      showToast(validation.error || 'الملف غير صالح', 'error');
      if (e.target) e.target.value = '';
      return;
    }

    try {
      setIsUploadingAvatar(true);
      setAvatarProgress(0);
      const url = await uploadMedia(file, 'avatars', (progress) => {
        setAvatarProgress(progress);
      });
      setPhotoURL(url);
      showToast('تم رفع الصورة الشخصية بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل في رفع الصورة الشخصية', 'error');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveBanner = () => {
    setBannerURL('https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80');
    showToast('تمت استعادة الغلاف الافتراضي', 'info');
  };

  const handleAddLink = () => {
    if (links.length >= 4) {
      showToast('الحد الأقصى هو 4 روابط', 'info');
      return;
    }
    setLinks([...links, { label: '', url: '' }]);
  };

  const handleRemoveLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const handleLinkChange = (idx: number, field: 'label' | 'url', val: string) => {
    const next = [...links];
    next[idx][field] = val;
    setLinks(next);
  };

  const handleClose = () => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      showToast('يرجى إدخال الاسم المعروض', 'error');
      return;
    }

    if (handleStatus === 'invalid' || handleStatus === 'taken') {
      showToast(handleError || 'اسم المستخدم غير صالح', 'error');
      return;
    }

    const cleanHandle = handle.trim().replace(/^@/, '');
    const validLinks = links.filter((l) => l.label.trim() && l.url.trim());

    try {
      setIsSaving(true);
      await updateUserProfile(profile.id, {
        displayName: displayName.trim(),
        handle: cleanHandle,
        bio: bio.trim(),
        photoURL,
        bannerURL,
        customization: {
          ...existingCustom,
          links: validLinks,
        },
      });

      await onUpdated();
      showToast('تم حفظ تعديلات الملف الشخصي بنجاح ✨', 'success');
      onClose();
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      showToast('تعذر حفظ التعديلات. تحقق من الاتصال.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#0B0F19] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto animate-scale-up">
        
        {/* Top Sticky Header */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="p-1 rounded-full text-[#94A3B8] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-white font-tajawal">تعديل الملف الشخصي</h2>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploadingBanner || isUploadingAvatar || handleStatus === 'taken' || handleStatus === 'invalid'}
            className="px-4 py-1.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal flex items-center gap-1.5 transition-all shadow-md shadow-[#3B6DFF]/30 active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>حفظ التغييرات</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-6 max-h-[82vh] overflow-y-auto">
          
          {/* SECTION 1: Banner & Avatar Visual Studio */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-white font-tajawal">
              الصور والهوية البصرية (Cover & Avatar)
            </label>

            {/* Cover Preview & Controls */}
            <div className="relative h-36 sm:h-40 rounded-2xl overflow-hidden bg-black border border-[#2A2F3A] group">
              <img
                src={bannerURL}
                alt="Banner preview"
                className="w-full h-full object-cover transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/55 transition-colors" />

              {/* Progress overlay */}
              {isUploadingBanner && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 z-20">
                  <Loader2 className="w-6 h-6 animate-spin text-[#38BDF8]" />
                  <span className="text-xs text-white font-mono font-bold">{bannerProgress || 0}% جاري رفع الغلاف...</span>
                </div>
              )}

              {/* Actions toolbar on banner */}
              <div className="absolute bottom-2.5 end-2.5 flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black text-white text-xs font-tajawal flex items-center gap-1.5 backdrop-blur-md border border-[#2A2F3A] transition-all cursor-pointer shadow-lg"
                >
                  <Camera className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>تغيير الغلاف</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className="p-1.5 rounded-xl bg-black/70 hover:bg-black text-red-400 hover:text-red-300 text-xs backdrop-blur-md border border-[#2A2F3A] transition-all cursor-pointer shadow-lg"
                  title="استعادة الافتراضي"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerFile}
                  className="hidden"
                />
              </div>

              {/* Avatar anchored on bottom edge */}
              <div className="absolute -bottom-1 start-4 translate-y-1/2 z-20">
                <div className="relative w-20 h-20 rounded-2xl p-[2px] bg-gradient-to-tr from-[#3B6DFF] to-[#38BDF8] shadow-2xl">
                  <div className="w-full h-full rounded-2xl overflow-hidden bg-[#0B0F19]">
                    <img
                      src={photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/80 rounded-2xl flex flex-col items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-[#38BDF8]" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1.5 -end-1.5 p-1.5 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-lg cursor-pointer transition-transform active:scale-90"
                    title="تغيير الصورة الشخصية"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Spacer for overlapping avatar */}
            <div className="h-9" />
          </div>

          {/* SECTION 2: Personal Information */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold text-white font-tajawal border-b border-[#2A2F3A] pb-1.5">
              المعلومات الأساسية (Identity)
            </h3>

            {/* Display Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#94A3B8] font-tajawal">الاسم المعروض</label>
                <span className="text-[10px] text-[#64748B] font-mono">{displayName.length}/50</span>
              </div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="أدخل اسمك المعروض في Q"
                className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-white font-tajawal focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Username @handle with availability validator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#94A3B8] font-tajawal">اسم المستخدم (المعرف الرقمي الفريد)</label>
                <span className="text-[10px] text-[#64748B] font-mono">{handle.length}/30</span>
              </div>
              <div className="relative">
                <span className="absolute start-3.5 top-2.5 text-xs text-[#64748B] font-mono">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={30}
                  placeholder="username"
                  className={`w-full bg-[#161B26] border rounded-xl ps-8 pe-10 py-2.5 text-xs text-white font-mono focus:outline-none transition-colors ${
                    handleStatus === 'invalid' || handleStatus === 'taken'
                      ? 'border-red-500/80 focus:border-red-500'
                      : handleStatus === 'available'
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-[#2A2F3A] focus:border-[#3B6DFF]'
                  }`}
                  required
                />
                <div className="absolute end-3 top-2.5">
                  {handleStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />}
                  {handleStatus === 'available' && <Check className="w-4 h-4 text-emerald-400" />}
                  {(handleStatus === 'taken' || handleStatus === 'invalid') && (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
              {handleError && (
                <p className="text-[11px] text-red-400 font-tajawal mt-1">{handleError}</p>
              )}
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#94A3B8] font-tajawal">النبذة التعريفية (Bio)</label>
                <span className="text-[10px] text-[#64748B] font-mono">{bio.length}/160</span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="اكتب نبذة شخصية ملهمة ومختصرة..."
                className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-white font-tajawal focus:outline-none resize-none transition-colors"
              />
            </div>
          </div>

          {/* SECTION 3: Custom Links */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-[#2A2F3A] pb-1.5">
              <h3 className="text-xs font-bold text-white font-tajawal">الروابط ومواقع التواصل (Links)</h3>
              {links.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="text-xs text-[#38BDF8] hover:text-[#4F8CFF] font-tajawal font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة رابط</span>
                </button>
              )}
            </div>

            {links.length === 0 ? (
              <p className="text-xs text-[#64748B] font-tajawal py-1">
                لم تقم بإضافة روابط بعد (مثل موقعك الشخصي، X، GitHub، إلخ).
              </p>
            ) : (
              <div className="space-y-2">
                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => handleLinkChange(idx, 'label', e.target.value)}
                      placeholder="العنوان (مثال: موقعي)"
                      className="w-1/3 bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white font-tajawal focus:outline-none"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none text-start"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      className="p-2 text-[#94A3B8] hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Unsaved changes confirmation dialog */}
        {showUnsavedWarning && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-amber-400 font-tajawal">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold">تغييرات غير محفوظة</h3>
              </div>
              <p className="text-xs text-[#CBD5E1] font-tajawal leading-relaxed">
                لديك تعديلات قيد التحرير لم تحفظ بعد. هل أنت متأكد من رغبتك في الإلغاء والخروج؟
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="py-2.5 rounded-xl bg-[#0B0F19] border border-[#2A2F3A] text-white text-xs font-bold font-tajawal hover:bg-[#1E1E2E] transition-colors cursor-pointer"
                >
                  مواصلة التعديل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    onClose();
                  }}
                  className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-tajawal transition-colors cursor-pointer"
                >
                  تجاهل والخروج
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
