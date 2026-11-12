/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { User } from 'lucide-react';
import { ActiveTab, NotificationItem } from './types';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { BottomNav } from './components/common/BottomNav';
import { FeedView } from './components/feed/FeedView';
import { ExploreView } from './components/explore/ExploreView';
import { EventsView } from './components/events/EventsView';
import { MessagesView } from './components/messages/MessagesView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { ProfileView } from './components/profile/ProfileView';
import { SettingsView } from './components/settings/SettingsView';
import { ModerationView } from './components/moderation/ModerationView';
import { CreatePostModal } from './components/feed/CreatePostModal';
import { AuthModal } from './components/auth/AuthModal';
import { SplashScreen } from './components/splash/SplashScreen';
import { listenToNotifications } from './services/firestore';

function MainApp() {
  const { currentUser } = useAuth();
  const { isRTL } = useLanguage();

  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [previousTab, setPreviousTab] = useState<ActiveTab>('feed');
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Notifications badge
  const [unreadCount, setUnreadCount] = useState(0);

  // Splash screen state (shows once per session)
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('q_splash_viewed');
  });

  // Modals
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      setUnreadCount(0);
      return;
    }
    const unsub = listenToNotifications(currentUser.id, (notifs: NotificationItem[]) => {
      const unread = notifs.filter((n) => !n.read).length;
      setUnreadCount(unread);
    });
    return () => unsub();
  }, [currentUser?.id]);

  const navigateToTab = (tab: ActiveTab) => {
    setPreviousTab(activeTab);
    if (tab === 'profile') {
      setSelectedProfileUserId(currentUser?.id || null);
    }
    setActiveTab(tab);
  };

  const handleSelectUserForProfile = (userId: string) => {
    setSelectedProfileUserId(userId);
    setPreviousTab(activeTab);
    setActiveTab('profile');
  };

  const handleOpenChatWithUser = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setPreviousTab(activeTab);
    setActiveTab('messages');
  };

  const currentProfileTarget = selectedProfileUserId || currentUser?.id || null;

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#3B6DFF] selection:text-white antialiased"
    >
      {/* 1. Splash Screen on Launch matching Screen 1 */}
      {showSplash && (
        <SplashScreen
          onDismiss={() => {
            sessionStorage.setItem('q_splash_viewed', 'true');
            setShowSplash(false);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      )}

      {/* Top Header matching original design */}
      <Header
        activeTab={activeTab}
        setActiveTab={navigateToTab}
        unreadNotificationsCount={unreadCount}
      />

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 flex gap-8">
        {/* Left Sidebar for Desktop */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          onOpenCreatePost={() => {
            if (!currentUser) setIsAuthOpen(true);
            else setIsCreatePostOpen(true);
          }}
        />

        {/* Center Mobile-Optimized Canvas */}
        <main className="flex-1 min-w-0 max-w-xl mx-auto w-full">
          {/* Screen 2: Feed */}
          {activeTab === 'feed' && (
            <FeedView
              onOpenCreatePost={() => {
                if (!currentUser) setIsAuthOpen(true);
                else setIsCreatePostOpen(true);
              }}
              onSelectAuthor={handleSelectUserForProfile}
            />
          )}

          {/* Screen 5: Explore */}
          {activeTab === 'explore' && (
            <ExploreView
              onSelectUser={handleSelectUserForProfile}
              onNavigateToEvents={() => navigateToTab('events')}
            />
          )}

          {/* Screen 6: Events */}
          {activeTab === 'events' && (
            <EventsView onBack={() => setActiveTab(previousTab || 'feed')} />
          )}

          {/* Screen 7: Direct Messages */}
          {activeTab === 'messages' && (
            <MessagesView
              initialConversationId={activeConversationId}
              onBack={() => setActiveTab(previousTab || 'feed')}
              onSelectUserForProfile={handleSelectUserForProfile}
            />
          )}

          {/* Screen 4: Notifications */}
          {activeTab === 'notifications' && (
            <NotificationsView
              onBack={() => setActiveTab(previousTab || 'feed')}
              onOpenSettings={() => navigateToTab('settings')}
              onSelectTarget={(targetId, type) => {
                if (type === 'follow' && targetId) {
                  handleSelectUserForProfile(targetId);
                } else if (type === 'message') {
                  navigateToTab('messages');
                } else {
                  navigateToTab('feed');
                }
              }}
            />
          )}

          {/* Screen 3: Profile */}
          {activeTab === 'profile' && (
            currentProfileTarget ? (
              <ProfileView
                userId={currentProfileTarget}
                onOpenChatWithUser={handleOpenChatWithUser}
              />
            ) : (
              <div className="w-full max-w-md mx-auto py-16 text-center bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-8 space-y-4 shadow-xl">
                <div className="w-16 h-16 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] flex items-center justify-center mx-auto text-[#3B6DFF]">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-tajawal">الملف الشخصي</h3>
                  <p className="text-xs text-[#94A3B8] font-tajawal mt-1">
                    يرجى تسجيل الدخول لعرض وتعديل ملفك الشخصي ومنشوراتك.
                  </p>
                </div>
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-6 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal transition-all shadow-md shadow-[#3B6DFF]/25 active:scale-95 cursor-pointer"
                >
                  تسجيل الدخول الآن
                </button>
              </div>
            )
          )}

          {/* Screen 8: Settings */}
          {activeTab === 'settings' && (
            <SettingsView
              onBack={() => setActiveTab(previousTab || 'feed')}
              onNavigateToModeration={() => navigateToTab('moderation')}
            />
          )}

          {/* Moderation Console for Staff */}
          {activeTab === 'moderation' && (
            <ModerationView onBack={() => setActiveTab('settings')} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (5 tabs matching reference image) */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={navigateToTab}
        onOpenCreatePost={() => {
          if (!currentUser) setIsAuthOpen(true);
          else setIsCreatePostOpen(true);
        }}
      />

      {/* Modals */}
      <CreatePostModal
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <MainApp />
          </AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
