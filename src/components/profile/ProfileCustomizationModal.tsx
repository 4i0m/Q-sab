import React, { useState } from 'react';
import {
  X,
  Palette,
  Eye,
  Link as LinkIcon,
  Shield,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Loader2,
  Lock,
  Globe
} from 'lucide-react';
import { UserProfile, UserCustomization } from '../../types';
import { updateUserProfile, updateUserProfileCustomization } from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge, RoleBadge } from '../common/VerifiedBadge';

interface ProfileCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdated: () => Promise<void> | void;
}

const ACCENT_COLORS = [
  { id: 'gold' as const, name: 'ذهب ملكي (Royal Gold)', hex: '#F59E0B', border: 'border-amber-400', bg: 'bg-amber-400', text: 'text-amber-400' },
  { id: 'emerald' as const, name: 'زمرد فاخر (Emerald Noir)', hex: '#10B981', border: 'border-emerald-400', bg: 'bg-emerald-400', text: 'text-emerald-400' },
  { id: 'crimson' as const, name: 'قرمزي ملكي (Crimson Rose)', hex: '#EF4444', border: 'border-red-500', bg: 'bg-red-500', text: 'text-red-400' },
  { id: 'silver' as const, name: 'بلاتينيوم فضي (Platinum Silver)', hex: '#94A3B8', border: 'border-slate-300', bg: 'bg-slate-300', text: 'text-slate-200' },
  { id: 'amethyst' as const, name: 'جمشت أرجواني (Imperial Amethyst)', hex: '#A855F7', border: 'border-purple-400', bg: 'bg-purple-400', text: 'text-purple-400' },
  { id: 'sapphire' as const, name: 'ياقوت أزرق (Deep Sapphire)', hex: '#3B82F6', border: 'border-sky-400', bg: 'bg-sky-400', text: 'text-sky-400' },
];

const THEME_PATTERNS = [
  {
    id: 'castle' as const,
    name: 'قلعة داكنة (Castle Noir)',
    bgPreview: 'bg-gradient-to-r from-neutral-950 via-[#121212] to-amber-950/30',
    bannerFallback: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'stars' as const,
    name: 'سماء مرصعة (Starlight Cosmos)',
    bgPreview: 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-950 to-black',
    bannerFallback: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'minimal' as const,
    name: 'أوبسيديان نقي (Obsidian Minimal)',
    bgPreview: 'bg-black',
    bannerFallback: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'carbon' as const,
    name: 'ألياف الكربون (Carbon Geometric)',
    bgPreview: 'bg-gradient-to-br from-[#151515] to-[#0A0A0A]',
    bannerFallback: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1200&q=80'
  },
];

