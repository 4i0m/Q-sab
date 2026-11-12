import React, { useState } from 'react';
import { Loader2, Mail, Lock, User, Sparkles } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { QLogo } from '../common/QLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
  
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMsg('');
    try {
      setSubmitting(true);
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تسجيل الدخول بواسطة Google');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    if (authMode === 'signup' && !displayName.trim()) {
      setErrorMsg('يرجى إدخال اسمك أو اسم العرض');
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === 'signin') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, displayName);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ في المصادقة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="max-w-md">
      <div className="space-y-5 pt-1">
        {/* Header with Q Logo */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <QLogo size={52} variant="icon" />
          </div>
          <h3 className="text-base font-bold text-white font-tajawal tracking-tight">
            الانضمام إلى مجتمع Q
          </h3>
          <p className="text-xs text-neutral-400 font-tajawal max-w-xs mx-auto">
            مساحة اجتماعية راقية للمبدعين والمفكرين بنظام مصادقة وتشفير متكامل.
          </p>
        </div>

        {/* Tab switcher: تسجيل الدخول / إنشاء حساب */}
        <div className="flex rounded-xl bg-[#0B0F19] p-1 border border-[#2A2F3A] text-xs font-bold font-tajawal">
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              authMode === 'signin'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('signup');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
              authMode === 'signup'
                ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            إنشاء حساب جديد
          </button>
        </div>

        {/* Google Authentication */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-white hover:bg-neutral-100 text-black font-bold text-xs tracking-wide shadow-md active:scale-95 disabled:opacity-50 transition-all cursor-pointer font-tajawal"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>المتابعة عبر Google</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#2A2F3A] w-full" />
          <span className="bg-[#161B26] px-3 text-[10px] text-[#94A3B8] uppercase font-tajawal shrink-0">
            أو عبر البريد الإلكتروني
          </span>
        </div>

        {/* Real Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-tajawal text-center">
              {errorMsg}
            </div>
          )}

          {authMode === 'signup' && (
            <div className="relative">
              <User className="w-4 h-4 text-[#94A3B8] absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="الاسم الكامل أو اسم العرض"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-10 pe-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal transition-colors"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="w-4 h-4 text-[#94A3B8] absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-10 pe-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal transition-colors"
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-[#94A3B8] absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              placeholder="كلمة المرور (6 أحرف على الأقل)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-10 pe-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-bold text-xs tracking-wide shadow-[0_4px_20px_rgba(59,109,255,0.4)] active:scale-95 disabled:opacity-50 transition-all cursor-pointer font-tajawal mt-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
            ) : authMode === 'signin' ? (
              'تسجيل الدخول'
            ) : (
              'إنشاء الحساب'
            )}
          </button>
        </form>
      </div>
    </Modal>
  );
}
