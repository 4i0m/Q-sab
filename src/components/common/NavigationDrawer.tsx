import { useEffect } from 'react';
import {
  User,
  Settings,
  Award,
  FileText,
  BookOpen,
  Repeat2,
  MessagesSquare,
  Calendar,
  Bell,
  Bookmark,
  LogOut,
  ShieldAlert,
  X,
  LogIn,
  Radio
} from 'lucide-react';
import { ActiveTab, computeLevelFromXp, xpRequiredForLevel } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { MediaImage } from './MediaImage';
import { LevelBadge, RoleBadge, VerifiedBadge } from './VerifiedBadge';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onOpenAuth?: () => void;
  unreadNotificationsCount?: number;
}

export function NavigationDrawer({
  isOpen,
  onClose,
  activeTab,
  onNavigate,
  onOpenAuth,
  unreadNotificationsCount = 0,
}: NavigationDrawerProps) {
  const { currentUser, isStaff, logout } = useAuth();
  const { isRTL } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navigateAndClose = (tab: ActiveTab) => {
    onNavigate(tab);
    onClose();
  };

  const handleSignOut = async () => {
    onClose();
    await logout();
  };

  const xp = currentUser?.xp || 0;
  const level = Math.max(1, currentUser?.level || computeLevelFromXp(xp));
  const currentFloorXp = level <= 1 ? 0 : xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const pct = Math.max(
    4,
    Math.min(100, Math.round(((xp - currentFloorXp) / Math.max(1, nextLevelXp - currentFloorXp)) * 100))
  );

  const primaryGroup: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; meta?: string }> = [
    { id: 'profile', label: 'الملف الشخصي', icon: User },
    { id: 'settings', label: 'الحساب والإعدادات', icon: Settings },
    { id: 'level', label: 'المستوى (Level)', icon: Award, meta: `Lv.${level}` },
  ];

  const exploreGroup: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'blogs', label: 'المدونات', icon: FileText },
    { id: 'wiki', label: 'الويكي', icon: BookOpen },
    { id: 'reposts', label: 'إعادات النشر', icon: Repeat2 },
    { id: 'rooms', label: 'غرف الدردشة', icon: MessagesSquare },
    { id: 'live', label: 'البث المباشر', icon: Radio },
    { id: 'events', label: 'الفعاليات', icon: Calendar },
  ];

  const activityGroup: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'notifications', label: 'الإشعارات', icon: Bell, badge: unreadNotificationsCount },
    { id: 'saved', label: 'المحفوظات', icon: Bookmark },
  ];

  const renderItem = (item: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    meta?: string;
    badge?: number;
  }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigateAndClose(item.id)}
        className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-start transition-colors cursor-pointer ${
          isActive
            ? 'bg-[#3B6DFF]/10 text-[#3B6DFF] dark:text-[#4F8CFF] font-bold'
            : 'text-slate-800 dark:text-[#E2E8F0] hover:bg-slate-100 dark:hover:bg-[#161B26] font-medium'
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#3B6DFF] dark:text-[#4F8CFF]' : 'text-slate-500 dark:text-[#94A3B8]'}`} />
          <span className="text-sm font-ar truncate">{item.label}</span>
        </span>
        {item.meta && (
          <span className="text-[11px] font-mono-subtle font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1E2534] text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
            {item.meta}
          </span>
        )}
        {typeof item.badge === 'number' && item.badge > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-[#3B6DFF] text-white text-[10px] font-mono-subtle font-bold flex items-center justify-center tabular-nums shrink-0">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel anchored to start edge */}
      <aside
        className={`relative z-10 w-[84vw] max-w-[320px] h-full bg-white dark:bg-[#0B0F19] border-e border-slate-200 dark:border-[#2A2F3A] shadow-2xl flex flex-col justify-between overflow-y-auto ${
          isRTL ? 'ms-0 me-auto' : 'me-auto ms-0'
        }`}
        aria-label="قائمة التنقل"
      >
        <div>
          {/* Top Account Header (X-inspired with Q identity) */}
          <div className="p-4 pb-3 border-b border-slate-200 dark:border-[#2A2F3A]">
            <div className="flex items-start justify-between gap-2 mb-3">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => navigateAndClose('profile')}
                  className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#3B6DFF]/60 hover:border-[#3B6DFF] transition-colors shrink-0 cursor-pointer"
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
                <div className="w-12 h-12 rounded-full bg-[#3B6DFF]/10 border border-[#3B6DFF]/30 flex items-center justify-center text-[#3B6DFF] font-display-en font-extrabold text-lg">
                  Q
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161B26] transition-colors cursor-pointer"
                aria-label="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {currentUser ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigateAndClose('profile')}
                  className="block text-start w-full group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] transition-colors">
                      {currentUser.displayName}
                    </span>
                    {currentUser.isVerified && (
                      <VerifiedBadge
                        category={currentUser.verificationCategory || 'blue'}
                        className="w-4 h-4"
                        interactive={false}
                      />
                    )}
                    <LevelBadge level={level} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-xs font-handle text-slate-500 dark:text-[#94A3B8]" dir="ltr">
                      @{currentUser.handle}
                    </span>
                    <RoleBadge role={currentUser.role} />
                    {currentUser.customRoleName && (
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/35 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">
                        {currentUser.customRoleName}
                      </span>
                    )}
                  </div>
                </button>

                {/* Followers / Following quick stats */}
                <div className="flex items-center gap-4 text-xs font-ar pt-0.5">
                  <button
                    type="button"
                    onClick={() => navigateAndClose('profile')}
                    className="hover:underline cursor-pointer text-slate-600 dark:text-[#94A3B8]"
                  >
                    <strong className="text-slate-900 dark:text-white font-mono-subtle tabular-nums">
                      {currentUser.followingCount || 0}
                    </strong>{' '}
                    متابَع
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateAndClose('profile')}
                    className="hover:underline cursor-pointer text-slate-600 dark:text-[#94A3B8]"
                  >
                    <strong className="text-slate-900 dark:text-white font-mono-subtle tabular-nums">
                      {currentUser.followersCount || 0}
                    </strong>{' '}
                    متابع
                  </button>
                </div>

                {/* Mini XP Progress Bar */}
                <button
                  type="button"
                  onClick={() => navigateAndClose('level')}
                  className="w-full pt-1.5 text-start cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono-subtle text-slate-500 dark:text-[#94A3B8] mb-1">
                    <span>Level {level}</span>
                    <span className="tabular-nums group-hover:text-[#3B6DFF]">{xp} XP</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#161B26] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#3B6DFF] to-[#38BDF8] rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white font-ar">
                  أهلاً بك في منصة Q
                </p>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] font-ar">
                  سجل الدخول للوصول إلى غرف الدردشة، المستوى، والملف الشخصي.
                </p>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Navigation Groups */}
          <nav className="p-3 space-y-3">
            <div className="space-y-0.5">
              {primaryGroup.map(renderItem)}
            </div>

            <div className="border-t border-slate-100 dark:border-[#2A2F3A]/80 pt-3 space-y-0.5">
              {exploreGroup.map(renderItem)}
            </div>

            <div className="border-t border-slate-100 dark:border-[#2A2F3A]/80 pt-3 space-y-0.5">
              {activityGroup.map(renderItem)}
              {(isStaff ||
                Boolean(
                  currentUser?.globalPermissions &&
                    Object.values(currentUser.globalPermissions).some(Boolean)
                )) &&
                renderItem({
                  id: 'moderation',
                  label: 'لوحة الإدارة والإشراف',
                  icon: ShieldAlert,
                })}
            </div>
          </nav>
        </div>

        {/* Footer Sign Out */}
        {currentUser && (
          <div className="p-3 border-t border-slate-200 dark:border-[#2A2F3A]">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/25 font-ar font-bold text-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
