import { Home, MessagesSquare, MessageSquare, User, Plus } from 'lucide-react';
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-xl border-t border-slate-200 dark:border-[#2A2F3A] pb-safe shadow-[0_-4px_20px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_25px_rgba(0,0,0,0.5)] transition-colors">
      <div className="max-w-md mx-auto flex items-center justify-between h-16 px-4">
        <button
          type="button"
          onClick={() => setActiveTab('rooms')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 transition-all cursor-pointer ${
            activeTab === 'rooms'
              ? 'text-[#3B6DFF] font-bold'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <MessagesSquare className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-ar tracking-tight whitespace-nowrap">{t('chatRooms')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 transition-all cursor-pointer ${
            activeTab === 'feed'
              ? 'text-[#3B6DFF] font-bold'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-ar tracking-tight whitespace-nowrap">{t('home')}</span>
        </button>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenCreatePost}
            className="w-12 h-12 rounded-full bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center shadow-[0_4px_20px_rgba(59,109,255,0.4)] hover:scale-105 active:scale-90 transition-all cursor-pointer border border-[#4F8CFF]/40"
            aria-label={t('publishPost')}
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('messages')}
          className={`relative flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 transition-all cursor-pointer ${
            activeTab === 'messages'
              ? 'text-[#3B6DFF] font-bold'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5 stroke-[2.2]" />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#3B6DFF]" />
            )}
          </div>
          <span className="text-[10px] font-ar tracking-tight whitespace-nowrap">{t('messages')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'text-[#3B6DFF] font-bold'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-ar tracking-tight whitespace-nowrap">{t('profile')}</span>
        </button>
      </div>
    </nav>
  );
}
