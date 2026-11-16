import { useEffect, useState } from 'react';
import {
  Award,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircle,
  Heart,
  Repeat2,
  Calendar,
  MessagesSquare,
  ArrowRight,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { XpLogEntry, computeLevelFromXp, xpRequiredForLevel } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { awardUserXp, listenToUserXpLogs } from '../../services/firestore';
import { MediaImage } from '../common/MediaImage';

interface LevelViewProps {
  onBack?: () => void;
}

const RANK_TIERS = [
  { minLevel: 1, title: 'عضو جديد', accent: '#64748B' },
  { minLevel: 3, title: 'مساهم نشط', accent: '#3B6DFF' },
  { minLevel: 7, title: 'مبدع Q', accent: '#0EA5E9' },
  { minLevel: 12, title: 'نجم المجتمع', accent: '#8B5CF6' },
  { minLevel: 20, title: 'قائد ملهم', accent: '#F59E0B' },
  { minLevel: 35, title: 'أسطورة Q', accent: '#E11D48' },
];

function getTierForLevel(level: number) {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel) current = tier;
  }
  return current;
}

export function LevelView({ onBack }: LevelViewProps) {
  const { currentUser, refreshProfile } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<XpLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [claimingCheckin, setClaimingCheckin] = useState(false);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!currentUser?.id) {
      setLogs([]);
      setLoadingLogs(false);
      return;
    }
    const unsub = listenToUserXpLogs(currentUser.id, (items) => {
      setLogs(items);
      setLoadingLogs(false);
    });
    return () => unsub();
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto py-16 text-center space-y-3 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6 font-ar">
        <Award className="w-10 h-10 text-[#3B6DFF] mx-auto" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">نظام المستويات والـ XP</h2>
        <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
          سجل الدخول لمتابعة مستواك ونقاط الخبرة المكتسبة من تفاعلاتك الحقيقية.
        </p>
      </div>
    );
  }

  const xp = currentUser.xp || 0;
  const level = Math.max(1, currentUser.level || computeLevelFromXp(xp));
  const tier = getTierForLevel(level);
  const floorXp = level <= 1 ? 0 : xpRequiredForLevel(level);
  const nextXp = xpRequiredForLevel(level + 1);
  const span = Math.max(1, nextXp - floorXp);
  const currentInLevel = Math.max(0, xp - floorXp);
  const remaining = Math.max(0, nextXp - xp);
  const progressPct = Math.min(100, Math.max(3, Math.round((currentInLevel / span) * 100)));

  const handleDailyCheckin = async () => {
    if (claimingCheckin) return;
    try {
      setClaimingCheckin(true);
      const res = await awardUserXp('daily_checkin');
      if (res?.awarded) {
        await refreshProfile();
        showToast(`تم تسجيل الحضور اليومي! حصلت على +${res.xpDelta} XP`, 'success');
      } else {
        showToast('لقد حصلت على مكافأة الحضور اليومي بالفعل. عد غداً!', 'info');
      }
    } finally {
      setClaimingCheckin(false);
    }
  };

  const earnWays = [
    { icon: FileText, label: 'نشر منشور أو مدونة', xp: '+20 XP' },
    { icon: Calendar, label: 'المشاركة في فعالية', xp: '+12 XP' },
    { icon: Repeat2, label: 'إعادة نشر محتوى', xp: '+10 XP' },
    { icon: MessageCircle, label: 'التعليق والنقاش', xp: '+8 XP' },
    { icon: MessagesSquare, label: 'المشاركة في غرف الدردشة', xp: '+4 XP' },
    { icon: Heart, label: 'التفاعل بالإعجاب', xp: '+3 XP' },
  ];

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 font-ar">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2F3A] pb-3">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#161B26] cursor-pointer"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">المستوى والتقدم</h1>
            <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
              نقاط خبرة حقيقية مبنية على تفاعلك في Q
            </p>
          </div>
        </div>
      </div>

      {/* Hero Amino-inspired Level Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#132247] to-[#1E3A8A] text-white p-5 shadow-xl border border-[#3B6DFF]/30">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/60 shadow-lg">
              <MediaImage
                src={currentUser.photoURL}
                alt={currentUser.displayName}
                variant="avatar"
                fallbackText={currentUser.displayName}
                containerClassName="w-full h-full rounded-full overflow-hidden"
                className="w-full h-full object-cover"
              />
            </div>
            <div
              className="absolute -bottom-1 -end-1 px-2 py-0.5 rounded-md text-[10px] font-mono-subtle font-extrabold text-white shadow border border-white/30 tabular-nums"
              style={{ backgroundColor: tier.accent }}
            >
              LV.{level}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold truncate">{currentUser.displayName}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/15 border border-white/20">
                {tier.title}
              </span>
            </div>
            <p className="text-xs font-handle text-blue-100/80" dir="ltr">
              @{currentUser.handle}
            </p>
            <div className="flex items-center gap-2 text-xs font-mono-subtle text-blue-100 pt-0.5 tabular-nums">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{xp.toLocaleString()} XP الإجمالي</span>
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono-subtle text-blue-100 tabular-nums">
            <span>المستوى {level}</span>
            <span>المتبقي للمستوى {level + 1}: {remaining} XP</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] via-[#60A5FA] to-[#FBBF24] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono-subtle text-blue-200/80 tabular-nums">
            <span>{currentInLevel} / {span} XP</span>
            <span>{progressPct}%</span>
          </div>
        </div>

        {/* Daily Check-in */}
        <button
          type="button"
          onClick={handleDailyCheckin}
          disabled={claimingCheckin}
          className="mt-4 w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-white text-[#0F172A] hover:bg-blue-50 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
        >
          {claimingCheckin ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#3B6DFF]" />
          ) : (
            <Sparkles className="w-4 h-4 text-[#3B6DFF]" />
          )}
          <span>تسجيل الحضور اليومي (+15 XP)</span>
        </button>
      </div>

      {/* How XP is Earned */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">كيف تكسب نقاط الخبرة؟</h2>
        <div className="grid grid-cols-2 gap-2">
          {earnWays.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 text-[#3B6DFF] shrink-0" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                    {item.label}
                  </span>
                </div>
                <span className="text-[10px] font-mono-subtle font-bold text-emerald-600 dark:text-emerald-400 shrink-0 tabular-nums">
                  {item.xp}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rank Tiers Roadmap */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">مسار الرتب والمستويات</h2>
        <div className="grid grid-cols-3 gap-2">
          {RANK_TIERS.map((rt) => {
            const unlocked = level >= rt.minLevel;
            return (
              <div
                key={rt.minLevel}
                className={`p-2.5 rounded-xl border text-center space-y-1 ${
                  unlocked
                    ? 'bg-[#3B6DFF]/8 border-[#3B6DFF]/35'
                    : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] opacity-65'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px] font-mono-subtle font-bold" style={{ color: rt.accent }}>
                  {unlocked && <CheckCircle2 className="w-3 h-3" />}
                  <span>LV.{rt.minLevel}</span>
                </div>
                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  {rt.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real XP History Log */}
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">سجل النشاط الأخير</h2>
          <span className="text-[11px] font-mono-subtle text-slate-500 tabular-nums">
            {logs.length} عملية
          </span>
        </div>

        {loadingLogs ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
          </div>
        ) : logs.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-[#2A2F3A]/70">
            {logs.slice(0, 15).map((entry) => (
              <div key={entry.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{entry.label}</div>
                  <div className="text-[10px] text-slate-500 font-mono-subtle flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className="text-xs font-mono-subtle font-bold text-emerald-600 dark:text-emerald-400 shrink-0 tabular-nums">
                  +{entry.amount} XP
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] text-center py-6">
            لا يوجد سجل نقاط خبرة بعد — ابدأ بالنشر أو التفاعل لكسب أول نقاطك!
          </p>
        )}
      </div>
    </div>
  );
}
