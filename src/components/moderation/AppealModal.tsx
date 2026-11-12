import React, { useState } from 'react';
import { X, Scale, FileText, Loader2, Check } from 'lucide-react';
import { UserProfile } from '../../types';
import { submitModerationAppeal } from '../../services/firestore';
import { useToast } from '../../context/ToastContext';

interface AppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  actionAppealed?: string;
  targetContentSnippet?: string;
}

export function AppealModal({
  isOpen,
  onClose,
  currentUser,
  actionAppealed = 'إجراء إداري / مخالفة محتوى',
  targetContentSnippet,
}: AppealModalProps) {
  const { showToast } = useToast();
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id || !appealReason.trim()) return;

    try {
      setSubmitting(true);
      await submitModerationAppeal({
        userId: currentUser.id,
        userHandle: currentUser.handle,
        userDisplayName: currentUser.displayName,
        actionAppealed,
        targetContentSnippet,
        appealReason: appealReason.trim(),
      });
      showToast('تم تقديم طلب التظلم بنجاح! سيتم مراجعته من قبل مجلس الرقابة.', 'success');
      onClose();
    } catch (err) {
      showToast('تعذر إرسال طلب التظلم', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F19]/85 backdrop-blur-md flex items-center justify-center p-4 font-tajawal">
      <div className="w-full max-w-md bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2A2F3A] pb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#3B6DFF]" />
            <h3 className="text-sm font-bold text-white">
              تقديم طلب تظلم إداري (Appeal)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="p-3 bg-[#0B0F19]/60 rounded-xl border border-[#2A2F3A] text-xs text-slate-300">
            <span className="text-[#4F8CFF] font-bold block mb-1">الإجراء المتظلم منه:</span>
            <p>{actionAppealed}</p>
            {targetContentSnippet && (
              <p className="mt-1 text-slate-400 italic text-[11px]">
                "{targetContentSnippet}"
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              أسباب التظلم وتوضيح الموقف:
            </label>
            <textarea
              rows={4}
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="اشرح لم تعتقد أن هذا الإجراء تم عن طريق الخطأ أو قدم أدلة تدعم موقفك..."
              className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none resize-none"
              required
            />
          </div>

          <div className="pt-2 border-t border-[#2A2F3A] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold shadow-md shadow-[#3B6DFF]/25 disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>إرسال التظلم</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
