import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  Check,
  Building2,
  Award,
  Calendar,
  User,
  Mail,
  Fingerprint
} from 'lucide-react';
import { UserProfile, VerificationCategory, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { updateUserVerificationDirect } from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';

interface AdminVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile;
  mode: 'grant' | 'revoke' | 'details';
  onSuccess?: () => void;
}

export function AdminVerificationModal({
  isOpen,
  onClose,
  targetUser,
  mode,
  onSuccess,
}: AdminVerificationModalProps) {
  const { currentUser, isStaff, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [category, setCategory] = useState<VerificationCategory>(
    targetUser.verificationCategory || 'blue'
  );
  const [adminNote, setAdminNote] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !isStaff || !currentUser) return null;

  const handleGrant = async () => {
    try {
      setLoading(true);
      await updateUserVerificationDirect(
        targetUser.id,
        true,
        category,
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        adminNote.trim() || undefined
      );

      showToast(`تم توثيق حساب @${targetUser.handle} بنجاح ✨`, 'success');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to grant verification:', err);
      showToast(err.message || 'فشل في توثيق الحساب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    try {
      setLoading(true);
      await updateUserVerificationDirect(
        targetUser.id,
        false,
        'blue',
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role },
        adminNote.trim() || 'Revoked by administrator'
      );

      showToast(`تم سحب شارة التوثيق من @${targetUser.handle}`, 'info');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to revoke verification:', err);
      showToast(err.message || 'فشل في سحب التوثيق', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#0B0F19] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto animate-scale-up">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1 rounded-full text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-white font-tajawal flex items-center gap-2">
              {mode === 'grant' && <ShieldCheck className="w-5 h-5 text-[#3B6DFF]" />}
              {mode === 'revoke' && <ShieldAlert className="w-5 h-5 text-red-400" />}
              {mode === 'details' && <Fingerprint className="w-5 h-5 text-[#38BDF8]" />}
              <span>
                {mode === 'grant' && 'منح شارة التوثيق (إدارة Q)'}
                {mode === 'revoke' && 'سحب شارة التوثيق'}
                {mode === 'details' && 'تفاصيل الحساب الفنية'}
              </span>
            </h2>
          </div>
        </div>

        {/* Target User Summary Card */}
        <div className="p-4 bg-[#161B26]/50 border-b border-[#2A2F3A] flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-black border border-[#2A2F3A] shrink-0">
            <img
              src={
                targetUser.photoURL ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetUser.displayName)}`
              }
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white font-tajawal truncate">
                {targetUser.displayName}
              </span>
              {targetUser.isVerified && (
                <VerifiedBadge category={targetUser.verificationCategory || 'blue'} />
              )}
            </div>
            <span className="text-xs text-[#94A3B8] font-mono block">@{targetUser.handle}</span>
            <span className="text-[10px] text-[#64748B] font-mono block mt-0.5 truncate">
              UID: {targetUser.id}
            </span>
          </div>
        </div>

        {/* Content based on Mode */}
        <div className="p-5 space-y-4 font-tajawal">
          {mode === 'grant' && (
            <>
              <div>
                <label className="block text-xs font-bold text-white mb-2">نوع وفئة التوثيق</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'blue', label: 'أزرق قياسي', desc: 'Verified Member', color: 'border-[#3B6DFF]' },
                    { id: 'silver', label: 'فضي شخصي', desc: 'Prominent Figure', color: 'border-slate-300' },
                    { id: 'institution', label: 'ذهبي مؤسسي', desc: 'Official Entity', color: 'border-amber-400' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id as VerificationCategory)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                        category === cat.id
                          ? 'bg-[#3B6DFF]/20 border-[#3B6DFF] text-white shadow-md'
                          : 'bg-[#161B26] border-[#2A2F3A] text-[#94A3B8] hover:border-[#3B6DFF]/40'
                      }`}
                    >
                      <span className="text-xs font-bold block">{cat.label}</span>
                      <span className="text-[10px] text-[#64748B] block mt-0.5">{cat.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  ملاحظة إدارية داخلية (Internal Admin Note)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="سبب منح التوثيق أو المستندات المرجعية..."
                  rows={3}
                  className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-white focus:outline-none resize-none"
                />
                <span className="text-[10px] text-[#64748B] mt-1 block">
                  يتم حفظ هذه الملاحظة وتوقيع المسؤول في سجل التدقيق الأمني (Audit Log).
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGrant}
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#3B6DFF]/30 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>تأكيد منح شارة التوثيق</span>
                </button>
              </div>
            </>
          )}

          {mode === 'revoke' && (
            <>
              <div className="p-3.5 rounded-2xl bg-red-950/20 border border-red-500/30 flex items-start gap-2.5 text-red-400 text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  أنت على وشك سحب شارة التوثيق المعتمدة من هذا الحساب. ستتم إزالة الشارة فوراً وتسجيل العملية في سجلات الإدارة.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">سبب السحب</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="مخالفة الشروط، انتحال هوية، إلخ..."
                  rows={3}
                  className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-red-500 rounded-xl p-3 text-xs text-white focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>تأكيد سحب التوثيق</span>
                </button>
              </div>
            </>
          )}

          {mode === 'details' && (
            <div className="space-y-2.5 text-xs">
              <div className="bg-[#161B26] p-3 rounded-2xl border border-[#2A2F3A] space-y-2">
                <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                  <span className="text-[#94A3B8]">المعرف الرقمي:</span>
                  <span className="text-white font-mono select-all text-[11px]">{targetUser.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                  <span className="text-[#94A3B8]">الرتبة في النظام:</span>
                  <span className="text-[#4F8CFF] font-bold">{targetUser.role || 'user'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                  <span className="text-[#94A3B8]">حالة التوثيق:</span>
                  <span className={targetUser.isVerified ? 'text-emerald-400 font-bold' : 'text-[#64748B]'}>
                    {targetUser.isVerified ? `موثق (${targetUser.verificationCategory || 'blue'})` : 'غير موثق'}
                  </span>
                </div>
                {targetUser.verifiedAt && (
                  <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                    <span className="text-[#94A3B8]">تاريخ التوثيق:</span>
                    <span className="text-white font-mono text-[11px]">{new Date(targetUser.verifiedAt).toLocaleDateString()}</span>
                  </div>
                )}
                {targetUser.verifiedBy && (
                  <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                    <span className="text-[#94A3B8]">تم التوثيق بواسطة:</span>
                    <span className="text-white font-mono text-[11px]">{targetUser.verifiedBy}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-[#2A2F3A]/60">
                  <span className="text-[#94A3B8]">عدد الإنذارات:</span>
                  <span className="text-amber-400 font-bold">{targetUser.warningCount || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#94A3B8]">تاريخ التسجيل:</span>
                  <span className="text-white font-mono text-[11px]">
                    {targetUser.createdAt ? new Date(targetUser.createdAt).toLocaleDateString() : '2026'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#161B26] border border-[#2A2F3A] hover:bg-[#1E1E2E] text-white font-bold text-xs cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
