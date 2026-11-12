import { X, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface PlatinumVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityName?: string;
  verificationDate?: string;
}

export function PlatinumVerificationModal({
  isOpen,
  onClose,
  entityName = 'وزارة الداخلية / جهة رسمية معتمدة',
  verificationDate = '2026-01-15',
}: PlatinumVerificationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#141414] via-[#0D0D0D] to-[#080808] border border-amber-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-5 overflow-hidden">
        
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 end-4 p-1.5 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors border border-neutral-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Platinum Shield Icon Emblem */}
        <div className="relative mx-auto mt-2 w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-slate-300 via-white to-slate-400 opacity-20 blur-xl" />
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-slate-200 via-neutral-100 to-slate-400 p-[2px] shadow-2xl border border-slate-300/40">
            <div className="w-full h-full rounded-2xl bg-gradient-to-b from-[#1f242e] to-[#0d1017] flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-12 h-12 text-slate-100 drop-shadow-[0_2px_10px_rgba(255,255,255,0.4)]" />
            </div>
          </div>
        </div>

        {/* Title and subtitle */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white font-tajawal tracking-tight">
            توثيق بلاتيني
          </h2>
          <p className="text-xs font-bold text-amber-400 font-tajawal">
            جهة حكومية معتمدة
          </p>
          <p className="text-xs text-neutral-400 font-tajawal pt-1 leading-relaxed px-2">
            تم التحقق من هوية هذا الحساب بواسطة إحدى الجهات الحكومية أو المؤسسية الرسمية.
          </p>
        </div>

        {/* Verification Info Table Card */}
        <div className="bg-[#111111] border border-neutral-800/80 rounded-2xl p-4 text-xs font-tajawal space-y-2.5 text-start">
          <div className="text-[11px] font-bold text-amber-400/90 pb-1 border-b border-neutral-800/60">
            معلومات التوثيق
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">نوع التوثيق:</span>
            <span className="font-bold text-slate-200">بلاتيني</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">الجهة التابعة:</span>
            <span className="font-bold text-neutral-200">{entityName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">تاريخ التوثيق:</span>
            <span className="font-mono-subtle text-neutral-300">{verificationDate}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400">حالة التوثيق:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              نشط
            </span>
          </div>
        </div>

        {/* Footer Note */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 font-tajawal">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
          <span>تم التحقق من هوية هذا الحساب وفقاً لإجراءات التوثيق المعتمدة في Q.</span>
        </div>

        {/* Close Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-black text-sm font-bold font-tajawal shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-95 transition-all"
        >
          إغلاق
        </button>

      </div>
    </div>
  );
}
