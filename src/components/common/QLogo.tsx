import React from 'react';

interface QLogoProps {
  className?: string;
  size?: number;
  variant?: 'icon' | 'lockup' | 'monochrome' | 'badge';
  animated?: boolean;
}

export function QLogo({
  className = '',
  size = 36,
  variant = 'icon',
  animated = false,
}: QLogoProps) {
  const gradientId = `q-electric-grad-${Math.random().toString(36).substr(2, 5)}`;
  const glowId = `q-glow-${Math.random().toString(36).substr(2, 5)}`;

  if (variant === 'lockup') {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <div style={{ width: size, height: size }} className="shrink-0 relative">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`w-full h-full filter drop-shadow-[0_2px_12px_rgba(59,109,255,0.45)] ${
              animated ? 'animate-pulse' : ''
            }`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4F8CFF" />
                <stop offset="50%" stopColor="#3B6DFF" />
                <stop offset="100%" stopColor="#2554E8" />
              </linearGradient>
            </defs>

            {/* Precision geometric Q loop */}
            <circle
              cx="48"
              cy="48"
              r="32"
              stroke={`url(#${gradientId})`}
              strokeWidth="11"
              strokeLinecap="round"
            />
            {/* Smooth curved dynamic tail */}
            <path
              d="M44 48 C 54 58, 62 66, 80 82"
              stroke={`url(#${gradientId})`}
              strokeWidth="11"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="flex flex-col text-start">
          <span className="font-jakarta text-2xl font-black tracking-tight text-white leading-none">
            Q
          </span>
          <span className="text-[10px] tracking-wider text-[#94A3B8] font-tajawal mt-0.5">
            Connect • Share • Discover
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'monochrome') {
    return (
      <div style={{ width: size, height: size }} className={`shrink-0 ${className}`}>
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <circle cx="48" cy="48" r="32" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
          <path d="M44 48 C 54 58, 62 66, 80 82" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (variant === 'badge') {
    // App Icon Container as shown in top-left of reference
    return (
      <div
        style={{ width: size, height: size }}
        className={`shrink-0 relative rounded-2xl bg-[#0D111D] border border-[#2A2F3A] p-2 flex items-center justify-center shadow-[0_4px_20px_rgba(59,109,255,0.25)] ${className}`}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full filter drop-shadow-[0_2px_8px_rgba(59,109,255,0.5)]"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4F8CFF" />
              <stop offset="60%" stopColor="#3B6DFF" />
              <stop offset="100%" stopColor="#224DE3" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="32" stroke={`url(#${gradientId})`} strokeWidth="12" strokeLinecap="round" />
          <path d="M44 48 C 54 58, 62 66, 80 82" stroke={`url(#${gradientId})`} strokeWidth="12" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // Default: Electric Blue Geometric Monogram Icon
  return (
    <div style={{ width: size, height: size }} className={`shrink-0 relative ${className}`}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full filter drop-shadow-[0_2px_12px_rgba(59,109,255,0.45)] ${
          animated ? 'animate-pulse' : ''
        }`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4F8CFF" />
            <stop offset="50%" stopColor="#3B6DFF" />
            <stop offset="100%" stopColor="#224DE3" />
          </linearGradient>
        </defs>

        {/* Outer continuous precision geometric loop */}
        <circle
          cx="48"
          cy="48"
          r="32"
          stroke={`url(#${gradientId})`}
          strokeWidth="11"
          strokeLinecap="round"
        />

        {/* Dynamic curved tangent tail */}
        <path
          d="M44 48 C 54 58, 62 66, 80 82"
          stroke={`url(#${gradientId})`}
          strokeWidth="11"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

