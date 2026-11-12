import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Check,
  X,
  Clock,
  User,
  AlertTriangle,
  History,
  Loader2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  FileText,
  BadgeCheck,
  Eye
} from 'lucide-react';
import { UserProfile, VerificationRequest, AuditLog, VerificationCategory } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  searchUsersDirectory,
  listenToVerificationRequests,
  reviewVerificationRequest,
  listenToAuditLogs,
  updateUserVerificationDirect
} from '../../services/firestore';
import { VerifiedBadge, VerificationStatusIndicator } from '../common/VerifiedBadge';
import { AdminVerificationModal } from './AdminVerificationModal';

interface AdminVerificationPanelProps {
  onBack?: () => void;
  onSelectUserForProfile?: (userId: string) => void;
}

export function AdminVerificationPanel({
  onBack,
  onSelectUserForProfile,
}: AdminVerificationPanelProps) {
  const { currentUser, isStaff, isAdmin } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'verification' | 'requests' | 'audit'>('verification');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Selected user for modal
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [verificationModalMode, setVerificationModalMode] = useState<'grant' | 'revoke' | 'details' | null>(null);

  // Requests queue
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Real-time listener for requests & audit
  useEffect(() => {
    if (!isStaff) return;

    const unsubRequests = listenToVerificationRequests((reqs) => {
      setRequests(reqs);
      setRequestsLoading(false);
    });

    const unsubAudit = listenToAuditLogs((logs) => {
      setAuditLogs(logs);
      setAuditLoading(false);
    });

    return () => {
      unsubRequests();
      unsubAudit();
    };
  }, [isStaff]);

  // Handle user search
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

  const handleApproveRequest = async (req: VerificationRequest) => {
    if (!currentUser) return;
    try {
      await reviewVerificationRequest(
        req.id,
        req.userId,
        req.category || 'blue',
        'approved',
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        'Approved by administrator from Q Administration'
      );
      showToast('تمت الموافقة على طلب التوثيق بنجاح ✨', 'success');
    } catch (err: any) {
      showToast('فشل في قبول الطلب', 'error');
    }
  };

  const handleRejectRequest = async (req: VerificationRequest) => {
    if (!currentUser) return;
    const reason = prompt('أدخل سبب رفض طلب التوثيق:');
    if (reason === null) return;

    try {
      await reviewVerificationRequest(
        req.id,
        req.userId,
        req.category || 'blue',
        'rejected',
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        reason.trim() || 'لا يستوفي معايير التوثيق المعتمدة'
      );
      showToast('تم رفض طلب التوثيق وتسجيل الإشعار', 'info');
    } catch (err: any) {
      showToast('فشل في معالجة الرفض', 'error');
    }
  };

  if (!isStaff) {
    return (
      <div className="w-full max-w-md mx-auto py-16 text-center bg-[#161B26] border border-red-500/30 rounded-3xl p-8 font-tajawal">
        <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-white">الوصول مقيد للإدارة فقط</h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          هذه المنطقة مخصصة حصراً للمشرفين والمسؤولين المعتمدين في منصة Q.
        </p>
      </div>
    );
  }

  const BackArrow = isRTL ? ChevronRight : ChevronLeft;

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 font-tajawal">
      {/* Top Bar */}
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
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#3B6DFF]" />
              <span>إدارة منصة Q (Q Administration)</span>
            </h1>
            <span className="text-[10px] text-[#4F8CFF] font-mono block">
              نظام الرقابة والتوثيق الأمني 2026
            </span>
          </div>
        </div>
      </div>

      {/* Actual Live Metrics Summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-[#94A3B8] block">طلبات التوثيق المعلقة</span>
          <span className="text-lg font-bold text-amber-400 font-mono mt-0.5 block">
            {pendingRequestsCount}
          </span>
        </div>
        <div className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3.5 text-center">
          <span className="text-[11px] text-[#94A3B8] block">سجلات العمليات الإدارية</span>
          <span className="text-lg font-bold text-[#38BDF8] font-mono mt-0.5 block">
            {auditLogs.length}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1.5 bg-[#161B26] p-1.5 rounded-2xl border border-[#2A2F3A] text-xs font-bold">
        <button
          onClick={() => setActiveTab('verification')}
          className={`py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'verification'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          توثيق الحسابات
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`relative py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <span>الطلبات</span>
          {pendingRequestsCount > 0 && (
            <span className="ms-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[9px] font-mono">
              {pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          سجل التدقيق
        </button>
      </div>

      {/* TAB 1: Direct Verification Search & Control */}
      {activeTab === 'verification' && (
        <div className="space-y-4 animate-scale-up">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن حساب باسم المستخدم @ أو المعرف UID..."
              className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl ps-10 pe-20 py-3 text-xs text-white placeholder-[#64748B] focus:outline-none transition-colors"
            />
            <Search className="w-4 h-4 text-[#64748B] absolute start-3.5 top-3.5" />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute end-2 top-2 px-3.5 py-1.5 bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'بحث'}
            </button>
          </form>

          {/* Search Results */}
          <div className="space-y-2.5">
            {searchResults.length > 0 ? (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      onClick={() => onSelectUserForProfile?.(user.id)}
                      className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
                    >
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-black border border-[#2A2F3A] shrink-0">
                        <img
                          src={
                            user.photoURL ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName)}`
                          }
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white group-hover:text-[#4F8CFF] transition-colors truncate">
                            {user.displayName}
                          </span>
                          {user.isVerified && (
                            <VerifiedBadge category={user.verificationCategory || 'blue'} />
                          )}
                        </div>
                        <span className="text-[11px] text-[#94A3B8] font-mono block">@{user.handle}</span>
                      </div>
                    </div>

                    <VerificationStatusIndicator
                      status={user.isVerified ? 'verified' : 'not_verified'}
                    />
                  </div>

                  {/* Admin Actions Toolbar */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2F3A]/60">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setVerificationModalMode('details');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#0B0F19] border border-[#2A2F3A] hover:bg-[#1E1E2E] text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      التفاصيل
                    </button>

                    {user.isVerified ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setVerificationModalMode('revoke');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-950/30 border border-red-500/40 hover:bg-red-900/40 text-red-400 text-xs font-bold transition-colors cursor-pointer"
                      >
                        سحب التوثيق
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setVerificationModalMode('grant');
                        }}
                        className="px-4 py-1.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-md shadow-[#3B6DFF]/25 transition-all cursor-pointer"
                      >
                        منح التوثيق ✨
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : searchQuery && !isSearching ? (
              <div className="py-8 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4">
                <p className="text-xs text-[#94A3B8]">لم يتم العثور على أي حساب يطابق البحث.</p>
              </div>
            ) : (
              <div className="py-8 text-center bg-[#161B26]/60 border border-[#2A2F3A] rounded-2xl p-6 space-y-2">
                <ShieldCheck className="w-8 h-8 text-[#3B6DFF] mx-auto" />
                <h4 className="text-xs font-bold text-white">البحث والتحكم في توثيق الحسابات</h4>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  يمكن للمسؤولين منح أو سحب شارة التوثيق لأي عضو مباشرة عبر البحث بمعرف الحساب أو من ملفه الشخصي.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Verification Requests Queue */}
      {activeTab === 'requests' && (
        <div className="space-y-3 animate-scale-up">
          {requestsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : requests.length > 0 ? (
            requests.map((req) => (
              <div
                key={req.id}
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {req.userDisplayName || req.legalName || req.userHandle || 'متقدم للتوثيق'}
                    </span>
                    <span className="text-[11px] text-[#4F8CFF] font-mono block">فئة: {req.category || 'blue'} • @{req.userHandle}</span>
                    <span className="text-[10px] text-[#64748B] font-mono block">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      req.status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : req.status === 'rejected'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {req.status === 'approved' ? 'مقبول' : req.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                  </span>
                </div>

                {req.evidenceDetails && (
                  <p className="text-xs text-[#CBD5E1] bg-[#0B0F19] p-2.5 rounded-xl border border-[#2A2F3A]">
                    {req.evidenceDetails}
                  </p>
                )}

                {req.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#2A2F3A]/60">
                    <button
                      type="button"
                      onClick={() => handleRejectRequest(req)}
                      className="py-2 rounded-xl bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-900/30 text-xs font-bold transition-colors cursor-pointer"
                    >
                      رفض الطلب
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveRequest(req)}
                      className="py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold transition-all shadow-md shadow-[#3B6DFF]/25 cursor-pointer"
                    >
                      قبول ومنح التوثيق
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4">
              <Clock className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
              <p className="text-xs text-[#94A3B8]">لا توجد طلبات توثيق معلقة حالياً.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Immutable Audit Logs */}
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
                className="bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3.5 space-y-1.5 text-xs shadow-sm"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#4F8CFF]">{log.actorName}</span>
                  <span className="text-[#64748B] font-mono text-[10px]">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-white font-medium">
                  {log.targetDetails || `${log.actionType} on ${log.targetId}`}
                </div>
                {log.reason && (
                  <div className="text-[11px] text-[#94A3B8] bg-[#0B0F19] p-2 rounded-xl border border-[#2A2F3A]">
                    السبب: {log.reason}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-4">
              <History className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
              <p className="text-xs text-[#94A3B8]">لا توجد سجلات تدقيق إدارية مسجلة حتى الآن.</p>
            </div>
          )}
        </div>
      )}

      {/* Verification Action Modal */}
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
          }}
        />
      )}
    </div>
  );
}
