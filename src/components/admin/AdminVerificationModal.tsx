import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  Check,
  Fingerprint,
  FileLock2
} from 'lucide-react';
import { UserProfile, VerificationCategory, AdminVerificationNote } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  updateUserVerificationDirect,
  getAdminVerificationNote
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge, VerificationStatusIndicator, RoleBadge } from '../common/VerifiedBadge';
import { MediaImage } from '../common/MediaImage';

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
  const { currentUser, isAdmin, isOwner } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [category, setCategory] = useState<VerificationCategory>(
    targetUser.verificationCategory || 'blue'
  );
  const [adminNote, setAdminNote] = useState('');
  const [existingNote, setExistingNote] = useState<AdminVerificationNote | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCategory(targetUser.verificationCategory || 'blue');
    setAdminNote('');
    if (!isOpen || !isAdmin) return;

    let mounted = true;
    setLoadingNote(true);
    getAdminVerificationNote(targetUser.id)
      .then((noteDoc) => {
        if (!mounted) return;
        setExistingNote(noteDoc);
        if (noteDoc?.note && mode === 'grant') {
          setAdminNote(noteDoc.note);
        }
      })
      .finally(() => {
        if (mounted) setLoadingNote(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, isAdmin, targetUser.id, targetUser.verificationCategory, mode]);

  if (!isOpen || !isAdmin || !currentUser) return null;

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

      showToast(`تم توثيق حساب @${targetUser.handle} بنجاح`, 'success');
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

  const tiers: Array<{
    id: VerificationCategory;
    label: string;
    desc: string;
    ownerOnly?: boolean;
  }> = [
    { id: 'blue', label: 'أزرق قياسي', desc: 'Verified Member' },
    { id: 'silver', label: 'فضي شخصي', desc: 'Prominent Figure' },
    { id: 'institution', label: 'ذهبي مؤسسي', desc: 'Official Entity' },
    ...(isOwner ? [{ id: 'blood_red' as const, label: 'ملكي خاص', desc: 'Executive', ownerOnly: true }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto font-tajawal">
      <div className="w-full max-w-md bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between bg-slate-50 dark:bg-[#161B26]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              aria-label={t('close')}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {mode === 'grant' && <ShieldCheck className="w-5 h-5 text-[#3B6DFF]" />}
              {mode === 'revoke' && <ShieldAlert className="w-5 h-5 text-red-500" />}
              {mode === 'details' && <Fingerprint className="w-5 h-5 text-[#3B6DFF]" />}
              <span>
                {mode === 'grant' &&
                  (targetUser.isVerified ? t('changeVerificationTier') : t('grantVerification'))}
                {mode === 'revoke' && t('removeVerification')}
                {mode === 'details' && t('accountTechnicalDetails')}
              </span>
            </h2>
          </div>
        </div>

        {/* Target User Summary */}
        <div className="p-4 bg-slate-50/60 dark:bg-[#161B26]/50 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#2A2F3A] shrink-0">
            <MediaImage
              src={targetUser.photoURL}
              alt={targetUser.displayName}
              variant="avatar"
              fallbackText={targetUser.displayName}
              containerClassName="w-full h-full overflow-hidden"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {targetUser.displayName}
              </span>
              {targetUser.isVerified && (
                <VerifiedBadge
                  category={targetUser.verificationCategory || 'blue'}
                  interactive={false}
                />
              )}
              <RoleBadge role={targetUser.role} />
            </div>
            <span className="text-xs text-slate-500 dark:text-[#94A3B8] font-mono block">
              @{targetUser.handle}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-[#64748B] font-mono block mt-0.5 truncate">
              UID: {targetUser.id}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {mode === 'grant' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                  فئة شارة التوثيق
                </label>
                <div className={`grid ${isOwner ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                  {tiers.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        category === cat.id
                          ? 'bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/20 border-[#3B6DFF] text-slate-900 dark:text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-[#161B26] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8] hover:border-[#3B6DFF]/40'
                      }`}
                    >
                      <VerifiedBadge category={cat.id} className="w-4 h-4" interactive={false} />
                      <span className="text-xs font-bold block">{cat.label}</span>
                      <span className="text-[10px] text-slate-500 dark:text-[#64748B] block">
                        {cat.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <FileLock2 className="w-3.5 h-3.5 text-[#3B6DFF]" />
                  <span>ملاحظة إدارية داخلية (Admin-Only)</span>
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="سبب المنح أو المرجع التوثيقي (لا يظهر للعامة)..."
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
                />
                <span className="text-[10px] text-slate-500 dark:text-[#64748B] mt-1 block">
                  تحفظ هذه الملاحظة في المسار الإداري الخاص وتُسجل العملية في سجل التدقيق.
                </span>
              </div>

              <button
                type="button"
                onClick={handleGrant}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#3B6DFF]/25 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>تأكيد منح التوثيق</span>
              </button>
            </>
          )}

          {mode === 'revoke' && (
            <>
              <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 flex items-start gap-2.5 text-red-700 dark:text-red-400 text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  أنت على وشك سحب شارة التوثيق المعتمدة من هذا الحساب. ستتم إزالة الشارة فوراً وتسجيل القرار في سجل التدقيق.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                  سبب سحب التوثيق
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="مخالفة الشروط، انتحال هوية، تغيير النشاط..."
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-red-500 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleRevoke}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                <span>تأكيد سحب التوثيق</span>
              </button>
            </>
          )}

          {mode === 'details' && (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 dark:bg-[#161B26] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A2F3A] space-y-2.5">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                  <span className="text-slate-500 dark:text-[#94A3B8]">المعرف الرقمي (UID):</span>
                  <span className="text-slate-900 dark:text-white font-mono select-all text-[11px]">
                    {targetUser.id}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                  <span className="text-slate-500 dark:text-[#94A3B8]">الرتبة في النظام:</span>
                  <RoleBadge role={targetUser.role || 'user'} />
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                  <span className="text-slate-500 dark:text-[#94A3B8]">{t('verificationStatusLabel')}:</span>
                  <VerificationStatusIndicator
                    status={
                      targetUser.isVerified
                        ? 'verified'
                        : targetUser.verificationStatus || 'not_verified'
                    }
                    category={targetUser.verificationCategory || 'blue'}
                  />
                </div>
                {targetUser.verifiedAt && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                    <span className="text-slate-500 dark:text-[#94A3B8]">تاريخ التوثيق:</span>
                    <span className="text-slate-900 dark:text-white font-mono tabular-nums text-[11px]">
                      {new Date(targetUser.verifiedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {(targetUser.verifiedByName || targetUser.verifiedBy) && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                    <span className="text-slate-500 dark:text-[#94A3B8]">تم الاعتماد بواسطة:</span>
                    <span className="text-slate-900 dark:text-white font-mono text-[11px]">
                      {targetUser.verifiedByName || targetUser.verifiedBy}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-[#2A2F3A]/60">
                  <span className="text-slate-500 dark:text-[#94A3B8]">الإنذارات المسجلة:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold tabular-nums">
                    {targetUser.warningCount || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 dark:text-[#94A3B8]">{t('joinedLabel')}:</span>
                  <span className="text-slate-900 dark:text-white font-mono tabular-nums text-[11px]">
                    {targetUser.createdAt ? new Date(targetUser.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>

              {/* Admin-only private verification note */}
              <div className="bg-slate-50 dark:bg-[#161B26] p-3.5 rounded-2xl border border-slate-200 dark:border-[#2A2F3A] space-y-1">
                <div className="text-[11px] font-bold text-[#3B6DFF] flex items-center gap-1.5">
                  <FileLock2 className="w-3.5 h-3.5" />
                  <span>الملاحظة الإدارية الداخلية الخاصة</span>
                </div>
                {loadingNote ? (
                  <div className="py-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري التحميل...</span>
                  </div>
                ) : existingNote?.note ? (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      {existingNote.note}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {existingNote.updatedByName || existingNote.updatedBy} ·{' '}
                      {new Date(existingNote.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-[#64748B]">
                    لا توجد ملاحظة داخلية مسجلة لهذا الحساب.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:bg-slate-200 dark:hover:bg-[#1E1E2E] text-slate-900 dark:text-white font-bold text-xs cursor-pointer transition-colors"
              >
                {t('close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
