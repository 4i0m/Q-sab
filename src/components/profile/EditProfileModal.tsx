import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  Save,
  AlertTriangle,
  Palette,
  Lock,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { UserProfile, UserCustomization } from '../../types';
import { updateUserProfile, checkHandleAvailability } from '../../services/firestore';
import {
  uploadMediaWithControl,
  validateMediaFile,
  createLocalPreview,
  revokeLocalPreview,
  isPersistentMediaUrl,
  deleteMediaFromStorage,
  UploadControlHandle
} from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { MediaImage, Q_BANNER_PRESETS, isLegacyUnsplashUrl } from '../common/MediaImage';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdated: () => Promise<void> | void;
}

const ACCENT_OPTIONS: Array<{
  id: NonNullable<UserCustomization['accentColor']>;
  labelAr: string;
  labelEn: string;
  hex: string;
}> = [
  { id: 'sapphire', labelAr: 'أزرق Q', labelEn: 'Q Blue', hex: '#3B6DFF' },
  { id: 'gold', labelAr: 'ذهبي', labelEn: 'Gold', hex: '#F59E0B' },
  { id: 'emerald', labelAr: 'زمردي', labelEn: 'Emerald', hex: '#10B981' },
  { id: 'silver', labelAr: 'فضي', labelEn: 'Silver', hex: '#94A3B8' },
  { id: 'amethyst', labelAr: 'أرجواني', labelEn: 'Amethyst', hex: '#A855F7' },
  { id: 'crimson', labelAr: 'قرمزي', labelEn: 'Crimson', hex: '#EF4444' },
];

const PATTERN_OPTIONS: Array<{
  id: NonNullable<UserCustomization['themePattern']>;
  labelAr: string;
  labelEn: string;
  gradient: string;
}> = (['minimal', 'stars', 'castle', 'carbon'] as const).map((id) => ({
  id,
  labelAr: Q_BANNER_PRESETS[id].labelAr,
  labelEn: Q_BANNER_PRESETS[id].labelEn,
  gradient: Q_BANNER_PRESETS[id].gradient,
}));

