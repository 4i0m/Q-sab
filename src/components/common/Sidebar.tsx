import {
  Home,
  Compass,
  Calendar,
  MessageSquare,
  Bell,
  User,
  Settings,
  ShieldCheck,
  Plus,
  Sparkles
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
  const { currentUser, isStaff } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    { id: 'feed' as ActiveTab, label: t('home'), icon: Home },
    { id: 'explore' as ActiveTab, label: t('explore'), icon: Compass },
    { id: 'events' as ActiveTab, label: t('communityEvents'), icon: Calendar },
    { id: 'messages' as ActiveTab, label: t('messages'), icon: MessageSquare },
    { id: 'notifications' as ActiveTab, label: t('notifications'), icon: Bell },
    { id: 'profile' as ActiveTab, label: t('profile'), icon: User },
    { id: 'settings' as ActiveTab, label: t('settings'), icon: Settings },
  ];

  if (isStaff) {
    navItems.push({ id: 'moderation' as ActiveTab, label: 'مركز الإشراف', icon: ShieldCheck });
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-20 h-[calc(100vh-6rem)] pb-6 justify-between">
      <div className="space-y-6">
        {/* Navigation items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-xs font-tajawal font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#3B6DFF]/15 text-[#4F8CFF] border border-[#3B6DFF]/30 shadow-md shadow-[#3B6DFF]/10'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#161B26]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#3B6DFF]' : 'text-[#94A3B8]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Post Action */}
        <button
          onClick={onOpenCreatePost}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white font-tajawal font-bold text-xs tracking-wide shadow-[0_4px_20px_rgba(59,109,255,0.35)] active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{t('publishPost')}</span>
        </button>
      </div>

      {/* Network branding box */}
      <div className="p-4 rounded-2xl bg-[#161B26] border border-[#2A2F3A]">
        <div className="flex items-center gap-2 text-xs font-semibold text-white font-jakarta">
          <Sparkles className="w-3.5 h-3.5 text-[#3B6DFF]" />
          <span>Q COMMUNITY</span>
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-1 font-tajawal leading-relaxed">
          تواصل .. اكتشف .. كن جزءاً من المجتمع
        </p>
      </div>
    </aside>
  );
}
