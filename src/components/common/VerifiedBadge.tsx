import React, { useId, useState } from 'react';
import {
  Crown,
  ShieldCheck,
  Shield,
  Diamond,
  Check,
  Clock,
  XCircle,
  MinusCircle,
  Award,
  Flame,
  Sparkles,
  Star,
  Gem
} from 'lucide-react';
import { CustomTitle, UserRole, VerificationCategory, VerificationStatus } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

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
  const { t } = useLanguage();
  const uid = useId().replace(/:/g, '');

  const gradId =
    category === 'silver'
      ? `q-ver-silver-${uid}`
      : category === 'institution'
      ? `q-ver-gold-${uid}`
      : category === 'blood_red'
      ? `q-ver-blood-${uid}`
      : `q-ver-blue-${uid}`;

  const descKey =
    category === 'institution'
      ? 'verifiedInstitutionDesc'
      : category === 'silver'
      ? 'verifiedSilverDesc'
      : category === 'blood_red'
      ? 'verifiedBloodDesc'
      : 'verifiedBlueDesc';

  const shadowClass =
    category === 'silver'
      ? 'drop-shadow-[0_1px_3px_rgba(148,163,184,0.45)]'
      : category === 'institution'
      ? 'drop-shadow-[0_1px_4px_rgba(245,158,11,0.45)]'
      : category === 'blood_red'
      ? 'drop-shadow-[0_1px_4px_rgba(225,29,72,0.5)]'
      : 'drop-shadow-[0_1px_4px_rgba(59,109,255,0.45)]';

  const badgeContent = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 ${shadowClass} transition-transform duration-150 ${
        interactive ? 'hover:scale-110 active:scale-95 cursor-pointer' : ''
      }`}
      aria-label={t('verifiedOfficialTitle')}
    >
      <defs>
        <linearGradient id={`q-ver-blue-${uid}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F8CFF" />
          <stop offset="0.55" stopColor="#3B6DFF" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={`q-ver-silver-${uid}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FAFC" />
          <stop offset="0.5" stopColor="#94A3B8" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={`q-ver-gold-${uid}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset="0.55" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id={`q-ver-blood-${uid}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB7185" />
          <stop offset="0.55" stopColor="#E11D48" />
          <stop offset="1" stopColor="#881337" />
        </linearGradient>
      </defs>

      <path
        d="M12 1.8L14.5 3.9L17.8 3.9L19.1 7L22 8.9L21.4 12.2L22.6 15.4L19.8 17.3L18.9 20.6L15.6 20.9L13.1 23.1L10 21.9L6.9 22.9L5.4 19.9L2.3 18.7L2.6 15.3L1.1 12.3L2.8 9.4L2.4 6L5.6 5L7.3 2.1L10.4 2.9L12 1.8Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M8.5 12.3L10.9 14.7L15.9 9.4"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!interactive) {
    return <span className="inline-flex items-center shrink-0">{badgeContent}</span>;
  }

  return (
    <span className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup((prev) => !prev);
        }}
        className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6DFF]"
        aria-expanded={showPopup}
        aria-label={t('verifiedOfficialTitle')}
      >
        {badgeContent}
      </button>

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
            className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 w-60 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3.5 shadow-xl dark:shadow-2xl z-50 animate-scale-up text-start font-tajawal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-[#3B6DFF]/15 flex items-center justify-center text-[#3B6DFF] shrink-0">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {t('verifiedOfficialTitle')}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
              {t(descKey)}
            </p>
          </div>
        </>
      )}
    </span>
  );
}

export function VerificationStatusIndicator({
  status = 'not_verified',
  category = 'blue',
}: {
  status?: VerificationStatus;
  category?: VerificationCategory;
}) {
  const { t } = useLanguage();

  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-tajawal font-bold text-[#3B6DFF] dark:text-[#4F8CFF] whitespace-nowrap shrink-0">
        <VerifiedBadge category={category} className="w-4 h-4" interactive={false} />
        <span>{t('statusVerified')}</span>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-tajawal font-bold text-amber-600 dark:text-amber-300 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5" />
        <span>{t('statusPending')}</span>
      </span>
    );
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-tajawal font-bold text-red-600 dark:text-red-400 whitespace-nowrap shrink-0">
        <XCircle className="w-3.5 h-3.5" />
        <span>{t('statusRejected')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-tajawal font-medium text-slate-500 dark:text-[#94A3B8] whitespace-nowrap shrink-0">
      <MinusCircle className="w-3.5 h-3.5" />
      <span>{t('statusNotVerified')}</span>
    </span>
  );
}

export function LevelBadge({ level }: { level?: number }) {
  const safeLevel = Math.max(1, Math.floor(level || 0));
  if (!level || level <= 0) return null;

  const tierStyles =
    safeLevel >= 20
      ? 'bg-amber-500/12 border-amber-500/45 text-amber-600 dark:text-amber-300'
      : safeLevel >= 10
      ? 'bg-violet-500/12 border-violet-500/40 text-violet-600 dark:text-violet-300'
      : 'bg-[#3B6DFF]/10 border-[#3B6DFF]/35 text-[#3B6DFF] dark:text-[#4F8CFF]';

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border font-mono-subtle text-[10px] font-semibold tabular-nums shrink-0 ${tierStyles}`}
      title={`LV ${safeLevel}`}
    >
      <span className="text-[9px] tracking-wider uppercase">LV</span>
      <span>{safeLevel}</span>
    </span>
  );
}

