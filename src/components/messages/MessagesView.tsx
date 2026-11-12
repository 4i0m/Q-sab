import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Search,
  SquarePen,
  ChevronLeft,
  ChevronRight,
  Users,
  Check,
  CheckCheck,
  Loader2,
  X,
  MessageSquare
} from 'lucide-react';
import { Conversation, Message, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  listenToConversations,
  listenToMessages,
  sendMessage,
  getAllUsers,
  getOrCreateConversation
} from '../../services/firestore';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';

interface MessagesViewProps {
  initialConversationId?: string | null;
  onBack?: () => void;
  onSelectUserForProfile?: (userId: string) => void;
}

export function MessagesView({
  initialConversationId,
  onBack,
  onSelectUserForProfile
}: MessagesViewProps) {
  const { currentUser } = useAuth();
  const { isRTL, t } = useLanguage();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [activeTab, setActiveTab] = useState<'private' | 'groups'>('private');
  const [searchQuery, setSearchQuery] = useState('');

  // Messages inside active conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // New Chat Modal
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [userSearchText, setUserSearchText] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen to real-time Firestore conversations
  useEffect(() => {
    if (!currentUser?.id) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }

    const unsub = listenToConversations(currentUser.id, (loadedConvs) => {
      setConversations(loadedConvs);
      setLoadingConvs(false);
      if (initialConversationId) {
        setActiveConvId(initialConversationId);
      }
    });

    return () => unsub();
  }, [currentUser?.id, initialConversationId]);

  // Listen to real-time messages of active conversation
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const unsub = listenToMessages(activeConvId, (loaded) => {
      setMessages(loaded);
      setLoadingMessages(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    });

    return () => unsub();
  }, [activeConvId]);

  const handleOpenCompose = async () => {
    setIsComposeOpen(true);
    try {
      setLoadingUsers(true);
      const all = await getAllUsers(50);
      setAvailableUsers(all.filter((u) => u.id !== currentUser?.id));
    } catch (err) {
      console.error('Error fetching users for compose:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleStartChat = async (targetUser: UserProfile) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً', 'info');
      return;
    }
    try {
      const convId = await getOrCreateConversation(currentUser, targetUser);
      setActiveConvId(convId);
      setIsComposeOpen(false);
    } catch (err) {
      showToast('تعذر بدء المحادثة', 'error');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeConvId || !messageText.trim() || sending) return;

    const currentConv = conversations.find((c) => c.id === activeConvId);
    const recipientId = currentConv?.participantIds.find((id) => id !== currentUser.id) || '';

    try {
      setSending(true);
      await sendMessage(activeConvId, currentUser, recipientId, messageText.trim());
      setMessageText('');
    } catch (err) {
      showToast('تعذر إرسال الرسالة', 'error');
    } finally {
      setSending(false);
    }
  };

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;
  const BackArrow = isRTL ? ChevronRight : ChevronLeft;

  // Active chat metadata
  const currentConv = conversations.find((c) => c.id === activeConvId);
  const otherParticipantId = currentConv?.participantIds.find((id) => id !== currentUser?.id);
  const otherParticipant = otherParticipantId ? currentConv?.participantDetails?.[otherParticipantId] : undefined;

  const activeChatTitle = otherParticipant?.displayName || currentConv?.groupName || 'محادثة';
  const activeChatAvatar = otherParticipant?.photoURL || currentConv?.groupAvatar;
  const activeChatVerified = otherParticipant?.isVerified;

  // Active conversation chat view
  if (activeConvId) {
    return (
      <div className="w-full max-w-md mx-auto h-[calc(100vh-8.5rem)] flex flex-col bg-[#0B0F19] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl">
        {/* Chat Header */}
        <div className="p-3.5 border-b border-[#2A2F3A] flex items-center justify-between bg-[#161B26]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveConvId(null)}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <BackArrow className="w-5 h-5" />
            </button>

            <div className="relative">
              {activeChatAvatar ? (
                <img
                  src={activeChatAvatar}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-[#3B6DFF]/40"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] flex items-center justify-center text-xs font-bold text-[#4F8CFF] font-tajawal">
                  {activeChatTitle.slice(0, 2)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-white font-tajawal">{activeChatTitle}</h3>
                {activeChatVerified && <VerifiedBadge className="w-3 h-3" />}
              </div>
              <span className="text-[10px] text-[#94A3B8] font-tajawal">محادثة مشفرة وآمنة</span>
            </div>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingMessages ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isMine = msg.senderId === currentUser?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMine && (
                    <div className="w-6 h-6 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] flex items-center justify-center text-[10px] text-neutral-300 font-bold shrink-0 overflow-hidden">
                      {msg.senderPhotoURL ? (
                        <img src={msg.senderPhotoURL} alt="" className="w-full h-full object-cover" />
                      ) : (
                        msg.senderName.slice(0, 1)
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[75%] rounded-2xl p-3 text-xs font-tajawal shadow-md leading-relaxed ${
                      isMine
                        ? 'bg-[#3B6DFF] text-white font-medium rounded-ee-none shadow-[#3B6DFF]/25'
                        : 'bg-[#161B26] border border-[#2A2F3A] text-[#F8FAFC] rounded-es-none'
                    }`}
                  >
                    <p className="whitespace-pre-line text-start">{msg.text}</p>
                    <div
                      className={`text-[9px] mt-1 flex items-center justify-end gap-1 font-mono-subtle ${
                        isMine ? 'text-white/80' : 'text-[#64748B]'
                      }`}
                    >
                      <span>{formatRelativeTime(msg.createdAt)}</span>
                      {isMine && <CheckCheck className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-[#64748B] mx-auto" />
              <p className="text-xs text-[#94A3B8] font-tajawal">لا توجد رسائل سابقة في هذه المحادثة.</p>
              <p className="text-[11px] text-[#64748B] font-tajawal">أرسل رسالة للبدء!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t border-[#2A2F3A] bg-[#161B26] flex items-center gap-2"
        >
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            className="flex-1 bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal transition-colors"
          />

          <button
            type="submit"
            disabled={!messageText.trim() || sending}
            className="w-10 h-10 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] disabled:opacity-40 text-white flex items-center justify-center transition-all active:scale-95 shadow-md shadow-[#3B6DFF]/30 cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    );
  }

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'groups') return !!c.isGroup;
    if (activeTab === 'private') return !c.isGroup;
    return true;
  }).filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const otherId = c.participantIds.find((id) => id !== currentUser?.id);
    const name = otherId ? c.participantDetails?.[otherId]?.displayName || '' : c.groupName || '';
    return name.toLowerCase().includes(query) || (c.lastMessageText || '').toLowerCase().includes(query);
  });

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4">
      {/* Top Header matching Screen 5 */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F3A]">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-white font-tajawal">{t('messages')}</h1>
        </div>

        <button
          onClick={handleOpenCompose}
          className="p-2 rounded-xl bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-[#4F8CFF] hover:border-[#3B6DFF]/40 transition-all active:scale-90 shadow-sm cursor-pointer"
          title="محادثة جديدة"
        >
          <SquarePen className="w-5 h-5 stroke-[2]" />
        </button>
      </div>

      {/* Search Input matching Screen 5: البحث في الرسائل... */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="البحث في الرسائل..."
          className="w-full bg-[#161B26] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl px-4 py-2.5 text-xs text-white placeholder-[#64748B] focus:outline-none font-tajawal shadow-inner text-start"
        />
        <Search className="absolute end-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
      </div>

      {/* Tabs: المحادثات الخاصة | المجموعات */}
      <div className="flex items-center border-b border-[#2A2F3A]">
        <button
          onClick={() => setActiveTab('private')}
          className={`flex-1 py-2.5 text-xs font-bold font-tajawal text-center transition-all relative cursor-pointer ${
            activeTab === 'private' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          {t('privateChats')}
          {activeTab === 'private' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-[0_2px_8px_rgba(59,109,255,0.6)]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 py-2.5 text-xs font-bold font-tajawal text-center transition-all relative cursor-pointer ${
            activeTab === 'groups' ? 'text-[#3B6DFF]' : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          {t('groups')}
          {activeTab === 'groups' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full shadow-[0_2px_8px_rgba(59,109,255,0.6)]" />
          )}
        </button>
      </div>

      {/* Real Firestore Conversations List matching Screen 5 */}
      <div className="space-y-2">
        {loadingConvs ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-[#161B26]/60 animate-pulse border border-[#2A2F3A]" />
            ))}
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const otherId = conv.participantIds.find((id) => id !== currentUser?.id);
            const otherDetail = otherId ? conv.participantDetails?.[otherId] : undefined;
            const title = otherDetail?.displayName || conv.groupName || 'محادثة';
            const avatar = otherDetail?.photoURL || conv.groupAvatar;
            const isVerified = otherDetail?.isVerified;

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className="p-3.5 rounded-2xl bg-[#161B26] hover:bg-[#1E1E2E] border border-[#2A2F3A] hover:border-[#3B6DFF]/40 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border border-[#3B6DFF]/30"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] flex items-center justify-center text-xs font-bold text-[#4F8CFF] font-tajawal">
                        {title.slice(0, 2)}
                      </div>
                    )}
                    {/* Glowing active dot matching Screen 5 */}
                    <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-[#4F8CFF] border-2 border-[#161B26]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white font-tajawal truncate">
                        {title}
                      </span>
                      {isVerified && <VerifiedBadge className="w-3 h-3" />}
                    </div>
                    <p className="text-[11px] text-[#94A3B8] font-tajawal truncate mt-0.5">
                      {conv.lastMessageText || 'محادثة جديدة'}
                    </p>
                  </div>
                </div>

                <div className="text-end shrink-0">
                  <span className="text-[10px] text-[#64748B] font-mono-subtle block">
                    {formatRelativeTime(conv.updatedAt)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6 space-y-3">
            <MessageSquare className="w-8 h-8 text-[#64748B] mx-auto" />
            <h4 className="text-sm font-bold text-white font-tajawal">
              {activeTab === 'groups' ? 'لا توجد مجموعات بعد' : 'لا توجد محادثات نشطة'}
            </h4>
            <p className="text-xs text-[#94A3B8] font-tajawal max-w-xs mx-auto">
              ابدأ محادثة مباشرة ومشفرة مع أي عضو بالضغط على أيقونة القلم في الأعلى.
            </p>
            <button
              onClick={handleOpenCompose}
              className="px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold font-tajawal transition-all shadow-md shadow-[#3B6DFF]/25 active:scale-95 cursor-pointer"
            >
              محادثة جديدة
            </button>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A2F3A] pb-2">
              <h3 className="text-sm font-bold text-white font-tajawal">بدء محادثة جديدة</h3>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="ابحث عن عضو بالاسم أو المعرف..."
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                className="w-full bg-[#0B0F19] border border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-white placeholder-[#64748B] font-tajawal focus:outline-none"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {loadingUsers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
                </div>
              ) : (
                availableUsers
                  .filter((u) => {
                    if (!userSearchText.trim()) return true;
                    const q = userSearchText.toLowerCase();
                    return u.displayName.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q);
                  })
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartChat(u)}
                      className="w-full p-2.5 rounded-xl hover:bg-[#1E1E2E] flex items-center justify-between text-start transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-9 h-9 rounded-full object-cover border border-[#3B6DFF]/30" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#1E1E2E] border border-[#2A2F3A] flex items-center justify-center text-xs text-[#4F8CFF] font-bold">
                            {u.displayName.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white font-tajawal">{u.displayName}</span>
                            {u.isVerified && <VerifiedBadge className="w-3 h-3" />}
                          </div>
                          <span className="text-[10px] text-[#94A3B8] font-mono-subtle">@{u.handle}</span>
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
