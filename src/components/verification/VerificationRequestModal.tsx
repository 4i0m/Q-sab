import React, { useState, useEffect } from 'react';
import {
  X,
  BadgeCheck,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react';
import { UserProfile, VerificationRequest, VerificationStatus } from '../../types';
import {
  submitVerificationRequest,
  listenToUserVerificationRequest
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge, VerificationStatusIndicator } from '../common/VerifiedBadge';

interface VerificationRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export function VerificationRequestModal({
  isOpen,
  onClose,
  currentUser,
}: VerificationRequestModalProps) {
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'blue' | 'silver' | 'institution'>('blue');
  const [legalName, setLegalName] = useState('');
  const [documentType, setDocumentType] = useState('هوية وطنية / جواز سفر');
  const [organizationName, setOrganizationName] = useState('');
  const [officialWebsite, setOfficialWebsite] = useState('');
  const [evidenceDetails, setEvidenceDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = listenToUserVerificationRequest(currentUser.id, (req) => {
      setExistingRequest(req);
    });
    return () => unsub();
  }, [currentUser?.id]);

  if (!isOpen) return null;

  // Derive truthful overall status from user record + latest request
  const derivedStatus: VerificationStatus = currentUser.isVerified
    ? 'verified'
    : currentUser.verificationStatus ||
      (existingRequest?.status === 'approved'
        ? 'verified'
        : existingRequest?.status === 'rejected'
        ? 'rejected'
        : existingRequest?.status === 'pending' || existingRequest?.status === 'more_info_needed'
        ? 'pending'
        : 'not_verified');

  const isPendingReview = derivedStatus === 'pending' && !currentUser.isVerified;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    if (!evidenceDetails.trim()) {
      showToast('يرجى كتابة تفاصيل وأدلة التوثيق', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await submitVerificationRequest({
        userId: currentUser.id,
        userHandle: currentUser.handle,
        userDisplayName: currentUser.displayName,
        userPhotoURL: currentUser.photoURL,
        category: selectedCategory,
        legalName: selectedCategory === 'institution' ? undefined : legalName.trim(),
        documentType: selectedCategory === 'institution' ? undefined : documentType,
        organizationName: selectedCategory === 'institution' ? organizationName.trim() : undefined,
        officialWebsite: selectedCategory === 'institution' ? officialWebsite.trim() : undefined,
        evidenceDetails: evidenceDetails.trim(),
      });

      showToast('تم إرسال طلب التوثيق للمراجعة الإدارية بنجاح', 'success');
      onClose();
    } catch (err) {
      console.error('Verification request submission error:', err);
      showToast('تعذر إرسال طلب التوثيق. تحقق من الصلاحيات أو حاول مجدداً.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-[#0B0F19]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal">
      <div className="w-full max-w-lg bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#0B0F19]/60">
          <div className="flex items-center gap-2.5">
            <BadgeCheck className="w-5 h-5 text-[#3B6DFF]" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('verificationAndBadges')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Account Verification Status Bar */}
        <div className="p-4 bg-slate-50/70 dark:bg-[#0B0F19]/80 border-b border-slate-200 dark:border-[#2A2F3A] shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('verificationStatusLabel')}:
            </span>
            <VerificationStatusIndicator
              status={derivedStatus}
              category={currentUser.verificationCategory || 'blue'}
            />
          </div>

          {existingRequest && (
            <div className="pt-2 border-t border-slate-200 dark:border-[#2A2F3A]/60 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  {existingRequest.status === 'pending' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                  {existingRequest.status === 'approved' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  {(existingRequest.status === 'rejected' || existingRequest.status === 'more_info_needed') && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span>آخر طلب: {existingRequest.category}</span>
                </span>
                <span className="font-mono tabular-nums text-[10px]">
                  {new Date(existingRequest.createdAt).toLocaleDateString()}
                </span>
              </div>

              {existingRequest.reviewerNotes && (
                <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161B26] p-2.5 rounded-xl border border-slate-200 dark:border-[#2A2F3A]">
                  ملاحظة المراجع: {existingRequest.reviewerNotes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* If already verified, show confirmation card without fake self-edit */}
        {currentUser.isVerified ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#3B6DFF]/10 border border-[#3B6DFF]/30 flex items-center justify-center">
              <VerifiedBadge
                category={currentUser.verificationCategory || 'blue'}
                className="w-8 h-8"
                interactive={false}
              />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('verifiedOfficialTitle')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                حسابك يحمل شارة التوثيق المعتمدة من إدارة Q ({currentUser.verificationCategory || 'blue'}).
              </p>
              {currentUser.verifiedAt && (
                <p className="text-[11px] text-slate-500 dark:text-[#64748B] font-mono tabular-nums pt-1">
                  {new Date(currentUser.verifiedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold hover:bg-slate-200 dark:hover:bg-[#1E1E2E] transition-colors cursor-pointer"
            >
              {t('close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-none">
            {isPendingReview && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  لديك طلب قيد المراجعة حالياً من قِبل إدارة Q. يمكنك إرسال طلب محدث إذا أضفت أدلة جديدة.
                </span>
              </div>
            )}

            {/* Category Chooser (blue | silver | institution) */}
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white mb-2">
                اختر فئة التوثيق المطلوبة:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'blue' as const,
                    title: 'الأزرق القياسي',
                    desc: 'الشخصيات العامة وصناع المحتوى',
                  },
                  {
                    id: 'silver' as const,
                    title: 'الفضي الشخصي',
                    desc: 'الكتاب والمفكرون والمهنيون',
                  },
                  {
                    id: 'institution' as const,
                    title: 'المؤسسي الذهبي',
                    desc: 'الشركات والجهات الرسمية',
                  },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`p-3 rounded-2xl border text-start transition-all flex items-start gap-2.5 cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'border-[#3B6DFF] bg-[#3B6DFF]/10 dark:bg-[#0B0F19] shadow-sm'
                        : 'border-slate-200 dark:border-[#2A2F3A] bg-slate-50 dark:bg-[#0B0F19]/60 hover:border-[#3B6DFF]/40'
                    }`}
                  >
                    <VerifiedBadge category={cat.id} className="w-5 h-5 shrink-0 mt-0.5" interactive={false} />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{cat.title}</h4>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                        {cat.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category-Specific Fields */}
            {selectedCategory !== 'institution' ? (
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-[#0B0F19]/60 border border-slate-200 dark:border-[#2A2F3A] rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم القانوني الكامل
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="كما يظهر في الوثيقة الرسمية..."
                    className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نوع الوثيقة الثبوتية
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-xs text-slate-900 dark:text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="هوية وطنية / جواز سفر">هوية وطنية / جواز سفر حكومي</option>
                    <option value="رخصة مهنية معتمدة">رخصة مهنية / نقابية معتمدة</option>
                    <option value="اعتماد أكاديمي">اعتماد أكاديمي أو صحفي</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-[#0B0F19]/60 border border-slate-200 dark:border-[#2A2F3A] rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الرسمي للمؤسسة أو الشركة
                  </label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="اسم الكيان الرسمي المسجل..."
                    className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الموقع الإلكتروني الرسمي
                  </label>
                  <input
                    type="url"
                    value={officialWebsite}
                    onChange={(e) => setOfficialWebsite(e.target.value)}
                    placeholder="https://company.com"
                    className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none text-left"
                    dir="ltr"
                    required
                  />
                </div>
              </div>
            )}

            {/* Evidence */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                أدلة التوثيق والروابط التعريفية
              </label>
              <textarea
                rows={4}
                value={evidenceDetails}
                onChange={(e) => setEvidenceDetails(e.target.value)}
                maxLength={2000}
                placeholder="ضع روابط مقالات، مشاريع منشورة، حسابات رسمية موثقة أخرى، أو وصفاً واضحاً لإثبات هويتك..."
                className="w-full bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none"
                required
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                تتم مراجعة الطلبات من قِبل مسؤولي إدارة Q ولا يمكن منح الشارة ذاتياً.
              </span>
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#2A2F3A] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-md shadow-[#3B6DFF]/25 disabled:opacity-50 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>{t('applyForVerification')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
