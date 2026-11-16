import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Globe,
  Users,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
  Plus,
  X,
  ImagePlus,
  Edit3,
  Trash2,
  Ban,
  UserCheck,
  UserX,
  User as UserIcon,
  Sparkles
} from 'lucide-react';
import { CommunityEvent, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToEvents,
  registerForCommunityEvent,
  leaveCommunityEvent,
  createCommunityEvent,
  updateCommunityEvent,
  deleteCommunityEvent,
  reviewEventParticipation,
  getAllUsers
} from '../../services/firestore';
import { uploadMediaWithControl } from '../../services/storage';
import { MediaImage } from '../common/MediaImage';
import { QLogo } from '../common/QLogo';

interface EventsViewProps {
  onBack?: () => void;
  onSelectAuthor?: (userId: string) => void;
}

export function EventsView({ onBack, onSelectAuthor }: EventsViewProps) {
  const { currentUser, isAdmin, isStaff } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'ongoing' | 'ended'>('all');
  const [registeredOnly, setRegisteredOnly] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  // Create / Edit Event Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<'official' | 'challenge' | 'competitions' | 'general'>('general');
  const [badgeText, setBadgeText] = useState('فعالية');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [locationType, setLocationType] = useState<'online' | 'in_person'>('online');
  const [locationDetails, setLocationDetails] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [existingCoverPath, setExistingCoverPath] = useState<string | undefined>(undefined);
  const [savingEvent, setSavingEvent] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Participants & Approval Requests Modal
  const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<CommunityEvent | null>(null);
  const [userLookup, setUserLookup] = useState<Record<string, UserProfile>>({});
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenToEvents((loadedEvents) => {
      setEvents(loadedEvents || []);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedEventForParticipants) return;
    const live = events.find((e) => e.id === selectedEventForParticipants.id);
    if (live) setSelectedEventForParticipants(live);
  }, [events, selectedEventForParticipants?.id]);

  const openCreateModal = () => {
    setEditingEvent(null);
    setTitle('');
    setSubtitle('');
    setCategory('general');
    setBadgeText('فعالية');
    setDateStr('');
    setTimeStr('18:00');
    setEndDateStr('');
    setEndTimeStr('');
    setLocationType('online');
    setLocationDetails('');
    setOrganizerName(currentUser?.displayName || '');
    setRequireApproval(false);
    setCoverFile(null);
    setCoverPreview('');
    setExistingCoverPath(undefined);
    setFormOpen(true);
  };

  const openEditModal = (evt: CommunityEvent) => {
    setEditingEvent(evt);
    setTitle(evt.title || '');
    setSubtitle(evt.subtitle || '');
    setCategory((evt.category === 'all' ? 'general' : evt.category) || 'general');
    setBadgeText(evt.badgeText || 'فعالية');
    setDateStr(evt.dateStr || '');
    setTimeStr(evt.timeStr || '');
    setEndDateStr(evt.endDateStr || '');
    setEndTimeStr(evt.endTimeStr || '');
    setLocationType(evt.locationType || 'online');
    setLocationDetails(evt.locationDetails || '');
    setOrganizerName(evt.organizerName || currentUser?.displayName || '');
    setRequireApproval(Boolean(evt.requireApproval));
    setCoverFile(null);
    setCoverPreview(evt.imageURL || '');
    setExistingCoverPath(evt.coverPath);
    setFormOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isStaff) {
      showToast('ليست لديك صلاحية إنشاء أو تعديل الفعاليات.', 'error');
      return;
    }
    if (!title.trim() || !dateStr.trim()) {
      showToast('يرجى إدخال عنوان الفعالية وتاريخ البدء.', 'error');
      return;
    }

    try {
      setSavingEvent(true);
      let imageURL = coverPreview && coverPreview.startsWith('http') ? coverPreview : '';
      let coverPath = existingCoverPath;

      if (coverFile) {
        imageURL = await uploadMediaWithControl(coverFile, 'events', {
          onMetadata: (meta) => {
            coverPath = meta.path;
          },
        }).promise;
      }

      if (editingEvent) {
        await updateCommunityEvent(
          editingEvent.id,
          {
            title: title.trim(),
            subtitle: subtitle.trim(),
            category,
            badgeText: badgeText.trim() || 'فعالية',
            dateStr: dateStr.trim(),
            timeStr: timeStr.trim(),
            endDateStr: endDateStr.trim() || undefined,
            endTimeStr: endTimeStr.trim() || undefined,
            locationType,
            locationDetails: locationDetails.trim(),
            organizerName: organizerName.trim() || currentUser.displayName,
            requireApproval,
            imageURL,
            coverPath,
          },
          { id: currentUser.id, name: currentUser.displayName, role: currentUser.role }
        );
        showToast('تم تحديث تفاصيل الفعالية بنجاح.', 'success');
      } else {
        await createCommunityEvent({
          title,
          subtitle,
          category,
          badgeText,
          dateStr,
          timeStr,
          endDateStr,
          endTimeStr,
          locationType,
          locationDetails,
          organizerId: currentUser.id,
          organizerName: organizerName || currentUser.displayName,
          requireApproval,
          imageURL,
          coverPath,
          creatorId: currentUser.id,
          creatorRole: currentUser.role,
        });
        showToast('تم نشر الفعالية بنجاح!', 'success');
      }

      setFormOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'تعذر حفظ الفعالية.', 'error');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleToggleRegistration = async (event: CommunityEvent) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً للمشاركة بالفعالية', 'info');
      return;
    }
    if (event.status === 'cancelled' || event.status === 'ended') {
      showToast('هذه الفعالية غير متاحة للتسجيل حالياً.', 'info');
      return;
    }

    const isRegistered = Boolean(event.registeredUserIds?.includes(currentUser.id));
    const isPending = Boolean(event.pendingUserIds?.includes(currentUser.id));

    try {
      setRegisteringId(event.id);
      if (isRegistered || isPending) {
        await leaveCommunityEvent(event.id, currentUser.id);
        showToast(isPending ? 'تم سحب طلب المشاركة' : 'تم إلغاء التسجيل في الفعالية', 'info');
      } else {
        const result = await registerForCommunityEvent(event.id, currentUser.id);
        showToast(
          result === 'pending'
            ? 'تم إرسال طلب المشاركة وبانتظار موافقة المنظم.'
            : `تم تسجيلك بنجاح في "${event.title}"!`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'تعذر تحديث حالة المشاركة', 'error');
    } finally {
      setRegisteringId(null);
    }
  };

  const handleOpenParticipants = async (evt: CommunityEvent) => {
    setSelectedEventForParticipants(evt);
    try {
      const users = await getAllUsers(120);
      const map: Record<string, UserProfile> = {};
      users.forEach((u) => {
        map[u.id] = u;
      });
      setUserLookup(map);
    } catch {
      // ignore lookup fallback
    }
  };

  const handleReviewRequest = async (targetUserId: string, approve: boolean) => {
    if (!currentUser || !selectedEventForParticipants) return;
    try {
      setReviewingUserId(targetUserId);
      await reviewEventParticipation(selectedEventForParticipants.id, targetUserId, approve, {
        id: currentUser.id,
        name: currentUser.displayName,
      });
      showToast(approve ? 'تم قبول المشارك في الفعالية' : 'تم رفض طلب المشاركة', 'info');
    } catch {
      showToast('تعذر تحديث طلب المشاركة', 'error');
    } finally {
      setReviewingUserId(null);
    }
  };

  const handleCancelEvent = async (evt: CommunityEvent) => {
    if (!currentUser) return;
    try {
      await updateCommunityEvent(
        evt.id,
        { status: 'cancelled' },
        { id: currentUser.id, name: currentUser.displayName, role: currentUser.role }
      );
      showToast('تم إلغاء الفعالية وتحديث حالتها.', 'info');
    } catch {
      showToast('تعذر إلغاء الفعالية.', 'error');
    }
  };

  const handleDeleteEvent = async (evt: CommunityEvent) => {
    try {
      await deleteCommunityEvent(evt.id);
      showToast('تم حذف الفعالية.', 'info');
    } catch {
      showToast('تعذر حذف الفعالية.', 'error');
    }
  };

  const filteredEvents = events.filter((e) => {
    if (registeredOnly && currentUser?.id) {
      const mine =
        e.registeredUserIds?.includes(currentUser.id) ||
        e.pendingUserIds?.includes(currentUser.id) ||
        e.creatorId === currentUser.id;
      if (!mine) return false;
    }
    if (filter === 'all') return true;
    return e.status === filter;
  });

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;

  const statusMeta = (status?: CommunityEvent['status']) => {
    if (status === 'ongoing') {
      return {
        label: 'جارية الآن',
        cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      };
    }
    if (status === 'ended') {
      return {
        label: 'منتهية',
        cls: 'bg-slate-200/80 dark:bg-[#1E2534] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-[#2A3242]',
      };
    }
    if (status === 'cancelled') {
      return {
        label: 'ملغاة',
        cls: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      };
    }
    return {
      label: 'قادمة',
      cls: 'bg-[#3B6DFF]/15 text-[#3B6DFF] dark:text-[#60A5FA] border-[#3B6DFF]/30',
    };
  };

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-ar">
      {/* Header */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {onBack ? (
            <button
              onClick={onBack}
              className="min-w-[40px] min-h-[40px] rounded-full hover:bg-slate-100 dark:hover:bg-[#1B2232] flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <NextArrow className="w-5 h-5 rotate-180" />
            </button>
          ) : (
            <QLogo size={28} />
          )}
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              الفعاليات
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-[#8E9BAB]">
              الفعاليات والأنشطة المجدولة والمباشرة في منصة Q
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRegisteredOnly((v) => !v)}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              registeredOnly
                ? 'bg-[#3B6DFF] border-[#3B6DFF] text-white'
                : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#242B38] text-slate-700 dark:text-slate-300'
            }`}
            title="فعالياتي"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">مشاركاتي</span>
          </button>

          {isStaff && (
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء فعالية</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'upcoming', label: 'قادمة' },
          { id: 'ongoing', label: 'جارية' },
          { id: 'ended', label: 'منتهية' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as any)}
            className={`min-h-[38px] px-4 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
              filter === tab.id
                ? 'bg-[#3B6DFF] text-white'
                : 'bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] text-slate-600 dark:text-[#8E9BAB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Events Stream */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF] mb-2" />
          <span className="text-xs">جاري تحميل الفعاليات...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-14 px-6 text-center bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#3B6DFF]/10 text-[#3B6DFF] flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            لا توجد فعاليات حالياً
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#8E9BAB] max-w-xs mx-auto leading-relaxed">
            {registeredOnly
              ? 'لم تسجل في أي فعالية حتى الآن.'
              : 'عند جدولة فعاليات رسمية أو لقاءات مجتمعية ستظهر هنا بشكل مباشر.'}
          </p>
          {isStaff && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-2 min-h-[44px] px-5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء فعالية</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((evt) => {
            const isRegistered = Boolean(currentUser?.id && evt.registeredUserIds?.includes(currentUser.id));
            const isPending = Boolean(currentUser?.id && evt.pendingUserIds?.includes(currentUser.id));
            const canManageEvt = Boolean(currentUser && (isAdmin || evt.creatorId === currentUser.id));
            const st = statusMeta(evt.status);
            const pendingCount = evt.pendingUserIds?.length || 0;

            return (
              <article
                key={evt.id}
                className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-[#232A37] rounded-3xl overflow-hidden shadow-sm hover:border-[#3B6DFF]/40 transition-colors"
              >
                {evt.imageURL && (
                  <div className="w-full aspect-[16/8] bg-slate-100 dark:bg-[#0B0F19] overflow-hidden border-b border-slate-200 dark:border-[#232A37]">
                    <MediaImage
                      src={evt.imageURL}
                      alt={evt.title}
                      variant="event"
                      containerClassName="w-full h-full overflow-hidden"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-4 sm:p-5 space-y-3">
                  {/* Top Badges & Staff Actions */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${st.cls}`}>
                        {st.label}
                      </span>
                      {evt.badgeText && (
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#1B2232] text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                          {evt.badgeText}
                        </span>
                      )}
                    </div>

                    {canManageEvt && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(evt)}
                          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1B2232] text-slate-500 hover:text-[#3B6DFF] cursor-pointer"
                          title="تعديل الفعالية"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {evt.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleCancelEvent(evt)}
                            className="p-2 rounded-xl hover:bg-amber-500/10 text-amber-600 cursor-pointer"
                            title="إلغاء الفعالية"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(evt)}
                          className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 cursor-pointer"
                          title="حذف الفعالية"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug">
                      {evt.title}
                    </h2>
                    {evt.subtitle && (
                      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-[#94A3B8] mt-1 leading-relaxed whitespace-pre-line">
                        {evt.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Meta Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-[#232A37] text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#3B6DFF] shrink-0" />
                      <span>
                        {evt.dateStr} {evt.timeStr ? `· ${evt.timeStr}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {evt.locationType === 'in_person' ? (
                        <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Globe className="w-4 h-4 text-[#3B6DFF] shrink-0" />
                      )}
                      <span className="truncate">
                        {evt.locationType === 'in_person'
                          ? evt.locationDetails || 'فعالية حضورية'
                          : evt.locationDetails || 'فعالية إلكترونية (عبر الإنترنت)'}
                      </span>
                    </div>

                    {evt.organizerName && (
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">المنظم: {evt.organizerName}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenParticipants(evt)}
                      className="flex items-center gap-2 text-[#3B6DFF] hover:underline cursor-pointer text-start"
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="tabular-nums font-bold">
                        {evt.registeredUserIds?.length || evt.participantsCount || 0} مشارك
                        {canManageEvt && pendingCount > 0 ? ` (${pendingCount} طلب انتظار)` : ''}
                      </span>
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={
                        registeringId === evt.id ||
                        evt.status === 'cancelled' ||
                        evt.status === 'ended'
                      }
                      onClick={() => handleToggleRegistration(evt)}
                      className={`flex-1 min-h-[44px] rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 ${
                        isRegistered
                          ? 'bg-emerald-500/10 border border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                          : isPending
                          ? 'bg-amber-500/10 border border-amber-500/35 text-amber-600 dark:text-amber-400'
                          : 'bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white shadow-sm'
                      }`}
                    >
                      {registeringId === evt.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isRegistered ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>مشارك (اضغط للإلغاء)</span>
                        </>
                      ) : isPending ? (
                        <>
                          <Clock className="w-4 h-4" />
                          <span>طلبك قيد المراجعة (اضغط للسحب)</span>
                        </>
                      ) : evt.status === 'cancelled' ? (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>فعالية ملغاة</span>
                        </>
                      ) : evt.status === 'ended' ? (
                        <span>انتهت الفعالية</span>
                      ) : (
                        <span>{evt.requireApproval ? 'إرسال طلب مشاركة' : 'المشاركة في الفعالية'}</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenParticipants(evt)}
                      className="min-h-[44px] px-4 rounded-2xl bg-slate-100 dark:bg-[#1B2232] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      <span>المشاركون</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Event Modal */}
      {formOpen && isStaff && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setFormOpen(false)}
        >
          <form
            onSubmit={handleSaveEvent}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-3.5 shadow-2xl font-ar"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {editingEvent ? 'تعديل الفعالية' : 'إنشاء فعالية جديدة'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="cursor-pointer p-1">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Cover Upload */}
            <div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCoverFile(f);
                    setCoverPreview(URL.createObjectURL(f));
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#2A2F3A] bg-slate-50 dark:bg-[#0B0F19] overflow-hidden flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6 text-[#3B6DFF]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      إضافة صورة غلاف للفعالية
                    </span>
                  </>
                )}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                عنوان الفعالية *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: ملتقى مصممي منصة Q"
                className="w-full min-h-[42px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                الوصف والتفاصيل
              </label>
              <textarea
                rows={3}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="تفاصيل الفعالية ومحاورها..."
                className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl p-3 text-xs text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تاريخ البدء *
                </label>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  وقت البدء
                </label>
                <input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تاريخ الانتهاء (اختياري)
                </label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  وقت الانتهاء
                </label>
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Online vs In-Person */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                مكان الانعقاد
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLocationType('online')}
                  className={`min-h-[40px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    locationType === 'online'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF]'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>إلكترونية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType('in_person')}
                  className={`min-h-[40px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    locationType === 'in_person'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>حضورية</span>
                </button>
              </div>
              <input
                type="text"
                value={locationDetails}
                onChange={(e) => setLocationDetails(e.target.value)}
                placeholder={
                  locationType === 'online'
                    ? 'رابط الجلسة أو اسم غرفة الدردشة'
                    : 'المدينة، العنوان التفصيلي...'
                }
                className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المنظم
                </label>
                <input
                  type="text"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  التصنيف
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full min-h-[40px] bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white"
                >
                  <option value="general">عامة</option>
                  <option value="official">رسمية</option>
                  <option value="competitions">مسابقة</option>
                  <option value="challenge">تحدي</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
              <span>طلب موافقة المنظم قبل تأكيد المشاركة</span>
            </label>

            <button
              type="submit"
              disabled={savingEvent}
              className="w-full min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {savingEvent && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingEvent ? 'حفظ التعديلات' : 'نشر الفعالية'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Participants & Participation Requests Modal */}
      {selectedEventForParticipants && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedEventForParticipants(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85dvh] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl flex flex-col overflow-hidden shadow-2xl font-ar"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                المشاركون في "{selectedEventForParticipants.title}"
              </h3>
              <button
                type="button"
                onClick={() => setSelectedEventForParticipants(null)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Pending Approval Requests (for creator / admin) */}
              {(isAdmin || selectedEventForParticipants.creatorId === currentUser?.id) &&
                (selectedEventForParticipants.pendingUserIds?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                      طلبات مشاركة بانتظار الموافقة ({selectedEventForParticipants.pendingUserIds?.length})
                    </p>
                    {selectedEventForParticipants.pendingUserIds?.map((uid) => {
                      const u = userLookup[uid];
                      return (
                        <div
                          key={uid}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25"
                        >
                          <div
                            onClick={() => {
                              setSelectedEventForParticipants(null);
                              onSelectAuthor?.(uid);
                            }}
                            className="flex items-center gap-2 min-w-0 cursor-pointer"
                          >
                            <MediaImage
                              src={u?.photoURL}
                              alt={u?.displayName || uid}
                              variant="avatar"
                              fallbackText={u?.displayName || 'Q'}
                              containerClassName="w-8 h-8 rounded-full overflow-hidden shrink-0"
                              className="w-full h-full object-cover"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {u?.displayName || 'عضو في Q'}
                              </p>
                              {u?.handle && (
                                <p className="font-handle text-[11px] text-slate-500">@{u.handle}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={reviewingUserId === uid}
                              onClick={() => handleReviewRequest(uid, true)}
                              className="p-2 rounded-xl bg-emerald-600 text-white cursor-pointer"
                              title="موافقة"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={reviewingUserId === uid}
                              onClick={() => handleReviewRequest(uid, false)}
                              className="p-2 rounded-xl bg-red-600 text-white cursor-pointer"
                              title="رفض"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Confirmed Participants */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  المشاركون المؤكدون ({selectedEventForParticipants.registeredUserIds?.length || 0})
                </p>
                {(selectedEventForParticipants.registeredUserIds?.length || 0) === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    لا يوجد مشاركون مسجلون بعد.
                  </p>
                ) : (
                  selectedEventForParticipants.registeredUserIds?.map((uid) => {
                    const u = userLookup[uid];
                    return (
                      <div
                        key={uid}
                        onClick={() => {
                          setSelectedEventForParticipants(null);
                          onSelectAuthor?.(uid);
                        }}
                        className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] cursor-pointer hover:border-[#3B6DFF]/40 border border-transparent"
                      >
                        <MediaImage
                          src={u?.photoURL}
                          alt={u?.displayName || uid}
                          variant="avatar"
                          fallbackText={u?.displayName || 'Q'}
                          containerClassName="w-9 h-9 rounded-full overflow-hidden shrink-0"
                          className="w-full h-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {u?.displayName || 'عضو في Q'}
                          </p>
                          {u?.handle && (
                            <p className="font-handle text-[11px] text-slate-500">@{u.handle}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
