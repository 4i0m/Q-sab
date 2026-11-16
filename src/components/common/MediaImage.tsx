import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { UserCustomization } from '../../types';

export type MediaImageVariant =
  | 'avatar'
  | 'banner'
  | 'post'
  | 'chat'
  | 'event'
  | 'story'
  | 'thumbnail';

export const Q_BANNER_PRESETS: Record<
  NonNullable<UserCustomization['themePattern']>,
  { gradient: string; labelAr: string; labelEn: string }
> = {
  minimal: {
    labelAr: 'أزرق Q',
    labelEn: 'Q Midnight',
    gradient:
      'radial-gradient(circle at 20% 20%, rgba(59, 109, 255, 0.42), transparent 55%), radial-gradient(circle at 80% 80%, rgba(79, 140, 255, 0.25), transparent 55%), linear-gradient(135deg, #0B1224 0%, #141E38 52%, #0F172A 100%)',
  },
  stars: {
    labelAr: 'سماء الليل',
    labelEn: 'Night Sky',
    gradient:
      'radial-gradient(circle at 75% 25%, rgba(96, 165, 250, 0.38), transparent 45%), radial-gradient(circle at 18% 75%, rgba(129, 140, 248, 0.28), transparent 50%), linear-gradient(135deg, #090D1A 0%, #151C36 60%, #1E293B 100%)',
  },
  castle: {
    labelAr: 'كلاسيكي داكن',
    labelEn: 'Classic Slate',
    gradient:
      'radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.25), transparent 55%), linear-gradient(135deg, #111827 0%, #1F2937 55%, #0B0F19 100%)',
  },
  carbon: {
    labelAr: 'كربون حديث',
    labelEn: 'Carbon Grid',
    gradient:
      'radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.24), transparent 50%), linear-gradient(135deg, #0D1117 0%, #161B26 55%, #111827 100%)',
  },
};

export function isLegacyUnsplashUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return /images\.unsplash\.com/i.test(url);
}

interface MediaImageProps {
  src?: string | null;
  alt?: string;
  variant?: MediaImageVariant;
  className?: string;
  containerClassName?: string;
  fallbackText?: string;
  bannerPattern?: NonNullable<UserCustomization['themePattern']>;
  accentColor?: string;
  loading?: 'lazy' | 'eager';
  allowRetry?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}

export function MediaImage({
  src,
  alt = '',
  variant = 'post',
  className = 'w-full h-full object-cover',
  containerClassName = 'relative w-full h-full overflow-hidden',
  fallbackText,
  bannerPattern = 'minimal',
  accentColor = '#3B6DFF',
  loading = 'lazy',
  allowRetry = variant === 'post' || variant === 'chat' || variant === 'event' || variant === 'story',
  onClick,
}: MediaImageProps) {
  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const shouldUseCssBannerOnly = variant === 'banner' && (!cleanSrc || isLegacyUnsplashUrl(cleanSrc));

  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    !cleanSrc || shouldUseCssBannerOnly ? 'error' : 'loading'
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  const effectiveSrc = (() => {
    if (!cleanSrc || shouldUseCssBannerOnly) return '';
    if (retryCount === 0) return cleanSrc;
    const sep = cleanSrc.includes('?') ? '&' : '?';
    return `${cleanSrc}${sep}retry=${retryCount}`;
  })();

  useEffect(() => {
    setRetryCount(0);
    if (!cleanSrc || shouldUseCssBannerOnly) {
      setStatus('error');
      return;
    }
    setStatus('loading');
  }, [cleanSrc, shouldUseCssBannerOnly]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !effectiveSrc) return;
    if (el.complete) {
      if (el.naturalWidth > 0) {
        setStatus('loaded');
      } else {
        setStatus('error');
      }
    }
  }, [effectiveSrc]);

  const initials = (fallbackText || alt || 'Q')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || 'Q';

  const preset = Q_BANNER_PRESETS[bannerPattern] || Q_BANNER_PRESETS.minimal;

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanSrc) return;
    setStatus('loading');
    setRetryCount((c) => c + 1);
  };

  return (
    <div
      onClick={onClick}
      className={`${containerClassName} bg-slate-100 dark:bg-[#141A26]`}
    >
      {/* Loading skeleton shimmer (never pitch black) */}
      {effectiveSrc && status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-[#1A2130] dark:via-[#222B3E] dark:to-[#1A2130] animate-pulse"
        />
      )}

      {/* Real image element */}
      {effectiveSrc && status !== 'error' && (
        <img
          ref={imgRef}
          src={effectiveSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth > 0) {
              setStatus('loaded');
            } else {
              setStatus('error');
            }
          }}
          onError={() => setStatus('error')}
          className={`${className} transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Error / Fallback Views */}
      {(!effectiveSrc || status === 'error') && (
        <>
          {variant === 'banner' ? (
            <div
              className="absolute inset-0"
              style={{
                background: preset.gradient,
              }}
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage: `radial-gradient(${accentColor}55 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }}
              />
            </div>
          ) : variant === 'avatar' ? (
            <div
              className="w-full h-full flex items-center justify-center font-bold text-white select-none text-[0.85em]"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, #1E40AF)`,
              }}
            >
              <span>{initials}</span>
            </div>
          ) : (
            <div className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 p-3 text-center bg-slate-100 dark:bg-[#141A26] text-slate-500 dark:text-[#94A3B8]">
              <ImageOff className="w-5 h-5 opacity-70" />
              {variant !== 'thumbnail' && (
                <span className="text-[11px] font-medium">تعذر تحميل الصورة</span>
              )}
              {allowRetry && cleanSrc && variant !== 'thumbnail' && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1E2638] border border-slate-200 dark:border-[#2A3244] text-[11px] font-bold text-[#3B6DFF] dark:text-[#60A5FA] hover:border-[#3B6DFF] transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>إعادة تحميل</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