export function ProfileCustomizationModal({
  isOpen,
  onClose,
  profile,
  onUpdated,
}: ProfileCustomizationModalProps) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'appearance' | 'links' | 'privacy'>('appearance');

  // Form states
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [handle, setHandle] = useState(profile.handle || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [bannerURL, setBannerURL] = useState(profile.bannerURL || '');

  // Customization states
  const existingCustom = profile.customization || {};
  const [accentColor, setAccentColor] = useState<UserCustomization['accentColor']>(
    existingCustom.accentColor || 'gold'
  );
  const [themePattern, setThemePattern] = useState<UserCustomization['themePattern']>(
    existingCustom.themePattern || 'castle'
  );
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>(
    existingCustom.links || []
  );

  // Privacy states
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers_only'>(
    existingCustom.privacy?.profileVisibility || 'public'
  );
  const [directMessages, setDirectMessages] = useState<'everyone' | 'followers_only'>(
    existingCustom.privacy?.directMessages || 'everyone'
  );
  const [allowComments, setAllowComments] = useState<'everyone' | 'followers_only'>(
    existingCustom.privacy?.allowComments || 'everyone'
  );

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const currentAccent = ACCENT_COLORS.find((c) => c.id === accentColor) || ACCENT_COLORS[0];
  const currentTheme = THEME_PATTERNS.find((t) => t.id === themePattern) || THEME_PATTERNS[0];

  const handleAddLink = () => {
    if (links.length >= 3) {
      showToast('الحد الأقصى هو 3 روابط شخصية', 'info');
      return;
    }
    setLinks([...links, { label: '', url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
    const updated = [...links];
    updated[index][field] = value;
    setLinks(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.id) return;

    try {
      setSaving(true);

      const validLinks = links.filter((l) => l.label.trim() && l.url.trim());

      const customizationData: UserCustomization = {
        accentColor,
        themePattern,
        links: validLinks,
        privacy: {
          profileVisibility,
          directMessages,
          allowComments,
        },
      };

      // 1. Update basic profile info
      await updateUserProfile(profile.id, {
        displayName: displayName.trim() || profile.displayName,
        handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || profile.handle,
        bio: bio.trim(),
        photoURL: photoURL.trim() || profile.photoURL,
        bannerURL: bannerURL.trim() || profile.bannerURL,
      });

      // 2. Update advanced customization and privacy
      await updateUserProfileCustomization(profile.id, customizationData);

      showToast('تم حفظ تخصيصات الملف الشخصي بنجاح! ✨', 'success');
      await onUpdated();
      onClose();
    } catch (err) {
      showToast('تعذر حفظ التعديلات', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F19]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal">
      <div className="w-full max-w-lg bg-[#161B26] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between shrink-0 bg-[#0B0F19]/60">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#3B6DFF]" />
            <h2 className="text-sm font-bold text-white">
              تخصيص الملف الشخصي والمظهر
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Mini Preview Box */}
        <div className="p-3 bg-[#0B0F19] border-b border-[#2A2F3A] shrink-0">
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-[#3B6DFF]" />
            <span>معاينة حية للملف الشخصي (Live Preview)</span>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-[#2A2F3A] bg-[#161B26] shadow-inner">
            {/* Banner preview */}
            <div className="h-16 w-full relative overflow-hidden bg-[#0B0F19]">
              <img
                src={bannerURL || currentTheme.bannerFallback}
                alt=""
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161B26] via-transparent to-transparent" />
            </div>

            {/* Profile info preview */}
            <div className="px-3 pb-3 relative flex items-start justify-between -mt-6">
              <div className="flex items-end gap-2">
                <div
                  className={`w-12 h-12 rounded-full p-[1.5px] shrink-0 shadow-lg ${currentAccent.border} bg-[#0B0F19]`}
                >
                  <img
                    src={
                      photoURL ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName || 'User')}`
                    }
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white">
                      {displayName || 'اسم المستخدم'}
                    </span>
                    {Boolean(profile.isVerified) && (
                      <VerifiedBadge category={profile.verificationCategory || 'blue'} className="w-3 h-3" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    @{handle || profile.handle}
                  </span>
                </div>
              </div>

              <span
                className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold mt-7 ${currentAccent.border} ${currentAccent.text} bg-[#0B0F19]/80`}
              >
                لون التمييز
              </span>
            </div>

            {bio && (
              <p className="px-3 pb-2 text-[11px] text-slate-300 line-clamp-1">
                {bio}
              </p>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-[#2A2F3A] shrink-0 bg-[#0B0F19]/60">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`flex-1 py-2.5 text-xs font-bold text-center transition-all relative ${
              activeTab === 'appearance' ? 'text-[#4F8CFF]' : 'text-slate-400 hover:text-white'
            }`}
          >
            المظهر والألوان
            {activeTab === 'appearance' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#3B6DFF] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('links')}
            className={`flex-1 py-2.5 text-xs font-bold text-center transition-all relative ${
              activeTab === 'links' ? 'text-[#4F8CFF]' : 'text-slate-400 hover:text-white'
            }`}
          >
            الروابط والمعلومات
            {activeTab === 'links' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#3B6DFF] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-2.5 text-xs font-bold text-center transition-all relative ${
              activeTab === 'privacy' ? 'text-[#4F8CFF]' : 'text-slate-400 hover:text-white'
            }`}
          >
            الخصوصية والأمان
            {activeTab === 'privacy' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#3B6DFF] rounded-full" />
            )}
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
          
          {/* TAB 1: Appearance & Colors */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              {/* Color Palette Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#3B6DFF]" />
                  <span>لون التمييز الشخصي (Accent Color)</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {ACCENT_COLORS.map((col) => (
                    <button
                      type="button"
                      key={col.id}
                      onClick={() => setAccentColor(col.id)}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                        accentColor === col.id
                          ? `${col.border} bg-[#0B0F19] shadow-md`
                          : 'border-[#2A2F3A] bg-[#0B0F19]/60 hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full shadow-inner border border-black/40"
                        style={{ backgroundColor: col.hex }}
                      />
                      <span className="text-[10px] text-slate-300 truncate max-w-full">
                        {col.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Pattern Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#3B6DFF]" />
                  <span>نمط الغلاف الافتراضي (Theme Pattern)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THEME_PATTERNS.map((th) => (
                    <button
                      type="button"
                      key={th.id}
                      onClick={() => setThemePattern(th.id)}
                      className={`p-2.5 rounded-xl border text-start transition-all ${
                        themePattern === th.id
                          ? 'border-[#3B6DFF] bg-[#0B0F19] shadow-md'
                          : 'border-[#2A2F3A] bg-[#0B0F19]/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{th.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photos URLs */}
              <div className="space-y-3 pt-1 border-t border-[#2A2F3A]">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    رابط الصورة الرمزية (Avatar URL)
                  </label>
                  <input
                    type="url"
                    value={photoURL}
                    onChange={(e) => setPhotoURL(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none text-left"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    رابط صورة الغلاف المخصص (Cover Banner URL)
                  </label>
                  <input
                    type="url"
                    value={bannerURL}
                    onChange={(e) => setBannerURL(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Links & Bio */}
          {activeTab === 'links' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الاسم الظاهر
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  اسم المستخدم (Handle)
                </label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  النبذة التعريفية (Bio)
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="اكتب نبذة تعريفية حقيقية عن اهتماماتك ومجالك..."
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none resize-none"
                />
              </div>

              {/* Custom Links Section */}
              <div className="pt-2 border-t border-[#2A2F3A] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1">
                    <LinkIcon className="w-3.5 h-3.5 text-[#3B6DFF]" />
                    <span>الروابط المخصصة (حتى 3 روابط)</span>
                  </label>
                  {links.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="text-xs text-[#4F8CFF] hover:text-white flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة رابط</span>
                    </button>
                  )}
                </div>

                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => handleLinkChange(idx, 'label', e.target.value)}
                      placeholder="عنوان الرابط (مثل: موقعي)"
                      className="w-1/3 bg-[#0B0F19] border border-[#2A2F3A] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                      placeholder="https://..."
                      className="flex-1 bg-[#0B0F19] border border-[#2A2F3A] rounded-xl px-2.5 py-1.5 text-xs text-white text-left"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      className="p-1.5 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Privacy Settings */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#0B0F19]/60 border border-[#2A2F3A] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">ظهور الملف الشخصي</h4>
                    <p className="text-[11px] text-slate-400">
                      تحديد من يمكنه عرض ملفك الشخصي ومنشوراتك
                    </p>
                  </div>
                  <select
                    value={profileVisibility}
                    onChange={(e) => setProfileVisibility(e.target.value as any)}
                    className="bg-[#0B0F19] border border-[#2A2F3A] text-xs text-[#4F8CFF] rounded-xl px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="public">عام (الجميع)</option>
                    <option value="followers_only">المتابعون فقط</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#2A2F3A]">
                  <div>
                    <h4 className="text-xs font-bold text-white">الرسائل الخاصة (DM)</h4>
                    <p className="text-[11px] text-slate-400">
                      التحكم فيمن يمكنه بدء محادثة معك
                    </p>
                  </div>
                  <select
                    value={directMessages}
                    onChange={(e) => setDirectMessages(e.target.value as any)}
                    className="bg-[#0B0F19] border border-[#2A2F3A] text-xs text-[#4F8CFF] rounded-xl px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="everyone">الجميع</option>
                    <option value="followers_only">المتابعون فقط</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#2A2F3A]">
                  <div>
                    <h4 className="text-xs font-bold text-white">التعليقات على المنشورات</h4>
                    <p className="text-[11px] text-slate-400">
                      تحديد من يحق له التعليق على منشوراتك
                    </p>
                  </div>
                  <select
                    value={allowComments}
                    onChange={(e) => setAllowComments(e.target.value as any)}
                    className="bg-[#0B0F19] border border-[#2A2F3A] text-xs text-[#4F8CFF] rounded-xl px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="everyone">الجميع</option>
                    <option value="followers_only">المتابعون فقط</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Footer Submit Button */}
          <div className="pt-3 border-t border-[#2A2F3A] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-md shadow-[#3B6DFF]/25 disabled:opacity-50 flex items-center gap-1.5 transition-all active:scale-95"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
              <span>حفظ التعديلات والتخصيص</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
