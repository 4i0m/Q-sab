import { Search, Bell, Settings, Globe } from 'lucide-react';
import { ActiveTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { QLogo } from './QLogo';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unreadNotificationsCount?: number;
}

export function Header({
  activeTab,
  setActiveTab,
  unreadNotificationsCount = 0,
}: HeaderProps) {
  const { currentUser, onlineCount } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B0F19]/90 backdrop-blur-xl border-b border-[#2A2F3A]">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        
        {/* Left: User Avatar or Q Brand Link */}
        <div className="flex items-center gap-2.5">
          {currentUser ? (
            <button
              onClick={() => setActiveTab('profile')}
              className="relative w-8 h-8 rounded-full overflow-hidden border border-[#3B6DFF]/60 hover:border-[#4F8CFF] transition-all shrink-0 cursor-pointer"
              title="الملف الشخصي"
            >
              <img
                src={
                  currentUser.photoURL ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                    currentUser.displayName
                  )}`
                }
                alt={currentUser.displayName}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('feed')}
              className="flex items-center gap-1.5 group active:scale-95 transition-transform"
            >
              <QLogo size={28} />
            </button>
          )}

          {/* Real verified presence badge in cyan */}
          <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161B26] border border-[#2A2F3A] text-[10px] text-[#94A3B8] font-mono-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F8CFF] animate-pulse"></span>
            <span>{onlineCount} {t('activeNow')}</span>
          </div>
        </div>

        {/* Center: Clean Q Logo matching Screen 2 */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => setActiveTab('feed')}
            className="flex items-center gap-2 group cursor-pointer active:scale-95 transition-transform"
          >
            <QLogo size={32} />
          </button>
        </div>

        {/* Action Icons matching Screen 2 & 8: Search, Notifications, Settings, Language */}
        <div className="flex items-center gap-1">
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[#161B26] hover:bg-[#1E1E2E] border border-[#2A2F3A] text-[11px] font-tajawal text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            title="تبديل اللغة / Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-[#4F8CFF]" />
            <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          {/* Search Icon */}
          <button
            onClick={() => setActiveTab('explore')}
            className={`p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'explore'
                ? 'text-[#4F8CFF] bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#161B26]'
            }`}
            aria-label={t('explore')}
          >
            <Search className="w-4 h-4 stroke-[2]" />
          </button>

          {/* Notifications Icon with Electric Blue Badge */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`relative p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'notifications'
                ? 'text-[#4F8CFF] bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#161B26]'
            }`}
            aria-label={t('notifications')}
          >
            <Bell className="w-4 h-4 stroke-[2]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#3B6DFF] ring-2 ring-[#0B0F19]" />
            )}
          </button>

          {/* Settings Icon */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-xl transition-all cursor-pointer active:scale-90 ${
              activeTab === 'settings'
                ? 'text-[#4F8CFF] bg-[#3B6DFF]/15 border border-[#3B6DFF]/30'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#161B26]'
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
