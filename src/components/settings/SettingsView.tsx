import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Lock,
  Bell,
  Palette,
  Globe,
  Shield,
  HelpCircle,
  Info,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Sparkles,
  ExternalLink,
  BadgeCheck,
  Check,
  Save,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Mail,
  Smartphone
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, Language } from '../../context/LanguageContext';
import { useTheme, ThemeMode, AccentColor } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { EditProfileModal } from '../profile/EditProfileModal';
import { AdminVerificationPanel } from '../admin/AdminVerificationPanel';
import { VerificationRequestModal } from '../verification/VerificationRequestModal';
import { PlatinumVerificationModal } from '../verification/PlatinumVerificationModal';
import { LegalPagesModal } from './LegalPagesModal';
import { AppealModal } from '../moderation/AppealModal';
import { QLogo } from '../common/QLogo';
import { updateUserProfile, deleteUserProfile } from '../../services/firestore';
import { sendPasswordResetEmail, deleteUser } from 'firebase/auth';
import { auth } from '../../firebase/config';

interface SettingsViewProps {
  onBack?: () => void;
  onNavigateToModeration?: () => void;
}

type ActiveSection =
  | null
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'appearance'
  | 'language'
  | 'security'
  | 'administration'
  | 'help'
  | 'about';

export function SettingsView({ onBack, onNavigateToModeration }: SettingsViewProps) {
  const { currentUser, isStaff, signOut, refreshProfile } = useAuth();
  const { language, setLanguage, isRTL, t } = useLanguage();
  const { theme, resolvedTheme, setTheme, accentColor, setAccentColor } = useTheme();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<ActiveSection>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isPlatinumModalOpen, setIsPlatinumModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Editable Account Form State
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [handle, setHandle] = useState(currentUser?.handle || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Privacy Settings State
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers_only'>(
    currentUser?.customization?.privacy?.profileVisibility || 'public'
  );
  const [dmPermission, setDmPermission] = useState<'everyone' | 'followers_only'>(
    currentUser?.customization?.privacy?.directMessages || 'everyone'
  );
  const [commentPermission, setCommentPermission] = useState<'everyone' | 'followers_only'>(
    currentUser?.customization?.privacy?.allowComments || 'everyone'
  );
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  // Notification Toggles State (stored in localStorage)
  const [notifLikes, setNotifLikes] = useState(() => localStorage.getItem('q_notif_likes') !== 'false');
  const [notifComments, setNotifComments] = useState(() => localStorage.getItem('q_notif_comments') !== 'false');
  const [notifFollows, setNotifFollows] = useState(() => localStorage.getItem('q_notif_follows') !== 'false');
  const [notifMessages, setNotifMessages] = useState(() => localStorage.getItem('q_notif_messages') !== 'false');
  const [notifAnnouncements, setNotifAnnouncements] = useState(() => localStorage.getItem('q_notif_announcements') !== 'false');

  // Password reset state
  const [isSendingReset, setIsSendingReset] = useState(false);

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;
  const BackArrow = isRTL ? ChevronRight : ChevronLeft;

  const handleLogout = async () => {
    try {
      await signOut();
      showToast('تم تسجيل الخروج بنجاح', 'info');
    } catch (err) {
      showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!displayName.trim() || !handle.trim()) {
      showToast('الاسم واسم المستخدم مطلوبان', 'error');
      return;
    }

    try {
      setIsSavingAccount(true);
      await updateUserProfile(currentUser.id, {
        displayName: displayName.trim(),
        handle: handle.trim().replace(/^@/, ''),
        bio: bio.trim(),
      });
      await refreshProfile();
      showToast('تم حفظ بيانات الحساب بنجاح ✨', 'success');
    } catch (err) {
      showToast('تعذر حفظ البيانات', 'error');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleSavePrivacy = async () => {
    if (!currentUser) return;
    try {
      setIsSavingPrivacy(true);
      const existingCustom = currentUser.customization || {};
      await updateUserProfile(currentUser.id, {
        customization: {
          ...existingCustom,
          privacy: {
            profileVisibility,
            directMessages: dmPermission,
            allowComments: commentPermission,
          },
        },
      });
      await refreshProfile();
      showToast('تم تحديث إعدادات الخصوصية بنجاح', 'success');
    } catch (err) {
      showToast('تعذر حفظ إعدادات الخصوصية', 'error');
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  const handleToggleNotification = (type: string, value: boolean, setter: (val: boolean) => void) => {
    setter(value);
    localStorage.setItem(`q_notif_${type}`, String(value));
    showToast('تم تحديث تفضيلات الإشعارات', 'info');
  };

  const handleSendPasswordReset = async () => {
    const email = currentUser?.email || auth.currentUser?.email;
    if (!email) {
      showToast('لا يوجد بريد إلكتروني مسجل لهذا الحساب', 'error');
      return;
    }
    try {
      setIsSendingReset(true);
      await sendPasswordResetEmail(auth, email);
      showToast(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email} بنجاح. تحقق من صندوق بريدك!`, 'success');
    } catch (err: any) {
      console.error('Password reset error:', err);
      showToast('تعذر إرسال الرابط. تحقق من بريدك الإلكتروني.', 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !auth.currentUser) return;
    if (deleteConfirmText.trim().toLowerCase() !== 'حذف' && deleteConfirmText.trim().toLowerCase() !== 'delete') {
      showToast('يرجى كتابة كلمة "حذف" للتأكيد', 'error');
      return;
    }

    try {
      setIsDeletingAccount(true);
      await deleteUserProfile(currentUser.id);
      await deleteUser(auth.currentUser);
      await signOut();
      showToast('تم حذف الحساب نهائياً من منصة Q', 'info');
    } catch (err: any) {
      console.error('Account deletion error:', err);
      if (err.code === 'auth/requires-recent-login') {
        showToast('لأسباب أمنية، يرجى تسجيل الخروج وتسجيل الدخول مرة أخرى قبل حذف الحساب', 'error');
      } else {
        showToast('فشل في إتمام عملية الحذف', 'error');
      }
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  // Profile data from authenticated session
  const profileName = currentUser?.displayName || 'عضو في Q';
  const profileHandle = currentUser?.handle || 'member';
  const profileAvatar = currentUser?.photoURL;
  const isVerified = Boolean(currentUser?.isVerified);

  // Administration Panel View for Staff & Admins
  if (activeSection === 'administration' && isStaff) {
    return <AdminVerificationPanel onBack={() => setActiveSection(null)} />;
  }

  // Sub-section Views
  if (activeSection) {
    return (
      <div className="w-full max-w-md mx-auto pb-24 space-y-4">
        {/* Sub-section Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-[#2A2F3A]">
          <button
            onClick={() => setActiveSection(null)}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
          >
            <BackArrow className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white font-tajawal">
            {activeSection === 'account' && 'إعدادات الحساب والملف الشخصي'}
            {activeSection === 'privacy' && 'إعدادات الخصوصية والأمان'}
            {activeSection === 'notifications' && 'تفضيلات الإشعارات'}
            {activeSection === 'appearance' && 'المظهر والسمات'}
            {activeSection === 'language' && 'اللغة / Language / Dil'}
            {activeSection === 'security' && 'الأمان والجلسات الرقمية'}
            {activeSection === 'help' && 'المساعدة والدعم الفني'}
            {activeSection === 'about' && 'حول منصة Q الاجتماعية'}
          </h1>
        </div>

        {/* 1. Account Section */}
        {activeSection === 'account' && (
          <div className="space-y-4 animate-scale-up">
            <form onSubmit={handleSaveAccount} className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-xl">
              <div>
                <label className="block text-xs font-bold text-[#94A3B8] font-tajawal mb-1.5">الاسم المعروض</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-white font-tajawal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#94A3B8] font-tajawal mb-1.5">اسم المستخدم (المعرف الرقمي)</label>
                <div className="relative">
                  <span className="absolute start-3.5 top-2.5 text-xs text-[#64748B] font-mono">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-8 pe-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#94A3B8] font-tajawal mb-1.5">البريد الإلكتروني المسجل</label>
                <input
                  type="email"
                  value={currentUser?.email || 'غير مسجل'}
                  disabled
                  className="w-full bg-[#0B0F19]/60 border border-[#2A2F3A]/60 rounded-xl px-3.5 py-2.5 text-xs text-[#64748B] font-mono cursor-not-allowed"
                />
                <span className="text-[10px] text-[#64748B] font-tajawal mt-1 block">
                  البريد الإلكتروني محمي ومربوط بحساب Firebase Auth.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#94A3B8] font-tajawal mb-1.5">النبذة الشخصية (Bio)</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={160}
                  placeholder="اكتب نبذة ملهمة عنك..."
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-white font-tajawal focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingAccount}
                className="w-full py-3 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal flex items-center justify-center gap-2 transition-all shadow-md shadow-[#3B6DFF]/25 cursor-pointer disabled:opacity-50"
              >
                {isSavingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>حفظ التعديلات</span>
              </button>
            </form>

            {/* Danger Zone */}
            <div className="bg-red-950/20 border border-red-500/30 rounded-3xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="text-xs font-bold font-tajawal">منطقة الحذف النهائي</h3>
              </div>
              <p className="text-[11px] text-[#94A3B8] font-tajawal leading-relaxed">
                حذف الحساب يؤدي إلى إزالة سجلك الشخصي ومنشوراتك بشكل نهائي من قاعدة البيانات ولا يمكن التراجع عنه.
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded-xl bg-red-900/30 hover:bg-red-900/50 border border-red-500/40 text-red-400 text-xs font-bold font-tajawal flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف حسابي نهائياً</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. Privacy Section */}
        {activeSection === 'privacy' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-5 shadow-xl animate-scale-up">
            <div>
              <label className="block text-xs font-bold text-white font-tajawal mb-2">ظهور الملف الشخصي</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProfileVisibility('public')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    profileVisibility === 'public'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  عام للجميع 🌍
                </button>
                <button
                  type="button"
                  onClick={() => setProfileVisibility('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    profileVisibility === 'followers_only'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  المتابعون فقط 🔒
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white font-tajawal mb-2">من يستطيع إرسال رسائل خاصة؟</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDmPermission('everyone')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    dmPermission === 'everyone'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  أي شخص في Q
                </button>
                <button
                  type="button"
                  onClick={() => setDmPermission('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    dmPermission === 'followers_only'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  المتابعون فقط
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white font-tajawal mb-2">من يستطيع التعليق على منشوراتك؟</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCommentPermission('everyone')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    commentPermission === 'everyone'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  الجميع
                </button>
                <button
                  type="button"
                  onClick={() => setCommentPermission('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-tajawal font-bold text-center transition-all cursor-pointer ${
                    commentPermission === 'followers_only'
                      ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                      : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/50'
                  }`}
                >
                  المتابعون فقط
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSavePrivacy}
              disabled={isSavingPrivacy}
              className="w-full py-3 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal flex items-center justify-center gap-2 transition-all shadow-md shadow-[#3B6DFF]/25 cursor-pointer disabled:opacity-50"
            >
              {isSavingPrivacy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ إعدادات الخصوصية</span>
            </button>
          </div>
        )}

        {/* 3. Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-xl animate-scale-up divide-y divide-[#2A2F3A]/60">
            <div className="flex items-center justify-between pt-2">
              <div>
                <span className="text-xs font-bold text-white font-tajawal block">الإعجابات والتفاعلات</span>
                <span className="text-[11px] text-[#94A3B8] font-tajawal">تنبيه عند تسجيل إعجاب على منشوراتك</span>
              </div>
              <input
                type="checkbox"
                checked={notifLikes}
                onChange={(e) => handleToggleNotification('likes', e.target.checked, setNotifLikes)}
                className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <span className="text-xs font-bold text-white font-tajawal block">التعليقات والردود</span>
                <span className="text-[11px] text-[#94A3B8] font-tajawal">إشعار عند إضافة تعليق أو رد</span>
              </div>
              <input
                type="checkbox"
                checked={notifComments}
                onChange={(e) => handleToggleNotification('comments', e.target.checked, setNotifComments)}
                className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <span className="text-xs font-bold text-white font-tajawal block">المتابعات الجديدة</span>
                <span className="text-[11px] text-[#94A3B8] font-tajawal">تنبيه فوري عند قيام عضو بمتابعتك</span>
              </div>
              <input
                type="checkbox"
                checked={notifFollows}
                onChange={(e) => handleToggleNotification('follows', e.target.checked, setNotifFollows)}
                className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <span className="text-xs font-bold text-white font-tajawal block">الرسائل الخاصة</span>
                <span className="text-[11px] text-[#94A3B8] font-tajawal">تنبيه عند استلام رسالة مباشرة جديدة</span>
              </div>
              <input
                type="checkbox"
                checked={notifMessages}
                onChange={(e) => handleToggleNotification('messages', e.target.checked, setNotifMessages)}
                className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <span className="text-xs font-bold text-white font-tajawal block">فعاليات وإعلانات Q الرسمية</span>
                <span className="text-[11px] text-[#94A3B8] font-tajawal">تنبيهات المسابقات والتحديات الكبرى</span>
              </div>
              <input
                type="checkbox"
                checked={notifAnnouncements}
                onChange={(e) => handleToggleNotification('announcements', e.target.checked, setNotifAnnouncements)}
                className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 4. Appearance Section */}
        {activeSection === 'appearance' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-6 shadow-xl animate-scale-up">
            {/* Theme Mode */}
            <div>
              <label className="block text-xs font-bold text-white font-tajawal mb-2.5">وضع العرض (Theme Mode)</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dark', label: 'داكن 🌙', desc: 'Midnight Navy' },
                  { id: 'light', label: 'فاتح ☀️', desc: 'Clean Light' },
                  { id: 'system', label: 'تلقائي 💻', desc: 'System' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTheme(m.id as ThemeMode)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      theme === m.id
                        ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-sm'
                        : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/40'
                    }`}
                  >
                    <span className="text-xs font-bold font-tajawal block">{m.label}</span>
                    <span className="text-[10px] text-[#64748B] block mt-0.5">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accent Color Chooser */}
            <div>
              <label className="block text-xs font-bold text-white font-tajawal mb-2.5">لون التمييز والأزرار (Accent Color)</label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: 'electric-blue', label: 'أزرق', color: '#3B6DFF' },
                  { id: 'cyan', label: 'سماوي', color: '#06B6D4' },
                  { id: 'amber', label: 'ذهبي', color: '#F59E0B' },
                  { id: 'emerald', label: 'زمردي', color: '#10B981' },
                  { id: 'purple', label: 'بنفسجي', color: '#8B5CF6' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAccentColor(c.id as AccentColor)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      accentColor === c.id ? 'border-white bg-white/10 scale-105' : 'border-[#2A2F3A] bg-[#0B0F19]'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full mb-1 shadow-md" style={{ backgroundColor: c.color }} />
                    <span className="text-[10px] text-[#94A3B8] font-tajawal font-medium">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. Language Section */}
        {activeSection === 'language' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-3 shadow-xl animate-scale-up">
            {[
              { id: 'ar', name: 'العربية', region: 'الشرق الأوسط وشمال أفريقيا (RTL)' },
              { id: 'en', name: 'English', region: 'International (LTR)' },
              { id: 'tr', name: 'Türkçe', region: 'Türkiye (LTR)' },
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLanguage(l.id as Language);
                  showToast(`تم تغيير اللغة إلى ${l.name}`, 'info');
                }}
                className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                  language === l.id
                    ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-md'
                    : 'bg-[#0B0F19] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/40'
                }`}
              >
                <div className="text-start">
                  <span className="text-sm font-bold font-tajawal block">{l.name}</span>
                  <span className="text-[10px] text-[#64748B] block">{l.region}</span>
                </div>
                {language === l.id && <Check className="w-4 h-4 text-[#4F8CFF]" />}
              </button>
            ))}
          </div>
        )}

        {/* 6. Security & Sessions Section */}
        {activeSection === 'security' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-5 shadow-xl animate-scale-up">
            <div>
              <h3 className="text-xs font-bold text-white font-tajawal mb-1">إعادة تعيين كلمة المرور</h3>
              <p className="text-[11px] text-[#94A3B8] font-tajawal leading-relaxed mb-3">
                سنرسل لك رابطاً آمناً عبر البريد الإلكتروني المعتمد لتعيين كلمة مرور جديدة لحسابك.
              </p>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="w-full py-3 rounded-xl bg-[#1E1E2E] border border-[#2A2F3A] hover:border-[#3B6DFF] text-white text-xs font-bold font-tajawal flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#4F8CFF]" />}
                <span>إرسال رابط إعادة تعيين كلمة المرور</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#2A2F3A]">
              <h3 className="text-xs font-bold text-white font-tajawal mb-2">معلومات الجلسة النشطة</h3>
              <div className="bg-[#0B0F19] border border-[#2A2F3A] rounded-2xl p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-[#94A3B8]">
                  <span>طريقة المصادقة:</span>
                  <span className="text-white">
                    {auth.currentUser?.providerData[0]?.providerId === 'google.com' ? 'Google OAuth 2.0' : 'Email & Password'}
                  </span>
                </div>
                <div className="flex justify-between text-[#94A3B8]">
                  <span>حالة التحقق من البريد:</span>
                  <span className={auth.currentUser?.emailVerified ? 'text-emerald-400' : 'text-amber-400'}>
                    {auth.currentUser?.emailVerified ? 'موثق ✅' : 'قيد التحقق ⚠️'}
                  </span>
                </div>
                <div className="flex justify-between text-[#94A3B8]">
                  <span>تاريخ الإنشاء:</span>
                  <span className="text-white">
                    {auth.currentUser?.metadata.creationTime ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString() : '2026'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. Help & Support */}
        {activeSection === 'help' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-xl animate-scale-up">
            <h3 className="text-xs font-bold text-white font-tajawal">الأسئلة الشائعة والدعم الفني</h3>
            <div className="space-y-3 text-xs font-tajawal text-[#CBD5E1]">
              <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#2A2F3A]">
                <h4 className="font-bold text-[#4F8CFF] mb-1">كيف أحصل على شارة التوثيق في Q؟</h4>
                <p className="text-[11px] text-[#94A3B8]">
                  يمكنك تقديم طلب توثيق رسمي من خيار "الشارات والتوثيق" مع إرفاق الوثائق أو الرابط المرجعي لتدقيق الهوية.
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#2A2F3A]">
                <h4 className="font-bold text-[#4F8CFF] mb-1">كيف أضمن خصوصية بياناتي؟</h4>
                <p className="text-[11px] text-[#94A3B8]">
                  جميع البيانات مشفرة وتخضع لقواعد أمان Firebase المشددة، مع تحكم كامل في من يمكنه مراسلتك أو التعليق على منشوراتك.
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#0B0F19] border border-[#2A2F3A]">
                <h4 className="font-bold text-[#4F8CFF] mb-1">فريق الدعم الفني</h4>
                <p className="text-[11px] text-[#94A3B8]">
                  للمساعدة المباشرة أو التبليغ عن مشكلة: support@q-network.app
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 8. About Section */}
        {activeSection === 'about' && (
          <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-6 text-center space-y-4 shadow-xl animate-scale-up">
            <div className="mx-auto w-16 h-16 flex items-center justify-center">
              <QLogo size={60} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-tajawal">منصة Q الاجتماعية</h3>
              <span className="text-xs text-[#4F8CFF] font-mono block mt-0.5">الإصدار 2.6.0 (2026 Production)</span>
            </div>
            <p className="text-xs text-[#94A3B8] font-tajawal leading-relaxed">
              منصة تواصل اجتماعي راقية ومبتكرة صممت للمبدعين والمفكرين بنظام واجهات فريد وهوية بصرية هندسية مستقبلية.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsLegalModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#1E1E2E] border border-[#2A2F3A] text-xs font-tajawal text-white hover:border-[#3B6DFF] transition-all cursor-pointer"
              >
                الشروط والسياسات
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#161B26] border border-red-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold font-tajawal">تأكيد حذف الحساب نهائياً</h3>
              </div>
              <p className="text-xs text-[#CBD5E1] font-tajawal leading-relaxed">
                هل أنت متأكد تماماً من رغبتك في حذف حسابك؟ سيتم حذف جميع بياناتك ومنشوراتك ومتابعاتك ولا يمكن استعادتها أبداً.
              </p>
              <div>
                <label className="block text-[11px] text-[#94A3B8] font-tajawal mb-1">
                  اكتب كلمة <span className="text-red-400 font-bold">"حذف"</span> للتأكيد:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="حذف"
                  className="w-full bg-[#0B0F19] border border-red-500/40 focus:border-red-500 rounded-xl px-3 py-2 text-xs text-white text-center font-bold font-tajawal focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingAccount}
                  className="py-2.5 rounded-xl bg-[#1E1E2E] border border-[#2A2F3A] text-white text-xs font-bold font-tajawal hover:bg-[#2A2F3A] transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount || (deleteConfirmText.trim().toLowerCase() !== 'حذف' && deleteConfirmText.trim().toLowerCase() !== 'delete')}
                  className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-tajawal flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>تأكيد الحذف</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main Settings Menu View (matching Screen 8 of user visual reference)
  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 relative">
      {/* Background subtle Q watermark */}
      <div className="absolute right-0 bottom-10 opacity-5 pointer-events-none -z-10 select-none">
        <QLogo size={280} />
      </div>

      {/* Top Bar matching Screen 8 */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-white font-tajawal">{t('settings')}</h1>
        </div>
      </div>

      {/* Profile Header Card matching Screen 8 */}
      <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 shadow-xl flex flex-col items-center text-center space-y-3">
        <div className="relative">
          {profileAvatar ? (
            <img
              src={profileAvatar}
              alt=""
              className="w-20 h-20 rounded-full object-cover border-2 border-[#3B6DFF] shadow-lg shadow-[#3B6DFF]/25"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#1E1E2E] border-2 border-[#3B6DFF] flex items-center justify-center text-xl font-bold text-[#4F8CFF] font-tajawal">
              {profileName.slice(0, 2)}
            </div>
          )}
          {currentUser && (
            <span className="absolute bottom-1 end-1 w-3.5 h-3.5 rounded-full bg-[#4F8CFF] border-2 border-[#161B26]" />
          )}
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5">
            <h2 className="text-base font-bold text-white font-tajawal">{profileName}</h2>
            {isVerified && (
              <VerifiedBadge category={currentUser?.verificationCategory || 'blue'} className="w-4 h-4" />
            )}
          </div>
          <span className="text-xs text-[#94A3B8] font-mono-subtle">@{profileHandle}</span>
        </div>

        {currentUser && (
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-6 py-2 rounded-xl bg-[#1E1E2E] border border-[#2A2F3A] hover:border-[#3B6DFF] text-[#F8FAFC] text-xs font-tajawal font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            تعديل الملف الشخصي والمظهر
          </button>
        )}
      </div>

      {/* Settings Menu Items matching Screen 8 */}
      <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl overflow-hidden divide-y divide-[#2A2F3A]/60 shadow-lg">
        {/* 1. ملفي الشخصي / الحساب */}
        <button
          onClick={() => setActiveSection('account')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">الحساب والملف الشخصي</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 2. الخصوصية والأمان */}
        <button
          onClick={() => setActiveSection('privacy')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">الخصوصية والأمان</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 3. الإشعارات */}
        <button
          onClick={() => setActiveSection('notifications')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">{t('notifications')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 4. المظهر */}
        <button
          onClick={() => setActiveSection('appearance')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">{t('appearance')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#94A3B8] text-xs font-tajawal">
            <span>{resolvedTheme === 'dark' ? 'داكن 🌙' : 'فاتح ☀️'}</span>
            <NextArrow className="w-4 h-4 text-[#64748B]" />
          </div>
        </button>

        {/* 5. اللغة */}
        <button
          onClick={() => setActiveSection('language')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">{t('language')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#4F8CFF] text-xs font-tajawal font-bold">
            <span>{language === 'ar' ? 'العربية' : language === 'tr' ? 'Türkçe' : 'English'}</span>
            <NextArrow className="w-4 h-4 text-[#64748B]" />
          </div>
        </button>

        {/* 6. الأمان والجلسات */}
        <button
          onClick={() => setActiveSection('security')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">الأمان والجلسات</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 7. الشارات والتوثيق */}
        <button
          onClick={() => setIsPlatinumModalOpen(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <BadgeCheck className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">الشارات والتوثيق</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 8. المساعدة والدعم */}
        <button
          onClick={() => setActiveSection('help')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">المساعدة والدعم</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* 9. حول التطبيق */}
        <button
          onClick={() => setActiveSection('about')}
          className="w-full p-4 flex items-center justify-between hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-[#94A3B8] stroke-[1.8]" />
            <span className="text-xs font-bold text-[#F8FAFC] font-tajawal">حول التطبيق</span>
          </div>
          <NextArrow className="w-4 h-4 text-[#64748B]" />
        </button>

        {/* Special Administration Section: Q Administration (visible ONLY for authorized administrators) */}
        {isStaff && (
          <button
            onClick={() => setActiveSection('administration')}
            className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-[#3B6DFF]/15 via-[#161B26] to-[#161B26] hover:bg-[#3B6DFF]/20 transition-all text-start cursor-pointer border-t border-b border-[#3B6DFF]/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#3B6DFF]/20 border border-[#3B6DFF]/40 flex items-center justify-center text-[#3B6DFF]">
                <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#4F8CFF] font-tajawal">إدارة منصة Q (Q Administration)</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-[#3B6DFF] text-white text-[9px] font-mono font-bold">Admin</span>
                </div>
                <span className="text-[10px] text-[#94A3B8] block font-mono-subtle mt-0.5">
                  إدارة التوثيق والتحقق وسجلات التدقيق الأمني
                </span>
              </div>
            </div>
            <NextArrow className="w-4 h-4 text-[#4F8CFF]" />
          </button>
        )}

        {/* Staff / Moderation Dashboard (if user is admin, owner, or moderator) */}
        {isStaff && (
          <button
            onClick={onNavigateToModeration}
            className="w-full p-4 flex items-center justify-between bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/20 transition-colors text-start cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-[#4F8CFF] stroke-[1.8]" />
              <div>
                <span className="text-xs font-bold text-[#4F8CFF] font-tajawal">لوحة الإدارة والرقابة</span>
                <span className="text-[10px] text-[#94A3B8] block font-mono-subtle">
                  إدارة البلاغات والأعضاء والتوثيق
                </span>
              </div>
            </div>
            <NextArrow className="w-4 h-4 text-[#4F8CFF]" />
          </button>
        )}
      </div>

      {/* Red Logout Button matching Screen 8 */}
      {currentUser && (
        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full py-3.5 rounded-2xl bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 hover:border-red-500/50 text-red-500 hover:text-red-400 font-tajawal font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      )}

      {/* Professional Edit Profile Modal */}
      {currentUser && isEditModalOpen && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={currentUser}
          onUpdated={refreshProfile}
        />
      )}

      {/* Verification Request Modal */}
      {currentUser && isVerificationModalOpen && (
        <VerificationRequestModal
          isOpen={isVerificationModalOpen}
          onClose={() => setIsVerificationModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Moderation Appeal Modal */}
      {currentUser && isAppealModalOpen && (
        <AppealModal
          isOpen={isAppealModalOpen}
          onClose={() => setIsAppealModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Legal & About Q Hub matching Screen 8 */}
      <LegalPagesModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />

      {/* Platinum Verification Modal */}
      <PlatinumVerificationModal
        isOpen={isPlatinumModalOpen}
        onClose={() => setIsPlatinumModalOpen(false)}
      />
    </div>
  );
}
