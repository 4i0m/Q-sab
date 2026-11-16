import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Check,
  Clock,
  History,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Users,
  Flag,
  Lock,
  AlertTriangle,
  Ban,
  RotateCcw,
  Trash2,
  ExternalLink,
  CheckCircle
} from 'lucide-react';
import {
  UserProfile,
  VerificationRequest,
  AuditLog,
  ModerationReport,
  UserRole
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from '../common/MediaImage';
import {
  searchUsersDirectory,
  getAllUsers,
  listenToVerificationRequests,
  reviewVerificationRequest,
  listenToAuditLogs,
  listenToReports,
  updateReportResolution,
  deletePostAsAdmin,
  updateUserRoleAsAdmin,
  warnUser,
  suspendUser,
  banUser,
  restoreUser
} from '../../services/firestore';
import {
  VerifiedBadge,
  VerificationStatusIndicator,
  RoleBadge
} from '../common/VerifiedBadge';
import { AdminVerificationModal } from './AdminVerificationModal';
import { formatRelativeTime } from '../../utils/date';

interface AdminVerificationPanelProps {
  onBack?: () => void;
  onSelectUserForProfile?: (userId: string) => void;
  onOpenModerationHub?: () => void;
}

type AdminTab = 'verification' | 'accounts' | 'reports' | 'audit' | 'permissions';

export function AdminVerificationPanel({
  onBack,
  onSelectUserForProfile,
  onOpenModerationHub,
}: AdminVerificationPanelProps) {
  const { currentUser, isAdmin, isOwner } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>('verification');

  // Verification Search & Directory States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Accounts Directory State
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountFilter, setAccountFilter] = useState('');

  // Requests, Reports, Audit Logs
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Modals (Zero browser prompt/confirm)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [verificationModalMode, setVerificationModalMode] = useState<'grant' | 'revoke' | 'details' | null>(null);

  const [reviewModalReq, setReviewModalReq] = useState<{
    req: VerificationRequest;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [penaltyModal, setPenaltyModal] = useState<{
    user: UserProfile;
    type: 'warn' | 'suspend' | 'ban';
  } | null>(null);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltySubmitting, setPenaltySubmitting] = useState(false);

  const [confirmDeleteReport, setConfirmDeleteReport] = useState<ModerationReport | null>(null);
  const [deletingReportedPost, setDeletingReportedPost] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubRequests = listenToVerificationRequests((reqs) => {
      setRequests(reqs);
      setRequestsLoading(false);
    });

    const unsubReports = listenToReports((reps) => {
      setReports(reps as ModerationReport[]);
      setReportsLoading(false);
    });

    const unsubAudit = listenToAuditLogs((logs) => {
      setAuditLogs(logs);
      setAuditLoading(false);
    });

    setAccountsLoading(true);
    getAllUsers(100)
      .then((list) => setAccounts(list))
      .catch(() => {})
      .finally(() => setAccountsLoading(false));

    return () => {
      unsubRequests();
      unsubReports();
      unsubAudit();
    };
  }, [isAdmin]);

  if (!isAdmin || !currentUser) {
    return (
      <div className="w-full max-w-xl mx-auto py-16 text-center bg-white dark:bg-[#161B26] border border-red-200 dark:border-red-500/30 rounded-3xl p-8 font-tajawal">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">الوصول مقيد للإدارة العليا فقط</h3>
        <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-1">
          يتطلب الوصول إلى Q Administration صلاحيات المدير العام (Admin) أو المالك (Owner).
        </p>
      </div>
    );
  }

  const BackArrow = isRTL ? ChevronRight : ChevronLeft;
  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;
  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const results = await searchUsersDirectory(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      showToast('تعذر البحث عن المستخدمين', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirmReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalReq) return;

    const { req, decision } = reviewModalReq;
    try {
      setReviewSubmitting(true);
      await reviewVerificationRequest(
        req.id,
        req.userId,
        req.category || 'blue',
        decision,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        reviewNote.trim() ||
          (decision === 'approved'
            ? 'Approved via Q Administration'
            : 'Rejected: insufficient verification evidence')
      );
      showToast(
        decision === 'approved' ? 'تمت الموافقة ومنح شارة التوثيق بنجاح' : 'تم رفض طلب التوثيق',
        decision === 'approved' ? 'success' : 'info'
      );
      setReviewModalReq(null);
      setReviewNote('');
    } catch (err) {
      showToast('تعذر معالجة طلب التوثيق', 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRoleChange = async (targetUser: UserProfile, newRole: UserRole) => {
    if (!isOwner && newRole === 'owner') {
      showToast('فقط المالك مخول بتعيين رتبة مالك', 'error');
      return;
    }
    try {
      await updateUserRoleAsAdmin(targetUser.id, newRole, {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setAccounts((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      );
      showToast(`تم تحديث رتبة @${targetUser.handle} إلى ${newRole}`, 'success');
    } catch (err) {
      showToast('تعذر تعديل الرتبة', 'error');
    }
  };

  const handleConfirmPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penaltyModal || !penaltyReason.trim()) return;
    const { user, type } = penaltyModal;
    const actor = { id: currentUser.id, name: currentUser.displayName, role: currentUser.role };

    try {
      setPenaltySubmitting(true);
      if (type === 'warn') {
        await warnUser(user.id, penaltyReason.trim(), actor);
        setAccounts((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, warningCount: (u.warningCount || 0) + 1 } : u))
        );
        showToast(`تم توجيه إنذار إلى @${user.handle}`, 'info');
      } else if (type === 'suspend') {
        await suspendUser(user.id, penaltyReason.trim(), actor);
        setAccounts((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isSuspended: true } : u))
        );
        showToast(`تم تعليق حساب @${user.handle}`, 'info');
      } else if (type === 'ban') {
        await banUser(user.id, penaltyReason.trim(), actor);
        setAccounts((prev) => prev.map((u) => (u.id === user.id ? { ...u, isBanned: true } : u)));
        showToast(`تم حظر حساب @${user.handle}`, 'info');
      }
      setPenaltyModal(null);
      setPenaltyReason('');
    } catch (err) {
      showToast('فشل في تنفيذ الإجراء الإداري', 'error');
    } finally {
      setPenaltySubmitting(false);
    }
  };

  const handleRestore = async (user: UserProfile) => {
    try {
      await restoreUser(user.id, {
        id: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
      });
      setAccounts((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isSuspended: false, isBanned: false } : u))
      );
      showToast(`تمت استعادة حساب @${user.handle}`, 'success');
    } catch (err) {
      showToast('تعذر استعادة الحساب', 'error');
    }
  };

  const handleConfirmDeleteReportedPost = async () => {
    if (!confirmDeleteReport) return;
    try {
      setDeletingReportedPost(true);
      await deletePostAsAdmin(confirmDeleteReport.targetId);
      await updateReportResolution(confirmDeleteReport.id, 'resolved', 'تم حذف المنشور المخالف بواسطة الإدارة');
      showToast('تم حذف المنشور المخالف وتسوية البلاغ', 'success');
      setConfirmDeleteReport(null);
    } catch (err) {
      showToast('تعذر حذف المنشور', 'error');
    } finally {
      setDeletingReportedPost(false);
    }
  };

  const filteredAccounts = accounts.filter((u) => {
    const q = accountFilter.trim().toLowerCase().replace(/^@/, '');
    if (!q) return true;
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.handle?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full max-w-xl mx-auto pb-24 space-y-4 font-tajawal">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#3B6DFF]" />
              <span>{t('qAdministration')}</span>
            </h1>
            <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
              {t('qAdministrationDesc')}
            </span>
          </div>
        </div>
        <RoleBadge role={currentUser.role} />
      </div>

      {/* 5 Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'verification' as const, label: t('verificationMgmt'), badge: pendingRequestsCount },
          { id: 'accounts' as const, label: t('accountMgmt'), badge: 0 },
          { id: 'reports' as const, label: t('reportsMgmt'), badge: pendingReportsCount },
          { id: 'audit' as const, label: t('auditHistory'), badge: 0 },
          { id: 'permissions' as const, label: t('permissionsInfo'), badge: 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-[#3B6DFF] text-white shadow-sm'
                : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono tabular-nums font-bold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* SECTION 1: Verification Management (Direct Search + Requests Queue) */}
      {activeTab === 'verification' && (
        <div className="space-y-4 animate-scale-up">
          {/* Direct Search */}
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بـ @المعرف أو الاسم أو UID لإدارة التوثيق..."
              className="w-full bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl ps-10 pe-20 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none transition-colors"
            />
            <Search className="w-4 h-4 text-slate-400 dark:text-[#64748B] absolute start-3.5 top-3.5" />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute end-2 top-2 px-3.5 py-1.5 bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'بحث'}
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2.5">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectUserForProfile?.(user.id)}
                      className="flex items-center gap-3 text-start cursor-pointer group flex-1 min-w-0"
                    >
                      <MediaImage
                        src={user.photoURL}
                        alt={user.displayName}
                        variant="avatar"
                        fallbackText={user.displayName}
                        containerClassName="w-11 h-11 rounded-full overflow-hidden bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] shrink-0"
                        className="w-full h-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] transition-colors truncate">
                            {user.displayName}
                          </span>
                          {user.isVerified && (
                            <VerifiedBadge
                              category={user.verificationCategory || 'blue'}
                              interactive={false}
                            />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono block">
                          @{user.handle}
                        </span>
                      </div>
                    </button>

                    <VerificationStatusIndicator
                      status={user.isVerified ? 'verified' : user.verificationStatus || 'not_verified'}
                      category={user.verificationCategory || 'blue'}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#2A2F3A]/60">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setVerificationModalMode('details');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-800 dark:text-white text-xs font-bold cursor-pointer"
                    >
                      التفاصيل
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setVerificationModalMode('grant');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold cursor-pointer"
                    >
                      {user.isVerified ? t('changeVerificationTier') : t('grantVerification')}
                    </button>

                    {user.isVerified && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setVerificationModalMode('revoke');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-bold cursor-pointer"
                      >
                        {t('removeVerification')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Verification Applications Queue */}
          <div className="space-y-3 pt-1">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>طلبات التوثيق المقدمة من الأعضاء</span>
              <span className="font-mono tabular-nums text-[11px] text-[#3B6DFF]">
                {requests.length}
              </span>
            </h2>

            {requestsLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
              </div>
            ) : requests.length > 0 ? (
              requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectUserForProfile?.(req.userId)}
                      className="text-start cursor-pointer group"
                    >
                      <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] block">
                        {req.userDisplayName || req.legalName || req.userHandle}
                      </span>
                      <span className="text-[11px] text-[#3B6DFF] font-mono block">
                        {req.category} · @{req.userHandle}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums block">
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </button>

                    <VerificationStatusIndicator
                      status={
                        req.status === 'approved'
                          ? 'verified'
                          : req.status === 'rejected'
                          ? 'rejected'
                          : 'pending'
                      }
                      category={req.category || 'blue'}
                    />
                  </div>

                  {(req.legalName || req.organizationName || req.officialWebsite) && (
                    <div className="text-[11px] text-slate-600 dark:text-[#CBD5E1] space-y-0.5">
                      {req.legalName && <div>الاسم القانوني: {req.legalName}</div>}
                      {req.organizationName && <div>المؤسسة: {req.organizationName}</div>}
                      {req.officialWebsite && (
                        <a
                          href={req.officialWebsite}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#3B6DFF] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{req.officialWebsite}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {req.evidenceDetails && (
                    <p className="text-xs text-slate-700 dark:text-[#CBD5E1] bg-slate-50 dark:bg-[#0B0F19] p-3 rounded-xl border border-slate-200 dark:border-[#2A2F3A] whitespace-pre-wrap">
                      {req.evidenceDetails}
                    </p>
                  )}

                  {req.status === 'pending' ? (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-[#2A2F3A]/60">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalReq({ req, decision: 'rejected' });
                          setReviewNote('');
                        }}
                        className="py-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold cursor-pointer"
                      >
                        رفض الطلب
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalReq({ req, decision: 'approved' });
                          setReviewNote('');
                        }}
                        className="py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-sm cursor-pointer"
                      >
                        اعتماد ومنح التوثيق
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] pt-1 border-t border-slate-100 dark:border-[#2A2F3A]/60 space-y-0.5">
                      <div>
                        المراجع: {req.reviewerName || req.reviewerId || 'الإدارة'}
                        {req.reviewedAt ? ` · ${new Date(req.reviewedAt).toLocaleDateString()}` : ''}
                      </div>
                      {req.reviewerNotes && <div>ملاحظة: {req.reviewerNotes}</div>}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-10 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
                <Clock className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                  لا توجد طلبات توثيق مسجلة حالياً.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: Account Management (Roles, Status, Warnings, Restrictions) */}
      {activeTab === 'accounts' && (
        <div className="space-y-3 animate-scale-up">
          <div className="relative">
            <input
              type="text"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              placeholder="تصفية الأعضاء بالاسم أو @المعرف..."
              className="w-full bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl ps-10 pe-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-3" />
          </div>

          {accountsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : (
            filteredAccounts.map((user) => (
              <div
                key={user.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectUserForProfile?.(user.id)}
                    className="flex items-center gap-3 text-start cursor-pointer min-w-0 flex-1"
                  >
                    <MediaImage
                      src={user.photoURL}
                      alt={user.displayName}
                      variant="avatar"
                      fallbackText={user.displayName}
                      containerClassName="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] shrink-0"
                      className="w-full h-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {user.displayName}
                        </span>
                        {user.isVerified && (
                          <VerifiedBadge
                            category={user.verificationCategory || 'blue'}
                            interactive={false}
                          />
                        )}
                        <RoleBadge role={user.role} />
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono block">
                        @{user.handle} · {user.warningCount || 0} إنذار
                      </span>
                    </div>
                  </button>

                  <select
                    value={user.role}
                    disabled={user.id === currentUser.id}
                    onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                    className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-[11px] font-bold text-[#3B6DFF] rounded-xl px-2.5 py-1.5 focus:outline-none disabled:opacity-50"
                  >
                    <option value="user">عضو (User)</option>
                    <option value="moderator">مشرف (Moderator)</option>
                    <option value="admin">مدير (Admin)</option>
                    {isOwner && <option value="owner">مالك (Owner)</option>}
                  </select>
                </div>

                {user.id !== currentUser.id && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-[#2A2F3A]/60">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setVerificationModalMode('grant');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#3B6DFF]/10 text-[#3B6DFF] text-[11px] font-bold cursor-pointer"
                    >
                      {user.isVerified ? t('changeVerificationTier') : t('grantVerification')}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPenaltyModal({ user, type: 'warn' });
                        setPenaltyReason('');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>{t('warnAccount')}</span>
                    </button>

                    {!user.isSuspended && !user.isBanned ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPenaltyModal({ user, type: 'suspend' });
                            setPenaltyReason('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 text-[11px] font-bold cursor-pointer"
                        >
                          {t('suspendAccount')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPenaltyModal({ user, type: 'ban' });
                            setPenaltyReason('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          <span>{t('banAccount')}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRestore(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t('restoreAccount')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION 3: User Reports & Moderation Tools */}
      {activeTab === 'reports' && (
        <div className="space-y-3 animate-scale-up">
          {onOpenModerationHub && (
            <button
              type="button"
              onClick={onOpenModerationHub}
              className="w-full py-2.5 px-4 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF] text-xs font-bold text-[#3B6DFF] flex items-center justify-between cursor-pointer"
            >
              <span>فتح مركز الرقابة والتظلمات الشامل</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {reportsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : reports.length > 0 ? (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#3B6DFF] flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" />
                    <span>
                      بلاغ عن {report.targetType === 'post' ? 'منشور' : report.targetType === 'comment' ? 'تعليق' : 'حساب'}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl p-3 text-xs space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">السبب: {report.reason}</p>
                  {report.targetContentSnippet && (
                    <p className="text-slate-600 dark:text-slate-400 italic text-[11px]">
                      "{report.targetContentSnippet}"
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">المُبلّغ: {report.reporterName}</p>
                </div>

                {report.status === 'pending' ? (
                  <div className="flex items-center gap-2 pt-1">
                    {report.targetType === 'post' && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteReport(report)}
                        className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف المنشور</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await updateReportResolution(report.id, 'resolved', 'تمت المراجعة والمعالجة');
                        showToast('تم إغلاق البلاغ كمعالج', 'success');
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>معالجة</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await updateReportResolution(report.id, 'dismissed', 'تم التجاهل');
                        showToast('تم تجاهل البلاغ', 'info');
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      تجاهل
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    الحالة: {report.status} · {report.actionTaken || ''}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">لا توجد بلاغات مسجلة حالياً.</p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: Administrative Activity History (Audit Logs) */}
      {activeTab === 'audit' && (
        <div className="space-y-2.5 animate-scale-up">
          {auditLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : auditLogs.length > 0 ? (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3.5 space-y-1.5 text-xs shadow-sm"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#3B6DFF]">{log.actorName}</span>
                  <span className="text-slate-500 dark:text-[#64748B] font-mono tabular-nums text-[10px]">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-slate-900 dark:text-white font-medium">
                  {log.targetDetails || `${log.actionType} (${log.targetId})`}
                </div>
                {log.reason && (
                  <div className="text-[11px] text-slate-600 dark:text-[#94A3B8] bg-slate-50 dark:bg-[#0B0F19] p-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A]">
                    السبب: {log.reason}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
              <History className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                لا توجد سجلات عمليات إدارية حتى الآن.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: Admin Role & Firestore Permissions Info */}
      {activeTab === 'permissions' && (
        <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-5 space-y-4 shadow-sm animate-scale-up">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A2F3A]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {currentUser.displayName}
              </h3>
              <span className="text-xs text-slate-500 font-mono block">
                @{currentUser.handle} · {currentUser.email || ''}
              </span>
            </div>
            <RoleBadge role={currentUser.role} />
          </div>

          <div className="space-y-2.5 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#3B6DFF]" />
              <span>الصلاحيات الفعّالة في قواعد أمان Firestore</span>
            </h4>
            <ul className="space-y-2 text-slate-600 dark:text-[#CBD5E1] list-disc list-inside leading-relaxed">
              <li>منح أو تعديل أو سحب شارات التوثيق وكتابة الملاحظات الإدارية الخاصة.</li>
              <li>مراجعة طلبات التوثيق والتظلمات والمصادقة عليها مع تسجيل سجل التدقيق.</li>
              <li>إدارة رتب الحسابات وتوجيه الإنذارات والتعليق والحظر واستعادة الحسابات.</li>
              <li>عرض البلاغات وسجلات التدقيق الأمني غير القابلة للتعديل (Immutable Audit Logs).</li>
              {isOwner && <li>صلاحيات المالك: منح الشارة التنفيذية الخاصة (Blood-Red Executive Badge).</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Grant / Revoke / Details Verification Modal */}
      {selectedUser && verificationModalMode && (
        <AdminVerificationModal
          isOpen={Boolean(selectedUser && verificationModalMode)}
          onClose={() => {
            setSelectedUser(null);
            setVerificationModalMode(null);
          }}
          targetUser={selectedUser}
          mode={verificationModalMode}
          onSuccess={() => {
            if (searchQuery.trim()) {
              searchUsersDirectory(searchQuery.trim()).then(setSearchResults);
            }
            getAllUsers(100).then(setAccounts).catch(() => {});
          }}
        />
      )}

      {/* Review Request Approve/Reject Modal */}
      {reviewModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReviewRequest}
            className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {reviewModalReq.decision === 'approved'
                ? 'تأكيد قبول طلب التوثيق'
                : 'تأكيد رفض طلب التوثيق'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
              المتقدم: @{reviewModalReq.req.userHandle} ({reviewModalReq.req.category})
            </p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              required={reviewModalReq.decision === 'rejected'}
              placeholder={
                reviewModalReq.decision === 'approved'
                  ? 'ملاحظة اختيارية للمراجعة الإدارية...'
                  : 'أدخل سبب الرفض ليظهر للمستخدم والمراجعة...'
              }
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReviewModalReq(null)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={reviewSubmitting}
                className={`py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  reviewModalReq.decision === 'approved'
                    ? 'bg-[#3B6DFF] hover:bg-[#2B5BE5]'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {reviewSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('confirm')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Penalty Modal */}
      {penaltyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmPenalty}
            className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {penaltyModal.type === 'warn'
                ? t('warnAccount')
                : penaltyModal.type === 'suspend'
                ? t('suspendAccount')
                : t('banAccount')}{' '}
              (@{penaltyModal.user.handle})
            </h3>
            <textarea
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
              rows={3}
              required
              placeholder="أدخل السبب الموثق في سجل التدقيق..."
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPenaltyModal(null)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={penaltySubmitting || !penaltyReason.trim()}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {penaltySubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('confirm')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reported Post Deletion Confirmation Modal */}
      {confirmDeleteReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">حذف المنشور المخالف</h3>
            <p className="text-xs text-slate-600 dark:text-[#CBD5E1]">
              سيتم حذف المنشور نهائياً وتحديث حالة البلاغ إلى معالج. هل أنت متأكد؟
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteReport(null)}
                className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReportedPost}
                disabled={deletingReportedPost}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingReportedPost && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
