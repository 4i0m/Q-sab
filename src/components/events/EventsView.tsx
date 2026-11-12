import { useState, useEffect } from 'react';
import {
  Calendar,
  Trophy,
  Gamepad2,
  Users,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  XCircle
} from 'lucide-react';
import { CommunityEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToEvents,
  registerForCommunityEvent,
  leaveCommunityEvent
} from '../../services/firestore';
import { QLogo } from '../common/QLogo';

interface EventsViewProps {
  onBack?: () => void;
}

export function EventsView({ onBack }: EventsViewProps) {
  const { currentUser } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'competitions' | 'challenge' | 'general'>('all');
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenToEvents((loadedEvents) => {
      setEvents((loadedEvents || []) as CommunityEvent[]);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleToggleRegistration = async (event: CommunityEvent) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً للمشاركة بالفعالية', 'info');
      return;
    }

    const isAlreadyRegistered = Boolean(
      currentUser.id && event.registeredUserIds?.includes(currentUser.id)
    );

    try {
      setRegisteringId(event.id);

      if (isAlreadyRegistered) {
        await leaveCommunityEvent(event.id, currentUser.id);
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? {
                  ...e,
                  participantsCount: Math.max(0, (e.participantsCount || 1) - 1),
                  registeredUserIds: (e.registeredUserIds || []).filter(
                    (id) => id !== currentUser.id
                  ),
                }
              : e
          )
        );
        showToast(`تم إلغاء التسجيل في "${event.title || 'الفعالية'}"`, 'info');
      } else {
        await registerForCommunityEvent(event.id, currentUser.id);
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? {
                  ...e,
                  participantsCount: (e.participantsCount || 0) + 1,
                  registeredUserIds: [...(e.registeredUserIds || []), currentUser.id],
                }
              : e
          )
        );
        showToast(`تم التسجيل بنجاح في "${event.title || 'الفعالية'}"! 🎉`, 'success');
      }
    } catch (err) {
      showToast('تعذر تحديث حالة التسجيل في الفعالية', 'error');
    } finally {
      setRegisteringId(null);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'competitions') return e.category === 'competitions';
    if (filter === 'challenge') return e.category === 'challenge';
    if (filter === 'general') return e.category === 'general';
    return true;
  });

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 font-tajawal">
      {/* Top Bar matching Screen 6 */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F3A]">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <NextArrow className="w-5 h-5 rotate-180" />
            </button>
          ) : (
            <QLogo size={28} />
          )}
          <h1 className="text-lg font-bold text-white">{t('communityEvents')}</h1>
        </div>

        <button
          className="p-2 rounded-xl bg-[#161B26] border border-[#2A2F3A] text-slate-300 hover:text-white hover:border-[#3B6DFF] transition-colors"
          title="التقويم"
        >
          <Calendar className="w-5 h-5 text-[#3B6DFF] stroke-[2]" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            filter === 'all'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          {t('all')}
        </button>

        <button
          onClick={() => setFilter('competitions')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            filter === 'competitions'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          {t('competitions')}
        </button>

        <button
          onClick={() => setFilter('challenge')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            filter === 'challenge'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          {t('challenges')}
        </button>

        <button
          onClick={() => setFilter('general')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            filter === 'general'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-slate-400 hover:text-white'
          }`}
        >
          {t('generalEvents')}
        </button>
      </div>

      {/* Events Cards List connected directly to Firestore */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-44 rounded-3xl bg-[#161B26] animate-pulse border border-[#2A2F3A]"
            />
          ))}
        </div>
      ) : filteredEvents.length > 0 ? (
        <div className="space-y-4">
          {filteredEvents.map((evt) => {
            const isRegistered = Boolean(
              currentUser?.id && evt.registeredUserIds?.includes(currentUser.id)
            );
            const isOfficial = evt.badgeText === 'فعالية رسمية';
            const isChallenge = evt.badgeText === 'تحدي';

            return (
              <div
                key={evt.id}
                className="relative bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 shadow-2xl overflow-hidden group hover:border-[#3B6DFF]/50 transition-all"
              >
                {/* Top Row: Category Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                      isOfficial
                        ? 'bg-[#3B6DFF]/20 border border-[#3B6DFF]/40 text-[#4F8CFF]'
                        : isChallenge
                        ? 'bg-indigo-900/40 border border-indigo-500/40 text-indigo-300'
                        : 'bg-[#0B0F19] border border-[#2A2F3A] text-slate-300'
                    }`}
                  >
                    {evt.badgeText || 'فعالية'}
                  </span>

                  <div className="flex items-center gap-1 text-[11px] text-[#4F8CFF]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>نشط الآن</span>
                  </div>
                </div>

                {/* Center Content Row */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-20 h-20 rounded-2xl bg-[#0B0F19] border border-[#2A2F3A] flex items-center justify-center shrink-0 relative overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                    {isOfficial ? (
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-[#3B6DFF]/20 blur-md rounded-full" />
                        <Trophy className="w-10 h-10 text-[#4F8CFF] stroke-[1.8] relative z-10" />
                      </div>
                    ) : isChallenge ? (
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-full" />
                        <Gamepad2 className="w-10 h-10 text-indigo-400 stroke-[1.8] relative z-10" />
                      </div>
                    ) : (
                      <Calendar className="w-10 h-10 text-[#3B6DFF] stroke-[1.8]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white leading-snug">
                      {evt.title || 'فعالية مجتمعية'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {evt.subtitle || 'حوار وتفاعل مفتوح مع أعضاء مجتمع Q'}
                    </p>
                  </div>
                </div>

                {/* Date, Time & Participants */}
                <div className="space-y-2 mb-4 pt-2 border-t border-[#2A2F3A] text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#3B6DFF] shrink-0" />
                    <span>
                      {evt.dateStr || 'قريباً'} {evt.timeStr ? `• ${evt.timeStr}` : ''}
                    </span>
                  </div>

                  {/* Registered count */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-xs text-slate-300">
                        {evt.participantsCount
                          ? `${evt.participantsCount.toLocaleString()} مشارك`
                          : `${evt.registeredUserIds?.length || 0} مشارك`}
                      </span>
                    </div>

                    {isRegistered && (
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        أنت مسجل في الفعالية
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <button
                  disabled={registeringId === evt.id}
                  onClick={() => handleToggleRegistration(evt)}
                  className={`w-full py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 ${
                    isRegistered
                      ? 'bg-[#0B0F19] border border-[#2A2F3A] hover:border-red-500/40 text-slate-300 hover:text-red-400 shadow-sm'
                      : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-lg shadow-[#3B6DFF]/25'
                  }`}
                >
                  {registeringId === evt.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : isRegistered ? (
                    <>
                      <XCircle className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                      <span>إلغاء التسجيل</span>
                    </>
                  ) : (
                    <span>{t('registerNow')}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
          <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-white">لا توجد فعاليات في هذا القسم حالياً</h4>
          <p className="text-xs text-slate-400 mt-1">
            تابع هذه المساحة للاطلاع على مسابقات وفعاليات مجتمع Q القادمة.
          </p>
        </div>
      )}
    </div>
  );
}
