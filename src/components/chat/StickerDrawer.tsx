import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Clock,
  Package,
  Store,
  Upload,
  Check,
  Trash2,
  Loader2,
  X,
  Search
} from 'lucide-react';
import { StickerItem, StickerPack } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToApprovedStickerPacks,
  listenToMyStickerPacks,
  submitStickerPack,
  toggleSaveStickerPack,
  recordRecentSticker
} from '../../services/stickers';
import { uploadMediaWithControl, validateMediaFile } from '../../services/storage';
import { MediaImage } from '../common/MediaImage';

export interface SelectedStickerPayload {
  packId: string;
  stickerId: string;
  url: string;
  label?: string;
}

interface StickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: SelectedStickerPayload) => Promise<void> | void;
  accentColor?: string;
}

export function StickerDrawer({
  isOpen,
  onClose,
  onSelectSticker,
  accentColor = '#3B6DFF',
}: StickerDrawerProps) {
  const { currentUser, isStaff, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'recent' | 'mine' | 'store' | 'create'>('store');
  const [approvedPacks, setApprovedPacks] = useState<StickerPack[]>([]);
  const [myPacks, setMyPacks] = useState<StickerPack[]>([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingPackId, setSavingPackId] = useState<string | null>(null);

  // Create Pack State
  const [packTitle, setPackTitle] = useState('');
  const [packDesc, setPackDesc] = useState('');
  const [draftStickers, setDraftStickers] = useState<
    Array<{
      tempId: string;
      url: string;
      storagePath?: string;
      contentType?: string;
      sizeBytes?: number;
      label: string;
    }>
  >([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submittingPack, setSubmittingPack] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingStore(true);
    const unsubApproved = listenToApprovedStickerPacks((packs) => {
      setApprovedPacks(packs);
      setLoadingStore(false);
    });
    const unsubMine = currentUser?.id
      ? listenToMyStickerPacks(currentUser.id, setMyPacks)
      : () => {};
    return () => {
      unsubApproved();
      unsubMine();
    };
  }, [isOpen, currentUser?.id]);

  const savedPackIds = useMemo(
    () => new Set(currentUser?.customization?.savedStickerPackIds || []),
    [currentUser?.customization?.savedStickerPackIds]
  );

  const recentStickers = currentUser?.customization?.recentStickers || [];

  const installedAndMyPacks = useMemo(() => {
    const map = new Map<string, StickerPack>();
    approvedPacks.forEach((p) => {
      if (savedPackIds.has(p.id) || p.authorId === currentUser?.id) {
        map.set(p.id, p);
      }
    });
    myPacks.forEach((p) => {
      map.set(p.id, p);
    });
    return Array.from(map.values());
  }, [approvedPacks, myPacks, savedPackIds, currentUser?.id]);

  const filteredStorePacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return approvedPacks;
    return approvedPacks.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q)
    );
  }, [approvedPacks, searchQuery]);

  if (!isOpen) return null;

  const isPrivilegedAutoApprove =
    isAdmin ||
    currentUser?.role === 'owner' ||
    currentUser?.role === 'assistant_admin' ||
    Boolean(currentUser?.globalPermissions?.manageStickers);

  const handleStickerClick = async (item: SelectedStickerPayload) => {
    await onSelectSticker(item);
    if (currentUser) {
      void recordRecentSticker(currentUser, item);
    }
    onClose();
  };

  const handleToggleSavePack = async (pack: StickerPack) => {
    if (!currentUser) {
      showToast('يجب تسجيل الدخول لحفظ حزم الملصقات.', 'info');
      return;
    }
    const isSaved = savedPackIds.has(pack.id);
    setSavingPackId(pack.id);
    try {
      await toggleSaveStickerPack(currentUser, pack.id, !isSaved);
      showToast(
        !isSaved ? `تمت إضافة حزمة "${pack.title}" إلى ملصقاتك.` : `تمت إزالة "${pack.title}".`,
        'success'
      );
    } catch {
      showToast('تعذر تحديث قائمة الملصقات المحفوظة.', 'error');
    } finally {
      setSavingPackId(null);
    }
  };

  const handlePickStickerFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = Math.max(0, 20 - draftStickers.length);
    if (remaining === 0) {
      showToast('الحد الأقصى 20 ملصقاً في الحزمة الواحدة.', 'info');
      return;
    }

    const slice = files.slice(0, remaining);
    setUploadingFiles(true);
    try {
      const uploaded: typeof draftStickers = [];
      for (let i = 0; i < slice.length; i += 1) {
        const file = slice[i];
        const validation = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
        if (!validation.isValid) {
          showToast(`${file.name}: ${validation.error || 'صيغة غير مدعومة'}`, 'error');
          continue;
        }
        let metaPath = '';
        let contentType = file.type || 'image/webp';
        let sizeBytes = file.size;
        const url = await uploadMediaWithControl(file, 'stickers', {
          onMetadata: (meta) => {
            metaPath = meta.path;
            contentType = meta.contentType;
            sizeBytes = meta.sizeBytes;
          },
        }).promise;

        uploaded.push({
          tempId: `stk_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
          url,
          storagePath: metaPath,
          contentType,
          sizeBytes,
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 30),
        });
      }
      if (uploaded.length > 0) {
        setDraftStickers((prev) => [...prev, ...uploaded]);
        showToast(`تم رفع ${uploaded.length} ملصق بنجاح.`, 'success');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'فشل رفع صور الملصقات.', 'error');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmitPack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('يجب تسجيل الدخول لإنشاء حزمة ملصقات.', 'info');
      return;
    }
    if (packTitle.trim().length < 2) {
      showToast('يرجى إدخال اسم حزمة لا يقل عن حرفين.', 'error');
      return;
    }
    if (draftStickers.length === 0) {
      showToast('يرجى رفع صورة ملصق واحدة على الأقل.', 'error');
      return;
    }

    setSubmittingPack(true);
    try {
      const stickers: StickerItem[] = draftStickers.map((d) => ({
        id: d.tempId,
        url: d.url,
        label: d.label.trim() || undefined,
        storagePath: d.storagePath,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
      }));
      const created = await submitStickerPack({
        title: packTitle.trim(),
        description: packDesc.trim(),
        coverURL: stickers[0].url,
        stickers,
      });

      if (created.status === 'approved') {
        await toggleSaveStickerPack(currentUser, created.id, true).catch(() => {});
        showToast('تم إنشاء حزمة الملصقات واعتمادها بنجاح!', 'success');
      } else {
        showToast('تم إرسال الحزمة للمراجعة الإدارية وستظهر فور اعتمادها.', 'success');
      }
      setPackTitle('');
      setPackDesc('');
      setDraftStickers([]);
      setTab('mine');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر إرسال حزمة الملصقات.', 'error');
    } finally {
      setSubmittingPack(false);
    }
  };

  const statusLabel = (pack: StickerPack) => {
    if (pack.status === 'pending') return { text: 'قيد المراجعة', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' };
    if (pack.status === 'rejected') return { text: 'مرفوضة', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' };
    if (pack.status === 'disabled' || !pack.isEnabled) return { text: 'معطّلة', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-400' };
    return { text: 'معتمدة', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
  };

  return (
    <div className="border-t border-slate-200 dark:border-[#242B38] bg-white dark:bg-[#111622] flex flex-col max-h-[360px] font-ar">
      {/* Header Tabs */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-[#242B38] bg-slate-50/70 dark:bg-[#0B0F19]/60">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: 'recent' as const, label: 'الأخيرة', icon: Clock },
            { id: 'mine' as const, label: 'حزمي', icon: Package },
            { id: 'store' as const, label: 'متجر الملصقات', icon: Store },
            { id: 'create' as const, label: 'إنشاء حزمة', icon: Plus },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={active ? { backgroundColor: accentColor } : undefined}
                className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1B2232]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          aria-label="إغلاق درج الملصقات"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'recent' && (
          recentStickers.length === 0 ? (
            <div className="py-8 text-center space-y-2.5">
              <Sparkles className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                لا توجد ملصقات مستخدمة مؤخراً
              </p>
              <p className="text-[11px] text-slate-500">
                استعرض متجر الملصقات الحقيقي أو أنشئ حزمة جديدة.
              </p>
              <button
                type="button"
                onClick={() => setTab('store')}
                className="px-4 py-2 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer"
              >
                تصفح متجر الملصقات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {recentStickers.map((st) => (
                <button
                  key={st.stickerId}
                  type="button"
                  onClick={() => void handleStickerClick(st)}
                  className="p-2 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] hover:bg-slate-100 dark:hover:bg-[#1B2232] border border-slate-200/70 dark:border-[#242B38] flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-95"
                  title={st.label || 'ملصق'}
                >
                  <MediaImage
                    src={st.url}
                    alt={st.label || 'ملصق'}
                    variant="thumbnail"
                    containerClassName="w-14 h-14 overflow-hidden rounded-xl"
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          )
        )}

        {tab === 'mine' && (
          installedAndMyPacks.length === 0 ? (
            <div className="py-8 text-center space-y-2.5">
              <Package className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                لم تضف أي حزمة ملصقات بعد
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab('store')}
                  className="px-3.5 py-2 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer"
                >
                  متجر الملصقات
                </button>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#1B2232] text-slate-800 dark:text-white text-xs font-bold cursor-pointer"
                >
                  إنشاء حزمة
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {installedAndMyPacks.map((pack) => {
                const stBadge = statusLabel(pack);
                const canSend = pack.status === 'approved' && pack.isEnabled !== false;
                return (
                  <div
                    key={pack.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MediaImage
                          src={pack.coverURL}
                          alt={pack.title}
                          variant="thumbnail"
                          containerClassName="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-white dark:bg-[#161B26]"
                          className="w-full h-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                              {pack.title}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${stBadge.cls}`}>
                              {stBadge.text}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {pack.stickers.length} ملصق · بواسطة {pack.authorName}
                          </p>
                        </div>
                      </div>
                      {canSend && savedPackIds.has(pack.id) && (
                        <button
                          type="button"
                          disabled={savingPackId === pack.id}
                          onClick={() => void handleToggleSavePack(pack)}
                          className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-[#1B2232] text-slate-700 dark:text-slate-300 text-[10px] font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      )}
                    </div>

                    {pack.status === 'rejected' && pack.moderationNote && (
                      <p className="text-[11px] text-red-500 bg-red-500/10 px-2.5 py-1.5 rounded-xl">
                        ملاحظة المراجعة: {pack.moderationNote}
                      </p>
                    )}

                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {pack.stickers.map((stk) => (
                        <button
                          key={stk.id}
                          type="button"
                          disabled={!canSend}
                          onClick={() =>
                            void handleStickerClick({
                              packId: pack.id,
                              stickerId: stk.id,
                              url: stk.url,
                              label: stk.label,
                            })
                          }
                          className={`p-1.5 rounded-xl border border-slate-200/70 dark:border-[#242B38] bg-white dark:bg-[#161B26] flex items-center justify-center ${
                            canSend
                              ? 'cursor-pointer hover:scale-105 transition-transform'
                              : 'opacity-50 cursor-not-allowed'
                          }`}
                          title={canSend ? stk.label || 'إرسال ملصق' : 'الحزمة بانتظار الاعتماد'}
                        >
                          <MediaImage
                            src={stk.url}
                            alt={stk.label || pack.title}
                            variant="thumbnail"
                            containerClassName="w-12 h-12 overflow-hidden rounded-lg"
                            className="w-full h-full object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === 'store' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في متجر الملصقات المعتمد..."
                className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] ps-8 pe-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
              />
            </div>

            {loadingStore ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
              </div>
            ) : filteredStorePacks.length === 0 ? (
              <div className="py-6 text-center space-y-2.5">
                <Store className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  لا توجد حزم ملصقات معتمدة حالياً
                </p>
                <p className="text-[11px] text-slate-500">
                  كن أول من يرفع حزمة ملصقات عالية الجودة لمنصة Q.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className="px-4 py-2 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إنشاء حزمة ملصقات</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStorePacks.map((pack) => {
                  const isSaved = savedPackIds.has(pack.id);
                  return (
                    <div
                      key={pack.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <MediaImage
                            src={pack.coverURL}
                            alt={pack.title}
                            variant="thumbnail"
                            containerClassName="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-white dark:bg-[#161B26]"
                            className="w-full h-full object-cover"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                              {pack.title}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {pack.stickers.length} ملصق · {pack.installsCount || 0} تثبيت · {pack.authorName}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={savingPackId === pack.id}
                          onClick={() => void handleToggleSavePack(pack)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
                            isSaved
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-[#3B6DFF] text-white'
                          }`}
                        >
                          {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{isSaved ? 'مضافة' : 'إضافة'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {pack.stickers.map((stk) => (
                          <button
                            key={stk.id}
                            type="button"
                            onClick={() =>
                              void handleStickerClick({
                                packId: pack.id,
                                stickerId: stk.id,
                                url: stk.url,
                                label: stk.label,
                              })
                            }
                            className="p-1.5 rounded-xl border border-slate-200/70 dark:border-[#242B38] bg-white dark:bg-[#161B26] flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                            title={stk.label || 'إرسال ملصق'}
                          >
                            <MediaImage
                              src={stk.url}
                              alt={stk.label || pack.title}
                              variant="thumbnail"
                              containerClassName="w-12 h-12 overflow-hidden rounded-lg"
                              className="w-full h-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'create' && (
          <form onSubmit={handleSubmitPack} className="space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] text-[11px] text-slate-600 dark:text-slate-300">
              {isPrivilegedAutoApprove || isStaff
                ? 'بصفتك ضمن الطاقم المخوّل، سيتم اعتماد الحزمة تلقائياً بمجرد إنشائها.'
                : 'تُرفع الملصقات مباشرة وتدخل المراجعة الإدارية قبل ظهورها في متجر الملصقات العام.'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={packTitle}
                onChange={(e) => setPackTitle(e.target.value)}
                placeholder="اسم حزمة الملصقات (مثال: تعابير Q)"
                className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] px-3 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                maxLength={200}
                value={packDesc}
                onChange={(e) => setPackDesc(e.target.value)}
                placeholder="وصف الحزمة (اختياري)"
                className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] px-3 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/webp,image/png,image/gif,image/jpeg"
              multiple
              onChange={handlePickStickerFiles}
              className="hidden"
            />

            <button
              type="button"
              disabled={uploadingFiles || draftStickers.length >= 20}
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[42px] rounded-xl border border-dashed border-[#3B6DFF]/60 bg-[#3B6DFF]/5 text-[#3B6DFF] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {uploadingFiles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري رفع الصور إلى التخزين السحابي...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>اختيار صور ملصقات (WebP / PNG / GIF — {draftStickers.length}/20)</span>
                </>
              )}
            </button>

            {draftStickers.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {draftStickers.map((d) => (
                  <div
                    key={d.tempId}
                    className="p-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] relative space-y-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDraftStickers((prev) => prev.filter((x) => x.tempId !== d.tempId))
                      }
                      className="absolute top-1 end-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <img src={d.url} alt={d.label} className="w-12 h-12 mx-auto object-contain" />
                    <input
                      type="text"
                      value={d.label}
                      maxLength={30}
                      onChange={(e) =>
                        setDraftStickers((prev) =>
                          prev.map((x) => (x.tempId === d.tempId ? { ...x, label: e.target.value } : x))
                        )
                      }
                      placeholder="وصف"
                      className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] text-[10px] text-center"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={submittingPack || uploadingFiles || draftStickers.length === 0}
              className="w-full min-h-[40px] rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submittingPack && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{submittingPack ? 'جاري الحفظ...' : 'إرسال حزمة الملصقات'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