export function RoleBadge({ role = 'user' }: { role?: UserRole }) {
  const { t } = useLanguage();

  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
        <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
        <span>{t('founder')}</span>
      </span>
    );
  }

  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 border border-[#3B6DFF]/30 dark:border-[#3B6DFF]/40 text-[#2563EB] dark:text-[#4F8CFF] text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
        <ShieldCheck className="w-3 h-3 text-[#3B6DFF] dark:text-[#4F8CFF]" />
        <span>{t('adminRole')}</span>
      </span>
    );
  }

  if (role === 'assistant_admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
        <Shield className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
        <span>{t('assistantAdminRole')}</span>
      </span>
    );
  }

  if (role === 'room_leader') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
        <Award className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        <span>{t('roomLeaderRole')}</span>
      </span>
    );
  }

  if (role === 'moderator') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-500/15 border border-cyan-300 dark:border-cyan-500/40 text-cyan-800 dark:text-cyan-300 text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
        <ShieldCheck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
        <span>{t('moderatorRole')}</span>
      </span>
    );
  }

  return null;
}

const TITLE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  Crown,
  Flame,
  Sparkles,
  Shield,
  Star,
  Gem,
};

/**
 * Strictly cosmetic custom title badge granted by Owner / Authorized Admins.
 * Does NOT grant or reflect administrative permissions.
 */
export function CustomTitleBadge({
  title,
  compact = false,
}: {
  title?: CustomTitle | null;
  compact?: boolean;
}) {
  if (!title || !title.text) return null;
  const IconComp = TITLE_ICON_MAP[title.icon || 'Award'] || Award;
  const baseColor = title.color || '#3B6DFF';
  const shapeRadius =
    title.shape === 'banner'
      ? 'rounded-sm border-s-2'
      : title.shape === 'shield'
      ? 'rounded-lg'
      : 'rounded-md';

  const hasGradient = Boolean(title.gradient && title.gradient.trim());
  const styleObj: React.CSSProperties = {
    color: hasGradient ? '#FFFFFF' : baseColor,
    backgroundColor: title.bgColor || `${baseColor}18`,
    borderColor: title.borderColor || `${baseColor}4A`,
    ...(hasGradient ? { backgroundImage: title.gradient } : {}),
  };

  return (
    <span
      className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} ${shapeRadius} font-bold font-tajawal whitespace-nowrap shrink-0 border shadow-xs`}
      style={styleObj}
      title={`لقب: ${title.text}${typeof title.priority === 'number' ? ` (أولوية ${title.priority})` : ''}`}
    >
      <IconComp className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
      <span>{title.text}</span>
    </span>
  );
}

export function VipBadge() {
  const { t } = useLanguage();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 text-[11px] font-bold font-tajawal whitespace-nowrap shrink-0">
      <Diamond className="w-3 h-3 text-purple-600 dark:text-purple-400" />
      <span>{t('vip')}</span>
    </span>
  );
}
