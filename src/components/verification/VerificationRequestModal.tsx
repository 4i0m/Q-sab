import React, { useState, useEffect } from 'react';
import {
  X,
  BadgeCheck,
  Building2,
  Sparkles,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  Globe
} from 'lucide-react';
import { UserProfile, VerificationCategory, VerificationRequest } from '../../types';
import {
  submitVerificationRequest,
  listenToUserVerificationRequest
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';

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

  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'silver' | 'institution'>('silver');
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
        legalName: selectedCategory === 'silver' ? legalName.trim() : undefined,
        documentType: selectedCategory === 'silver' ? documentType : undefined,
        organizationName: selectedCategory === 'institution' ? organizationName.trim() : undefined,
        officialWebsite: selectedCategory === 'institution' ? officialWebsite.trim() : undefined,
        evidenceDetails: evidenceDetails.trim(),
      });

      showToast('تم إرسال طلب التوثيق للمراجعة الإدارية بنجاح! 🛡️', 'success');
      onClose();
    } catch (err) {
      showToast('تعذر إرسال طلب التوثيق', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F19]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal">
      <div className="w-full max-w-lg bg-[#161B26] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2A2F3A] flex items-center justify-between shrink-0 bg-[#0B0F19]/60">
          <div className="flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-[#3B6DFF]" />
            <h2 className="text-sm font-bold text-white">
              منظومة التوثيق الرسمية في Q
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Application Status if present */}
        {existingRequest && (
          <div className="p-3.5 bg-[#0B0F19]/80 border-b border-[#2A2F3A] shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {existingRequest.status === 'pending' && (
                  <Clock className="w-4 h-4 text-[#4F8CFF] animate-spin" />
                )}
                {existingRequest.status === 'approved' && (
                  <Check className="w-4 h-4 text-emerald-400" />
                )}
                {existingRequest.status === 'rejected' && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                {existingRequest.status === 'more_info_needed' && (
                  <AlertCircle className="w-4 h-4 text-[#4F8CFF]" />
                )}

                <span className="text-xs font-bold text-white">
                  حالة طلب التوثيق السابق:
                </span>
              </div>

              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                  existingRequest.status === 'approved'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : existingRequest.status === 'rejected'
                    ? 'bg-red-950/60 border-red-500/40 text-red-300'
                    : existingRequest.status === 'more_info_needed'
                    ? 'bg-[#3B6DFF]/20 border-[#3B6DFF]/40 text-[#4F8CFF]'
                    : 'bg-[#161B26] border-[#2A2F3A] text-slate-300'
                }`}
              >
                {existingRequest.status === 'pending' && 'قيد المراجعة الإدارية'}
                {existingRequest.status === 'approved' && 'تمت الموافقة ✓'}
                {existingRequest.status === 'rejected' && 'تم الرفض'}
                {existingRequest.status === 'more_info_needed' && 'مطلوب معلومات إضافية'}
              </span>
            </div>

            {existingRequest.reviewerNotes && (
              <p className="text-[11px] text-neutral-300 font-tajawal mt-1 bg-black/50 p-2 rounded-xl border border-neutral-800">
                ملاحظات المراجع الإداري: {existingRequest.reviewerNotes}
              </p>
            )}
          </div>
        )}

        {/* Categories Overview Box */}
        <div className="p-3 bg-[#080808] border-b border-neutral-800/60 shrink-0">
          <div className="grid grid-cols-2 gap-2 text-start">
            {/* Blue Info */}
            <div className="p-2 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center gap-2">
              <VerifiedBadge category="blue" className="w-4 h-4" />
              <div>
                <span className="text-[10px] font-bold text-white font-tajawal block">التوثيق الأزرق (الأصلي)</span>
                <span className="text-[9px] text-neutral-400 font-tajawal">الشخصيات العامة وصناع المحتوى البارزون</span>
              </div>
            </div>

            {/* Blood-Red Info */}
            <div className="p-2 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center gap-2">
              <VerifiedBadge category="blood_red" className="w-4 h-4" />
              <div>
                <span className="text-[10px] font-bold text-rose-300 font-tajawal block">التوثيق الملكي الدموي</span>
                <span className="text-[9px] text-neutral-400 font-tajawal">حسابات استثنائية بقرار مباشر من المالك</span>
              </div>
            </div>
          </div>
        </div>

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
          {/* Category Chooser */}
          <div>
            <label className="block text-xs font-bold text-white font-tajawal mb-2">
              اختر فئة التوثيق المطلوبة:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Silver Option */}
              <button
                type="button"
                onClick={() => setSelectedCategory('silver')}
                className={`p-3 rounded-2xl border text-start transition-all flex items-start gap-2.5 ${
                  selectedCategory === 'silver'
                    ? 'border-slate-300 bg-neutral-900 shadow-md shadow-slate-400/10'
                    : 'border-neutral-800 bg-[#111] hover:border-neutral-700'
                }`}
              >
                <VerifiedBadge category="silver" className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white font-tajawal">التوثيق الفضي</h4>
                  <p className="text-[10px] text-neutral-400 font-tajawal mt-0.5">
                    للأفراد المتميزين، الكتاب، المفكرين، والمهنيين المستقلين
                  </p>
                </div>
              </button>

              {/* Institutional Option */}
              <button
                type="button"
                onClick={() => setSelectedCategory('institution')}
                className={`p-3 rounded-2xl border text-start transition-all flex items-start gap-2.5 ${
                  selectedCategory === 'institution'
                    ? 'border-[#3B6DFF] bg-[#0B0F19] shadow-md shadow-[#3B6DFF]/15'
                    : 'border-[#2A2F3A] bg-[#0B0F19]/60 hover:border-[#3B6DFF]/40'
                }`}
              >
                <VerifiedBadge category="institution" className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">التوثيق المؤسسي</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    للشركات، المنظمات، العلامات التجارية، والجهات الرسمية
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Fields based on Category */}
          {selectedCategory === 'silver' ? (
            <div className="space-y-3 p-3 bg-[#0B0F19]/60 border border-[#2A2F3A] rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الاسم القانوني الكامل (Legal Full Name)
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="كما يظهر في الوثيقة الرسمية..."
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  نوع الوثيقة الثبوتية
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="هوية وطنية / جواز سفر">هوية وطنية / جواز سفر حكومي</option>
                  <option value="رخصة مهنية معتمدة">رخصة مهنية / نقابية معتمدة</option>
                  <option value="شهادة تخرج أو اعتماد أكاديمي">اعتماد أكاديمي أو براءة اختراع</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-[#0B0F19]/60 border border-[#2A2F3A] rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الاسم الرسمي للمؤسسة أو الشركة (Organization Name)
                </label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="اسم الكيان الرسمي المسجل..."
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الموقع الإلكتروني الرسمي (Official Website)
                </label>
                <input
                  type="url"
                  value={officialWebsite}
                  onChange={(e) => setOfficialWebsite(e.target.value)}
                  placeholder="https://company.com"
                  className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none text-left"
                  dir="ltr"
                  required
                />
              </div>
            </div>
          )}

          {/* Evidence and Details */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              أدلة التوثيق والروابط التعريفية (Evidence & Links)
            </label>
            <textarea
              rows={4}
              value={evidenceDetails}
              onChange={(e) => setEvidenceDetails(e.target.value)}
              placeholder="ضع روابط مقالات صحفية، مشاريع منشورة، وثائق رسمية، حسابات موثقة أخرى، أو أي إثباتات تؤكد هويتك وأهليتك..."
              className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none resize-none"
              required
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              تتم مراجعة الطلبات بدقة من قبل هيئة الرقابة والإدارة في Q. لن يتم إفشاء بياناتك لأي طرف ثالث.
            </span>
          </div>

          {/* Submit Action */}
          <div className="pt-2 border-t border-[#2A2F3A] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-md shadow-[#3B6DFF]/25 disabled:opacity-50 flex items-center gap-1.5 transition-all active:scale-95"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>إرسال طلب التوثيق للمراجعة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
