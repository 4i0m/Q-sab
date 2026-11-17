import { useState, useEffect } from 'react';
import { QLogo } from '../common/QLogo';

interface SplashScreenProps {
  onDismiss?: () => void;
  onOpenAuth?: () => void;
  duration?: number;
}

export function SplashScreen({ onDismiss, onOpenAuth, duration = 2200 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!duration || duration <= 0) return;
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, duration);
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, duration + 250);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [duration, onDismiss]);

  const handleStartNow = () => {
    setIsFading(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 250);
  };

  const handleSignIn = () => {
    setIsFading(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
      onOpenAuth?.();
    }, 250);
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0B0F19] flex flex-col justify-between px-6 py-10 transition-opacity duration-500 select-none overflow-hidden ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Fluid Luminous Blue Wave as shown in Screen 1 */}
      <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
        {/* Soft radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-[#3B6DFF]/15 rounded-full blur-[100px]" />
        
        {/* Fluid electric blue luminous ribbon / wave */}
        <svg
          viewBox="0 0 500 700"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full object-cover opacity-85"
          preserveAspectRatio="none"
        >
          <path
            d="M-50 450 C 100 320, 250 560, 550 360 L 550 750 L -50 750 Z"
            fill="url(#waveGradient1)"
          />
          <path
            d="M-50 500 C 150 420, 320 620, 550 460"
            stroke="url(#waveStroke)"
            strokeWidth="3"
            filter="url(#glowFilter)"
          />
          <defs>
            <linearGradient id="waveGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E2A4A" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#162238" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0B0F19" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="waveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2554E8" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#4F8CFF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#3B6DFF" stopOpacity="0.3" />
            </linearGradient>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      </div>

      {/* Top Bar with subtle Skip */}
      <div className="w-full flex justify-end pt-2">
        <button
          onClick={handleStartNow}
          className="text-xs font-tajawal text-[#94A3B8] hover:text-white px-3 py-1.5 rounded-full hover:bg-[#161B26]/60 transition-colors"
        >
          تخطي ←
        </button>
      </div>

      {/* Center Hero: Glowing Q Logo & Slogan matching Screen 1 */}
      <div className="flex flex-col items-center text-center space-y-5 my-auto">
        {/* Glowing Electric Blue Monogram */}
        <div className="relative">
          <div className="absolute -inset-6 bg-[#3B6DFF]/25 rounded-full blur-3xl animate-pulse" />
          <QLogo size={104} animated={false} className="drop-shadow-[0_4px_30px_rgba(59,109,255,0.6)]" />
        </div>

        {/* Wordmark and Slogan */}
        <div className="space-y-2 pt-2">
          <h1 className="text-3xl font-black text-white font-jakarta tracking-tight">
            Q
          </h1>
          <p className="text-sm text-[#94A3B8] font-tajawal max-w-xs mx-auto leading-relaxed">
            تواصل .. اكتشف .. كن جزءاً من المجتمع
          </p>
        </div>
      </div>

      {/* Bottom Action Buttons matching Screen 1 */}
      <div className="w-full max-w-sm mx-auto space-y-3 pb-4">
        {/* 1. Primary Solid Electric Blue Button: ابدأ الآن */}
        <button
          onClick={handleStartNow}
          className="w-full py-4 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold font-tajawal text-sm shadow-[0_4px_25px_rgba(59,109,255,0.45)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
        >
          ابدأ الآن
        </button>

        {/* 2. Secondary Outlined Button: تسجيل الدخول */}
        <button
          onClick={handleSignIn}
          className="w-full py-3.5 rounded-2xl bg-[#161B26]/80 hover:bg-[#1E1E2E] border border-[#2A2F3A] text-[#F8FAFC] font-bold font-tajawal text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
        >
          تسجيل الدخول
        </button>
      </div>
    </div>
  );
}

