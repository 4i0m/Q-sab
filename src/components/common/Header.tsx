import { Search, Bell, Settings, Globe, Menu } from 'lucide-react';
import { ActiveTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { QLogo } from './QLogo';
import { MediaImage } from './MediaImage';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenDrawer: () => void;
  unreadNotificationsCount?: number;
}

export function Header({
  activeTab,
  setActiveTab,
  onOpenDrawer,
  unreadNotificationsCount = 0,
}: HeaderProps) {
  const { currentUser, onlineCount } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    const order: Array<'ar' | 'en' | 'tr'> = ['ar', 'en', 'tr'];
    const next = order[(order.indexOf(language) + 1) % order.length];
    setLanguage(next);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-xl border-b border-slate-200 dark:border-[#2A2F3A] transition-colors">
      <div className="max-w-md mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Start corner: Profile Avatar button that opens X-style Navigation Drawer */}
        <div className="flex items-center gap-2 min-w-0">
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="relative w-9 h-9 rounded-full overflow-hidden border border-[#3B6DFF]/60 hover:border-[#4F8CFF] transition-all shrink-0 cursor-pointer active:scale-95"
              title="القائمة الجانبية"
              aria-label="فتح القائمة الجانبية"
            >
              <MediaImage
                src={currentUser.photoURL}
                alt={currentUser.displayName}
                variant="avatar"
                fallbackText={currentUser.displayName}
                containerClassName="w-full h-full rounded-full overflow-hidden"
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-[#3B6DFF] transition-colors shrink-0 cursor-pointer"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-[10px] text-slate-600 dark:text-[#94A3B8] font-mono-subtle tabular-nums shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {onlineCount} {t('activeNow')}
            </span>
          </div>
        </div>

        {/* Center: Clean Q Logo */}
        <div className="flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className="flex items-center gap-2 group cursor-pointer active:scale-95 transition-transform"
            aria-label={t('home')}
          >
            <QLogo size={32} />
          </button>
        </div>

        {/* Actions: Language, Search, Notifications, Settings */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#161B26] hover:bg-slate-200 dark:hover:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] text-[11px] font-handle font-semibold text-slate-700 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title={t('language')}
          >
            <Globe className="w-3.5 h-3.5 text-[#3B6DFF] dark:text-[#4F8CFF]" />
            <span>{language === 'ar' ? 'AR' : language === 'en' ? 'EN' : 'TR'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'explore'
                ? 'text-[#3B6DFF] dark:text-[#4F8CFF] bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161B26]'
            }`}
            aria-label={t('explore')}
          >
            <Search className="w-4 h-4 stroke-[2]" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`relative p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'notifications'
                ? 'text-[#3B6DFF] dark:text-[#4F8CFF] bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161B26]'
            }`}
            aria-label={t('notifications')}
          >
            <Bell className="w-4 h-4 stroke-[2]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#3B6DFF] ring-2 ring-white dark:ring-[#0B0F19]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'settings'
                ? 'text-[#3B6DFF] dark:text-[#4F8CFF] bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161B26]'
            }`}
            aria-label={t('settings')}
          >
            <Settings className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </div>
    </header>
  );
}
