import { useState, useEffect } from 'react';
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
  BadgeCheck,
  Check,
  Save,
  Trash2,
  KeyRound,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, Language } from '../../context/LanguageContext';
import { useTheme, ThemeMode, AccentColor } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge, VerificationStatusIndicator } from '../common/VerifiedBadge';
import { EditProfileModal } from '../profile/EditProfileModal';
import { AdminVerificationPanel } from '../admin/AdminVerificationPanel';
import { VerificationRequestModal } from '../verification/VerificationRequestModal';
import { LegalPagesModal } from './LegalPagesModal';
import { AppealModal } from '../moderation/AppealModal';
import { QLogo } from '../common/QLogo';
import { MediaImage } from '../common/MediaImage';
import { updateUserProfile, deleteUserProfile, checkHandleAvailability } from '../../services/firestore';
import { sendPasswordResetEmail, deleteUser } from 'firebase/auth';
import { auth } from '../../firebase/config';

interface SettingsViewProps {
  onBack?: () => void;
  onNavigateToModeration?: () => void;
  onSelectUserForProfile?: (userId: string) => void;
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

export function SettingsView({
  onBack,
  onNavigateToModeration,
  onSelectUserForProfile,
}: SettingsViewProps) {
  const { currentUser, isAdmin, isStaff, signOut, refreshProfile } = useAuth();
  const { language, setLanguage, isRTL, t } = useLanguage();
  const { theme, resolvedTheme, setTheme, accentColor, setAccentColor } = useTheme();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<ActiveSection>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
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

  // Notification Toggles State
  const [notifLikes, setNotifLikes] = useState(() => localStorage.getItem('q_notif_likes') !== 'false');
  const [notifComments, setNotifComments] = useState(() => localStorage.getItem('q_notif_comments') !== 'false');
  const [notifFollows, setNotifFollows] = useState(() => localStorage.getItem('q_notif_follows') !== 'false');
  const [notifMessages, setNotifMessages] = useState(() => localStorage.getItem('q_notif_messages') !== 'false');
  const [notifAnnouncements, setNotifAnnouncements] = useState(
    () => localStorage.getItem('q_notif_announcements') !== 'false'
  );
  const [notifSound, setNotifSound] = useState(() => localStorage.getItem('q_notif_sound') !== 'false');

  // Chat Display Preferences State
  const [chatUseRoomTheme, setChatUseRoomTheme] = useState<boolean>(
    currentUser?.customization?.chatPreferences?.useRoomTheme ?? true
  );
  const [chatBubbleTheme, setChatBubbleTheme] = useState<'classic' | 'glass' | 'minimal' | 'gold'>(
    currentUser?.customization?.chatPreferences?.bubbleTheme || 'classic'
  );
  const [isSavingChatPrefs, setIsSavingChatPrefs] = useState(false);

  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setDisplayName(currentUser.displayName || '');
    setHandle(currentUser.handle || '');
    setBio(currentUser.bio || '');
    setProfileVisibility(currentUser.customization?.privacy?.profileVisibility || 'public');
    setDmPermission(currentUser.customization?.privacy?.directMessages || 'everyone');
    setCommentPermission(currentUser.customization?.privacy?.allowComments || 'everyone');
    const storedNotifs = currentUser.customization?.notifications;
    if (storedNotifs) {
      setNotifLikes(storedNotifs.likes ?? true);
      setNotifComments(storedNotifs.comments ?? true);
      setNotifFollows(storedNotifs.follows ?? true);
      setNotifMessages(storedNotifs.messages ?? true);
      setNotifAnnouncements(storedNotifs.announcements ?? true);
      setNotifSound(storedNotifs.sound ?? true);
    }
    const storedChatPrefs = currentUser.customization?.chatPreferences;
    if (storedChatPrefs) {
      setChatUseRoomTheme(storedChatPrefs.useRoomTheme ?? true);
      if (storedChatPrefs.bubbleTheme) {
        setChatBubbleTheme(storedChatPrefs.bubbleTheme);
      }
    }
  }, [currentUser]);

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
    const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
    if (!displayName.trim() || !cleanHandle) {
      showToast('الاسم واسم المستخدم مطلوبان', 'error');
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(cleanHandle)) {
      showToast('اسم المستخدم يجب أن يتكون من 3 إلى 30 حرفاً إنجليزياً أو أرقاماً أو _ فقط', 'error');
      return;
    }

    try {
      setIsSavingAccount(true);
      const available = await checkHandleAvailability(cleanHandle, currentUser.id);
      if (!available) {
        showToast('اسم المستخدم هذا مستخدم بالفعل، اختر معرفاً آخر', 'error');
        return;
      }
      await updateUserProfile(currentUser.id, {
        displayName: displayName.trim(),
        handle: cleanHandle,
        bio: bio.trim(),
      });
      await refreshProfile();
      showToast('تم حفظ بيانات الحساب بنجاح', 'success');
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

  const handleToggleNotification = async (
    type: 'likes' | 'comments' | 'follows' | 'messages' | 'announcements' | 'sound',
    value: boolean,
    setter: (val: boolean) => void
  ) => {
    setter(value);
    localStorage.setItem(`q_notif_${type}`, String(value));
    if (!currentUser) return;
    const nextNotifs = {
      likes: type === 'likes' ? value : notifLikes,
      comments: type === 'comments' ? value : notifComments,
      follows: type === 'follows' ? value : notifFollows,
      messages: type === 'messages' ? value : notifMessages,
      announcements: type === 'announcements' ? value : notifAnnouncements,
      sound: type === 'sound' ? value : notifSound,
    };
    try {
      await updateUserProfile(currentUser.id, {
        customization: {
          ...(currentUser.customization || {}),
          notifications: nextNotifs,
        },
      });
      await refreshProfile();
      showToast('تم حفظ تفضيلات الإشعارات', 'success');
    } catch {
      showToast('تم حفظ التفضيل محلياً وتعذر مزامنته سحابياً', 'info');
    }
  };

  const handleSaveChatPreferences = async (
    nextUseRoomTheme: boolean,
    nextBubbleTheme: 'classic' | 'glass' | 'minimal' | 'gold'
  ) => {
    setChatUseRoomTheme(nextUseRoomTheme);
    setChatBubbleTheme(nextBubbleTheme);
    if (!currentUser) return;
    try {
      setIsSavingChatPrefs(true);
      await updateUserProfile(currentUser.id, {
        customization: {
          ...(currentUser.customization || {}),
          chatPreferences: {
            ...(currentUser.customization?.chatPreferences || {}),
            useRoomTheme: nextUseRoomTheme,
            bubbleTheme: nextBubbleTheme,
          },
        },
      });
      await refreshProfile();
      showToast('تم تحديث مظهر الدردشة الشخصي', 'success');
    } catch {
      showToast('تعذر حفظ تفضيلات الدردشة', 'error');
    } finally {
      setIsSavingChatPrefs(false);
    }
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
      showToast(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}`, 'success');
    } catch (err: any) {
      showToast('تعذر إرسال الرابط. تحقق من بريدك الإلكتروني.', 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !auth.currentUser) return;
    if (
      deleteConfirmText.trim().toLowerCase() !== 'حذف' &&
      deleteConfirmText.trim().toLowerCase() !== 'delete'
    ) {
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
      if (err.code === 'auth/requires-recent-login') {
        showToast('لأسباب أمنية، يرجى إعادة تسجيل الدخول قبل حذف الحساب', 'error');
      } else {
        showToast('فشل في إتمام عملية الحذف', 'error');
      }
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const profileName = currentUser?.displayName || 'عضو في Q';
  const profileHandle = currentUser?.handle || 'member';
  const profileAvatar = currentUser?.photoURL;
  const isVerified = Boolean(currentUser?.isVerified);

  // Q Administration Panel — STRICTLY Admin & Owner ONLY (never moderators)
  if (activeSection === 'administration' && isAdmin) {
    return (
      <AdminVerificationPanel
        onBack={() => setActiveSection(null)}
        onSelectUserForProfile={onSelectUserForProfile}
        onOpenModerationHub={onNavigateToModeration}
      />
    );
  }

  // Sub-section Views
  if (activeSection) {
    return (
      <div className="w-full max-w-xl mx-auto pb-24 space-y-4 font-tajawal">
        {/* Sub-section Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-[#2A2F3A]">
          <button
            onClick={() => setActiveSection(null)}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <BackArrow className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            {activeSection === 'account' && t('accountSettings')}
            {activeSection === 'privacy' && t('privacySettings')}
            {activeSection === 'notifications' && t('notificationSettings')}
            {activeSection === 'appearance' && t('appearance')}
            {activeSection === 'language' && t('language')}
            {activeSection === 'security' && t('security')}
            {activeSection === 'help' && t('helpAndSupport')}
            {activeSection === 'about' && t('aboutApp')}
          </h1>
        </div>

        {/* 1. Account Section */}
        {activeSection === 'account' && (
          <div className="space-y-4 animate-scale-up">
            <form
              onSubmit={handleSaveAccount}
              className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-sm"
            >
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-[#94A3B8] mb-1.5">
                  الاسم المعروض
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-[#94A3B8] mb-1.5">
                  اسم المستخدم (@handle)
                </label>
                <div className="relative">
                  <span className="absolute start-3.5 top-2.5 text-xs text-slate-500 font-mono">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-8 pe-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-[#94A3B8] mb-1.5">
                  البريد الإلكتروني المسجل
                </label>
                <input
                  type="email"
                  value={currentUser?.email || auth.currentUser?.email || '—'}
                  disabled
                  className="w-full bg-slate-100 dark:bg-[#0B0F19]/60 border border-slate-200 dark:border-[#2A2F3A]/60 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 dark:text-[#64748B] font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-[#94A3B8] mb-1.5">
                  النبذة الشخصية (Bio)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={160}
                  placeholder="اكتب نبذة مختصرة عنك..."
                  className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingAccount}
                className="w-full py-3 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{t('saveChanges')}</span>
              </button>
            </form>

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 rounded-3xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="text-xs font-bold">{t('dangerZone')}</h3>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                حذف الحساب يزيل ملفك الشخصي ومنشوراتك بشكل دائم ولا يمكن التراجع عنه.
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded-xl bg-white dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('deleteAccount')}</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. Privacy Section */}
        {activeSection === 'privacy' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-5 shadow-sm animate-scale-up">
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                ظهور الملف الشخصي
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProfileVisibility('public')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    profileVisibility === 'public'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  عام للجميع
                </button>
                <button
                  type="button"
                  onClick={() => setProfileVisibility('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    profileVisibility === 'followers_only'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  المتابعون فقط
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                من يستطيع إرسال رسائل خاصة؟
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDmPermission('everyone')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    dmPermission === 'everyone'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  الجميع في Q
                </button>
                <button
                  type="button"
                  onClick={() => setDmPermission('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    dmPermission === 'followers_only'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  المتابعون فقط
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                من يستطيع التعليق على منشوراتك؟
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCommentPermission('everyone')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    commentPermission === 'everyone'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                  }`}
                >
                  الجميع
                </button>
                <button
                  type="button"
                  onClick={() => setCommentPermission('followers_only')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                    commentPermission === 'followers_only'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
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
              className="w-full py-3 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingPrivacy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{t('saveChanges')}</span>
            </button>
          </div>
        )}

        {/* 3. Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-sm animate-scale-up divide-y divide-slate-100 dark:divide-[#2A2F3A]/60">
            {[
              { key: 'likes' as const, val: notifLikes, setter: setNotifLikes, title: 'الإعجابات والتفاعلات', desc: 'تنبيه عند تسجيل إعجاب على منشوراتك' },
              { key: 'comments' as const, val: notifComments, setter: setNotifComments, title: 'التعليقات والردود', desc: 'إشعار عند إضافة تعليق أو رد' },
              { key: 'follows' as const, val: notifFollows, setter: setNotifFollows, title: 'المتابعات الجديدة', desc: 'تنبيه فوري عند قيام عضو بمتابعتك' },
              { key: 'messages' as const, val: notifMessages, setter: setNotifMessages, title: 'الرسائل الخاصة', desc: 'تنبيه عند استلام رسالة مباشرة جديدة' },
              { key: 'announcements' as const, val: notifAnnouncements, setter: setNotifAnnouncements, title: 'فعاليات وإعلانات Q', desc: 'تنبيهات المسابقات والتحديات والبيانات الرسمية' },
              { key: 'sound' as const, val: notifSound, setter: setNotifSound, title: 'صوت التنبيهات الحية', desc: 'تشغيل نغمة صوتية خفيفة عند وصول إشعار أو بيان رسمي' },
            ].map((item, idx) => (
              <div key={item.key} className={`flex items-center justify-between ${idx === 0 ? '' : 'pt-3.5'}`}>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">{item.title}</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">{item.desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={item.val}
                  onChange={(e) => void handleToggleNotification(item.key, e.target.checked, item.setter)}
                  className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer"
                />
              </div>
            ))}
          </div>
        )}

        {/* 4. Appearance Section */}
        {activeSection === 'appearance' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-6 shadow-sm animate-scale-up">
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2.5">
                {t('theme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dark', label: t('darkTheme'), desc: 'Midnight Navy' },
                  { id: 'light', label: t('lightTheme'), desc: 'Clean Light' },
                  { id: 'system', label: t('systemTheme'), desc: 'Auto' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTheme(m.id as ThemeMode)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      theme === m.id
                        ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    <span className="text-xs font-bold block">{m.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#64748B] block mt-0.5">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2.5">
                {t('accentColor')}
              </label>
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
                      accentColor === c.id
                        ? 'border-[#3B6DFF] bg-[#3B6DFF]/10 scale-105'
                        : 'border-slate-200 dark:border-[#2A2F3A] bg-slate-50 dark:bg-[#0B0F19]'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full mb-1 shadow-sm" style={{ backgroundColor: c.color }} />
                    <span className="text-[10px] text-slate-700 dark:text-[#94A3B8] font-medium">
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {currentUser && (
              <div className="pt-4 border-t border-slate-200 dark:border-[#2A2F3A] space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      استخدام مظهر غرف الدردشة المخصص
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                      عند التفعيل يظهر لك تصميم مالك الغرفة؛ وعند الإيقاف يُطبق نمط فقاعاتك الشخصي
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={isSavingChatPrefs}
                    checked={chatUseRoomTheme}
                    onChange={(e) => void handleSaveChatPreferences(e.target.checked, chatBubbleTheme)}
                    className="w-5 h-5 accent-[#3B6DFF] rounded cursor-pointer shrink-0"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                    نمط فقاعات المحادثة الشخصي
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'classic', label: 'كلاسيكي', desc: 'أزرق Q الأصلي' },
                        { id: 'glass', label: 'زجاجي', desc: 'شفافية ناعمة' },
                        { id: 'minimal', label: 'بسيط', desc: 'حدود هادئة' },
                        { id: 'gold', label: 'ملكي ذهبي', desc: 'لمسة فاخرة' },
                      ] as const
                    ).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        disabled={isSavingChatPrefs}
                        onClick={() => void handleSaveChatPreferences(chatUseRoomTheme, b.id)}
                        className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                          chatBubbleTheme === b.id
                            ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white shadow-sm'
                            : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                        }`}
                      >
                        <span className="text-xs font-bold block">{b.label}</span>
                        <span className="text-[10px] text-slate-500 dark:text-[#64748B] block mt-0.5">{b.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Language Section */}
        {activeSection === 'language' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-3 shadow-sm animate-scale-up">
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
                    ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-slate-900 dark:text-white'
                    : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                }`}
              >
                <div className="text-start">
                  <span className="text-sm font-bold block">{l.name}</span>
                  <span className="text-[10px] text-slate-500 dark:text-[#64748B] block">{l.region}</span>
                </div>
                {language === l.id && <Check className="w-4 h-4 text-[#3B6DFF]" />}
              </button>
            ))}
          </div>
        )}

        {/* 6. Security & Sessions Section */}
        {activeSection === 'security' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-5 shadow-sm animate-scale-up">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1">{t('resetPassword')}</h3>
              <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed mb-3">
                سنرسل لك رابطاً آمناً عبر البريد الإلكتروني المعتمد لتعيين كلمة مرور جديدة لحسابك.
              </p>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF] text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#3B6DFF]" />}
                <span>{t('resetPassword')}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-[#2A2F3A]">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-2">معلومات الجلسة النشطة</h3>
              <div className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-500 dark:text-[#94A3B8]">
                  <span>المصادقة:</span>
                  <span className="text-slate-900 dark:text-white">
                    {auth.currentUser?.providerData[0]?.providerId === 'google.com'
                      ? 'Google OAuth 2.0'
                      : 'Email & Password'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-[#94A3B8]">
                  <span>تأكيد البريد:</span>
                  <span className={auth.currentUser?.emailVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    {auth.currentUser?.emailVerified ? 'موثق' : 'قيد التحقق'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-[#94A3B8]">
                  <span>تاريخ الإنشاء:</span>
                  <span className="text-slate-900 dark:text-white tabular-nums">
                    {auth.currentUser?.metadata.creationTime
                      ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString()
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. Help & Support */}
        {activeSection === 'help' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-sm animate-scale-up">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('helpAndSupport')}</h3>
            <div className="space-y-3 text-xs text-slate-600 dark:text-[#CBD5E1]">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A]">
                <h4 className="font-bold text-[#3B6DFF] mb-1">كيف أحصل على شارة التوثيق في Q؟</h4>
                <p className="text-[11px] text-slate-600 dark:text-[#94A3B8]">
                  افتح خيار "{t('verificationAndBadges')}" لإرسال طلب توثيق مع الروابط والإثباتات لمراجعته من قِبل الإدارة.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A]">
                <h4 className="font-bold text-[#3B6DFF] mb-1">كيف أقدم تظلماً إدارياً؟</h4>
                <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] mb-2">
                  إذا تم اتخاذ إجراء إداري بحق حسابك يمكنك تقديم طلب تظلم مباشر لمراجعته.
                </p>
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => setIsAppealModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#3B6DFF]/10 text-[#3B6DFF] text-[11px] font-bold cursor-pointer"
                  >
                    تقديم تظلم
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 8. About Section */}
        {activeSection === 'about' && (
          <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-6 text-center space-y-4 shadow-sm animate-scale-up">
            <div className="mx-auto w-16 h-16 flex items-center justify-center">
              <QLogo size={60} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">منصة Q الاجتماعية</h3>
              <span className="text-xs text-[#3B6DFF] font-mono block mt-0.5">Q Platform</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
              منصة تواصل اجتماعي حديثة بهوية زرقاء متقنة وتجربة حقيقية متصلة مباشرة بخدمات Firebase.
            </p>
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setIsLegalModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] text-xs font-bold text-slate-900 dark:text-white hover:border-[#3B6DFF] transition-all cursor-pointer"
              >
                الشروط والسياسات
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-red-300 dark:border-red-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold">تأكيد حذف الحساب نهائياً</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#CBD5E1] leading-relaxed">
                هل أنت متأكد من حذف حسابك؟ سيتم حذف ملفك الشخصي ولا يمكن استعادته.
              </p>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-[#94A3B8] mb-1">
                  اكتب <span className="text-red-600 dark:text-red-400 font-bold">"حذف"</span> للتأكيد:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="حذف"
                  className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-red-300 dark:border-red-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white text-center font-bold focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingAccount}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={
                    isDeletingAccount ||
                    (deleteConfirmText.trim().toLowerCase() !== 'حذف' &&
                      deleteConfirmText.trim().toLowerCase() !== 'delete')
                  }
                  className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{t('confirm')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {currentUser && isAppealModalOpen && (
          <AppealModal
            isOpen={isAppealModalOpen}
            onClose={() => setIsAppealModalOpen(false)}
            currentUser={currentUser}
          />
        )}

        <LegalPagesModal
          isOpen={isLegalModalOpen}
          onClose={() => setIsLegalModalOpen(false)}
        />
      </div>
    );
  }

  // Main Settings Menu
  return (
    <div className="w-full max-w-xl mx-auto pb-24 space-y-4 relative font-tajawal">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('settings')}</h1>
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-sm flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <MediaImage
            src={profileAvatar}
            alt={profileName}
            variant="avatar"
            fallbackText={profileName}
            containerClassName="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#3B6DFF] shadow-md"
            className="w-full h-full object-cover"
          />
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{profileName}</h2>
            {isVerified && (
              <VerifiedBadge category={currentUser?.verificationCategory || 'blue'} className="w-4 h-4" />
            )}
          </div>
          <span className="text-xs text-slate-500 dark:text-[#94A3B8] font-mono">@{profileHandle}</span>
        </div>

        {currentUser && (
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="min-h-[42px] px-6 py-2 rounded-xl bg-slate-100 dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF] text-slate-900 dark:text-[#F8FAFC] text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            {t('editProfile')}
          </button>
        )}
      </div>

      {/* Settings List */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl overflow-hidden divide-y divide-slate-100 dark:divide-[#2A2F3A]/60 shadow-sm">
        <button
          onClick={() => setActiveSection('account')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('account')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        <button
          onClick={() => setActiveSection('privacy')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('privacy')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        <button
          onClick={() => setActiveSection('notifications')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('notifications')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        <button
          onClick={() => setActiveSection('appearance')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('appearance')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#94A3B8] text-xs">
            <span>{resolvedTheme === 'dark' ? t('darkTheme') : t('lightTheme')}</span>
            <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
          </div>
        </button>

        <button
          onClick={() => setActiveSection('language')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('language')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#3B6DFF] text-xs font-bold">
            <span>{language === 'ar' ? 'العربية' : language === 'tr' ? 'Türkçe' : 'English'}</span>
            <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
          </div>
        </button>

        <button
          onClick={() => setActiveSection('security')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('security')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        {/* Verification & Badges — Connected directly to live VerificationRequestModal */}
        {currentUser && (
          <button
            onClick={() => setIsVerificationModalOpen(true)}
            className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <BadgeCheck className="w-5 h-5 text-[#3B6DFF]" />
              <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">
                {t('verificationAndBadges')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <VerificationStatusIndicator
                status={
                  currentUser.isVerified
                    ? 'verified'
                    : currentUser.verificationStatus || 'not_verified'
                }
                category={currentUser.verificationCategory || 'blue'}
              />
              <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
            </div>
          </button>
        )}

        <button
          onClick={() => setActiveSection('help')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">
              {t('helpAndSupport')}
            </span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        <button
          onClick={() => setActiveSection('about')}
          className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-slate-500 dark:text-[#94A3B8]" />
            <span className="text-xs font-bold text-slate-900 dark:text-[#F8FAFC]">{t('aboutApp')}</span>
          </div>
          <NextArrow className="w-4 h-4 text-slate-400 dark:text-[#64748B]" />
        </button>

        {/* Q Administration — STRICTLY visible ONLY to Admin / Owner accounts */}
        {isAdmin && (
          <button
            onClick={() => setActiveSection('administration')}
            className="w-full min-h-[64px] p-4 flex items-center justify-between bg-[#3B6DFF]/5 dark:bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/10 dark:hover:bg-[#3B6DFF]/20 transition-all text-start cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#3B6DFF]/15 border border-[#3B6DFF]/30 flex items-center justify-center text-[#3B6DFF]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#3B6DFF]">{t('qAdministration')}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#3B6DFF] text-white text-[9px] font-mono font-bold">
                    Admin
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block mt-0.5">
                  {t('qAdministrationDesc')}
                </span>
              </div>
            </div>
            <NextArrow className="w-4 h-4 text-[#3B6DFF]" />
          </button>
        )}

        {/* Staff & Delegated Moderation Hub */}
        {(isStaff || Boolean(currentUser?.globalPermissions && Object.values(currentUser.globalPermissions).some(Boolean))) &&
          onNavigateToModeration && (
          <button
            onClick={onNavigateToModeration}
            className="w-full min-h-[56px] p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1E1E2E] transition-colors text-start cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-[#3B6DFF]" />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {t('moderationCenter')}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                  مركز البلاغات والرقابة والرتب والإعلانات
                </span>
              </div>
            </div>
            <NextArrow className="w-4 h-4 text-[#3B6DFF]" />
          </button>
        )}
      </div>

      {/* Sign Out */}
      {currentUser && (
        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full min-h-[48px] py-3.5 rounded-2xl bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>
        </div>
      )}

      {currentUser && isEditModalOpen && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={currentUser}
          onUpdated={refreshProfile}
        />
      )}

      {currentUser && isVerificationModalOpen && (
        <VerificationRequestModal
          isOpen={isVerificationModalOpen}
          onClose={() => setIsVerificationModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {currentUser && isAppealModalOpen && (
        <AppealModal
          isOpen={isAppealModalOpen}
          onClose={() => setIsAppealModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      <LegalPagesModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />
    </div>
  );
}
