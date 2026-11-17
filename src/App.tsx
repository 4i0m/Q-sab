/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { User, WifiOff, MessageSquare, X } from 'lucide-react';
import { ActiveTab, Conversation, NotificationItem, Post } from './types';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { BottomNav } from './components/common/BottomNav';
import { NavigationDrawer } from './components/common/NavigationDrawer';
import { MediaImage } from './components/common/MediaImage';
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
import { LiveBroadcastView } from './components/live/LiveBroadcastView';
import { CreatePostModal, CreatePostInitialMode } from './components/feed/CreatePostModal';
import { AuthModal } from './components/auth/AuthModal';
import { SplashScreen } from './components/splash/SplashScreen';
import { getUserProfile, listenToConversations, listenToNotifications } from './services/firestore';

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

  // Notifications badge (strictly non-DM social notifications)
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);

  // Dedicated DM unread badge + clickable floating DM banner
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [dmAlert, setDmAlert] = useState<{
    conversationId: string;
    senderName: string;
    senderPhotoURL?: string;
    preview: string;
    isGroup?: boolean;
    groupName?: string;
  } | null>(null);
  const dmInitializedRef = useRef(false);
  const seenDmTimestampsRef = useRef<Map<string, string>>(new Map());
  const dmAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTabRef = useRef(activeTab);
  const activeConvIdRef = useRef(activeConversationId);
  const isMobileThreadOpenRef = useRef(isMobileThreadOpen);
  const notifPrefsRef = useRef(currentUser?.customization?.notifications);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
    if (activeTab === 'messages' && activeConversationId && dmAlert?.conversationId === activeConversationId) {
      setDmAlert(null);
    }
  }, [activeTab, activeConversationId, dmAlert?.conversationId]);

  useEffect(() => {
    isMobileThreadOpenRef.current = isMobileThreadOpen;
  }, [isMobileThreadOpen]);

  useEffect(() => {
    notifPrefsRef.current = currentUser?.customization?.notifications;
  }, [currentUser?.customization?.notifications]);

  const playNotificationChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  };

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

  // Hardware back button / Android gesture back support via history stack
  const navStateRef = useRef({
    isAuthOpen,
    isCreatePostOpen,
    isDrawerOpen,
    hasSelectedPost: Boolean(selectedPost),
    isMobileThreadOpen,
    isMobileRoomOpen,
    activeTab,
  });

  useEffect(() => {
    navStateRef.current = {
      isAuthOpen,
      isCreatePostOpen,
      isDrawerOpen,
      hasSelectedPost: Boolean(selectedPost),
      isMobileThreadOpen,
      isMobileRoomOpen,
      activeTab,
    };
  }, [
    isAuthOpen,
    isCreatePostOpen,
    isDrawerOpen,
    selectedPost,
    isMobileThreadOpen,
    isMobileRoomOpen,
    activeTab,
  ]);

  const historyLockRef = useRef(false);
  useEffect(() => {
    const isDeepView =
      isAuthOpen ||
      isCreatePostOpen ||
      isDrawerOpen ||
      Boolean(selectedPost) ||
      isMobileThreadOpen ||
      isMobileRoomOpen ||
      activeTab !== 'feed';

    if (isDeepView && !historyLockRef.current) {
      try {
        window.history.pushState({ qDepth: true }, '');
        historyLockRef.current = true;
      } catch {
        // Ignore history restriction
      }
    } else if (!isDeepView) {
      historyLockRef.current = false;
    }
  }, [
    isAuthOpen,
    isCreatePostOpen,
    isDrawerOpen,
    selectedPost,
    isMobileThreadOpen,
    isMobileRoomOpen,
    activeTab,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const s = navStateRef.current;
      historyLockRef.current = false;
      if (s.isAuthOpen) {
        setIsAuthOpen(false);
        return;
      }
      if (s.isCreatePostOpen) {
        setIsCreatePostOpen(false);
        return;
      }
      if (s.isDrawerOpen) {
        setIsDrawerOpen(false);
        return;
      }
      if (s.hasSelectedPost) {
        setSelectedPost(null);
        return;
      }
      if (s.isMobileThreadOpen) {
        setIsMobileThreadOpen(false);
        setActiveConversationId(null);
        return;
      }
      if (s.isMobileRoomOpen) {
        setIsMobileRoomOpen(false);
        setSelectedRoomId(null);
        return;
      }
      if (s.activeTab !== 'feed') {
        setActiveTab('feed');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
      const socialNotifs = notifs.filter((n) => n.type !== 'message');
      const unread = socialNotifs.filter((n) => !n.read).length;
      if (
        prevUnreadRef.current !== null &&
        unread > prevUnreadRef.current &&
        currentUser.customization?.notifications?.sound !== false
      ) {
        playNotificationChime();
      }
      prevUnreadRef.current = unread;
      setUnreadCount(unread);
    });
    return () => unsub();
  }, [currentUser?.id, currentUser?.customization?.notifications?.sound, firebaseUser?.uid]);

  useEffect(() => {
    if (!currentUser?.id || firebaseUser?.uid !== currentUser.id) {
      setUnreadMessagesCount(0);
      setDmAlert(null);
      dmInitializedRef.current = false;
      seenDmTimestampsRef.current.clear();
      return;
    }

    const uid = currentUser.id;
    const unsub = listenToConversations(uid, (convs: Conversation[]) => {
      let unreadMsgs = 0;
      const incomingCandidates: Conversation[] = [];

      convs.forEach((conv) => {
        const ts = conv.lastMessageTimestamp || '';
        const senderId = conv.lastMessageSenderId || '';
        const readAt = conv.readBy?.[uid];
        const hasText = Boolean(conv.lastMessageText);
        const isUnreadFromOther = Boolean(
          hasText && senderId && senderId !== uid && ts && (!readAt || ts > readAt)
        );
        if (isUnreadFromOther) {
          unreadMsgs += 1;
        }

        const prevSeenTs = seenDmTimestampsRef.current.get(conv.id);
        if (dmInitializedRef.current && isUnreadFromOther && ts !== prevSeenTs) {
          incomingCandidates.push(conv);
        }
        if (ts) {
          seenDmTimestampsRef.current.set(conv.id, ts);
        }
      });

      setUnreadMessagesCount(unreadMsgs);

      if (!dmInitializedRef.current) {
        dmInitializedRef.current = true;
        return;
      }

      const prefs = notifPrefsRef.current;
      const allowDmAlerts =
        prefs?.messages !== false && localStorage.getItem('q_notif_messages') !== 'false';
      if (!allowDmAlerts || incomingCandidates.length === 0) return;

      const latest = incomingCandidates[0];
      const desktopThreadVisible =
        typeof window !== 'undefined' && window.innerWidth >= 1024;
      const isViewingExactThread =
        activeTabRef.current === 'messages' &&
        activeConvIdRef.current === latest.id &&
        (isMobileThreadOpenRef.current || desktopThreadVisible);

      if (isViewingExactThread) return;

      const senderId = latest.lastMessageSenderId || '';
      const snapshotDetail = senderId ? latest.participantDetails?.[senderId] : undefined;
      const allowPreview =
        prefs?.showMessagePreview !== false &&
        localStorage.getItem('q_notif_showMessagePreview') !== 'false';
      const preview = allowPreview
        ? latest.lastMessageText || 'رسالة جديدة'
        : 'رسالة جديدة واردة';

      const triggerAlert = (name: string, photoURL?: string) => {
        setDmAlert({
          conversationId: latest.id,
          senderName: name,
          senderPhotoURL: photoURL,
          preview,
          isGroup: latest.isGroup,
          groupName: latest.groupName,
        });
        if (
          prefs?.sound !== false &&
          localStorage.getItem('q_notif_sound') !== 'false'
        ) {
          playNotificationChime();
        }
        if (dmAlertTimerRef.current) clearTimeout(dmAlertTimerRef.current);
        dmAlertTimerRef.current = setTimeout(() => {
          setDmAlert(null);
        }, 5500);
      };

      if (senderId) {
        void getUserProfile(senderId)
          .then((profile) => {
            triggerAlert(
              profile?.displayName || snapshotDetail?.displayName || 'مستخدم Q',
              profile?.photoURL || snapshotDetail?.photoURL
            );
          })
          .catch(() => {
            triggerAlert(
              snapshotDetail?.displayName || 'مستخدم Q',
              snapshotDetail?.photoURL
            );
          });
      }
    });

    return () => {
      unsub();
      if (dmAlertTimerRef.current) {
        clearTimeout(dmAlertTimerRef.current);
      }
    };
  }, [currentUser?.id, firebaseUser?.uid]);

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

      {/* Dedicated Incoming DM Floating Alert Banner (Independent from Bell Notifications) */}
      {dmAlert && (
        <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:end-5 sm:w-96 z-50 animate-slide-up">
          <div className="bg-white/95 dark:bg-[#161B26]/95 backdrop-blur-xl border border-[#3B6DFF]/40 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const targetId = dmAlert.conversationId;
                setDmAlert(null);
                handleOpenChatWithUser(targetId);
              }}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-start cursor-pointer"
            >
              <div className="relative shrink-0">
                <MediaImage
                  src={dmAlert.senderPhotoURL}
                  alt={dmAlert.senderName}
                  variant="avatar"
                  fallbackText={dmAlert.senderName}
                  containerClassName="w-10 h-10 rounded-full overflow-hidden border border-[#3B6DFF]/40"
                  className="w-full h-full object-cover"
                />
                <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-[#3B6DFF] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#161B26]">
                  <MessageSquare className="w-2.5 h-2.5" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {dmAlert.isGroup && dmAlert.groupName
                      ? `${dmAlert.senderName} · ${dmAlert.groupName}`
                      : dmAlert.senderName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] truncate mt-0.5">
                  {dmAlert.preview}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setDmAlert(null)}
              className="min-w-[32px] min-h-[32px] rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              aria-label="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

              {/* Live Broadcasts */}
              {activeTab === 'live' && (
                <LiveBroadcastView
                  onSelectAuthor={handleSelectUserForProfile}
                  onBack={() => setActiveTab(previousTab || 'feed')}
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
                  onActiveConversationChange={(cid) => {
                    setActiveConversationId(cid);
                    setIsMobileThreadOpen(Boolean(cid));
                  }}
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
          unreadMessagesCount={unreadMessagesCount}
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
