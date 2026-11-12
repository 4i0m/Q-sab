import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Trash2,
  Users,
  AlertTriangle,
  BadgeCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
  Clock,
  Building2,
  Sparkles,
  Scale,
  Activity,
  Search,
  RotateCcw,
  Ban,
  AlertOctagon,
  Eye,
  Crown
} from 'lucide-react';
import {
  ModerationReport,
  UserProfile,
  Post,
  UserRole,
  VerificationRequest,
  VerificationCategory,
  AuditLog,
  ModerationAppeal
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToReports,
  updateReportResolution,
  getAllUsers,
  listenToPosts,
  deletePostAsAdmin,
  togglePostHidden,
  listenToVerificationRequests,
  reviewVerificationRequest,
  updateUserVerificationDirect,
  updateUserRoleAsAdmin,
  warnUser,
  suspendUser,
  banUser,
  restoreUser,
  listenToAuditLogs,
  listenToModerationAppeals,
  decideModerationAppeal,
  getPlatformOverviewStats
} from '../../services/firestore';
import { VerifiedBadge, RoleBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';

interface ModerationViewProps {
  onBack?: () => void;
}

export function ModerationView({ onBack }: ModerationViewProps) {
  const { currentUser, isStaff, isAdmin, isOwner, onlineCount } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'verifications' | 'reports' | 'users' | 'appeals' | 'logs'
  >('overview');

  // Real data state
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  // Stats overview state
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    pendingReports: 0,
    pendingVerifications: 0,
    pendingAppeals: 0,
  });

  // Filter states
  const [reportFilter, setReportFilter] = useState<'pending' | 'resolved' | 'dismissed' | 'all'>('pending');
  const [verificationFilter, setVerificationFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [appealFilter, setAppealFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [userSearch, setUserSearch] = useState('');
  const [actionReason, setActionReason] = useState('');

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!isStaff) return;

    // Load platform real stats
    getPlatformOverviewStats().then(setStats);

    // Listen to real-time collections
    const unsubReports = listenToReports(setReports);
    const unsubVerifications = listenToVerificationRequests(setVerifications);
    const unsubAppeals = listenToModerationAppeals(setAppeals);
    const unsubLogs = listenToAuditLogs(setAuditLogs);
    const unsubPosts = listenToPosts(setPosts);

    // Load users list
    getAllUsers(100).then(setUsers);

    return () => {
      unsubReports();
      unsubVerifications();
      unsubAppeals();
      unsubLogs();
      unsubPosts();
    };
  }, [isStaff]);

  // Handle Verification Review
  const handleReviewVerification = async (
    req: VerificationRequest,
    status: 'approved' | 'rejected' | 'more_info_needed',
    notes: string
  ) => {
    if (!currentUser) return;
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
        status === 'approved' ? 'تمت الموافقة على طلب التوثيق بنجاح! 🛡️' : 'تم تحديث حالة الطلب',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'تعذر معالجة طلب التوثيق', 'error');
    }
  };

  // Handle Direct Badge Assignment
  const handleDirectVerificationChange = async (
    targetUser: UserProfile,
    newCategory: VerificationCategory,
    isVerified: boolean
  ) => {
    if (!currentUser) return;
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
    } catch (err: any) {
      showToast(err.message || 'تعذر تعديل التوثيق', 'error');
    }
  };

  // Handle Penalties: Warning, Suspension, Ban, Restore
  const handleWarnUser = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    const reason = prompt(`سبب توجيه الإنذار للمستخدم @${targetUser.handle}:`);
    if (!reason?.trim()) return;

    try {
      await warnUser(targetUser.id, reason.trim(), {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, warningCount: (u.warningCount || 0) + 1 } : u
        )
      );
      showToast(`تم توجيه إنذار رسمي للمستخدم @${targetUser.handle}`, 'info');
    } catch (err) {
      showToast('تعذر إصدار الإنذار', 'error');
    }
  };

  const handleSuspendUser = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    const reason = prompt(`سبب تعليق الحساب مؤقتاً للمستخدم @${targetUser.handle}:`);
    if (!reason?.trim()) return;

    try {
      await suspendUser(targetUser.id, reason.trim(), {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isSuspended: true } : u))
      );
      showToast(`تم تعليق حساب @${targetUser.handle} مؤقتاً`, 'info');
    } catch (err) {
      showToast('تعذر تعليق الحساب', 'error');
    }
  };

  const handleBanUser = async (targetUser: UserProfile) => {
    if (!isAdmin) {
      showToast('الحظر النهائي يتطلب صلاحيات مدير النظام', 'error');
      return;
    }
    if (!currentUser) return;
    const reason = prompt(`سبب الحظر النهائي للمستخدم @${targetUser.handle}:`);
    if (!reason?.trim()) return;

    try {
      await banUser(targetUser.id, reason.trim(), {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isBanned: true } : u))
      );
      showToast(`تم حظر حساب @${targetUser.handle} نهائياً`, 'info');
    } catch (err) {
      showToast('تعذر حظر الحساب', 'error');
    }
  };

  const handleRestoreUser = async (targetUser: UserProfile) => {
    if (!currentUser) return;
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
    } catch (err) {
      showToast('تعذر استعادة الحساب', 'error');
    }
  };

  // Handle Content Moderation
  const handleToggleHidePost = async (postId: string, isHidden: boolean) => {
    if (!currentUser) return;
    try {
      await togglePostHidden(postId, isHidden, {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      showToast(isHidden ? 'تم حجب المنشور عن النشر العام' : 'تم استعادة ظهور المنشور', 'info');
    } catch (err) {
      showToast('تعذر تحديث ظهور المنشور', 'error');
    }
  };

  // Handle Appeals
  const handleDecideAppeal = async (appeal: ModerationAppeal, decision: 'approved' | 'rejected') => {
    if (!currentUser) return;
    const notes = prompt(`ملاحظات القرار بخصوص التظلم:`) || '';
    try {
      await decideModerationAppeal(
        appeal.id,
        appeal.userId,
        decision,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        notes
      );
      showToast(decision === 'approved' ? 'تم قبول التظلم ورفع الإجراء' : 'تم رفض التظلم', 'info');
    } catch (err) {
      showToast('تعذر تسجيل قرار التظلم', 'error');
    }
  };

  if (!isStaff) {
    return (
      <div className="w-full max-w-md mx-auto py-20 text-center bg-[#161B26] border border-red-500/30 rounded-3xl p-6 shadow-2xl font-tajawal">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-white">صلاحية محظورة</h2>
        <p className="text-xs text-slate-400 mt-1">
          هذه الواجهة مخصصة لمشرفي وإداريي مجتمع Q المعتمدين فقط.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-tajawal">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#3B6DFF]" />
            <div>
              <h1 className="text-base font-bold text-white">
                مركز الإدارة والرقابة الشامل (Governance Hub)
              </h1>
              <span className="text-[10px] text-slate-400 block">
                توثيق الفئات • الرقابة • إدارة الأعضاء • التظلمات
              </span>
            </div>
          </div>
        </div>

        <span className="px-3 py-1 rounded-xl bg-[#3B6DFF]/15 border border-[#3B6DFF]/40 text-xs font-bold text-[#4F8CFF] shadow-sm">
          {currentUser?.role === 'owner' ? 'المالك (Owner)' : currentUser?.role === 'admin' ? 'مدير عام (Admin)' : 'مشرف (Moderator)'}
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[#2A2F3A]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>نظرة عامة</span>
        </button>

        <button
          onClick={() => setActiveTab('verifications')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'verifications'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <BadgeCheck className="w-3.5 h-3.5" />
          <span>طلبات التوثيق ({verifications.filter((v) => v.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'reports'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>البلاغات ({reports.filter((r) => r.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>إدارة الأعضاء</span>
        </button>

        <button
          onClick={() => setActiveTab('appeals')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'appeals'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>التظلمات ({appeals.filter((a) => a.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'logs'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>سجل الرقابة ({auditLogs.length})</span>
        </button>
      </div>

      {/* 1. OVERVIEW DASHBOARD */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                الأعضاء المسجلون
              </span>
              <div className="text-xl font-bold text-white mt-1">
                {users.length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                المنشورات الفعلية
              </span>
              <div className="text-xl font-bold text-white mt-1">
                {posts.length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                المتصلون الآن
              </span>
              <div className="text-xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{onlineCount}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                طلبات التوثيق المعلقة
              </span>
              <div className="text-xl font-bold text-[#4F8CFF] mt-1">
                {verifications.filter((v) => v.status === 'pending').length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                بلاغات قيد الفحص
              </span>
              <div className="text-xl font-bold text-rose-400 mt-1">
                {reports.filter((r) => r.status === 'pending').length}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#161B26] border border-[#2A2F3A] shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                تظلمات قيد المراجعة
              </span>
              <div className="text-xl font-bold text-sky-400 mt-1">
                {appeals.filter((a) => a.status === 'pending').length}
              </div>
            </div>
          </div>

          {/* Quick Rules & Guidelines Card */}
          <div className="p-4 rounded-2xl bg-[#161B26] border border-[#2A2F3A] space-y-2">
            <h3 className="text-xs font-bold text-[#4F8CFF] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#3B6DFF]" />
              <span>سياسات منظومة التوثيق والرقابة</span>
            </h3>
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside leading-relaxed">
              <li>التوثيق الأزرق (Blue): مخصص ومحفوظ للشخصيات العامة المعتمدة.</li>
              <li>التوثيق الفضي (Silver): للأفراد البارزين، المهنيين، والمبدعين بعد مراجعة إثبات الهوية.</li>
              <li>التوثيق المؤسسي (Institutional): للشركات والمؤسسات والجهات الرسمية مع توثيق الموقع الإلكتروني.</li>
              <li>التوثيق الملكي الدموي (Blood-Red): استثنائي ويقتصر حصرياً على قرار مالك المنصة (Owner).</li>
              <li>كل إجراء إداري يُسجل في سجل العمليات الثابت (Audit Logs) باسم المشرف وتاريخه.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 2. VERIFICATIONS QUEUE (FOUR CATEGORIES) */}
      {activeTab === 'verifications' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setVerificationFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] transition-all ${
                  verificationFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
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
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between text-xs font-tajawal">
                  <div className="flex items-center gap-2">
                    <VerifiedBadge category={req.category} className="w-4 h-4" />
                    <span className="text-white font-bold">
                      طلب توثيق ({req.category === 'silver' ? 'فضي - أفراد' : req.category === 'institution' ? 'مؤسسي - منظمات' : req.category === 'blood_red' ? 'دموي ملكي' : 'أزرق'})
                    </span>
                  </div>
                  <span className="text-neutral-500 font-mono-subtle text-[10px]">
                    {formatRelativeTime(req.createdAt)}
                  </span>
                </div>

                <div className="bg-neutral-900/80 rounded-xl p-3 text-xs text-neutral-300 font-tajawal space-y-1.5 border border-neutral-800/60">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400">مقدم الطلب:</span>
                    <span className="font-bold text-white">{req.userDisplayName}</span>
                    <span className="text-neutral-500 font-mono-subtle">@{req.userHandle}</span>
                  </div>

                  {req.legalName && (
                    <div>
                      <span className="text-neutral-400">الاسم القانوني: </span>
                      <span className="text-white font-mono-subtle">{req.legalName}</span>
                      {req.documentType && (
                        <span className="text-neutral-500 text-[10px] block">
                          نوع الوثيقة: {req.documentType}
                        </span>
                      )}
                    </div>
                  )}

                  {req.organizationName && (
                    <div>
                      <span className="text-neutral-400">اسم المؤسسة: </span>
                      <span className="text-white font-bold">{req.organizationName}</span>
                      {req.officialWebsite && (
                        <a
                          href={req.officialWebsite}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#4F8CFF] hover:underline block text-[11px]"
                        >
                          الموقع: {req.officialWebsite}
                        </a>
                      )}
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400 block mb-0.5">تفاصيل الأدلة والروابط:</span>
                    <p className="text-slate-300 italic whitespace-pre-wrap">{req.evidenceDetails}</p>
                  </div>
                </div>

                {req.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleReviewVerification(req, 'approved', 'استوفى المعايير والوثائق الرسمية')}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-bold font-tajawal flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>اعتماد ومنح الشارة</span>
                    </button>

                    <button
                      onClick={() => {
                        const note = prompt('ملاحظة الرفض أو سبب عدم الاستيفاء:');
                        if (note) handleReviewVerification(req, 'rejected', note);
                      }}
                      className="py-1.5 px-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 text-xs font-bold font-tajawal transition-colors"
                    >
                      رفض
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] font-tajawal text-slate-400 flex items-center gap-1.5 pt-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>الحالة: {req.status === 'approved' ? 'معتمد' : 'مرفوض'} • الملاحظات: {req.reviewerNotes || 'لا توجد'}</span>
                  </div>
                )}
              </div>
            ))}

          {verifications.length === 0 && (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-tajawal">لا توجد طلبات توثيق معلقة حالياً.</p>
            </div>
          )}
        </div>
      )}

      {/* 3. USER MANAGEMENT & DIRECT BADGE CONTROL */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="ابحث عن عضو بالاسم أو المعرف لإدارة العقوبات أو التوثيق..."
              className="w-full bg-[#161B26] border border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-tajawal"
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
                    className="p-3.5 bg-[#161B26] border border-[#2A2F3A] rounded-2xl space-y-3 shadow-md"
                  >
                    {/* User Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={
                            targetUser.photoURL ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${targetUser.displayName}`
                          }
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white font-tajawal">
                              {targetUser.displayName}
                            </span>
                            {Boolean(targetUser.isVerified) && (
                              <VerifiedBadge category={targetUser.verificationCategory || 'blue'} className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-500 font-mono-subtle">
                            @{targetUser.handle} • {targetUser.followersCount || 0} متابع
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isUserRestricted && (
                          <span className="px-2 py-0.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 text-[10px] font-bold font-tajawal">
                            {targetUser.isBanned ? 'محظور نهائياً' : 'معلق مؤقتاً'}
                          </span>
                        )}
                        <RoleBadge role={targetUser.role} />
                      </div>
                    </div>

                    {/* Direct Verification Category Selector */}
                    {isAdmin && (
                      <div className="p-2.5 bg-neutral-900/60 rounded-xl border border-neutral-800/80 space-y-2">
                        <div className="flex items-center justify-between text-xs font-tajawal">
                          <span className="text-neutral-300 font-bold">منظومة شارات التوثيق (الفئات الأربع):</span>
                          {targetUser.isVerified && (
                            <button
                              onClick={() => handleDirectVerificationChange(targetUser, 'blue', false)}
                              className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            >
                              إلغاء التوثيق
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <button
                            onClick={() => handleDirectVerificationChange(targetUser, 'blue', true)}
                            className={`p-1.5 rounded-lg border text-[11px] font-tajawal flex items-center justify-center gap-1 ${
                              targetUser.isVerified && (!targetUser.verificationCategory || targetUser.verificationCategory === 'blue')
                                ? 'bg-sky-950 border-sky-400 text-sky-200'
                                : 'bg-[#111] border-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                          >
                            <VerifiedBadge category="blue" className="w-3 h-3" />
                            <span>أزرق (أصلي)</span>
                          </button>

                          <button
                            onClick={() => handleDirectVerificationChange(targetUser, 'silver', true)}
                            className={`p-1.5 rounded-lg border text-[11px] font-tajawal flex items-center justify-center gap-1 ${
                              targetUser.isVerified && targetUser.verificationCategory === 'silver'
                                ? 'bg-slate-800 border-slate-300 text-slate-100'
                                : 'bg-[#111] border-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                          >
                            <VerifiedBadge category="silver" className="w-3 h-3" />
                            <span>فضي (أفراد)</span>
                          </button>

                          <button
                            onClick={() => handleDirectVerificationChange(targetUser, 'institution', true)}
                            className={`p-1.5 rounded-lg border text-[11px] font-tajawal flex items-center justify-center gap-1 ${
                              targetUser.isVerified && targetUser.verificationCategory === 'institution'
                                ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white'
                                : 'bg-[#0B0F19] border-[#2A2F3A] text-slate-400 hover:text-white'
                            }`}
                          >
                            <VerifiedBadge category="institution" className="w-3 h-3" />
                            <span>مؤسسي (كيانات)</span>
                          </button>

                          <button
                            disabled={!isOwner}
                            onClick={() => handleDirectVerificationChange(targetUser, 'blood_red', true)}
                            title={!isOwner ? 'خاص بالمالك فقط' : ''}
                            className={`p-1.5 rounded-lg border text-[11px] font-tajawal flex items-center justify-center gap-1 ${
                              targetUser.isVerified && targetUser.verificationCategory === 'blood_red'
                                ? 'bg-rose-950 border-rose-500 text-rose-200'
                                : isOwner
                                ? 'bg-[#0B0F19] border-[#2A2F3A] text-rose-400 hover:border-rose-500'
                                : 'bg-[#0B0F19] border-[#2A2F3A] text-slate-600 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <VerifiedBadge category="blood_red" className="w-3 h-3" />
                            <span>دموي ملكي 👑</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Moderation Actions Bar */}
                    <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
                      <button
                        onClick={() => handleWarnUser(targetUser)}
                        className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300 hover:bg-amber-900/40 text-[11px] font-tajawal flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>إنذار ({targetUser.warningCount || 0})</span>
                      </button>

                      {!targetUser.isSuspended ? (
                        <button
                          onClick={() => handleSuspendUser(targetUser)}
                          className="px-2.5 py-1 rounded-lg bg-orange-950/40 border border-orange-500/30 text-orange-300 hover:bg-orange-900/40 text-[11px] font-tajawal flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          <span>تعليق مؤقت</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestoreUser(targetUser)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-tajawal flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>رفع التعليق</span>
                        </button>
                      )}

                      {isAdmin && (
                        !targetUser.isBanned ? (
                          <button
                            onClick={() => handleBanUser(targetUser)}
                            className="px-2.5 py-1 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/40 text-[11px] font-tajawal flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            <span>حظر نهائي</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreUser(targetUser)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-tajawal flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>إلغاء الحظر</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 4. REPORTS QUEUE */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'resolved', 'dismissed', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setReportFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] font-tajawal transition-all ${
                  reportFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
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
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between text-xs font-tajawal">
                  <span className="text-[#4F8CFF] font-bold">
                    بلاغ عن {report.targetType === 'post' ? 'منشور' : 'مستخدم'}
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>

                <div className="bg-[#0B0F19]/80 rounded-xl p-3 text-xs text-slate-300 font-tajawal space-y-1">
                  <p className="font-bold text-white">السبب: {report.reason}</p>
                  {report.targetContentSnippet && (
                    <p className="text-slate-400 italic text-[11px]">"{report.targetContentSnippet}"</p>
                  )}
                  <p className="text-[10px] text-slate-500">مقدم البلاغ: {report.reporterName}</p>
                </div>

                {report.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    {report.targetType === 'post' && (
                      <button
                        onClick={async () => {
                          if (confirm('حذف هذا المنشور المخالف نهائياً؟')) {
                            await deletePostAsAdmin(report.targetId);
                            await updateReportResolution(report.id, 'resolved', 'تم حذف المنشور المخالف');
                            showToast('تم حذف المنشور المخالف', 'success');
                          }
                        }}
                        className="flex-1 py-1.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 text-xs font-bold font-tajawal flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المنشور</span>
                      </button>
                    )}

                    <button
                      onClick={() => updateReportResolution(report.id, 'resolved', 'تمت المعالجة وتنبيه الحساب')}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-bold font-tajawal flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>معالجة</span>
                    </button>

                    <button
                      onClick={() => updateReportResolution(report.id, 'dismissed', 'بلاغ غير مبرر')}
                      className="py-1.5 px-3 rounded-xl bg-[#0B0F19] border border-[#2A2F3A] text-slate-400 hover:text-white text-xs font-tajawal transition-colors"
                    >
                      تجاهل
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] font-tajawal text-slate-500 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>الحالة: {report.status} • الإجراء: {report.actionTaken || 'تم الفحص'}</span>
                  </div>
                )}
              </div>
            ))}

          {reports.length === 0 && (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-tajawal">لا توجد بلاغات في هذا القسم.</p>
            </div>
          )}
        </div>
      )}

      {/* 5. APPEALS QUEUE */}
      {activeTab === 'appeals' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setAppealFilter(st)}
                className={`px-3 py-1 rounded-lg text-[11px] font-tajawal transition-all ${
                  appealFilter === st
                    ? 'bg-[#3B6DFF] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
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
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between text-xs font-tajawal">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#3B6DFF]" />
                    <span className="font-bold text-white">تظلم إداري: {appeal.actionAppealed}</span>
                  </div>
                  <span className="text-slate-500 text-[10px]">
                    {formatRelativeTime(appeal.createdAt)}
                  </span>
                </div>

                <div className="bg-[#0B0F19]/80 rounded-xl p-3 text-xs text-slate-300 font-tajawal space-y-1 border border-[#2A2F3A]">
                  <p className="text-slate-400">
                    مقدم التظلم: <span className="font-bold text-white">{appeal.userDisplayName}</span> (@{appeal.userHandle})
                  </p>
                  <p className="font-medium text-white pt-1">شرح التظلم: {appeal.appealReason}</p>
                  {appeal.decisionNotes && (
                    <p className="text-slate-400 pt-1 text-[11px]">قرار المجلس: {appeal.decisionNotes}</p>
                  )}
                </div>

                {appeal.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleDecideAppeal(appeal, 'approved')}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-bold font-tajawal flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>قبول التظلم وإلغاء العقوبة</span>
                    </button>

                    <button
                      onClick={() => handleDecideAppeal(appeal, 'rejected')}
                      className="py-1.5 px-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 text-xs font-bold font-tajawal"
                    >
                      رفض التظلم
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 font-tajawal block">
                    الحالة: {appeal.status === 'approved' ? 'مقبول' : 'مرفوض'}
                  </span>
                )}
              </div>
            ))}

          {appeals.length === 0 && (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-tajawal">لا توجد طلبات تظلم حالياً.</p>
            </div>
          )}
        </div>
      )}

      {/* 6. IMMUTABLE AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 bg-[#161B26] border border-[#2A2F3A] rounded-xl text-xs font-tajawal space-y-1 shadow-sm"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold text-[#4F8CFF]">
                  {log.actorName} ({log.actorRole})
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
              <p className="text-white font-medium">{log.targetDetails || log.actionType}</p>
            </div>
          ))}

          {auditLogs.length === 0 && (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
              <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-tajawal">لا توجد سجلات بعد.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
