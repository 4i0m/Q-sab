import React, { useState, useRef } from 'react';
import { Palette, Upload, X, Check, Loader2, RotateCcw } from 'lucide-react';
import { CHAT_BACKGROUND_PRESETS } from '../../utils/chatBackgrounds';
import { uploadMediaWithControl, validateMediaFile } from '../../services/storage';
import { useToast } from '../../context/ToastContext';

interface ChatBackgroundPickerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  currentPresetId?: string;
  currentImageURL?: string;
  scrimOpacity?: number;
  showScrimSlider?: boolean;
  allowScopeChoice?: boolean;
  uploadFolder: 'chats' | 'rooms';
  onApply: (options: {
    presetId: string;
    bgImageURL: string;
    scrimOpacity: number;
    scope: 'conversation' | 'default_dm';
  }) => Promise<void> | void;
  onResetToDefault?: () => Promise<void> | void;
}

export function ChatBackgroundPicker({
  isOpen,
  onClose,
  title = 'خلفية المحادثة',
  currentPresetId = 'default',
  currentImageURL = '',
  scrimOpacity = 0.58,
  showScrimSlider = false,
  allowScopeChoice = false,
  uploadFolder,
  onApply,
  onResetToDefault,
}: ChatBackgroundPickerProps) {
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState(currentPresetId || 'default');
  const [customImageURL, setCustomImageURL] = useState(currentImageURL || '');
  const [scrim, setScrim] = useState(scrimOpacity);
  const [scope, setScope] = useState<'conversation' | 'default_dm'>('conversation');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const validation = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
    if (!validation.isValid) {
      showToast(validation.error || 'صيغة الصورة غير مدعومة.', 'error');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadMediaWithControl(file, uploadFolder).promise;
      setCustomImageURL(url);
      showToast('تم رفع صورة الخلفية بنجاح.', 'success');
    } catch (uploadErr: unknown) {
      showToast(uploadErr instanceof Error ? uploadErr.message : 'فشل رفع الصورة.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onApply({
        presetId: selectedPreset,
        bgImageURL: customImageURL,
        scrimOpacity: scrim,
        scope,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 font-ar"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[88vh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#3B6DFF]" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets Gallery */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">الخلفيات الاحترافية الجاهزة</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHAT_BACKGROUND_PRESETS.map((preset) => {
              const active = !customImageURL && selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setCustomImageURL('');
                  }}
                  className={`rounded-2xl p-2 border text-start cursor-pointer transition-all ${
                    active
                      ? 'border-[#3B6DFF] ring-2 ring-[#3B6DFF]/30 bg-[#3B6DFF]/5'
                      : 'border-slate-200 dark:border-[#242B38] bg-slate-50 dark:bg-[#0B0F19]'
                  }`}
                >
                  <div
                    style={preset.previewStyle}
                    className="w-full h-14 rounded-xl mb-1.5 border border-white/10 relative"
                  >
                    {active && (
                      <span className="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-[#3B6DFF] text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{preset.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Upload */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">أو ارفع صورة مخصصة</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUploadImage}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex-1 min-h-[42px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-[#2A2F3A] bg-slate-50 dark:bg-[#0B0F19] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin text-[#3B6DFF]" /> : <Upload className="w-4 h-4 text-[#3B6DFF]" />}
              <span>{uploading ? 'جاري الرفع...' : customImageURL ? 'تغيير الصورة المخصصة' : 'رفع صورة من الجهاز'}</span>
            </button>
            {customImageURL && (
              <button
                type="button"
                onClick={() => setCustomImageURL('')}
                className="min-h-[42px] px-3 rounded-xl bg-red-500/10 text-red-500 text-xs font-bold cursor-pointer"
              >
                إزالة
              </button>
            )}
          </div>
          {customImageURL && (
            <div
              className="h-24 w-full rounded-2xl border border-slate-200 dark:border-[#242B38] bg-cover bg-center relative overflow-hidden"
              style={{ backgroundImage: `url(${customImageURL})` }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: `rgba(9, 13, 22, ${scrim})` }}
              >
                <span className="text-xs font-bold text-white px-3 py-1 rounded-lg bg-black/40">
                  معاينة التباين مع الرسائل
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Contrast Scrim Slider */}
        {(showScrimSlider || customImageURL) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">طبقة التعتيم لقراءة مريحة</span>
              <span className="font-mono-subtle tabular-nums text-slate-500">{Math.round(scrim * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={0.85}
              step={0.05}
              value={scrim}
              onChange={(e) => setScrim(Number(e.target.value))}
              className="w-full accent-[#3B6DFF]"
            />
          </div>
        )}

        {/* DM Scope Selector */}
        {allowScopeChoice && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">نطاق التطبيق</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('conversation')}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold cursor-pointer ${
                  scope === 'conversation'
                    ? 'border-[#3B6DFF] bg-[#3B6DFF]/15 text-[#3B6DFF]'
                    : 'border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                }`}
              >
                لهذه المحادثة فقط
              </button>
              <button
                type="button"
                onClick={() => setScope('default_dm')}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold cursor-pointer ${
                  scope === 'default_dm'
                    ? 'border-[#3B6DFF] bg-[#3B6DFF]/15 text-[#3B6DFF]'
                    : 'border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                }`}
              >
                لكل المحادثات الخاصة
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={saving || uploading}
            onClick={handleSave}
            className="flex-1 min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>حفظ الخلفية</span>
          </button>
          {onResetToDefault && (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                await onResetToDefault();
                onClose();
              }}
              className="min-h-[44px] px-4 rounded-2xl bg-slate-100 dark:bg-[#0B0F19] text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>افتراضي</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
