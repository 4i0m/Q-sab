import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Trash2,
  Users,
  AlertTriangle,
  BadgeCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
  Clock,
  Scale,
  Activity,
  Search,
  RotateCcw,
  Ban,
  X,
  KeyRound,
  Megaphone,
  Pause,
  Play,
  Plus,
  Edit3,
  ImagePlus
} from 'lucide-react';
import {
  ModerationReport,
  UserProfile,
  UserRole,
  Post,
  VerificationRequest,
  VerificationCategory,
  AuditLog,
  ModerationAppeal,
  GlobalAdminRole,
  GlobalPermissionKey,
  PlatformAnnouncement,
  PlatformAd
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from '../common/MediaImage';
import {
  listenToReports,
  updateReportResolution,
  getAllUsers,
  listenToPosts,
  deletePostAsAdmin,
  listenToVerificationRequests,
  reviewVerificationRequest,
  updateUserVerificationDirect,
  warnUser,
  suspendUser,
  banUser,
  restoreUser,
  listenToAuditLogs,
  listenToModerationAppeals,
  decideModerationAppeal,
  listenToGlobalAdminRoles,
  performGlobalRoleAction,
  listenToPlatformAnnouncements,
  listenToPlatformAds,
  performBroadcastAction
} from '../../services/firestore';
import { uploadMedia } from '../../services/storage';
import { VerifiedBadge, RoleBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';

const GLOBAL_PERMISSION_LABELS: Array<{ key: GlobalPermissionKey; label: string }> = [
  { key: 'manageUsers', label: 'إدارة الأعضاء والعقوبات' },
  { key: 'manageRoles', label: 'إدارة الرتب والصلاحيات' },
  { key: 'manageTitles', label: 'منح وسحب الألقاب' },
  { key: 'manageVerifications', label: 'طلبات وشارات التوثيق' },
  { key: 'manageEvents', label: 'إدارة الفعاليات' },
  { key: 'manageAnnouncements', label: 'البيانات والإعلانات الرسمية' },
  { key: 'manageAds', label: 'الإعلانات الممولة' },
  { key: 'manageRooms', label: 'الرقابة على غرف الدردشة' },
  { key: 'manageWiki', label: 'تعديل صفحات الويكي' },
  { key: 'viewAuditLogs', label: 'الاطلاع على سجل الرقابة' },
];

const REPORT_TARGET_LABELS: Record<ModerationReport['targetType'], string> = {
  post: 'منشور',
  user: 'مستخدم',
  comment: 'تعليق',
  room: 'غرفة دردشة',
  room_message: 'رسالة في غرفة دردشة',
  dm_message: 'رسالة خاصة',
};

interface ModerationViewProps {
  onBack?: () => void;
}

export function ModerationView({ onBack }: ModerationViewProps) {
  const { currentUser, isStaff, isAdmin, isOwner, onlineCount } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const perms = currentUser?.globalPermissions || {};
  const hasAnyGlobalPerm = Object.values(perms).some(Boolean);
  const canAccessHub = isStaff || hasAnyGlobalPerm;
  const canVerifications = isAdmin || Boolean(perms.manageVerifications);
  const canUsers = isAdmin || Boolean(perms.manageUsers);
  const canReports = isStaff || Boolean(perms.manageUsers);
  const canRoles = isOwner || Boolean(perms.manageRoles);
  const canBroadcasts = isAdmin || Boolean(perms.manageAnnouncements || perms.manageAds);
  const canAppeals = isAdmin;
  const canLogs = isAdmin || Boolean(perms.viewAuditLogs);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'verifications' | 'reports' | 'users' | 'roles' | 'broadcasts' | 'appeals' | 'logs'
  >('overview');

  // Real data state
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [globalRoles, setGlobalRoles] = useState<GlobalAdminRole[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [ads, setAds] = useState<PlatformAd[]>([]);

  // Filter states
  const [reportFilter, setReportFilter] = useState<'pending' | 'resolved' | 'dismissed' | 'all'>('pending');
  const [verificationFilter, setVerificationFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [appealFilter, setAppealFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [userSearch, setUserSearch] = useState('');

  // Custom Global Roles Manager state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleColor, setRoleColor] = useState('#3B6DFF');
  const [rolePerms, setRolePerms] = useState<Partial<Record<GlobalPermissionKey, boolean>>>({});
  const [isSavingRole, setIsSavingRole] = useState(false);

  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignBaseRole, setAssignBaseRole] = useState<UserRole>('moderator');
  const [assignPerms, setAssignPerms] = useState<Partial<Record<GlobalPermissionKey, boolean>>>({});
  const [isAssigningRole, setIsAssigningRole] = useState(false);

  // Official Announcements & Ads Manager state
  const [broadcastKind, setBroadcastKind] = useState<'announcement' | 'ad'>(() =>
    !isAdmin && !perms.manageAnnouncements && perms.manageAds ? 'ad' : 'announcement'
  );
  const [bcTitle, setBcTitle] = useState('');
  const [bcContent, setBcContent] = useState('');
  const [bcMediaUrl, setBcMediaUrl] = useState('');
  const [bcTargetUrl, setBcTargetUrl] = useState('');
  const [bcSponsorName, setBcSponsorName] = useState('');
  const [bcCtaLabel, setBcCtaLabel] = useState('');
  const [bcPlaySound, setBcPlaySound] = useState(true);
  const [bcNotifyUsers, setBcNotifyUsers] = useState(true);
  const [bcPublishAt, setBcPublishAt] = useState('');
  const [bcExpiresAt, setBcExpiresAt] = useState('');
  const [isUploadingBcMedia, setIsUploadingBcMedia] = useState(false);
  const [isPublishingBc, setIsPublishingBc] = useState(false);
  const bcFileInputRef = useRef<HTMLInputElement>(null);

  // In-app dialog states (zero window.prompt / window.confirm)
  const [penaltyModal, setPenaltyModal] = useState<{
    type: 'warn' | 'suspend' | 'ban';
    targetUser: UserProfile;
  } | null>(null);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [rejectVerifModal, setRejectVerifModal] = useState<VerificationRequest | null>(null);
  const [rejectVerifNote, setRejectVerifNote] = useState('');
  const [appealModal, setAppealModal] = useState<{
    appeal: ModerationAppeal;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [appealNotes, setAppealNotes] = useState('');
  const [confirmDeleteReportPost, setConfirmDeleteReportPost] = useState<ModerationReport | null>(null);
  const [submittingModal, setSubmittingModal] = useState(false);

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!canAccessHub) return;

    const unsubReports = canReports ? listenToReports(setReports) : () => {};
    const unsubPosts = listenToPosts(setPosts);
    getAllUsers(100).then(setUsers);

    const unsubVerifications = canVerifications ? listenToVerificationRequests(setVerifications) : () => {};
    const unsubAppeals = canAppeals ? listenToModerationAppeals(setAppeals) : () => {};
    const unsubLogs = canLogs ? listenToAuditLogs(setAuditLogs) : () => {};
    const unsubRoles = canRoles ? listenToGlobalAdminRoles(setGlobalRoles) : () => {};
    const unsubAnnouncements = canBroadcasts ? listenToPlatformAnnouncements(setAnnouncements) : () => {};
    const unsubAds = canBroadcasts ? listenToPlatformAds(setAds) : () => {};

    return () => {
      unsubReports();
      unsubPosts();
      unsubVerifications();
      unsubAppeals();
      unsubLogs();
      unsubRoles();
      unsubAnnouncements();
      unsubAds();
    };
  }, [canAccessHub, canReports, canVerifications, canAppeals, canLogs, canRoles, canBroadcasts]);

  // Handle Verification Review
  const handleReviewVerification = async (
    req: VerificationRequest,
    status: 'approved' | 'rejected' | 'more_info_needed',
    notes: string
  ) => {
    if (!currentUser || !canVerifications) return;
    try {
      await reviewVerificationRequest(
        req.id,
        req.userId,
        req.category,
        status,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        notes
      );
      showToast(
        status === 'approved' ? 'تمت الموافقة على طلب التوثيق بنجاح.' : 'تم تحديث حالة الطلب.',
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر معالجة طلب التوثيق';
      showToast(message, 'error');
    }
  };

  // Handle Direct Badge Assignment
  const handleDirectVerificationChange = async (
    targetUser: UserProfile,
    newCategory: VerificationCategory,
    isVerified: boolean
  ) => {
    if (!currentUser || !canVerifications) return;
    if (newCategory === 'blood_red' && !isOwner) {
      showToast('فقط مالك المنصة مخول بمنح أو سحب التوثيق الملكي الدموي.', 'error');
      return;
    }

    try {
      await updateUserVerificationDirect(
        targetUser.id,
        isVerified,
        newCategory,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        'تعديل مباشر من لوحة الإدارة'
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, isVerified, verificationCategory: isVerified ? newCategory : undefined }
            : u
        )
      );
      showToast(
        isVerified ? `تم منح شارة التوثيق (${newCategory})` : 'تم إلغاء شارة التوثيق',
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر تعديل التوثيق';
      showToast(message, 'error');
    }
  };

  // Handle Penalty Submission via In-App Modal
  const submitPenaltyModal = async () => {
    if (!currentUser || !penaltyModal) return;
    const reason = penaltyReason.trim();
    if (!reason) {
      showToast('يرجى إدخال سبب الإجراء الإداري.', 'error');
      return;
    }

    const { type, targetUser } = penaltyModal;
    setSubmittingModal(true);
    try {
      const actor = {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      };
      if (type === 'warn') {
        await warnUser(targetUser.id, reason, actor);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, warningCount: (u.warningCount || 0) + 1 } : u
          )
        );
        showToast(`تم توجيه إنذار رسمي للمستخدم @${targetUser.handle}`, 'info');
      } else if (type === 'suspend') {
        await suspendUser(targetUser.id, reason, actor);
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, isSuspended: true } : u))
        );
        showToast(`تم تعليق حساب @${targetUser.handle} مؤقتاً`, 'info');
      } else {
        if (!canUsers) {
          showToast('الحظر النهائي يتطلب صلاحيات إدارة الأعضاء', 'error');
          return;
        }
        await banUser(targetUser.id, reason, actor);
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, isBanned: true } : u))
        );
        showToast(`تم حظر حساب @${targetUser.handle} نهائياً`, 'info');
      }
      setPenaltyModal(null);
      setPenaltyReason('');
    } catch {
      showToast('تعذر تنفيذ الإجراء الإداري.', 'error');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleRestoreUser = async (targetUser: UserProfile) => {
    if (!currentUser || !canUsers) return;
    try {
      await restoreUser(targetUser.id, {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, isSuspended: false, isBanned: false } : u
        )
      );
      showToast(`تم رفع العقوبة واستعادة حساب @${targetUser.handle}`, 'success');
    } catch {
      showToast('تعذر استعادة الحساب', 'error');
    }
  };

  const submitRejectVerifModal = async () => {
    if (!rejectVerifModal) return;
    const note = rejectVerifNote.trim();
    if (!note) {
      showToast('يرجى إدخال سبب الرفض.', 'error');
      return;
    }
    setSubmittingModal(true);
    try {
      await handleReviewVerification(rejectVerifModal, 'rejected', note);
      setRejectVerifModal(null);
      setRejectVerifNote('');
    } finally {
      setSubmittingModal(false);
    }
  };

  const submitAppealModal = async () => {
    if (!currentUser || !appealModal || !isAdmin) return;
    setSubmittingModal(true);
    try {
      await decideModerationAppeal(
        appealModal.appeal.id,
        appealModal.appeal.userId,
        appealModal.decision,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        appealNotes.trim()
      );
      showToast(
        appealModal.decision === 'approved' ? 'تم قبول التظلم ورفع الإجراء' : 'تم رفض التظلم',
        'info'
      );
      setAppealModal(null);
      setAppealNotes('');
    } catch {
      showToast('تعذر تسجيل قرار التظلم', 'error');
    } finally {
      setSubmittingModal(false);
    }
  };

  const confirmDeleteReportedPost = async () => {
    if (!confirmDeleteReportPost) return;
    setSubmittingModal(true);
    try {
      await deletePostAsAdmin(confirmDeleteReportPost.targetId);
      await updateReportResolution(
        confirmDeleteReportPost.id,
        'resolved',
        'تم حذف المنشور المخالف'
      );
      showToast('تم حذف المنشور المخالف', 'success');
      setConfirmDeleteReportPost(null);
    } catch {
      showToast('تعذر حذف المنشور المخالف', 'error');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleSaveCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRoles) return;
    if (!roleName.trim()) {
      showToast('يرجى إدخال اسم الرتبة.', 'error');
      return;
    }
    setIsSavingRole(true);
    try {
      await performGlobalRoleAction({
        operation: editingRoleId ? 'update_role' : 'create_role',
        roleId: editingRoleId || undefined,
        name: roleName.trim(),
        description: roleDesc.trim(),
        color: roleColor,
        permissions: rolePerms,
      });
      showToast(editingRoleId ? 'تم تحديث الرتبة بنجاح.' : 'تم إنشاء الرتبة المخصصة.', 'success');
      setEditingRoleId(null);
      setRoleName('');
      setRoleDesc('');
      setRoleColor('#3B6DFF');
      setRolePerms({});
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر حفظ الرتبة.', 'error');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteCustomRole = async (roleId: string) => {
    if (!canRoles) return;
    try {
      await performGlobalRoleAction({ operation: 'delete_role', roleId });
      showToast('تم حذف الرتبة.', 'info');
      if (editingRoleId === roleId) {
        setEditingRoleId(null);
        setRoleName('');
        setRoleDesc('');
        setRolePerms({});
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر حذف الرتبة.', 'error');
    }
  };

  const handleAssignUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRoles || !assignTargetUserId) {
      showToast('يرجى اختيار الحساب المستهدف.', 'error');
      return;
    }
    const preset = globalRoles.find((r) => r.id === assignRoleId);
    const mergedPerms = preset ? { ...preset.permissions, ...assignPerms } : assignPerms;
    setIsAssigningRole(true);
    try {
      await performGlobalRoleAction({
        operation: 'assign_user_role',
        targetUserId: assignTargetUserId,
        roleId: preset?.id || '',
        name: preset?.name || '',
        baseRole: assignBaseRole,
        permissions: mergedPerms,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === assignTargetUserId
            ? {
                ...u,
                role: assignBaseRole,
                customRoleId: preset?.id || '',
                customRoleName: preset?.name || '',
                globalPermissions: mergedPerms,
              }
            : u
        )
      );
      showToast('تم تعيين الصلاحيات والرتبة للحساب بنجاح.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تعيين الصلاحيات.', 'error');
    } finally {
      setIsAssigningRole(false);
    }
  };

  const handleUploadBroadcastImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBcMedia(true);
    try {
      const url = await uploadMedia(file, 'events');
      setBcMediaUrl(url);
      showToast('تم رفع الصورة بنجاح.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر رفع الصورة.', 'error');
    } finally {
      setIsUploadingBcMedia(false);
      if (bcFileInputRef.current) bcFileInputRef.current.value = '';
    }
  };

  const handlePublishBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBroadcasts) return;
    if (!bcTitle.trim() || !bcContent.trim()) {
      showToast('العنوان والمحتوى مطلوبان.', 'error');
      return;
    }
    setIsPublishingBc(true);
    try {
      const publishIso = bcPublishAt ? new Date(bcPublishAt).toISOString() : undefined;
      const expiresIso = bcExpiresAt ? new Date(bcExpiresAt).toISOString() : '';
      await performBroadcastAction({
        kind: broadcastKind,
        operation: 'create',
        title: bcTitle.trim(),
        content: bcContent.trim(),
        bannerURL: broadcastKind === 'announcement' ? bcMediaUrl.trim() : undefined,
        mediaURL: broadcastKind === 'ad' ? bcMediaUrl.trim() : undefined,
        targetUrl: bcTargetUrl.trim(),
        sponsorName: broadcastKind === 'ad' ? bcSponsorName.trim() : undefined,
        ctaLabel: broadcastKind === 'ad' ? bcCtaLabel.trim() : undefined,
        playSound: broadcastKind === 'announcement' ? bcPlaySound : undefined,
        publishAt: publishIso,
        expiresAt: expiresIso,
        notifyUserIds:
          broadcastKind === 'announcement' && bcNotifyUsers
            ? users.map((u) => u.id)
            : [],
      });
      showToast(
        broadcastKind === 'announcement' ? 'تم نشر البيان الرسمي بنجاح.' : 'تم نشر الإعلان المموّل بنجاح.',
        'success'
      );
      setBcTitle('');
      setBcContent('');
      setBcMediaUrl('');
      setBcTargetUrl('');
      setBcSponsorName('');
      setBcCtaLabel('');
      setBcPublishAt('');
      setBcExpiresAt('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر النشر.', 'error');
    } finally {
      setIsPublishingBc(false);
    }
  };

  const handleTogglePauseBroadcast = async (
    kind: 'announcement' | 'ad',
    id: string,
    nextPaused: boolean
  ) => {
    try {
      await performBroadcastAction({
        kind,
        operation: 'toggle_pause',
        id,
        isPaused: nextPaused,
      });
      showToast(nextPaused ? 'تم إيقاف العرض مؤقتاً.' : 'تم استئناف العرض.', 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تحديث الحالة.', 'error');
    }
  };

  const handleDeleteBroadcast = async (kind: 'announcement' | 'ad', id: string) => {
    try {
      await performBroadcastAction({
        kind,
        operation: 'delete',
        id,
      });
      showToast('تم الحذف بنجاح.', 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر الحذف.', 'error');
    }
  };

  if (!canAccessHub) {
    return (
      <div className="w-full max-w-md mx-auto py-20 text-center bg-white dark:bg-[#161B26] border border-red-500/30 rounded-3xl p-6 shadow-2xl font-tajawal">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">صلاحية محظورة</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          هذه الواجهة مخصصة لمشرفي وإداريي منصة Q المعتمدين فقط.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-tajawal">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#3B6DFF]" />
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                مركز الإدارة والرقابة الشامل
              </h1>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                الرقابة • البلاغات • التوثيق • إدارة الأعضاء
              </span>
            </div>
          </div>
        </div>

        <span className="px-3 py-1 rounded-xl bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 border border-[#3B6DFF]/30 text-xs font-bold text-[#3B6DFF] dark:text-[#4F8CFF]">
          {currentUser?.customRoleName
            ? currentUser.customRoleName
            : currentUser?.role === 'owner'
            ? 'المالك (Owner)'
            : currentUser?.role === 'admin'
            ? 'مدير عام (Admin)'
            : currentUser?.role === 'assistant_admin'
            ? 'نائب مدير'
            : currentUser?.role === 'room_leader'
            ? 'قائد غرف'
            : 'مشرف (Moderator)'}
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200 dark:border-[#2A2F3A]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>نظرة عامة</span>
        </button>

        {canVerifications && (
          <button
            onClick={() => setActiveTab('verifications')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'verifications'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BadgeCheck className="w-3.5 h-3.5" />
            <span>طلبات التوثيق ({verifications.filter((v) => v.status === 'pending').length})</span>
          </button>
        )}

        {canReports && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>البلاغات ({reports.filter((r) => r.status === 'pending').length})</span>
          </button>
        )}

        {canUsers && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>إدارة الأعضاء</span>
          </button>
        )}

        {canRoles && (
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>الرتب والصلاحيات</span>
          </button>
        )}

        {canBroadcasts && (
          <button
            onClick={() => setActiveTab('broadcasts')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'broadcasts'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>الإعلانات الرسمية</span>
          </button>
        )}

        {canAppeals && (
          <button
            onClick={() => setActiveTab('appeals')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'appeals'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>التظلمات ({appeals.filter((a) => a.status === 'pending').length})</span>
          </button>
        )}

        {canLogs && (
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>سجل الرقابة ({auditLogs.length})</span>
          </button>
        )}
      </div>

      {/* 1. OVERVIEW DASHBOARD */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                الأعضاء المسجلون
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {users.length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                المنشورات الفعلية
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {posts.length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                المتصلون الآن
              </span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{onlineCount}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                بلاغات قيد الفحص
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                {reports.filter((r) => r.status === 'pending').length}
              </div>
            </div>

            {isAdmin && (
              <>
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    طلبات التوثيق المعلقة
                  </span>
                  <div className="text-xl font-bold text-[#3B6DFF] dark:text-[#4F8CFF] mt-1 tabular-nums">
                    {verifications.filter((v) => v.status === 'pending').length}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A]">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    تظلمات قيد المراجعة
                  </span>
                  <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1 tabular-nums">
                    {appeals.filter((a) => a.status === 'pending').length}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-2">
            <h3 className="text-xs font-bold text-[#3B6DFF] dark:text-[#4F8CFF] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#3B6DFF]" />
              <span>سياسات منظومة التوثيق والرقابة</span>
            </h3>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside leading-relaxed">
              <li>التوثيق الأزرق (Blue): مخصص ومحفوظ للشخصيات العامة والحسابات المعتمدة.</li>
              <li>التوثيق الفضي (Silver): للأفراد البارزين والمهنيين والمبدعين بعد المراجعة.</li>
              <li>التوثيق المؤسسي (Institution): للشركات والمؤسسات والجهات الرسمية.</li>
              <li>التوثيق الملكي الدموي (Blood-Red): استثنائي ويقتصر حصرياً على مالك المنصة (Owner).</li>
              <li>كل إجراء رقابي يُسجل في سجل العمليات الثابت (Audit Logs) باسم المشرف وتاريخه.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 2. VERIFICATIONS QUEUE */}
      {activeTab === 'verifications' && canVerifications && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setVerificationFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] transition-all ${
                  verificationFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {st === 'pending' && 'قيد المراجعة'}
                {st === 'approved' && 'تمت الموافقة'}
                {st === 'rejected' && 'المرفوضة'}
                {st === 'all' && 'الكل'}
              </button>
            ))}
          </div>

          {verifications
            .filter((v) => verificationFilter === 'all' || v.status === verificationFilter)
            .map((req) => (
              <div
                key={req.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <VerifiedBadge category={req.category} className="w-4 h-4" />
                    <span className="text-slate-900 dark:text-white font-bold">
                      طلب توثيق (
                      {req.category === 'silver'
                        ? 'فضي - أفراد'
                        : req.category === 'institution'
                        ? 'مؤسسي - منظمات'
                        : req.category === 'blood_red'
                        ? 'دموي ملكي'
                        : 'أزرق'}
                      )
                    </span>
                  </div>
                  <span className="text-slate-500 text-[10px]">
                    {formatRelativeTime(req.createdAt)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-[#0B0F19]/80 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1.5 border border-slate-200 dark:border-[#2A2F3A]">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">مقدم الطلب:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {req.userDisplayName}
                    </span>
                    <span className="text-slate-500">@{req.userHandle}</span>
                  </div>

                  {req.legalName && (
                    <div>
                      <span className="text-slate-500">الاسم القانوني: </span>
                      <span className="text-slate-900 dark:text-white">{req.legalName}</span>
                      {req.documentType && (
                        <span className="text-slate-500 text-[10px] block">
                          نوع الوثيقة: {req.documentType}
                        </span>
                      )}
                    </div>
                  )}

                  {req.organizationName && (
                    <div>
                      <span className="text-slate-500">اسم المؤسسة: </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        {req.organizationName}
                      </span>
                      {req.officialWebsite && (
                        <a
                          href={req.officialWebsite}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#3B6DFF] dark:text-[#4F8CFF] hover:underline block text-[11px]"
                        >
                          الموقع: {req.officialWebsite}
                        </a>
                      )}
                    </div>
                  )}

                  <div>
                    <span className="text-slate-500 block mb-0.5">تفاصيل الأدلة والروابط:</span>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {req.evidenceDetails}
                    </p>
                  </div>
                </div>

                {req.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() =>
                        handleReviewVerification(req, 'approved', 'استوفى المعايير والوثائق الرسمية')
                      }
                      className="flex-1 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>اعتماد ومنح الشارة</span>
                    </button>

                    <button
                      onClick={() => {
                        setRejectVerifModal(req);
                        setRejectVerifNote('');
                      }}
                      className="py-1.5 px-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/20 text-xs font-bold transition-colors"
                    >
                      رفض
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>
                      الحالة: {req.status === 'approved' ? 'معتمد' : 'مرفوض'} • الملاحظات:{' '}
                      {req.reviewerNotes || 'لا توجد'}
                    </span>
                  </div>
                )}
              </div>
            ))}

          {verifications.length === 0 && (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                لا توجد طلبات توثيق معلقة حالياً.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 3. USER MANAGEMENT & DIRECT BADGE CONTROL */}
      {activeTab === 'users' && canUsers && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="ابحث عن عضو بالاسم أو المعرف لإدارة العقوبات أو التوثيق..."
              className="w-full bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-[#3B6DFF]"
            />
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>

          <div className="space-y-2.5">
            {users
              .filter(
                (u) =>
                  u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
                  u.handle.toLowerCase().includes(userSearch.toLowerCase())
              )
              .map((targetUser) => {
                const isUserRestricted = targetUser.isSuspended || targetUser.isBanned;

                return (
                  <div
                    key={targetUser.id}
                    className="p-3.5 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <MediaImage
                          src={targetUser.photoURL}
                          alt={targetUser.displayName}
                          variant="avatar"
                          fallbackText={targetUser.displayName}
                          containerClassName="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-[#2A2F3A] shrink-0"
                          className="w-full h-full object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {targetUser.displayName}
                            </span>
                            {Boolean(targetUser.isVerified) && (
                              <VerifiedBadge
                                category={targetUser.verificationCategory || 'blue'}
                                className="w-3.5 h-3.5"
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            @{targetUser.handle} • {targetUser.followersCount || 0} متابع
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isUserRestricted && (
                          <span className="px-2 py-0.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-300 text-[10px] font-bold">
                            {targetUser.isBanned ? 'محظور نهائياً' : 'معلق مؤقتاً'}
                          </span>
                        )}
                        <RoleBadge role={targetUser.role} />
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-[#0B0F19]/60 rounded-xl border border-slate-200 dark:border-[#2A2F3A] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-300 font-bold">
                          منظومة شارات التوثيق:
                        </span>
                        {targetUser.isVerified && (
                          <button
                            onClick={() => handleDirectVerificationChange(targetUser, 'blue', false)}
                            className="text-[10px] text-red-500 hover:text-red-400 transition-colors"
                          >
                            إلغاء التوثيق
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button
                          onClick={() => handleDirectVerificationChange(targetUser, 'blue', true)}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1 ${
                            targetUser.isVerified &&
                            (!targetUser.verificationCategory ||
                              targetUser.verificationCategory === 'blue')
                              ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF] dark:text-sky-200'
                              : 'bg-white dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <VerifiedBadge category="blue" className="w-3 h-3" />
                          <span>أزرق</span>
                        </button>

                        <button
                          onClick={() => handleDirectVerificationChange(targetUser, 'silver', true)}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1 ${
                            targetUser.isVerified && targetUser.verificationCategory === 'silver'
                              ? 'bg-slate-200 dark:bg-slate-800 border-slate-400 text-slate-900 dark:text-slate-100'
                              : 'bg-white dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <VerifiedBadge category="silver" className="w-3 h-3" />
                          <span>فضي</span>
                        </button>

                        <button
                          onClick={() =>
                            handleDirectVerificationChange(targetUser, 'institution', true)
                          }
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1 ${
                            targetUser.isVerified &&
                            targetUser.verificationCategory === 'institution'
                              ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF] dark:text-white'
                              : 'bg-white dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <VerifiedBadge category="institution" className="w-3 h-3" />
                          <span>مؤسسي</span>
                        </button>

                        <button
                          disabled={!isOwner}
                          onClick={() =>
                            handleDirectVerificationChange(targetUser, 'blood_red', true)
                          }
                          title={!isOwner ? 'خاص بالمالك فقط' : ''}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1 ${
                            targetUser.isVerified &&
                            targetUser.verificationCategory === 'blood_red'
                              ? 'bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-200'
                              : isOwner
                              ? 'bg-white dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-rose-600 dark:text-rose-400 hover:border-rose-500'
                              : 'bg-slate-100 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-400 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <VerifiedBadge category="blood_red" className="w-3 h-3" />
                          <span>ملكي</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
                      <button
                        onClick={() => {
                          setPenaltyModal({ type: 'warn', targetUser });
                          setPenaltyReason('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>إنذار ({targetUser.warningCount || 0})</span>
                      </button>

                      {!targetUser.isSuspended ? (
                        <button
                          onClick={() => {
                            setPenaltyModal({ type: 'suspend', targetUser });
                            setPenaltyReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-700 dark:text-orange-300 text-[11px] flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          <span>تعليق مؤقت</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestoreUser(targetUser)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>رفع التعليق</span>
                        </button>
                      )}

                      {!targetUser.isBanned ? (
                        <button
                          onClick={() => {
                            setPenaltyModal({ type: 'ban', targetUser });
                            setPenaltyReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-[11px] flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          <span>حظر نهائي</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestoreUser(targetUser)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>إلغاء الحظر</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 4. REPORTS QUEUE */}
      {activeTab === 'reports' && canReports && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'resolved', 'dismissed', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setReportFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                  reportFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {st === 'pending' && 'قيد الفحص'}
                {st === 'resolved' && 'تم اتخاذ إجراء'}
                {st === 'dismissed' && 'تم التجاهل'}
                {st === 'all' && 'الكل'}
              </button>
            ))}
          </div>

          {reports
            .filter((r) => reportFilter === 'all' || r.status === reportFilter)
            .map((report) => (
              <div
                key={report.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#3B6DFF] dark:text-[#4F8CFF] font-bold">
                    بلاغ عن {REPORT_TARGET_LABELS[report.targetType] || 'محتوى'}
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-[#0B0F19]/80 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1 border border-slate-200 dark:border-[#2A2F3A]">
                  <p className="font-bold text-slate-900 dark:text-white">السبب: {report.reason}</p>
                  {report.targetContentSnippet && (
                    <p className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                      "{report.targetContentSnippet}"
                    </p>
                  )}
                  {(report.roomId || report.conversationId) && (
                    <p className="text-[10px] text-slate-400 font-mono">
                      {report.roomId ? `Room: ${report.roomId}` : `DM: ${report.conversationId}`}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">مقدم البلاغ: {report.reporterName}</p>
                </div>

                {report.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    {report.targetType === 'post' && (
                      <button
                        onClick={() => setConfirmDeleteReportPost(report)}
                        className="flex-1 py-1.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/20 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المنشور</span>
                      </button>
                    )}

                    <button
                      onClick={() =>
                        updateReportResolution(report.id, 'resolved', 'تمت المعالجة وتنبيه الحساب')
                      }
                      className="flex-1 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>معالجة</span>
                    </button>

                    <button
                      onClick={() => updateReportResolution(report.id, 'dismissed', 'بلاغ غير مبرر')}
                      className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs transition-colors"
                    >
                      تجاهل
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>
                      الحالة: {report.status} • الإجراء: {report.actionTaken || 'تم الفحص'}
                    </span>
                  </div>
                )}
              </div>
            ))}

          {reports.length === 0 && (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                لا توجد بلاغات في هذا القسم.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4B. CUSTOM GLOBAL ROLES & GRANULAR PERMISSIONS */}
      {activeTab === 'roles' && canRoles && (
        <div className="space-y-4">
          {/* Create / Edit Role Card */}
          <form
            onSubmit={handleSaveCustomRole}
            className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-[#3B6DFF]" />
                <span>{editingRoleId ? 'تعديل الرتبة المخصصة' : 'إنشاء رتبة إدارية جديدة بصلاحيات دقيقة'}</span>
              </h3>
              {editingRoleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoleId(null);
                    setRoleName('');
                    setRoleDesc('');
                    setRolePerms({});
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="اسم الرتبة (مثلاً: منسق الفعاليات)"
                className="sm:col-span-2 bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                required
              />
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-1.5">
                <span className="text-[11px] text-slate-500">اللون:</span>
                <input
                  type="color"
                  value={roleColor}
                  onChange={(e) => setRoleColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>

            <input
              type="text"
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              placeholder="وصف مختصر لدور الرتبة (اختياري)"
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GLOBAL_PERMISSION_LABELS.map((item) => {
                const checked = Boolean(rolePerms[item.key]);
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] cursor-pointer transition-colors ${
                      checked
                        ? 'bg-[#3B6DFF]/10 border-[#3B6DFF]/50 text-[#3B6DFF] font-bold'
                        : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setRolePerms((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="accent-[#3B6DFF] rounded"
                    />
                    <span className="truncate">{item.label}</span>
                  </label>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={isSavingRole}
              className="w-full py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSavingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{editingRoleId ? 'حفظ التعديلات على الرتبة' : 'إنشاء الرتبة المخصصة'}</span>
            </button>
          </form>

          {/* Saved Custom Roles */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              الرتب المخصصة ({globalRoles.length})
            </h4>
            {globalRoles.length === 0 ? (
              <div className="p-6 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl text-xs text-slate-500">
                لا توجد رتب مخصصة منشأة بعد.
              </div>
            ) : (
              globalRoles.map((r) => {
                const activePermKeys = Object.entries(r.permissions || {})
                  .filter(([, v]) => v)
                  .map(([k]) => k as GlobalPermissionKey);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: r.color || '#3B6DFF' }}
                        />
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {r.name}
                        </span>
                        {r.description && (
                          <span className="text-[11px] text-slate-500">— {r.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoleId(r.id);
                            setRoleName(r.name);
                            setRoleDesc(r.description || '');
                            setRoleColor(r.color || '#3B6DFF');
                            setRolePerms(r.permissions || {});
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] cursor-pointer"
                          title="تعديل"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCustomRole(r.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activePermKeys.map((pk) => {
                        const found = GLOBAL_PERMISSION_LABELS.find((x) => x.key === pk);
                        return (
                          <span
                            key={pk}
                            className="px-2 py-0.5 rounded-lg bg-[#3B6DFF]/10 text-[#3B6DFF] text-[10px] font-bold"
                          >
                            {found?.label || pk}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Assign Role / Permissions to User */}
          <form
            onSubmit={handleAssignUserRole}
            className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
          >
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
              تعيين رتبة أو صلاحيات مخصصة لحساب عضو
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={assignTargetUserId}
                onChange={(e) => {
                  const uid = e.target.value;
                  setAssignTargetUserId(uid);
                  const target = users.find((u) => u.id === uid);
                  if (target) {
                    setAssignBaseRole(target.role);
                    setAssignRoleId(target.customRoleId || '');
                    setAssignPerms(target.globalPermissions || {});
                  }
                }}
                className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                required
              >
                <option value="">اختر الحساب...</option>
                {users
                  .filter((u) => u.role !== 'owner')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.handle})
                    </option>
                  ))}
              </select>

              <select
                value={assignRoleId}
                onChange={(e) => {
                  const rid = e.target.value;
                  setAssignRoleId(rid);
                  const preset = globalRoles.find((r) => r.id === rid);
                  if (preset) {
                    setAssignPerms({ ...(preset.permissions || {}) });
                  }
                }}
                className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="">بدون قالب رتبة (تحديد يدوي)</option>
                {globalRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <select
                value={assignBaseRole}
                onChange={(e) => setAssignBaseRole(e.target.value as UserRole)}
                className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="user">عضو (user)</option>
                <option value="moderator">مشرف (moderator)</option>
                <option value="room_leader">قائد غرف (room_leader)</option>
                <option value="assistant_admin">نائب مدير (assistant_admin)</option>
                {isOwner && <option value="admin">مدير عام (admin)</option>}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GLOBAL_PERMISSION_LABELS.map((item) => {
                const checked = Boolean(assignPerms[item.key]);
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] cursor-pointer ${
                      checked
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setAssignPerms((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="accent-emerald-600 rounded"
                    />
                    <span className="truncate">{item.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isAssigningRole || !assignTargetUserId}
                className="flex-1 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isAssigningRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>اعتماد الرتبة والصلاحيات</span>
              </button>
              {assignTargetUserId && (
                <button
                  type="button"
                  disabled={isAssigningRole}
                  onClick={async () => {
                    setIsAssigningRole(true);
                    try {
                      await performGlobalRoleAction({
                        operation: 'assign_user_role',
                        targetUserId: assignTargetUserId,
                        roleId: '',
                        name: '',
                        baseRole: 'user',
                        permissions: {},
                      });
                      setAssignRoleId('');
                      setAssignBaseRole('user');
                      setAssignPerms({});
                      setUsers((prev) =>
                        prev.map((u) =>
                          u.id === assignTargetUserId
                            ? { ...u, role: 'user', customRoleId: '', customRoleName: '', globalPermissions: {} }
                            : u
                        )
                      );
                      showToast('تمت استعادة الحساب لصلاحيات العضو العادي.', 'info');
                    } catch (err: unknown) {
                      showToast(err instanceof Error ? err.message : 'تعذر السحب.', 'error');
                    } finally {
                      setIsAssigningRole(false);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-300 text-xs font-bold cursor-pointer"
                >
                  سحب الصلاحيات
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* 4C. OFFICIAL PLATFORM ANNOUNCEMENTS & SPONSORED ADS */}
      {activeTab === 'broadcasts' && canBroadcasts && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(isAdmin || perms.manageAnnouncements) && (
              <button
                type="button"
                onClick={() => setBroadcastKind('announcement')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  broadcastKind === 'announcement'
                    ? 'bg-[#3B6DFF] text-white'
                    : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                }`}
              >
                بيان رسمي ({announcements.length})
              </button>
            )}
            {(isAdmin || perms.manageAds) && (
              <button
                type="button"
                onClick={() => setBroadcastKind('ad')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  broadcastKind === 'ad'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                }`}
              >
                إعلان مموّل ({ads.length})
              </button>
            )}
          </div>

          <form
            onSubmit={handlePublishBroadcast}
            className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
          >
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
              {broadcastKind === 'announcement' ? 'نشر بيان أو إعلان رسمي في Q' : 'إنشاء إعلان مموّل فعلي'}
            </h3>

            <input
              type="text"
              value={bcTitle}
              onChange={(e) => setBcTitle(e.target.value)}
              placeholder={broadcastKind === 'announcement' ? 'عنوان البيان الرسمي...' : 'عنوان الحملة الإعلانية...'}
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
              required
            />

            <textarea
              value={bcContent}
              onChange={(e) => setBcContent(e.target.value)}
              rows={3}
              placeholder="نص الرسالة أو تفاصيل الإعلان..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF] resize-none"
              required
            />

            {broadcastKind === 'ad' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={bcSponsorName}
                  onChange={(e) => setBcSponsorName(e.target.value)}
                  placeholder="اسم الجهة المعلنة (Sponsor)"
                  className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                <input
                  type="text"
                  value={bcCtaLabel}
                  onChange={(e) => setBcCtaLabel(e.target.value)}
                  placeholder="نص زر الإجراء (مثلاً: اكتشف المزيد)"
                  className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="url"
                value={bcTargetUrl}
                onChange={(e) => setBcTargetUrl(e.target.value)}
                placeholder="رابط خارجي اختياري (https://...)"
                className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={bcFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadBroadcastImage}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploadingBcMedia}
                  onClick={() => bcFileInputRef.current?.click()}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isUploadingBcMedia ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 text-[#3B6DFF]" />}
                  <span>{bcMediaUrl ? 'تم إرفاق صورة' : 'رفع صورة / بنر'}</span>
                </button>
                {bcMediaUrl && (
                  <button
                    type="button"
                    onClick={() => setBcMediaUrl('')}
                    className="p-2 rounded-xl bg-red-500/10 text-red-500 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">وقت النشر (اختياري)</label>
                <input
                  type="datetime-local"
                  value={bcPublishAt}
                  onChange={(e) => setBcPublishAt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">تاريخ الانتهاء (اختياري)</label>
                <input
                  type="datetime-local"
                  value={bcExpiresAt}
                  onChange={(e) => setBcExpiresAt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {broadcastKind === 'announcement' && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bcPlaySound}
                    onChange={(e) => setBcPlaySound(e.target.checked)}
                    className="accent-[#3B6DFF] rounded"
                  />
                  <span>نغمة صوتية مع الإشعار</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bcNotifyUsers}
                    onChange={(e) => setBcNotifyUsers(e.target.checked)}
                    className="accent-[#3B6DFF] rounded"
                  />
                  <span>إرسال إشعار فوري للأعضاء ({users.length})</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isPublishingBc}
              className="w-full py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPublishingBc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              <span>{broadcastKind === 'announcement' ? 'نشر البيان الرسمي' : 'نشر الإعلان المموّل'}</span>
            </button>
          </form>

          {/* Existing Items List */}
          <div className="space-y-2.5">
            {(broadcastKind === 'announcement' ? announcements : ads).map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          item.isPaused
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {item.isPaused ? 'متوقف مؤقتاً' : 'نشط'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void handleTogglePauseBroadcast(broadcastKind, item.id, !item.isPaused)
                      }
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] cursor-pointer"
                      title={item.isPaused ? 'استئناف' : 'إيقاف مؤقت'}
                    >
                      {item.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBroadcast(broadcastKind, item.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. APPEALS QUEUE (ADMIN ONLY) */}
      {activeTab === 'appeals' && canAppeals && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setAppealFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] transition-all ${
                  appealFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {st === 'pending' && 'قيد النظر'}
                {st === 'approved' && 'المقبولة'}
                {st === 'rejected' && 'المرفوضة'}
                {st === 'all' && 'الكل'}
              </button>
            ))}
          </div>

          {appeals
            .filter((a) => appealFilter === 'all' || a.status === appealFilter)
            .map((appeal) => (
              <div
                key={appeal.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#3B6DFF]" />
                    <span className="font-bold text-slate-900 dark:text-white">
                      تظلم إداري: {appeal.actionAppealed}
                    </span>
                  </div>
                  <span className="text-slate-500 text-[10px]">
                    {formatRelativeTime(appeal.createdAt)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-[#0B0F19]/80 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1 border border-slate-200 dark:border-[#2A2F3A]">
                  <p className="text-slate-500">
                    مقدم التظلم:{' '}
                    <span className="font-bold text-slate-900 dark:text-white">
                      {appeal.userDisplayName}
                    </span>{' '}
                    (@{appeal.userHandle})
                  </p>
                  <p className="font-medium text-slate-900 dark:text-white pt-1">
                    شرح التظلم: {appeal.appealReason}
                  </p>
                  {appeal.decisionNotes && (
                    <p className="text-slate-500 pt-1 text-[11px]">
                      قرار الإدارة: {appeal.decisionNotes}
                    </p>
                  )}
                </div>

                {appeal.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setAppealModal({ appeal, decision: 'approved' });
                        setAppealNotes('');
                      }}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>قبول التظلم وإلغاء العقوبة</span>
                    </button>

                    <button
                      onClick={() => {
                        setAppealModal({ appeal, decision: 'rejected' });
                        setAppealNotes('');
                      }}
                      className="py-1.5 px-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/20 text-xs font-bold"
                    >
                      رفض التظلم
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 block">
                    الحالة: {appeal.status === 'approved' ? 'مقبول' : 'مرفوض'}
                  </span>
                )}
              </div>
            ))}

          {appeals.length === 0 && (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                لا توجد طلبات تظلم حالياً.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 6. IMMUTABLE AUDIT LOGS */}
      {activeTab === 'logs' && canLogs && (
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-xl text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-bold text-[#3B6DFF] dark:text-[#4F8CFF]">
                  {log.actorName} ({log.actorRole})
                </span>
                <span className="text-[10px]">{formatRelativeTime(log.createdAt)}</span>
              </div>
              <p className="text-slate-900 dark:text-white font-medium">
                {log.targetDetails || log.actionType}
              </p>
            </div>
          ))}

          {auditLogs.length === 0 && (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6">
              <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">لا توجد سجلات بعد.</p>
            </div>
          )}
        </div>
      )}

      {/* Penalty Reason Modal */}
      {penaltyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {penaltyModal.type === 'warn'
                  ? `توجيه إنذار إلى @${penaltyModal.targetUser.handle}`
                  : penaltyModal.type === 'suspend'
                  ? `تعليق حساب @${penaltyModal.targetUser.handle}`
                  : `حظر حساب @${penaltyModal.targetUser.handle} نهائياً`}
              </h4>
              <button
                onClick={() => setPenaltyModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
              rows={3}
              placeholder="اكتب السبب الإداري الموثق..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF] resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={submitPenaltyModal}
                disabled={submittingModal}
                className="flex-1 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#325EE0] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submittingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد الإجراء</span>
              </button>
              <button
                onClick={() => setPenaltyModal(null)}
                disabled={submittingModal}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Verification Modal */}
      {rejectVerifModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                رفض طلب التوثيق (@{rejectVerifModal.userHandle})
              </h4>
              <button
                onClick={() => setRejectVerifModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={rejectVerifNote}
              onChange={(e) => setRejectVerifNote(e.target.value)}
              rows={3}
              placeholder="ملاحظة الرفض أو سبب عدم الاستيفاء..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF] resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={submitRejectVerifModal}
                disabled={submittingModal}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submittingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد الرفض</span>
              </button>
              <button
                onClick={() => setRejectVerifModal(null)}
                disabled={submittingModal}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decide Appeal Modal */}
      {appealModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {appealModal.decision === 'approved' ? 'قبول التظلم' : 'رفض التظلم'}
              </h4>
              <button
                onClick={() => setAppealModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={appealNotes}
              onChange={(e) => setAppealNotes(e.target.value)}
              rows={3}
              placeholder="ملاحظات القرار بخصوص التظلم (اختياري)..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF] resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={submitAppealModal}
                disabled={submittingModal}
                className="flex-1 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#325EE0] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submittingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>اعتماد القرار</span>
              </button>
              <button
                onClick={() => setAppealModal(null)}
                disabled={submittingModal}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Reported Post Modal */}
      {confirmDeleteReportPost && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-red-600 dark:text-red-400">
                حذف المنشور المخالف نهائياً
              </h4>
              <button
                onClick={() => setConfirmDeleteReportPost(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              سيتم حذف المنشور المبلغ عنه وإغلاق البلاغ كـ "تم اتخاذ إجراء". هل تود المتابعة؟
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmDeleteReportedPost}
                disabled={submittingModal}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submittingModal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حذف المنشور</span>
              </button>
              <button
                onClick={() => setConfirmDeleteReportPost(null)}
                disabled={submittingModal}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
