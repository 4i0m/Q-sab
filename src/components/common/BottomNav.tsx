import { Home, Compass, MessageSquare, User, Plus } from 'lucide-react';
import { ActiveTab } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenCreatePost: () => void;
  unreadMessagesCount?: number;
}

export function BottomNav({
  activeTab,
  setActiveTab,
  onOpenCreatePost,
  unreadMessagesCount = 0,
}: BottomNavProps) {
  const { t } = useLanguage();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-[#2A2F3A] pb-safe shadow-[0_-4px_25px_rgba(0,0,0,0.5)]">
      <div className="max-w-md mx-auto flex items-center justify-between h-16 px-4">
        
        {/* 1. الرئيسية (Home) */}
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center justify-center gap-1 w-14 py-1 transition-all cursor-pointer ${
            activeTab === 'feed' ? 'text-[#3B6DFF] font-bold' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-tajawal tracking-tight">{t('home')}</span>
        </button>

        {/* 2. الرسائل (Messages) matching reference ordering */}
        <button
          onClick={() => setActiveTab('messages')}
          className={`relative flex flex-col items-center justify-center gap-1 w-14 py-1 transition-all cursor-pointer ${
            activeTab === 'messages' ? 'text-[#3B6DFF] font-bold' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5 stroke-[2.2]" />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#3B6DFF]"></span>
            )}
          </div>
          <span className="text-[10px] font-tajawal tracking-tight">{t('messages')}</span>
        </button>

        {/* 3. Center + (Create Post) - Prominent Electric Blue Circle matching Reference */}
        <div className="flex items-center justify-center">
          <button
            onClick={onOpenCreatePost}
            className="w-12 h-12 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center shadow-[0_4px_20px_rgba(59,109,255,0.45)] hover:scale-105 active:scale-90 transition-all cursor-pointer border border-[#4F8CFF]/40"
            aria-label={t('publishPost')}
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
        </div>

        {/* 4. اكتشف (Explore) */}
        <button
          onClick={() => setActiveTab('explore')}
          className={`flex flex-col items-center justify-center gap-1 w-14 py-1 transition-all cursor-pointer ${
            activeTab === 'explore' ? 'text-[#3B6DFF] font-bold' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <Compass className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-tajawal tracking-tight">{t('explore')}</span>
        </button>

        {/* 5. الملف الشخصي (Profile) */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 w-14 py-1 transition-all cursor-pointer ${
            activeTab === 'profile' ? 'text-[#3B6DFF] font-bold' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          <User className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-tajawal tracking-tight">{t('profile')}</span>
        </button>

      </div>
    </nav>
  );
}
