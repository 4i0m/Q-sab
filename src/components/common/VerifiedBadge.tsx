import React, { useState } from 'react';
import { Crown, ShieldCheck, Diamond, Sparkles, Check, Clock, XCircle, MinusCircle, Info } from 'lucide-react';
import { UserRole, VerificationCategory, VerificationStatus } from '../../types';

interface VerifiedBadgeProps {
  category?: VerificationCategory;
  className?: string;
  showTooltip?: boolean;
  interactive?: boolean;
}

export function VerifiedBadge({
  category = 'blue',
  className = 'w-4 h-4',
  interactive = true,
}: VerifiedBadgeProps) {
  const [showPopup, setShowPopup] = useState(false);

  // Modern 2026 Q Verified Badge SVG:
  // Smooth geometric fluted/scalloped circle with sharp white checkmark and subtle electric blue gradient
  const badgeContent = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 drop-shadow-[0_1px_4px_rgba(59,109,255,0.45)] transition-transform ${interactive ? 'hover:scale-110 active:scale-95 cursor-pointer' : ''}`}
      onClick={(e) => {
        if (interactive) {
          e.stopPropagation();
          setShowPopup(!showPopup);
        }
      }}
    >
      <defs>
        <linearGradient id="q-verified-blue" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F8CFF" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="q-verified-silver" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F1F5F9" />
          <stop offset="0.5" stopColor="#94A3B8" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="q-verified-gold" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset="0.6" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#B45309" />
        </linearGradient>
      </defs>

      {/* Modern fluted scalloped seal path */}
      <path
        d="M12 2L14.7 4.3L18.2 4.4L19.4 7.7L22.4 9.6L21.7 13.1L23 16.4L20 18.2L19 21.6L15.5 21.8L12.9 24.1L9.7 22.8L6.4 23.9L5 20.7L1.8 19.3L2.2 15.8L0.6 12.7L2.4 9.7L2 6.2L5.4 5.2L7.1 2.2L10.5 3L12 2Z"
        fill={
          category === 'silver'
            ? 'url(#q-verified-silver)'
            : category === 'institution'
            ? 'url(#q-verified-gold)'
            : 'url(#q-verified-blue)'
        }
      />
      {/* Crisp White Checkmark */}
      <path
        d="M8.5 12.5L10.8 14.8L15.8 9.5"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <span className="relative inline-flex items-center">
      {badgeContent}

      {/* Accessible Interactive Popover */}
      {showPopup && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopup(false);
            }}
          />
          <div
            className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 w-52 bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-3 shadow-2xl z-50 animate-scale-up text-start font-tajawal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-[#3B6DFF]/20 flex items-center justify-center text-[#3B6DFF]">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
              <span className="text-xs font-bold text-white">حساب موثق رسمي</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              {category === 'institution'
                ? 'تم التحقق من هوية المنظمة أو المؤسسة الرسمية في مجتمع Q.'
                : category === 'silver'
                ? 'حساب شخصي معتمد تم تدقيق هويته الرسمية.'
                : 'تم التحقق من هوية وموثوقية صاحب هذا الحساب رسمياً في Q.'}
            </p>
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Modern Status Indicator for Administration & Request review
 */
export function VerificationStatusIndicator({
  status = 'not_verified',
  category = 'blue',
}: {
  status?: VerificationStatus;
  category?: VerificationCategory;
}) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#3B6DFF]/15 border border-[#3B6DFF]/30 text-[#4F8CFF] text-[11px] font-tajawal font-bold shadow-sm">
        <Check className="w-3.5 h-3.5 stroke-[3]" />
        <span>موثق رسمياً</span>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-tajawal font-bold shadow-sm">
        <Clock className="w-3.5 h-3.5" />
        <span>قيد المراجعة</span>
      </span>
    );
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-tajawal font-bold shadow-sm">
        <XCircle className="w-3.5 h-3.5" />
        <span>مرفوض</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-neutral-800/60 border border-neutral-700/50 text-[#94A3B8] text-[11px] font-tajawal font-medium">
      <MinusCircle className="w-3.5 h-3.5" />
      <span>غير موثق</span>
    </span>
  );
}

export function LevelBadge({ level }: { level: number }) {
  if (!level || level <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold shadow-sm"
      title={`المستوى ${level} (Level ${level})`}
    >
      <span className="text-[9px]">Lv.</span>
      <span>{level}</span>
    </span>
  );
}

export function RoleBadge({ role = 'user' }: { role?: UserRole }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-300 text-[11px] font-bold shadow-sm font-tajawal">
        <Crown className="w-3 h-3 text-amber-400" />
        <span>المؤسس</span>
      </span>
    );
  }

  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#3B6DFF]/15 border border-[#3B6DFF]/40 text-[#4F8CFF] text-[11px] font-bold shadow-sm font-tajawal">
        <ShieldCheck className="w-3 h-3 text-[#4F8CFF]" />
        <span>الإدارة</span>
      </span>
    );
  }

  if (role === 'moderator') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold shadow-sm font-tajawal">
        <ShieldCheck className="w-3 h-3 text-cyan-400" />
        <span>مشرف</span>
      </span>
    );
  }

  return null;
}

export function VipBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/50 text-purple-300 text-[11px] font-bold shadow-sm font-tajawal">
      <Diamond className="w-3 h-3 text-purple-400" />
      <span>مميز</span>
    </span>
  );
}
