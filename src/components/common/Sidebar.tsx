import {
  Home,
  Compass,
  Calendar,
  MessageSquare,
  MessagesSquare,
  Bell,
  User,
  Settings,
  ShieldCheck,
  Plus,
  Award,
  Bookmark
} from 'lucide-react';
import { ActiveTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenCreatePost: () => void;
}

export function Sidebar({ activeTab, setActiveTab, onOpenCreatePost }: SidebarProps) {
  const { isStaff } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    { id: 'feed' as ActiveTab, label: t('home'), icon: Home },
    { id: 'explore' as ActiveTab, label: t('explore'), icon: Compass },
    { id: 'rooms' as ActiveTab, label: t('chatRooms'), icon: MessagesSquare },
    { id: 'events' as ActiveTab, label: t('events'), icon: Calendar },
    { id: 'messages' as ActiveTab, label: t('messages'), icon: MessageSquare },
    { id: 'notifications' as ActiveTab, label: t('notifications'), icon: Bell },
    { id: 'level' as ActiveTab, label: t('level'), icon: Award },
    { id: 'saved' as ActiveTab, label: t('saved'), icon: Bookmark },
    { id: 'profile' as ActiveTab, label: t('profile'), icon: User },
    { id: 'settings' as ActiveTab, label: t('settings'), icon: Settings },
  ];

  if (isStaff) {
    navItems.push({ id: 'moderation' as ActiveTab, label: t('moderationCenter'), icon: ShieldCheck });
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-20 h-[calc(100vh-6rem)] pb-6 justify-between">
      <div className="space-y-5">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-xs font-ar font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#3B6DFF]/10 dark:bg-[#3B6DFF]/15 text-[#3B6DFF] dark:text-[#4F8CFF] border border-[#3B6DFF]/30 shadow-sm'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#161B26]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#3B6DFF]' : 'text-slate-500 dark:text-[#94A3B8]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onOpenCreatePost}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-ar font-bold text-xs tracking-wide shadow-[0_4px_20px_rgba(59,109,255,0.3)] active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{t('publishPost')}</span>
        </button>
      </div>
    </aside>
  );
}