export function EditProfileModal({
  isOpen,
  onClose,
  profile,
  onUpdated,
}: EditProfileModalProps) {
  const { showToast } = useToast();
  const { language, t } = useLanguage();

  const existingCustom = profile.customization || {};

  // Core profile fields
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [handle, setHandle] = useState(profile.handle || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [photoPath, setPhotoPath] = useState(profile.photoPath || '');
  const [bannerURL, setBannerURL] = useState(
    isLegacyUnsplashUrl(profile.bannerURL) ? '' : profile.bannerURL || ''
  );
  const [bannerPath, setBannerPath] = useState(profile.bannerPath || '');

  // Customization & quick privacy fields
  const [accentColor, setAccentColor] = useState<NonNullable<UserCustomization['accentColor']>>(
    existingCustom.accentColor || 'sapphire'
  );
  const [themePattern, setThemePattern] = useState<NonNullable<UserCustomization['themePattern']>>(
    existingCustom.themePattern || 'minimal'
  );
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>(
    existingCustom.links ? existingCustom.links.map((l) => ({ ...l })) : []
  );
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers_only'>(
    existingCustom.privacy?.profileVisibility || 'public'
  );
  const [directMessages, setDirectMessages] = useState<'everyone' | 'followers_only'>(
    existingCustom.privacy?.directMessages || 'everyone'
  );

  // Upload and loading states
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [bannerProgress, setBannerProgress] = useState<number | null>(null);
  const [bannerPreviewURL, setBannerPreviewURL] = useState<string | null>(null);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [avatarPreviewURL, setAvatarPreviewURL] = useState<string | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Validation states
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [handleError, setHandleError] = useState<string | null>(null);

  // Unsaved changes confirmation
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerUploadRef = useRef<UploadControlHandle | null>(null);
  const avatarUploadRef = useRef<UploadControlHandle | null>(null);
  const lastBannerFileRef = useRef<File | null>(null);
  const lastAvatarFileRef = useRef<File | null>(null);

  const selectedAccentHex =
    ACCENT_OPTIONS.find((opt) => opt.id === accentColor)?.hex || '#3B6DFF';

  // Check if form has unsaved modifications
  const isDirty =
    displayName !== (profile.displayName || '') ||
    handle !== (profile.handle || '') ||
    bio !== (profile.bio || '') ||
    photoURL !== (profile.photoURL || '') ||
    bannerURL !== (isLegacyUnsplashUrl(profile.bannerURL) ? '' : profile.bannerURL || '') ||
    accentColor !== (existingCustom.accentColor || 'sapphire') ||
    themePattern !== (existingCustom.themePattern || 'minimal') ||
    profileVisibility !== (existingCustom.privacy?.profileVisibility || 'public') ||
    directMessages !== (existingCustom.privacy?.directMessages || 'everyone') ||
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
        setHandleError('اسم المستخدم هذا محجوز بالفعل لعضو آخر');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [handle, profile.handle, profile.id]);

  useEffect(() => {
    return () => {
      bannerUploadRef.current?.cancel();
      avatarUploadRef.current?.cancel();
      revokeLocalPreview(bannerPreviewURL);
      revokeLocalPreview(avatarPreviewURL);
    };
  }, []);

  if (!isOpen) return null;

  const startBannerUpload = async (file: File) => {
    const validation = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
    if (!validation.isValid) {
      setBannerUploadError(validation.error || 'الملف غير صالح');
      showToast(validation.error || 'الملف غير صالح', 'error');
      return;
    }

    lastBannerFileRef.current = file;
    revokeLocalPreview(bannerPreviewURL);
    const localUrl = createLocalPreview(file);
    setBannerPreviewURL(localUrl);
    setBannerUploadError(null);
    setIsUploadingBanner(true);
    setBannerProgress(0);

    const handle = uploadMediaWithControl(file, 'banners', {
      onProgress: (progress) => setBannerProgress(progress),
      onMetadata: (meta) => setBannerPath(meta.path),
      timeoutMs: 20000,
    });
    bannerUploadRef.current = handle;

    try {
      const url = await handle.promise;
      setBannerURL(url);
      setBannerPreviewURL(null);
      revokeLocalPreview(localUrl);
      setBannerUploadError(null);
      showToast('تم رفع صورة الغلاف بنجاح', 'success');
    } catch (err: any) {
      const msg = err?.message || 'فشل في رفع الغلاف';
      setBannerUploadError(msg);
      showToast(msg, 'error');
    } finally {
      bannerUploadRef.current = null;
      setIsUploadingBanner(false);
      setBannerProgress(null);
    }
  };

  const handleBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    await startBannerUpload(file);
  };

  const startAvatarUpload = async (file: File) => {
    const validation = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
    if (!validation.isValid) {
      setAvatarUploadError(validation.error || 'الملف غير صالح');
      showToast(validation.error || 'الملف غير صالح', 'error');
      return;
    }

    lastAvatarFileRef.current = file;
    revokeLocalPreview(avatarPreviewURL);
    const localUrl = createLocalPreview(file);
    setAvatarPreviewURL(localUrl);
    setAvatarUploadError(null);
    setIsUploadingAvatar(true);
    setAvatarProgress(0);

    const handle = uploadMediaWithControl(file, 'avatars', {
      onProgress: (progress) => setAvatarProgress(progress),
      onMetadata: (meta) => setPhotoPath(meta.path),
      timeoutMs: 20000,
    });
    avatarUploadRef.current = handle;

    try {
      const url = await handle.promise;
      setPhotoURL(url);
      setAvatarPreviewURL(null);
      revokeLocalPreview(localUrl);
      setAvatarUploadError(null);
      showToast('تم رفع الصورة الشخصية بنجاح', 'success');
    } catch (err: any) {
      const msg = err?.message || 'فشل في رفع الصورة الشخصية';
      setAvatarUploadError(msg);
      showToast(msg, 'error');
    } finally {
      avatarUploadRef.current = null;
      setIsUploadingAvatar(false);
      setAvatarProgress(null);
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    await startAvatarUpload(file);
  };

  const handleResetBanner = () => {
    bannerUploadRef.current?.cancel();
    revokeLocalPreview(bannerPreviewURL);
    setBannerPreviewURL(null);
    setBannerUploadError(null);
    setBannerURL('');
    setBannerPath('');
    showToast('تمت استعادة الغلاف الافتراضي للنمط', 'info');
  };

  const handleResetAvatar = () => {
    avatarUploadRef.current?.cancel();
    revokeLocalPreview(avatarPreviewURL);
    setAvatarPreviewURL(null);
    setAvatarUploadError(null);
    setPhotoURL('');
    setPhotoPath('');
    showToast('تمت استعادة الصورة الرمزية الافتراضية', 'info');
  };

  const handleAddLink = () => {
    if (links.length >= 4) {
      showToast('الحد الأقصى هو 4 روابط شخصية', 'info');
      return;
    }
    setLinks([...links, { label: '', url: '' }]);
  };

  const handleRemoveLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const handleLinkChange = (idx: number, field: 'label' | 'url', val: string) => {
    const next = [...links];
    next[idx] = { ...next[idx], [field]: val };
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
    const validLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url);

    const safePhotoURL = isPersistentMediaUrl(photoURL) ? photoURL : '';
    const safeBannerURL = isPersistentMediaUrl(bannerURL) && !isLegacyUnsplashUrl(bannerURL) ? bannerURL : '';

    try {
      setIsSaving(true);
      await updateUserProfile(profile.id, {
        displayName: displayName.trim(),
        handle: cleanHandle,
        bio: bio.trim(),
        photoURL: safePhotoURL,
        ...(photoPath && safePhotoURL ? { photoPath } : { photoPath: '' }),
        bannerURL: safeBannerURL,
        ...(bannerPath && safeBannerURL ? { bannerPath } : { bannerPath: '' }),
        customization: {
          ...existingCustom,
          accentColor,
          themePattern,
          links: validLinks,
          privacy: {
            ...existingCustom.privacy,
            profileVisibility,
            directMessages,
          },
        },
      });

      // Best-effort cleanup of replaced user-owned Supabase media
      const replacedUrls: string[] = [];
      if (profile.photoURL && profile.photoURL !== safePhotoURL) replacedUrls.push(profile.photoURL);
      if (profile.bannerURL && profile.bannerURL !== safeBannerURL) replacedUrls.push(profile.bannerURL);
      if (replacedUrls.length > 0) {
        deleteMediaFromStorage({ urls: replacedUrls }).catch(() => {});
      }

      await onUpdated();
      showToast('تم حفظ تعديلات الملف الشخصي والتخصيص بنجاح', 'success');
      onClose();
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      showToast('تعذر حفظ التعديلات. تحقق من الاتصال.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-[#0B0F19]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal">
      <div className="w-full max-w-xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto animate-scale-up">
        {/* Top Sticky Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between bg-slate-50 dark:bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              aria-label={t('close')}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('editProfile')}</h2>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={
              isSaving ||
              isUploadingBanner ||
              isUploadingAvatar ||
              handleStatus === 'taken' ||
              handleStatus === 'invalid'
            }
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-[#3B6DFF]/25 active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{t('saveChanges')}</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* SECTION 1: Cover Banner */}
          <section className="space-y-3 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#3B6DFF]" />
                <span>{t('coverSectionTitle')}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF] text-slate-900 dark:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-[#3B6DFF]" />
                  <span>{t('changeCover')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetBanner}
                  className="p-2 rounded-xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] hover:border-red-400 text-red-500 cursor-pointer transition-colors"
                  title={t('resetDefault')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="relative h-32 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A]">
              <MediaImage
                src={bannerPreviewURL || bannerURL}
                alt={t('coverSectionTitle')}
                variant="banner"
                bannerPattern={themePattern}
                accentColor={selectedAccentHex}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
              {isUploadingBanner && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 z-20 px-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-[#4F8CFF]" />
                    <span className="text-xs text-white font-mono font-bold tabular-nums">
                      {bannerProgress || 0}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => bannerUploadRef.current?.cancel()}
                    className="px-3 py-1 rounded-lg bg-white/15 hover:bg-red-600/80 text-white text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    إلغاء الرفع
                  </button>
                </div>
              )}
            </div>
            {bannerUploadError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-2 text-[11px] text-red-600 dark:text-red-300">
                <span className="flex-1 leading-snug">{bannerUploadError}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {lastBannerFileRef.current && (
                    <button
                      type="button"
                      onClick={() => lastBannerFileRef.current && startBannerUpload(lastBannerFileRef.current)}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold cursor-pointer"
                    >
                      إعادة المحاولة
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      revokeLocalPreview(bannerPreviewURL);
                      setBannerPreviewURL(null);
                      setBannerUploadError(null);
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white font-bold cursor-pointer"
                  >
                    إخفاء
                  </button>
                </div>
              </div>
            )}
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerFile}
              className="hidden"
            />
          </section>

          {/* SECTION 2: Profile Avatar */}
          <section className="space-y-3 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#3B6DFF]" />
              <span>{t('avatarSectionTitle')}</span>
            </h3>

            <div className="flex items-center gap-4">
              <div
                className="relative w-20 h-20 rounded-full p-[2px] shrink-0"
                style={{ backgroundColor: selectedAccentHex }}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 dark:bg-[#0B0F19]">
                  <MediaImage
                    src={avatarPreviewURL || photoURL}
                    alt={t('avatarSectionTitle')}
                    variant="avatar"
                    fallbackText={displayName || profile.displayName}
                    accentColor={selectedAccentHex}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/80 rounded-2xl flex flex-col items-center justify-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin text-[#4F8CFF]" />
                    <span className="text-[10px] text-white font-mono tabular-nums">
                      {avatarProgress || 0}%
                    </span>
                    <button
                      type="button"
                      onClick={() => avatarUploadRef.current?.cancel()}
                      className="text-[9px] text-red-300 underline cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{t('changeAvatar')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAvatar}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 hover:border-red-400 hover:text-red-500 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('resetDefault')}</span>
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
            {avatarUploadError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-2 text-[11px] text-red-600 dark:text-red-300">
                <span className="flex-1 leading-snug">{avatarUploadError}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {lastAvatarFileRef.current && (
                    <button
                      type="button"
                      onClick={() => lastAvatarFileRef.current && startAvatarUpload(lastAvatarFileRef.current)}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold cursor-pointer"
                    >
                      إعادة
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      revokeLocalPreview(avatarPreviewURL);
                      setAvatarPreviewURL(null);
                      setAvatarUploadError(null);
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white font-bold cursor-pointer"
                  >
                    إخفاء
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SECTION 3: Identity & Bio */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-[#2A2F3A] pb-1.5">
              {t('identitySectionTitle')}
            </h3>

            {/* Display Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-[#94A3B8]">
                  الاسم المعروض
                </label>
                <span className="text-[10px] text-slate-500 dark:text-[#64748B] font-mono tabular-nums">
                  {displayName.length}/50
                </span>
              </div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="أدخل اسمك المعروض في Q"
                className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Username @handle with live availability check */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-[#94A3B8]">
                  اسم المستخدم (@handle)
                </label>
                <span className="text-[10px] text-slate-500 dark:text-[#64748B] font-mono tabular-nums">
                  {handle.length}/30
                </span>
              </div>
              <div className="relative">
                <span className="absolute start-3.5 top-2.5 text-xs text-slate-500 dark:text-[#64748B] font-mono">
                  @
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={30}
                  placeholder="username"
                  className={`w-full bg-slate-50 dark:bg-[#161B26] border rounded-xl ps-8 pe-10 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none transition-colors ${
                    handleStatus === 'invalid' || handleStatus === 'taken'
                      ? 'border-red-500/80 focus:border-red-500'
                      : handleStatus === 'available'
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF]'
                  }`}
                  required
                />
                <div className="absolute end-3 top-2.5">
                  {handleStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-[#3B6DFF]" />}
                  {handleStatus === 'available' && <Check className="w-4 h-4 text-emerald-500" />}
                  {(handleStatus === 'taken' || handleStatus === 'invalid') && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              {handleError && <p className="text-[11px] text-red-500 mt-1">{handleError}</p>}
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-[#94A3B8]">
                  النبذة التعريفية (Bio)
                </label>
                <span className="text-[10px] text-slate-500 dark:text-[#64748B] font-mono tabular-nums">
                  {bio.length}/160
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="اكتب نبذة شخصية واضحة ومختصرة..."
                className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none transition-colors"
              />
            </div>
          </section>

          {/* SECTION 4: Custom Links */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2F3A] pb-1.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                {t('linksSectionTitle')}
              </h3>
              {links.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="text-xs text-[#3B6DFF] hover:text-[#2B5BE5] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة رابط</span>
                </button>
              )}
            </div>

            {links.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#64748B] py-1">
                يمكنك إضافة حتى 4 روابط شخصية (موقع، محفظة أعمال، حساب رسمي).
              </p>
            ) : (
              <div className="space-y-2">
                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => handleLinkChange(idx, 'label', e.target.value)}
                      placeholder="العنوان (مثل: موقعي)"
                      className="w-1/3 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none text-start"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      className="p-2 text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
                      aria-label="Remove link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SECTION 5: Account-Specific Customization (Accent Color & Cover Pattern + Mini Preview) */}
          <section className="space-y-4 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-[#3B6DFF]" />
                <span>{t('customizationTitle')}</span>
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                <span>{displayName || profile.displayName}</span>
              </span>
            </div>

            {/* Accent Color Swatches */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-2">
                {t('accentColor')}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {ACCENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAccentColor(opt.id)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      accentColor === opt.id
                        ? 'border-[#3B6DFF] bg-white dark:bg-[#0B0F19] shadow-sm'
                        : 'border-slate-200 dark:border-[#2A2F3A] bg-white/60 dark:bg-[#0B0F19]/60 hover:border-slate-400'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-black/15"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Pattern */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-2">
                نمط الغلاف الافتراضي
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PATTERN_OPTIONS.map((pat) => (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => setThemePattern(pat.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      themePattern === pat.id
                        ? 'border-[#3B6DFF] bg-white dark:bg-[#0B0F19] text-slate-900 dark:text-white shadow-sm'
                        : 'border-slate-200 dark:border-[#2A2F3A] bg-white/60 dark:bg-[#0B0F19]/60 text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    <span className="text-[11px] font-bold block whitespace-nowrap">
                      {language === 'ar' ? pat.labelAr : pat.labelEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* SECTION 6: Quick Privacy Options */}
          <section className="space-y-3 bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#3B6DFF]" />
              <span>{t('privacyQuickTitle')}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  ظهور الملف الشخصي
                </label>
                <select
                  value={profileVisibility}
                  onChange={(e) => setProfileVisibility(e.target.value as 'public' | 'followers_only')}
                  className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                >
                  <option value="public">عام للجميع</option>
                  <option value="followers_only">المتابعون فقط</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  الرسائل الخاصة
                </label>
                <select
                  value={directMessages}
                  onChange={(e) => setDirectMessages(e.target.value as 'everyone' | 'followers_only')}
                  className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                >
                  <option value="everyone">الجميع في Q</option>
                  <option value="followers_only">المتابعون فقط</option>
                </select>
              </div>
            </div>
          </section>
        </form>

        {/* Unsaved changes confirmation dialog */}
        {showUnsavedWarning && (
          <div className="fixed inset-0 z-60 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold">{t('unsavedChangesTitle')}</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#CBD5E1] leading-relaxed">
                {t('unsavedChangesBody')}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold hover:bg-slate-200 dark:hover:bg-[#1E1E2E] transition-colors cursor-pointer"
                >
                  {t('keepEditing')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    onClose();
                  }}
                  className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('discardAndClose')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
