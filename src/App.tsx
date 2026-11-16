/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { User, WifiOff } from 'lucide-react';
import { ActiveTab, NotificationItem, Post } from './types';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { BottomNav } from './components/common/BottomNav';
import { NavigationDrawer } from './components/common/NavigationDrawer';
import { FeedView } from './components/feed/FeedView';
import { FilteredFeedView } from './components/feed/FilteredFeedView';
import { PostDetailView } from './components/feed/PostDetailView';
import { ExploreView } from './components/explore/ExploreView';
import { ChatRoomsView } from './components/rooms/ChatRoomsView';
import { EventsView } from './components/events/EventsView';
import { MessagesView } from './components/messages/MessagesView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { ProfileView } from './components/profile/ProfileView';
import { LevelView } from './components/level/LevelView';
import { SettingsView } from './components/settings/SettingsView';
import { ModerationView } from './components/moderation/ModerationView';
import { CreatePostModal, CreatePostInitialMode } from './components/feed/CreatePostModal';
import { AuthModal } from './components/auth/AuthModal';
import { SplashScreen } from './components/splash/SplashScreen';
import { listenToNotifications } from './services/firestore';

function MainApp() {
  const { currentUser, firebaseUser } = useAuth();
  const { isRTL, t } = useLanguage();

  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [previousTab, setPreviousTab] = useState<ActiveTab>('feed');
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesInitialTab, setMessagesInitialTab] = useState<'all' | 'unread' | 'groups'>('all');
  const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);
  const [isMobileRoomOpen, setIsMobileRoomOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));

  // Notifications badge
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);

  // Splash screen state (shows once per session)
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('q_splash_viewed');
  });

  // Modals
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [createPostMode, setCreatePostMode] = useState<CreatePostInitialMode>('post');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const openCreatePost = (mode: CreatePostInitialMode = 'post') => {
    if (!currentUser) {
      setIsAuthOpen(true);
    } else {
      setCreatePostMode(mode);
      setIsCreatePostOpen(true);
    }
  };

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id || firebaseUser?.uid !== currentUser.id) {
      setUnreadCount(0);
      prevUnreadRef.current = null;
      return;
    }
    const unsub = listenToNotifications(currentUser.id, (notifs: NotificationItem[]) => {
      const unread = notifs.filter((n) => !n.read).length;
      if (
        prevUnreadRef.current !== null &&
        unread > prevUnreadRef.current &&
        currentUser.customization?.notifications?.sound !== false
      ) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(740, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(988, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
          }
        } catch {
          // Audio playback blocked before user gesture
        }
      }
      prevUnreadRef.current = unread;
      setUnreadCount(unread);
    });
    return () => unsub();
  }, [currentUser?.id, currentUser?.customization?.notifications?.sound, firebaseUser?.uid]);

  const navigateToTab = (tab: ActiveTab) => {
    setPreviousTab(activeTab);
    setSelectedPost(null);
    if (tab !== 'messages') {
      setIsMobileThreadOpen(false);
    } else {
      setMessagesInitialTab('all');
    }
    if (tab !== 'rooms') {
      setSelectedRoomId(null);
      setIsMobileRoomOpen(false);
    }
    if (tab === 'profile') {
      setSelectedProfileUserId(currentUser?.id || null);
    }
    setActiveTab(tab);
  };

  const handleOpenRoomTarget = (roomId?: string | null) => {
    setSelectedPost(null);
    setPreviousTab(activeTab);
    setSelectedRoomId(roomId || null);
    setIsMobileRoomOpen(Boolean(roomId));
    setActiveTab('rooms');
  };

  const handleSelectUserForProfile = (userId: string) => {
    setSelectedPost(null);
    setSelectedProfileUserId(userId);
    setPreviousTab(activeTab);
    setActiveTab('profile');
  };

  const handleOpenChatWithUser = (conversationId: string) => {
    setSelectedPost(null);
    setMessagesInitialTab('all');
    setActiveConversationId(conversationId);
    setIsMobileThreadOpen(true);
    setPreviousTab(activeTab);
    setActiveTab('messages');
  };

  const currentProfileTarget = selectedProfileUserId || currentUser?.id || null;
  const fullScreenChatMode =
    (activeTab === 'messages' && isMobileThreadOpen) ||
    (activeTab === 'rooms' && isMobileRoomOpen);

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-[#F8FAFC] flex flex-col font-ar selection:bg-[#3B6DFF] selection:text-white antialiased transition-colors"
    >
      {isOffline && (
        <div className="bg-amber-600 text-white text-[11px] font-bold px-3 py-1.5 flex items-center justify-center gap-2 z-50">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>انقطع الاتصال بالإنترنت — جاري عرض البيانات المخزنة ومحاولة إعادة الاتصال...</span>
        </div>
      )}
      {/* 1. Splash Screen on Launch */}
      {showSplash && (
        <SplashScreen
          onDismiss={() => {
            sessionStorage.setItem('q_splash_viewed', 'true');
            setShowSplash(false);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      )}

      {/* Top Header hidden on mobile during full-screen active chat */}
      <div className={fullScreenChatMode ? 'hidden lg:block' : ''}>
        <Header
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          unreadNotificationsCount={unreadCount}
        />
      </div>

      {/* X-Style Navigation Drawer */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        onNavigate={navigateToTab}
        onOpenAuth={() => setIsAuthOpen(true)}
        unreadNotificationsCount={unreadCount}
      />

      {/* Main Container */}
      <div
        className={`flex-1 max-w-7xl w-full mx-auto flex gap-8 ${
          fullScreenChatMode ? 'px-0 pt-0 lg:px-8 lg:pt-4' : 'px-3 sm:px-6 lg:px-8 pt-4'
        }`}
      >
        {/* Left Sidebar for Desktop */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          onOpenCreatePost={() => openCreatePost('post')}
        />

        {/* Center Canvas */}
        <main
          className={`flex-1 min-w-0 mx-auto w-full ${
            fullScreenChatMode
              ? 'max-w-none lg:max-w-2xl'
              : activeTab === 'explore' || activeTab === 'rooms'
              ? 'max-w-3xl'
              : 'max-w-xl'
          }`}
        >
          {/* Dedicated Post Detail View */}
          {selectedPost ? (
            <PostDetailView
              post={selectedPost}
              onBack={() => setSelectedPost(null)}
              onSelectAuthor={handleSelectUserForProfile}
            />
          ) : (
            <>
              {/* Feed */}
              {activeTab === 'feed' && (
                <FeedView
                  onOpenCreatePost={openCreatePost}
                  onSelectAuthor={handleSelectUserForProfile}
                  onSelectPost={(p) => setSelectedPost(p)}
                />
              )}

              {/* Filtered Destinations (Blogs / Wiki / Reposts / Saved) */}
              {(activeTab === 'blogs' ||
                activeTab === 'wiki' ||
                activeTab === 'reposts' ||
                activeTab === 'saved') && (
                <FilteredFeedView
                  mode={activeTab}
                  onBack={() => setActiveTab(previousTab || 'feed')}
                  onSelectAuthor={handleSelectUserForProfile}
                  onSelectPost={(p) => setSelectedPost(p)}
                  onOpenCreatePost={openCreatePost}
                />
              )}

              {/* Standalone Chat Rooms */}
              {activeTab === 'rooms' && (
                <ChatRoomsView
                  onSelectAuthor={handleSelectUserForProfile}
                  initialRoomId={selectedRoomId}
                  onActiveRoomChange={(rid) => setIsMobileRoomOpen(Boolean(rid))}
                />
              )}

              {/* Amino-Inspired Q Level System */}
              {activeTab === 'level' && (
                <LevelView onBack={() => setActiveTab(previousTab || 'feed')} />
              )}

              {/* Explore */}
              {activeTab === 'explore' && (
                <ExploreView
                  onSelectUser={handleSelectUserForProfile}
                  onSelectPost={(p) => setSelectedPost(p)}
                  onSelectRoom={(roomId) => handleOpenRoomTarget(roomId)}
                  onNavigateToEvents={() => navigateToTab('events')}
                />
              )}

              {/* Real Events */}
              {activeTab === 'events' && (
                <EventsView
                  onBack={() => setActiveTab(previousTab || 'feed')}
                  onSelectAuthor={handleSelectUserForProfile}
                />
              )}

              {/* Direct Messages & Group DMs */}
              {activeTab === 'messages' && (
                <MessagesView
                  initialConversationId={activeConversationId}
                  initialTab={messagesInitialTab}
                  onActiveConversationChange={(cid) => setIsMobileThreadOpen(Boolean(cid))}
                  onBack={() => setActiveTab(previousTab || 'feed')}
                  onSelectUserForProfile={handleSelectUserForProfile}
                  onOpenRoomsTab={() => handleOpenRoomTarget(null)}
                />
              )}

              {/* Notifications */}
              {activeTab === 'notifications' && (
                <NotificationsView
                  onBack={() => setActiveTab(previousTab || 'feed')}
                  onOpenSettings={() => navigateToTab('settings')}
                  onSelectTarget={(targetId, type) => {
                    if (type === 'room_invite') {
                      handleOpenRoomTarget(targetId || null);
                    } else if (type === 'event') {
                      navigateToTab('events');
                    } else if (type === 'follow' && targetId) {
                      handleSelectUserForProfile(targetId);
                    } else if (type === 'message') {
                      if (targetId) {
                        setActiveConversationId(targetId);
                        setIsMobileThreadOpen(true);
                      }
                      navigateToTab('messages');
                    } else {
                      navigateToTab('feed');
                    }
                  }}
                />
              )}

              {/* Profile */}
              {activeTab === 'profile' && (
                currentProfileTarget ? (
                  <ProfileView
                    userId={currentProfileTarget}
                    onBack={() => setActiveTab(previousTab || 'feed')}
                    onOpenSettings={() => navigateToTab('settings')}
                    onOpenChatWithUser={handleOpenChatWithUser}
                    onSelectAuthor={handleSelectUserForProfile}
                    onSelectPost={(p) => setSelectedPost(p)}
                  />
                ) : (
                  <div className="w-full max-w-md mx-auto py-16 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-8 space-y-4 shadow-sm dark:shadow-xl">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#1E1E2E] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-center mx-auto text-[#3B6DFF]">
                      <User className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-ar">{t('profile')}</h3>
                      <p className="text-xs text-slate-600 dark:text-[#94A3B8] font-ar mt-1">
                        {t('signInToViewProfile')}
                      </p>
                    </div>
                    <button
                      onClick={() => setIsAuthOpen(true)}
                      className="px-6 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-ar transition-all shadow-md shadow-[#3B6DFF]/25 active:scale-95 cursor-pointer"
                    >
                      {t('signInNow')}
                    </button>
                  </div>
                )
              )}

              {/* Settings */}
              {activeTab === 'settings' && (
                <SettingsView
                  onBack={() => setActiveTab(previousTab || 'feed')}
                  onNavigateToModeration={() => navigateToTab('moderation')}
                  onSelectUserForProfile={handleSelectUserForProfile}
                />
              )}

              {/* Moderation Console for Staff */}
              {activeTab === 'moderation' && (
                <ModerationView onBack={() => setActiveTab('settings')} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (hidden in full-screen chat thread) */}
      {!fullScreenChatMode && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          onOpenCreatePost={() => openCreatePost('post')}
        />
      )}

      {/* Modals */}
      <CreatePostModal
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
        initialMode={createPostMode}
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
