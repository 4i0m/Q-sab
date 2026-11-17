import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  Search,
  SquarePen,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Loader2,
  X,
  MessageSquare,
  Users,
  Image as ImageIcon,
  Mic,
  Square,
  Smile,
  Sparkles,
  Reply,
  Trash2,
  Play,
  Pause,
  AlertCircle,
  Copy,
  Images,
  Plus,
  LogOut,
  UserPlus,
  Camera,
  MessagesSquare,
  Edit3,
  Flag,
  Palette
} from 'lucide-react';
import {
  Conversation,
  Message,
  UserProfile
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
  listenToConversations,
  listenToMessages,
  sendMessage,
  markConversationRead,
  setConversationTyping,
  toggleDirectMessageReaction,
  editDirectMessage,
  deleteDirectMessage,
  submitReport,
  getAllUsers,
  getOrCreateConversation,
  createGroupConversation,
  addGroupConversationMembers,
  leaveGroupConversation,
  checkIsFollowing,
  updateUserProfileCustomization
} from '../../services/firestore';
import {
  uploadMediaWithControl,
  validateMediaFile,
  createLocalPreview,
  revokeLocalPreview,
  UploadControlHandle
} from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { MediaImage } from '../common/MediaImage';
import { StickerDrawer, SelectedStickerPayload } from '../chat/StickerDrawer';
import { ChatBackgroundPicker } from '../chat/ChatBackgroundPicker';
import { resolveChatBackgroundStyle } from '../../utils/chatBackgrounds';
import { formatRelativeTime } from '../../utils/date';
import { useLiveUserProfiles } from '../../hooks/useUserProfiles';
import { matchesSearchQuery } from '../../utils/search';

interface MessagesViewProps {
  initialConversationId?: string | null;
  initialTab?: 'all' | 'unread' | 'groups';
  onActiveConversationChange?: (convId: string | null) => void;
  onBack?: () => void;
  onSelectUserForProfile?: (userId: string) => void;
  onOpenRoomsTab?: () => void;
}

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '😮', '👏', '🎉', '🙏', '😍', '🤔', '💯', '✨'];
const MESSAGE_REACTIONS = ['❤️', '👍', '😂', '🔥', '😮'];
const Q_STICKERS: Array<{ id: string; label: string; emoji: string; bg: string }> = [
  { id: 'q_wave', label: 'أهلاً!', emoji: '👋', bg: 'from-blue-600 to-cyan-500' },
  { id: 'q_love', label: 'محبة Q', emoji: '💙', bg: 'from-[#3B6DFF] to-indigo-600' },
  { id: 'q_fire', label: 'مبدع!', emoji: '🔥', bg: 'from-orange-500 to-rose-600' },
  { id: 'q_100', label: 'أسطوري', emoji: '💯', bg: 'from-emerald-500 to-teal-600' },
  { id: 'q_laugh', label: 'ههه', emoji: '😂', bg: 'from-amber-400 to-orange-500' },
  { id: 'q_star', label: 'نجم Q', emoji: '⭐', bg: 'from-violet-600 to-purple-500' },
];

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function getDateGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
}

export function MessagesView({
  initialConversationId,
  initialTab,
  onActiveConversationChange,
  onBack,
  onSelectUserForProfile,
  onOpenRoomsTab
}: MessagesViewProps) {
  const { currentUser, firebaseUser, isAdmin, onlineUsers } = useAuth();
  const { isRTL, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups'>(initialTab || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<Message | null>(null);
  const [reportTargetMsg, setReportTargetMsg] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const dmLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Composer extras
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    localUrl: string;
    kind: 'image' | 'video';
    progress: number;
    uploading: boolean;
    error?: string;
    handle?: UploadControlHandle;
  } | null>(null);

  // Voice recording (MediaRecorder)
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<{
    blob: Blob;
    localUrl: string;
    durationSec: number;
    uploading: boolean;
    progress: number;
    error?: string;
  } | null>(null);

  // Audio playback with real progress
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // In-chat tools (search / shared media / group members drawer)
  const [threadToolsTab, setThreadToolsTab] = useState<'search' | 'media' | 'members' | null>(null);
  const [threadSearch, setThreadSearch] = useState('');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [confirmLeaveGroup, setConfirmLeaveGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Compose & Group Chat Creation Modals
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [userSearchText, setUserSearchText] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [groupChatModalOpen, setGroupChatModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupAvatar, setNewGroupAvatar] = useState('');
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [creatingGroupChat, setCreatingGroupChat] = useState(false);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onlineSet = useMemo(() => new Set(onlineUsers.map((u) => u.userId)), [onlineUsers]);

  const trackedUserIds = useMemo(() => {
    const ids: string[] = [];
    conversations.forEach((conv) => {
      (conv.participantIds || []).forEach((pid) => {
        if (pid !== currentUser?.id) ids.push(pid);
      });
    });
    messages.forEach((m) => {
      if (m.senderId && m.senderId !== currentUser?.id) ids.push(m.senderId);
    });
    return ids;
  }, [conversations, messages, currentUser?.id]);

  const liveProfiles = useLiveUserProfiles(trackedUserIds);

  const resolveConvParticipant = (conv: Conversation | undefined, uid?: string) => {
    if (!uid) {
      return {
        displayName: 'مستخدم Q',
        handle: 'member',
        photoURL: '',
        isVerified: false,
        verificationCategory: 'blue' as const,
      };
    }
    if (uid === currentUser?.id && currentUser) {
      return {
        displayName: currentUser.displayName,
        handle: currentUser.handle,
        photoURL: currentUser.photoURL || '',
        isVerified: Boolean(currentUser.isVerified),
        verificationCategory: currentUser.verificationCategory || ('blue' as const),
      };
    }
    const live = liveProfiles[uid];
    const snap = conv?.participantDetails?.[uid];
    if (live) {
      return {
        displayName: live.displayName,
        handle: live.handle,
        photoURL: live.photoURL,
        isVerified: live.isVerified,
        verificationCategory: live.verificationCategory || ('blue' as const),
      };
    }
    return {
      displayName: snap?.displayName || 'مستخدم Q',
      handle: snap?.handle || uid.slice(0, 8),
      photoURL: snap?.photoURL || '',
      isVerified: Boolean(snap?.isVerified),
      verificationCategory: snap?.verificationCategory || ('blue' as const),
    };
  };

  const setConversationOpen = (convId: string | null) => {
    setActiveConvId(convId);
    onActiveConversationChange?.(convId);
  };

  useEffect(() => {
    if (initialConversationId) {
      setConversationOpen(initialConversationId);
    }
  }, [initialConversationId]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    return () => {
      onActiveConversationChange?.(null);
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id || firebaseUser?.uid !== currentUser.id) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }

    const unsub = listenToConversations(currentUser.id, (loadedConvs) => {
      setConversations(loadedConvs);
      setLoadingConvs(false);
    });

    return () => unsub();
  }, [currentUser?.id, firebaseUser?.uid]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      setThreadToolsTab(null);
      setThreadSearch('');
      return;
    }
    setThreadToolsTab(null);
    setThreadSearch('');

    setLoadingMessages(true);
    if (currentUser?.id) {
      void markConversationRead(activeConvId, currentUser.id);
    }

    const unsub = listenToMessages(activeConvId, (loaded) => {
      setMessages(loaded);
      setLoadingMessages(false);
      if (currentUser?.id) {
        void markConversationRead(activeConvId, currentUser.id);
      }
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    });

    return () => {
      unsub();
      if (currentUser?.id && activeConvId) {
        void setConversationTyping(activeConvId, currentUser.id, false);
      }
    };
  }, [activeConvId, currentUser?.id]);

  // Cleanup local previews / audio / recorder on unmount
  useEffect(() => {
    return () => {
      if (pendingMedia) {
        pendingMedia.handle?.cancel();
        revokeLocalPreview(pendingMedia.localUrl);
      }
      if (recordedAudio) {
        revokeLocalPreview(recordedAudio.localUrl);
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      audioElRef.current?.pause();
    };
  }, []);

  const isConversationUnread = (conv: Conversation): boolean => {
    if (!currentUser?.id) return false;
    if (!conv.lastMessageTimestamp || conv.lastMessageSenderId === currentUser.id) return false;
    const readAt = conv.readBy?.[currentUser.id];
    if (!readAt) return true;
    return conv.lastMessageTimestamp > readAt;
  };

  const ensureUsersLoaded = async (): Promise<UserProfile[]> => {
    if (availableUsers.length > 0) return availableUsers;
    try {
      setLoadingUsers(true);
      const all = await getAllUsers(60);
      const filtered = all.filter((u) => u.id !== currentUser?.id);
      setAvailableUsers(filtered);
      return filtered;
    } catch (err) {
      console.error('Error fetching users:', err);
      return [];
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenCompose = async () => {
    setIsComposeOpen(true);
    await ensureUsersLoaded();
  };

  const handleOpenGroupChatModal = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً', 'info');
      return;
    }
    setIsComposeOpen(false);
    setNewGroupName('');
    setNewGroupDesc('');
    setNewGroupAvatar('');
    setSelectedGroupMemberIds([]);
    setGroupMemberSearch('');
    setGroupChatModalOpen(true);
    await ensureUsersLoaded();
  };

  const handleGroupAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const check = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
    if (!check.isValid) {
      showToast(check.error || 'ملف غير صالح', 'error');
      return;
    }
    try {
      setUploadingGroupAvatar(true);
      const url = await uploadMediaWithControl(file, 'chats', { timeoutMs: 20000 }).promise;
      setNewGroupAvatar(url);
    } catch {
      showToast('تعذر رفع صورة الدردشة الجماعية', 'error');
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  const handleCreateGroupChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || creatingGroupChat) return;
    if (!newGroupName.trim()) {
      showToast('يرجى كتابة اسم الدردشة الجماعية', 'info');
      return;
    }
    if (selectedGroupMemberIds.length === 0) {
      showToast('اختر عضواً واحداً على الأقل لإضافته إلى الدردشة الجماعية', 'info');
      return;
    }
    const members = availableUsers.filter((u) => selectedGroupMemberIds.includes(u.id));
    try {
      setCreatingGroupChat(true);
      const convId = await createGroupConversation(currentUser, members, {
        groupName: newGroupName.trim(),
        groupDescription: newGroupDesc.trim(),
        groupAvatar: newGroupAvatar,
      });
      setGroupChatModalOpen(false);
      setActiveTab('groups');
      setConversationOpen(convId);
      showToast('تم إنشاء الدردشة الجماعية بنجاح', 'success');
    } catch {
      showToast('تعذر إنشاء الدردشة الجماعية', 'error');
    } finally {
      setCreatingGroupChat(false);
    }
  };

  const handleStartChat = async (targetUser: UserProfile) => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول أولاً', 'info');
      return;
    }
    try {
      const dmRule = targetUser.customization?.privacy?.directMessages || 'everyone';
      if (dmRule === 'followers_only' && !isAdmin && targetUser.id !== currentUser.id) {
        const following = await checkIsFollowing(currentUser.id, targetUser.id);
        if (!following) {
          showToast('هذا العضو يقصر الرسائل الخاصة على المتابعين فقط.', 'info');
          return;
        }
      }
      const convId = await getOrCreateConversation(currentUser, targetUser);
      setConversationOpen(convId);
      setIsComposeOpen(false);
    } catch {
      showToast('تعذر بدء المحادثة', 'error');
    }
  };

  const handleTypingChange = (value: string) => {
    setMessageText(value);
    if (!currentUser?.id || !activeConvId) return;
    void setConversationTyping(activeConvId, currentUser.id, value.trim().length > 0);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (currentUser?.id && activeConvId) {
        void setConversationTyping(activeConvId, currentUser.id, false);
      }
    }, 3000);
  };

  const currentConv = conversations.find((c) => c.id === activeConvId);
  const isGroupConv = Boolean(currentConv?.isGroup);
  const otherParticipantIds = (currentConv?.participantIds || []).filter(
    (id) => id !== currentUser?.id
  );
  const recipientId = otherParticipantIds[0] || '';
  const sendRecipientIds = isGroupConv ? otherParticipantIds : undefined;

  const handleAddMembersSubmit = async () => {
    if (!currentUser || !currentConv || selectedAddMemberIds.length === 0 || addingMembers) return;
    const usersToAdd = availableUsers.filter((u) => selectedAddMemberIds.includes(u.id));
    if (usersToAdd.length === 0) return;
    try {
      setAddingMembers(true);
      await addGroupConversationMembers(currentConv, usersToAdd, currentUser);
      setSelectedAddMemberIds([]);
      setAddMembersOpen(false);
      showToast('تمت إضافة الأعضاء إلى الدردشة الجماعية', 'success');
    } catch {
      showToast('تعذر إضافة الأعضاء', 'error');
    } finally {
      setAddingMembers(false);
    }
  };

  const handleLeaveGroupChat = async () => {
    if (!currentUser || !currentConv || leavingGroup) return;
    try {
      setLeavingGroup(true);
      await leaveGroupConversation(currentConv, currentUser.id);
      setConfirmLeaveGroup(false);
      setThreadToolsTab(null);
      setConversationOpen(null);
      showToast('تمت مغادرة الدردشة الجماعية', 'info');
    } catch {
      showToast('تعذر مغادرة الدردشة الجماعية', 'error');
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleSendTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeConvId || sending) return;

    if (editingMsg) {
      if (!messageText.trim()) return;
      try {
        setSending(true);
        await editDirectMessage(activeConvId, editingMsg.id, messageText.trim());
        setEditingMsg(null);
        setMessageText('');
        showToast('تم تعديل الرسالة', 'success');
      } catch {
        showToast('تعذر تعديل الرسالة', 'error');
      } finally {
        setSending(false);
      }
      return;
    }

    if (pendingMedia) {
      await uploadAndSendPendingMedia();
      return;
    }

    if (recordedAudio) {
      await uploadAndSendVoiceNote();
      return;
    }

    if (!messageText.trim()) return;

    try {
      setSending(true);
      await sendMessage(activeConvId, currentUser, recipientId, messageText.trim(), undefined, {
        messageType: 'text',
        recipientIds: sendRecipientIds,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text || (replyingTo.audioURL ? 'رسالة صوتية' : 'وسائط'),
            }
          : undefined,
      });
      setMessageText('');
      setReplyingTo(null);
      setShowEmojiPicker(false);
    } catch {
      showToast('تعذر إرسال الرسالة', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleMediaFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const check = validateMediaFile(file, { allowImages: true, allowVideos: true, allowAudio: false });
    if (!check.isValid) {
      showToast(check.error || 'الملف غير صالح', 'error');
      return;
    }

    if (pendingMedia) {
      pendingMedia.handle?.cancel();
      revokeLocalPreview(pendingMedia.localUrl);
    }

    setPendingMedia({
      file,
      localUrl: createLocalPreview(file),
      kind: check.kind === 'video' ? 'video' : 'image',
      progress: 0,
      uploading: false,
    });
  };

  const uploadAndSendPendingMedia = async () => {
    if (!pendingMedia || !currentUser || !activeConvId) return;
    let uploadedMeta: import('../../types').MediaMetadata | undefined;
    const handle = uploadMediaWithControl(pendingMedia.file, 'chats', {
      timeoutMs: 20000,
      onProgress: (pct) => {
        setPendingMedia((prev) => (prev ? { ...prev, progress: pct } : null));
      },
      onMetadata: (meta) => {
        uploadedMeta = meta;
      },
    });
    setPendingMedia((prev) => (prev ? { ...prev, uploading: true, error: undefined, handle } : null));

    try {
      const url = await handle.promise;
      await sendMessage(activeConvId, currentUser, recipientId, messageText.trim(), url, {
        messageType: pendingMedia.kind,
        mediaType: pendingMedia.kind,
        mediaPath: uploadedMeta?.path,
        mediaMetadata: uploadedMeta,
        recipientIds: sendRecipientIds,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text || 'وسائط',
            }
          : undefined,
      });
      revokeLocalPreview(pendingMedia.localUrl);
      setPendingMedia(null);
      setMessageText('');
      setReplyingTo(null);
    } catch (err: any) {
      const msg = err?.message || 'فشل رفع الوسائط';
      setPendingMedia((prev) =>
        prev ? { ...prev, uploading: false, error: msg, handle: undefined } : null
      );
      showToast(msg, 'error');
    }
  };

  const handleSendSticker = async (sticker: SelectedStickerPayload) => {
    if (!currentUser || !activeConvId || sending) return;
    setShowStickers(false);
    try {
      setSending(true);
      await sendMessage(activeConvId, currentUser, recipientId, sticker.label || '', undefined, {
        messageType: 'sticker',
        stickerId: sticker.stickerId,
        stickerUrl: sticker.url,
        stickerPackId: sticker.packId,
        recipientIds: sendRecipientIds,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text || 'وسائط',
            }
          : undefined,
      });
      setReplyingTo(null);
    } catch {
      showToast('تعذر إرسال الملصق', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleApplyDmBackground = async (options: {
    presetId: string;
    bgImageURL: string;
    scrimOpacity: number;
    scope: 'conversation' | 'default_dm';
  }) => {
    if (!currentUser) return;
    const prevCustom = currentUser.customization || {};
    const prevChat = prevCustom.chatPreferences || {};
    const nextChat = { ...prevChat };

    if (options.scope === 'default_dm') {
      nextChat.defaultDmBgPresetId = options.presetId;
      nextChat.defaultDmBgImageURL = options.bgImageURL || '';
    } else if (activeConvId) {
      nextChat.dmBackgrounds = {
        ...(prevChat.dmBackgrounds || {}),
        [activeConvId]: {
          presetId: options.presetId,
          imageURL: options.bgImageURL || '',
        },
      };
    }

    try {
      await updateUserProfileCustomization(currentUser.id, {
        ...prevCustom,
        chatPreferences: nextChat,
      });
      showToast('تم حفظ خلفية المحادثة بنجاح.', 'success');
    } catch {
      showToast('تعذر حفظ خلفية المحادثة.', 'error');
    }
  };

  const handleResetDmBackground = async () => {
    if (!currentUser) return;
    const prevCustom = currentUser.customization || {};
    const prevChat = prevCustom.chatPreferences || {};
    const nextDmMap = { ...(prevChat.dmBackgrounds || {}) };
    if (activeConvId) {
      delete nextDmMap[activeConvId];
    }
    try {
      await updateUserProfileCustomization(currentUser.id, {
        ...prevCustom,
        chatPreferences: {
          ...prevChat,
          dmBackgrounds: nextDmMap,
        },
      });
      showToast('تمت استعادة الخلفية الافتراضية.', 'info');
    } catch {
      showToast('تعذر إعادة ضبط الخلفية.', 'error');
    }
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('التسجيل الصوتي غير مدعوم في هذا المتصفح.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      setRecordSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          setRecordedAudio((prev) => {
            if (prev) revokeLocalPreview(prev.localUrl);
            return {
              blob,
              localUrl: createLocalPreview(blob),
              durationSec: Math.max(1, recordSeconds),
              uploading: false,
              progress: 0,
            };
          });
        }
        setIsRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      showToast('يرجى السماح بالوصول إلى الميكروفون لتسجيل رسالة صوتية.', 'error');
    }
  };

  const stopVoiceRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const uploadAndSendVoiceNote = async () => {
    if (!recordedAudio || !currentUser || !activeConvId) return;
    setRecordedAudio((prev) => (prev ? { ...prev, uploading: true, error: undefined } : null));
    let uploadedMeta: import('../../types').MediaMetadata | undefined;
    const handle = uploadMediaWithControl(recordedAudio.blob, 'audio', {
      fileName: `voice_${Date.now()}.webm`,
      timeoutMs: 20000,
      onProgress: (pct) => {
        setRecordedAudio((prev) => (prev ? { ...prev, progress: pct } : null));
      },
      onMetadata: (meta) => {
        uploadedMeta = meta;
      },
    });
    try {
      const audioURL = await handle.promise;
      await sendMessage(activeConvId, currentUser, recipientId, '', undefined, {
        messageType: 'audio',
        audioURL,
        audioDurationSec: recordedAudio.durationSec,
        mediaPath: uploadedMeta?.path,
        mediaMetadata: uploadedMeta,
        recipientIds: sendRecipientIds,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text || 'رسالة صوتية',
            }
          : undefined,
      });
      revokeLocalPreview(recordedAudio.localUrl);
      setRecordedAudio(null);
      setReplyingTo(null);
    } catch (err: any) {
      const msg = err?.message || 'فشل رفع التسجيل الصوتي';
      setRecordedAudio((prev) => (prev ? { ...prev, uploading: false, error: msg } : null));
      showToast(msg, 'error');
    }
  };

  const togglePlayAudio = (msgId: string, url: string) => {
    if (playingAudioId === msgId && audioElRef.current) {
      audioElRef.current.pause();
      setPlayingAudioId(null);
      return;
    }
    audioElRef.current?.pause();
    const audio = new Audio(url);
    audioElRef.current = audio;
    audio.ontimeupdate = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setAudioProgress((prev) => ({
          ...prev,
          [msgId]: Math.min(1, Math.max(0, audio.currentTime / audio.duration)),
        }));
      }
    };
    audio.onended = () => {
      setPlayingAudioId(null);
      setAudioProgress((prev) => ({ ...prev, [msgId]: 0 }));
    };
    audio.onerror = () => {
      setPlayingAudioId(null);
      showToast('تعذر تشغيل المقطع الصوتي.', 'error');
    };
    void audio.play().catch(() => setPlayingAudioId(null));
    setPlayingAudioId(msgId);
  };

  const handleQuickStarterSend = async (text: string) => {
    if (!currentUser || !activeConvId || sending) return;
    try {
      setSending(true);
      await sendMessage(activeConvId, currentUser, recipientId, text, undefined, {
        messageType: 'text',
        recipientIds: sendRecipientIds,
      });
    } catch {
      showToast('تعذر إرسال الرسالة', 'error');
    } finally {
      setSending(false);
    }
  };

  const BackArrow = isRTL ? ChevronRight : ChevronLeft;

  const otherParticipantId = !isGroupConv ? otherParticipantIds[0] : undefined;
  const otherParticipant = otherParticipantId
    ? resolveConvParticipant(currentConv, otherParticipantId)
    : undefined;
  const activeChatTitle = isGroupConv
    ? currentConv?.groupName || 'دردشة جماعية'
    : otherParticipant?.displayName || currentConv?.groupName || 'محادثة';
  const activeChatAvatar = isGroupConv
    ? currentConv?.groupAvatar
    : otherParticipant?.photoURL || currentConv?.groupAvatar;
  const activeChatVerified = !isGroupConv && Boolean(otherParticipant?.isVerified);
  const activeChatVerificationCategory = otherParticipant?.verificationCategory || 'blue';
  const onlineGroupCount = isGroupConv
    ? otherParticipantIds.filter((id) => onlineSet.has(id)).length
    : 0;
  const isOtherOnline = isGroupConv
    ? onlineGroupCount > 0
    : Boolean(otherParticipantId && onlineSet.has(otherParticipantId));

  // Typing status within last 6s
  const typingParticipantIds = otherParticipantIds.filter((id) => {
    const iso = currentConv?.typingUsers?.[id];
    return Boolean(iso && Date.now() - new Date(iso).getTime() < 6000);
  });
  const isOtherTyping = typingParticipantIds.length > 0;
  const typingSubtitle = isGroupConv
    ? typingParticipantIds.length === 1
      ? `${resolveConvParticipant(currentConv, typingParticipantIds[0]).displayName} يكتب الآن...`
      : 'عدة أعضاء يكتبون الآن...'
    : 'يكتب الآن...';

  // Read receipt ("Seen") on last outgoing message
  const lastMyMessageId = [...messages].reverse().find((m) => m.senderId === currentUser?.id)?.id;

  // ============================================================================
  // FULL-SCREEN THREAD VIEW (INSTAGRAM-STYLE ON MOBILE)
  // ============================================================================
  if (activeConvId) {
    const sharedMediaMessages = messages.filter((m) => Boolean(m.mediaURL) && !m.deletedAt);
    const trimmedThreadSearch = threadSearch.trim();
    const displayedMessages = trimmedThreadSearch
      ? messages.filter((m) =>
          matchesSearchQuery(
            trimmedThreadSearch,
            m.text,
            liveProfiles[m.senderId]?.displayName || m.senderName
          )
        )
      : messages;

    const WAVEFORM_BARS = [38, 65, 92, 54, 78, 45, 96, 68, 84, 48, 74, 58, 88, 42];
    const groupParticipantCount = currentConv?.participantIds?.length || 0;

    return (
      <div className="fixed inset-0 z-40 lg:static lg:z-auto w-full h-[100dvh] lg:h-[calc(100vh-5.5rem)] lg:max-w-2xl lg:mx-auto flex flex-col bg-white dark:bg-[#0B0F19] lg:border lg:border-slate-200 lg:dark:border-[#2A2F3A] lg:rounded-3xl overflow-hidden shadow-xl font-ar">
        {/* Glassmorphic Conversation Header */}
        <div className="shrink-0 bg-white/92 dark:bg-[#131824]/92 backdrop-blur-xl border-b border-slate-200/80 dark:border-[#2A2F3A] pt-[max(0.5rem,env(safe-area-inset-top))] lg:pt-0">
          <div className="px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setConversationOpen(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E2536] transition-colors cursor-pointer shrink-0"
                aria-label="العودة للرسائل"
              >
                <BackArrow className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isGroupConv) {
                    setThreadToolsTab((prev) => (prev === 'members' ? null : 'members'));
                  } else if (otherParticipantId && onSelectUserForProfile) {
                    onSelectUserForProfile(otherParticipantId);
                  }
                }}
                className="flex items-center gap-2.5 text-start cursor-pointer group min-w-0"
              >
                <div className="relative shrink-0">
                  <MediaImage
                    src={activeChatAvatar}
                    alt={activeChatTitle}
                    variant="avatar"
                    fallbackText={activeChatTitle}
                    containerClassName={`w-10 h-10 rounded-full overflow-hidden border-2 transition-colors ${
                      isOtherOnline ? 'border-emerald-500/70' : 'border-[#3B6DFF]/35'
                    }`}
                    className="w-full h-full object-cover"
                  />
                  {isOtherOnline && (
                    <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131824]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] transition-colors truncate">
                      {activeChatTitle}
                    </h3>
                    {activeChatVerified && (
                      <VerifiedBadge
                        category={activeChatVerificationCategory}
                        className="w-3.5 h-3.5 shrink-0"
                        interactive={false}
                      />
                    )}
                  </div>
                  <span
                    className={`text-[11px] block truncate ${
                      isOtherTyping
                        ? 'text-[#3B6DFF] font-bold'
                        : isOtherOnline
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-slate-500 dark:text-[#94A3B8]'
                    }`}
                  >
                    {isOtherTyping
                      ? typingSubtitle
                      : isGroupConv
                      ? `${groupParticipantCount} أعضاء${onlineGroupCount > 0 ? ` · ${onlineGroupCount} متصل الآن` : ''}`
                      : isOtherOnline
                      ? 'نشط الآن'
                      : 'غير متصل'}
                  </span>
                </div>
              </button>
            </div>

            {/* Thread Utility Actions: Group Members / Background / Search / Shared Media */}
            <div className="flex items-center gap-1 shrink-0">
              {isGroupConv && (
                <button
                  type="button"
                  onClick={() => setThreadToolsTab((prev) => (prev === 'members' ? null : 'members'))}
                  className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                    threadToolsTab === 'members'
                      ? 'bg-[#3B6DFF] text-white'
                      : 'text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1E2536] hover:text-slate-900 dark:hover:text-white'
                  }`}
                  aria-label="أعضاء الدردشة الجماعية"
                  title="أعضاء الدردشة الجماعية"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowBgPicker(true)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1E2536] hover:text-[#3B6DFF]"
                aria-label="خلفية المحادثة"
                title="خلفية المحادثة"
              >
                <Palette className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setThreadToolsTab((prev) => (prev === 'search' ? null : 'search'))}
                className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  threadToolsTab === 'search'
                    ? 'bg-[#3B6DFF] text-white'
                    : 'text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1E2536] hover:text-slate-900 dark:hover:text-white'
                }`}
                aria-label="بحث في المحادثة"
                title="بحث في المحادثة"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setThreadToolsTab((prev) => (prev === 'media' ? null : 'media'))}
                className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-colors cursor-pointer relative ${
                  threadToolsTab === 'media'
                    ? 'bg-[#3B6DFF] text-white'
                    : 'text-slate-500 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1E2536] hover:text-slate-900 dark:hover:text-white'
                }`}
                aria-label="الوسائط المشتركة"
                title="الوسائط المشتركة"
              >
                <Images className="w-4 h-4" />
                {sharedMediaMessages.length > 0 && threadToolsTab !== 'media' && (
                  <span className="absolute top-2 end-2 w-1.5 h-1.5 rounded-full bg-[#3B6DFF]" />
                )}
              </button>
            </div>
          </div>

          {/* Collapsible Group Members & Info Drawer */}
          {threadToolsTab === 'members' && isGroupConv && currentConv && (
            <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-[#2A2F3A]/60 space-y-3 max-h-72 overflow-y-auto">
              {currentConv.groupDescription && (
                <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                  {currentConv.groupDescription}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  الأعضاء ({groupParticipantCount})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setAddMembersOpen((prev) => !prev);
                      setSelectedAddMemberIds([]);
                      setAddMemberSearch('');
                      await ensureUsersLoaded();
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/20 text-[#3B6DFF] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إضافة أعضاء</span>
                  </button>
                  {!confirmLeaveGroup ? (
                    <button
                      type="button"
                      onClick={() => setConfirmLeaveGroup(true)}
                      className="min-h-[40px] px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>مغادرة</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={leavingGroup}
                        onClick={handleLeaveGroupChat}
                        className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {leavingGroup ? 'جاري المغادرة...' : 'تأكيد المغادرة'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmLeaveGroup(false)}
                        className="min-h-[40px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {addMembersOpen && (
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] space-y-2">
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    placeholder="ابحث لإضافة أعضاء جدد..."
                    className="w-full min-h-[38px] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableUsers
                      .filter((u) => !currentConv.participantIds.includes(u.id))
                      .filter((u) => matchesSearchQuery(addMemberSearch, u.displayName, u.handle))
                      .map((u) => {
                        const checked = selectedAddMemberIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() =>
                              setSelectedAddMemberIds((prev) =>
                                prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                              )
                            }
                            className={`w-full min-h-[40px] px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-[#3B6DFF]/15 text-[#3B6DFF] font-bold'
                                : 'hover:bg-white dark:hover:bg-[#161B26] text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <span className="truncate">{u.displayName} · @{u.handle}</span>
                            {checked && <Check className="w-4 h-4 shrink-0" />}
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAddMembersOpen(false)}
                      className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-slate-500 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={selectedAddMemberIds.length === 0 || addingMembers}
                      onClick={handleAddMembersSubmit}
                      className="min-h-[38px] px-4 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      {addingMembers ? 'جاري الإضافة...' : `إضافة (${selectedAddMemberIds.length})`}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {currentConv.participantIds.map((pid) => {
                  const detail = resolveConvParticipant(currentConv, pid);
                  const isMe = pid === currentUser?.id;
                  const online = onlineSet.has(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        if (!isMe && onSelectUserForProfile) {
                          onSelectUserForProfile(pid);
                        }
                      }}
                      className="min-h-[44px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] hover:bg-slate-100 dark:hover:bg-[#1E2536] border border-slate-200/70 dark:border-[#2A2F3A] flex items-center gap-2 text-start cursor-pointer"
                    >
                      <div className="relative shrink-0">
                        <MediaImage
                          src={detail.photoURL}
                          alt={detail.displayName}
                          variant="avatar"
                          fallbackText={detail.displayName}
                          containerClassName="w-7 h-7 rounded-full overflow-hidden"
                          className="w-full h-full object-cover"
                        />
                        {online && (
                          <span className="absolute bottom-0 end-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-[#0B0F19]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                          <span className="truncate">{detail.displayName} {isMe ? '(أنت)' : ''}</span>
                          {detail.isVerified && (
                            <VerifiedBadge
                              category={detail.verificationCategory}
                              className="w-3 h-3 shrink-0"
                              interactive={false}
                            />
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] truncate block font-handle">
                          @{detail.handle}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible Thread Search Bar */}
          {threadToolsTab === 'search' && (
            <div className="px-3 pb-2.5 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="ابحث داخل هذه المحادثة..."
                  autoFocus
                  className="w-full min-h-[38px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl ps-9 pe-8 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                {threadSearch && (
                  <button
                    type="button"
                    onClick={() => setThreadSearch('')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {trimmedThreadSearch && (
                <span className="text-[11px] font-bold text-[#3B6DFF] tabular-nums whitespace-nowrap">
                  {displayedMessages.length} نتيجة
                </span>
              )}
            </div>
          )}

          {/* Collapsible Shared Media Gallery */}
          {threadToolsTab === 'media' && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-[#2A2F3A]/60 max-h-48 overflow-y-auto">
              {sharedMediaMessages.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] text-center py-4">
                  لم يتم تبادل صور أو فيديوهات في هذه المحادثة بعد.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {sharedMediaMessages.map((m) => {
                    const isVid =
                      m.mediaType === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(m.mediaURL || '');
                    return (
                      <div
                        key={m.id}
                        onClick={() => !isVid && m.mediaURL && setLightboxUrl(m.mediaURL)}
                        className="aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-[#2A2F3A] cursor-pointer"
                      >
                        {isVid ? (
                          <video src={m.mediaURL} className="w-full h-full object-cover" />
                        ) : (
                          <MediaImage
                            src={m.mediaURL}
                            alt=""
                            variant="thumbnail"
                            containerClassName="w-full h-full overflow-hidden"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages Stream with Atmospheric Pattern or Custom Background */}
        {(() => {
          const chatPrefs = currentUser?.customization?.chatPreferences;
          const perConvBg = activeConvId ? chatPrefs?.dmBackgrounds?.[activeConvId] : undefined;
          const dmPresetId = perConvBg?.presetId || chatPrefs?.defaultDmBgPresetId || 'default';
          const dmImageURL = perConvBg
            ? perConvBg.imageURL || ''
            : chatPrefs?.defaultDmBgImageURL || '';
          const dmBgResolved = resolveChatBackgroundStyle({
            presetId: dmPresetId,
            bgImageURL: dmImageURL,
            resolvedTheme,
          });
          const dmCanvasStyle = dmBgResolved.hasCustomImage
            ? {
                ...dmBgResolved.style,
                backgroundImage: `linear-gradient(rgba(9,13,22,0.52), rgba(9,13,22,0.62)), ${dmBgResolved.style.backgroundImage}`,
              }
            : dmBgResolved.style;
          const usePattern = dmPresetId === 'default' && !dmImageURL;

          return (
            <div
              onClick={() => setActiveActionMsgId(null)}
              style={dmCanvasStyle}
              className={`flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 space-y-1.5 ${
                usePattern ? 'chat-canvas-pattern' : ''
              }`}
            >
              {loadingMessages ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
                </div>
              ) : displayedMessages.length > 0 ? (
                displayedMessages.map((msg, index) => {
                  const isMine = msg.senderId === currentUser?.id;
                  const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
                  const nextMsg = index < displayedMessages.length - 1 ? displayedMessages[index + 1] : null;
                  const showDateDivider =
                    !prevMsg || getDateGroupLabel(prevMsg.createdAt) !== getDateGroupLabel(msg.createdAt);
                  const isGroupedPrev =
                    Boolean(prevMsg && prevMsg.senderId === msg.senderId && !showDateDivider);
                  const isGroupedNext =
                    Boolean(
                      nextMsg &&
                        nextMsg.senderId === msg.senderId &&
                        getDateGroupLabel(nextMsg.createdAt) === getDateGroupLabel(msg.createdAt)
                    );
                  const isSeen =
                    isMine &&
                    msg.id === lastMyMessageId &&
                    otherParticipantIds.some((id) => {
                      const r = currentConv?.readBy?.[id];
                      return Boolean(r && r >= msg.createdAt);
                    });
                  const stickerObj =
                    msg.messageType === 'sticker'
                      ? Q_STICKERS.find((s) => s.id === msg.stickerId)
                      : undefined;
                  const hasCustomSticker = Boolean(msg.messageType === 'sticker' && msg.stickerUrl);
                  const isStickerMsg = Boolean(hasCustomSticker || stickerObj);
                  const reactionsEntries = Object.entries(msg.reactions || {}).filter(
                    ([, users]) => users.length > 0
                  );
                  const voicePct = audioProgress[msg.id] || 0;
                  const isVoicePlaying = playingAudioId === msg.id;

                  const bubbleShape = isStickerMsg
                    ? 'bg-transparent shadow-none p-1'
                    : msg.deletedAt
                    ? 'bg-white/75 dark:bg-[#161B26]/70 border border-slate-200 dark:border-[#2A2F3A] text-slate-400 italic rounded-[20px]'
                    : isMine
                    ? `bg-gradient-to-br from-[#3B6DFF] to-[#2554E8] text-white shadow-[0_6px_18px_rgba(59,109,255,0.22)] rounded-[20px] ${
                        !isGroupedNext ? 'rounded-ee-[6px]' : ''
                      }`
                    : `bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-[#2A2F3A] text-slate-900 dark:text-[#F8FAFC] shadow-sm rounded-[20px] ${
                        !isGroupedNext ? 'rounded-es-[6px]' : ''
                      }`;

              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && (
                    <div className="py-3 flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-200/80 dark:bg-[#2A2F3A]/80" />
                      <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-[#161B26]/90 border border-slate-200/70 dark:border-[#2A2F3A] text-[10px] font-bold text-slate-500 dark:text-[#94A3B8] shadow-xs">
                        {getDateGroupLabel(msg.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-slate-200/80 dark:bg-[#2A2F3A]/80" />
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'} ${
                      isGroupedPrev ? 'mt-0.5' : 'mt-3'
                    }`}
                  >
                    {!isMine && (
                      <div className="w-7 h-7 shrink-0">
                        {!isGroupedNext && (
                          <button
                            type="button"
                            onClick={() => msg.senderId && onSelectUserForProfile?.(msg.senderId)}
                            className="w-7 h-7 rounded-full block cursor-pointer"
                          >
                            <MediaImage
                              src={
                                liveProfiles[msg.senderId]
                                  ? liveProfiles[msg.senderId].photoURL
                                  : msg.senderPhotoURL || activeChatAvatar
                              }
                              alt={liveProfiles[msg.senderId]?.displayName || msg.senderName}
                              variant="avatar"
                              fallbackText={liveProfiles[msg.senderId]?.displayName || msg.senderName}
                              containerClassName="w-7 h-7 rounded-full border border-slate-200 dark:border-[#2A2F3A] overflow-hidden shadow-xs"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        )}
                      </div>
                    )}

                    <div className={`max-w-[80%] sm:max-w-[74%] min-w-0 flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      {!isMine && isGroupConv && !isGroupedPrev && (
                        <button
                          type="button"
                          onClick={() => msg.senderId && onSelectUserForProfile?.(msg.senderId)}
                          className="text-[11px] font-bold text-[#3B6DFF] dark:text-[#60A5FA] mb-1 px-1.5 truncate max-w-full hover:underline cursor-pointer"
                        >
                          {liveProfiles[msg.senderId]?.displayName || msg.senderName}
                        </button>
                      )}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!msg.deletedAt) {
                            setActiveActionMsgId(activeActionMsgId === msg.id ? null : msg.id);
                          }
                        }}
                        onTouchStart={() => {
                          if (msg.deletedAt) return;
                          if (dmLongPressRef.current) clearTimeout(dmLongPressRef.current);
                          dmLongPressRef.current = setTimeout(() => setActionSheetMsg(msg), 450);
                        }}
                        onTouchEnd={() => {
                          if (dmLongPressRef.current) clearTimeout(dmLongPressRef.current);
                        }}
                        onTouchMove={() => {
                          if (dmLongPressRef.current) clearTimeout(dmLongPressRef.current);
                        }}
                        onContextMenu={(e) => {
                          if (!msg.deletedAt) {
                            e.preventDefault();
                            setActionSheetMsg(msg);
                          }
                        }}
                        className={`relative max-w-full min-w-0 px-3.5 py-2.5 text-[13.5px] leading-relaxed cursor-pointer transition-transform active:scale-[0.99] ${bubbleShape}`}
                      >
                        {msg.deletedAt ? (
                          <span>تم حذف هذه الرسالة</span>
                        ) : (
                          <>
                            {/* Reply Quote Card */}
                            {msg.replyTo && (
                              <div
                                className={`mb-2 p-2 rounded-xl text-[11px] border ${
                                  isMine
                                    ? 'bg-black/18 border-white/20 text-white/95'
                                    : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200/80 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8]'
                                }`}
                              >
                                <span className="font-bold flex items-center gap-1 mb-0.5">
                                  <Reply className="w-3 h-3" />
                                  {msg.replyTo.senderName}
                                </span>
                                <span className="line-clamp-1 opacity-90">{msg.replyTo.text}</span>
                              </div>
                            )}

                            {/* Sticker Bubble */}
                            {hasCustomSticker && msg.stickerUrl ? (
                              <MediaImage
                                src={msg.stickerUrl}
                                alt={msg.text || 'ملصق'}
                                variant="thumbnail"
                                containerClassName="w-28 h-28 overflow-hidden rounded-2xl"
                                className="w-full h-full object-contain drop-shadow-md"
                              />
                            ) : stickerObj ? (
                              <div
                                className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${stickerObj.bg} flex flex-col items-center justify-center shadow-lg`}
                              >
                                <span className="text-4xl">{stickerObj.emoji}</span>
                                <span className="text-[10px] font-bold text-white mt-1">
                                  {stickerObj.label}
                                </span>
                              </div>
                            ) : null}

                            {/* Image / Video Media Bubble */}
                            {msg.mediaURL && (
                              <div className="mb-1.5 w-full max-w-[260px] min-w-0 rounded-2xl overflow-hidden bg-slate-900/10 dark:bg-black/20">
                                {msg.mediaType === 'video' ||
                                /\.(mp4|webm|mov|m4v)(\?|$)/i.test(msg.mediaURL) ? (
                                  <video
                                    src={msg.mediaURL}
                                    controls
                                    playsInline
                                    className="w-full max-w-full max-h-64 rounded-2xl"
                                  />
                                ) : (
                                  <MediaImage
                                    src={msg.mediaURL}
                                    alt="صورة مرسلة"
                                    variant="chat"
                                    containerClassName="w-full max-w-[260px] min-w-0 max-h-72 rounded-2xl overflow-hidden cursor-pointer"
                                    className="w-full max-h-72 object-cover rounded-2xl"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setLightboxUrl(msg.mediaURL || null);
                                    }}
                                  />
                                )}
                              </div>
                            )}

                            {/* Interactive Multi-Bar Waveform Voice Bubble */}
                            {msg.audioURL && (
                              <div className="flex items-center gap-3 w-[220px] max-w-full min-w-0 py-1">
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    togglePlayAudio(msg.id, msg.audioURL!);
                                  }}
                                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer shadow-sm transition-transform active:scale-90 ${
                                    isMine
                                      ? 'bg-white text-[#3B6DFF]'
                                      : 'bg-[#3B6DFF] text-white'
                                  }`}
                                  aria-label={isVoicePlaying ? 'إيقاف مؤقت' : 'تشغيل الرسالة الصوتية'}
                                >
                                  {isVoicePlaying ? (
                                    <Pause className="w-4 h-4 fill-current" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current" />
                                  )}
                                </button>
                                <div className="flex-1 space-y-1.5">
                                  <div className="flex items-center gap-[3px] h-6">
                                    {WAVEFORM_BARS.map((heightPct, bIdx) => {
                                      const barThreshold = (bIdx + 1) / WAVEFORM_BARS.length;
                                      const isPassed =
                                        isVoicePlaying && voicePct > 0
                                          ? voicePct >= barThreshold - 0.05
                                          : isVoicePlaying;
                                      return (
                                        <span
                                          key={bIdx}
                                          style={{ height: `${heightPct}%` }}
                                          className={`flex-1 rounded-full transition-colors ${
                                            isMine
                                              ? isPassed
                                                ? 'bg-white'
                                                : 'bg-white/35'
                                              : isPassed
                                              ? 'bg-[#3B6DFF]'
                                              : 'bg-slate-300 dark:bg-slate-600'
                                          }`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] opacity-85 tabular-nums">
                                    <span>رسالة صوتية</span>
                                    <span>{formatDuration(msg.audioDurationSec || 1)}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Text */}
                            {!isStickerMsg && msg.text && (
                              <p className="whitespace-pre-line text-start break-words [overflow-wrap:anywhere] leading-relaxed">
                                {msg.text}
                              </p>
                            )}

                            {/* Timestamp + Read Receipt */}
                            <div
                              className={`text-[9.5px] mt-1 flex items-center justify-end gap-1 tabular-nums ${
                                isStickerMsg
                                  ? 'text-slate-500 dark:text-[#94A3B8]'
                                  : isMine
                                  ? 'text-white/80'
                                  : 'text-slate-400 dark:text-[#64748B]'
                              }`}
                            >
                              {msg.editedAt && <span>(معدّلة)</span>}
                              <span>{formatRelativeTime(msg.createdAt)}</span>
                              {isMine &&
                                (isSeen ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-cyan-200" aria-label="تمت القراءة" />
                                ) : (
                                  <Check className="w-3 h-3" aria-label="تم الإرسال" />
                                ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Reactions Row */}
                      {reactionsEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 px-1">
                          {reactionsEntries.map(([emoji, users]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() =>
                                currentUser &&
                                toggleDirectMessageReaction(activeConvId, msg, emoji, currentUser.id)
                              }
                              className={`px-2 py-0.5 rounded-full text-[10px] border shadow-xs flex items-center gap-1 cursor-pointer ${
                                currentUser && users.includes(currentUser.id)
                                  ? 'bg-[#3B6DFF]/15 border-[#3B6DFF]/50 text-[#3B6DFF]'
                                  : 'bg-white dark:bg-[#161B26] border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="tabular-nums font-bold">{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Inline Quick Actions Bar on Tap */}
                      {activeActionMsgId === msg.id && !msg.deletedAt && (
                        <div className="mt-1.5 flex items-center gap-1 p-1.5 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] shadow-xl z-10">
                          {MESSAGE_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                if (currentUser) {
                                  void toggleDirectMessageReaction(activeConvId, msg, emoji, currentUser.id);
                                }
                                setActiveActionMsgId(null);
                              }}
                              className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-[#0B0F19] text-sm flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                            >
                              {emoji}
                            </button>
                          ))}
                          <span className="w-px h-4 bg-slate-200 dark:bg-[#2A2F3A] mx-0.5" />
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(msg);
                              setEditingMsg(null);
                              setActiveActionMsgId(null);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] cursor-pointer"
                            title="رد"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          {msg.text && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(msg.text);
                                showToast('تم نسخ نص الرسالة', 'success');
                                setActiveActionMsgId(null);
                              }}
                              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] cursor-pointer"
                              title="نسخ النص"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isMine && msg.text && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsg(msg);
                                setMessageText(msg.text);
                                setReplyingTo(null);
                                setActiveActionMsgId(null);
                              }}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                              title="تعديل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isMine ? (
                            <button
                              type="button"
                              onClick={() => {
                                void deleteDirectMessage(activeConvId, msg.id);
                                setActiveActionMsgId(null);
                              }}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReportTargetMsg(msg);
                                setReportReason('');
                                setActiveActionMsgId(null);
                              }}
                              className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                              title="إبلاغ"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          ) : trimmedThreadSearch ? (
            <div className="py-16 text-center space-y-2">
              <Search className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-600 dark:text-[#94A3B8]">
                لا توجد رسائل تطابق &ldquo;{threadSearch}&rdquo;
              </p>
            </div>
          ) : (
            <div className="my-8 max-w-xs mx-auto p-6 rounded-3xl bg-white/95 dark:bg-[#161B26]/95 border border-slate-200 dark:border-[#2A2F3A] text-center space-y-3.5 shadow-sm backdrop-blur-md">
              <MediaImage
                src={activeChatAvatar}
                alt={activeChatTitle}
                variant="avatar"
                fallbackText={activeChatTitle}
                containerClassName="w-16 h-16 rounded-full mx-auto border-2 border-[#3B6DFF]/35 shadow-sm overflow-hidden"
                className="w-full h-full object-cover"
              />
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-1">
                  <span>{activeChatTitle}</span>
                  {activeChatVerified && (
                    <VerifiedBadge category={activeChatVerificationCategory} className="w-3.5 h-3.5" />
                  )}
                </h4>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
                  {isGroupConv
                    ? currentConv?.groupDescription ||
                      `${groupParticipantCount} أعضاء في هذه الدردشة الجماعية — ابدأ الحديث الآن.`
                    : 'ابدأ المحادثة برسالة ترحيب أو شارك صورة أو مقطعا صوتياً.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {['👋 أهلاً!', 'السلام عليكم، كيف حالك؟', '✨ سعيد بالتواصل معك'].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={sending}
                    onClick={() => handleQuickStarterSend(starter)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] hover:bg-[#3B6DFF] hover:text-white border border-slate-200 dark:border-[#2A2F3A] text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOtherTyping && (
            <div className="flex items-center gap-2 text-xs text-[#3B6DFF] px-2 py-1.5">
              <div className="px-3 py-2 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B6DFF] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B6DFF] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B6DFF] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
          );
        })()}

        {/* Pending Media Preview / Voice Recording / Reply Banner */}
        <div className="shrink-0 bg-white/95 dark:bg-[#131824]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-[#2A2F3A] pb-[env(safe-area-inset-bottom)]">
          {(replyingTo || editingMsg) && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2A2F3A] flex items-center justify-between bg-slate-50 dark:bg-[#0B0F19]">
              <div className="text-xs min-w-0">
                <span className="font-bold text-[#3B6DFF] block">
                  {editingMsg ? 'تعديل الرسالة' : `الرد على ${replyingTo?.senderName}`}
                </span>
                <span className="text-slate-500 dark:text-[#94A3B8] truncate block">
                  {editingMsg
                    ? editingMsg.text
                    : replyingTo?.text || (replyingTo?.audioURL ? 'رسالة صوتية' : 'وسائط')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  if (editingMsg) {
                    setEditingMsg(null);
                    setMessageText('');
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {pendingMedia && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2A2F3A] space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-black shrink-0 relative">
                  {pendingMedia.kind === 'video' ? (
                    <video src={pendingMedia.localUrl} className="w-full h-full object-cover" />
                  ) : (
                    <img src={pendingMedia.localUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {pendingMedia.file.name}
                  </p>
                  {pendingMedia.uploading ? (
                    <p className="text-[11px] text-[#3B6DFF]">
                      جاري الرفع... {pendingMedia.progress}%
                    </p>
                  ) : pendingMedia.error ? (
                    <p className="text-[11px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{pendingMedia.error}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">جاهز للإرسال</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    pendingMedia.handle?.cancel();
                    revokeLocalPreview(pendingMedia.localUrl);
                    setPendingMedia(null);
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {recordedAudio && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2A2F3A] flex items-center justify-between gap-3">
              <audio src={recordedAudio.localUrl} controls className="h-9 flex-1" />
              {recordedAudio.uploading && (
                <span className="text-xs font-bold text-[#3B6DFF]">{recordedAudio.progress}%</span>
              )}
              {recordedAudio.error && (
                <span className="text-[11px] text-red-500 truncate max-w-[140px]">
                  {recordedAudio.error}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  revokeLocalPreview(recordedAudio.localUrl);
                  setRecordedAudio(null);
                }}
                className="p-2 text-slate-400 hover:text-red-500 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Emoji Picker Drawer */}
          {showEmojiPicker && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2A2F3A] flex flex-wrap gap-1.5 bg-slate-50 dark:bg-[#0B0F19]">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setMessageText((prev) => `${prev}${em}`)}
                  className="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-[#161B26] text-lg flex items-center justify-center cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* Real Sticker Drawer */}
          <StickerDrawer
            isOpen={showStickers}
            onClose={() => setShowStickers(false)}
            onSelectSticker={handleSendSticker}
          />

          {/* Composer Bar */}
          <form onSubmit={handleSendTextMessage} className="p-2.5 flex items-center gap-1.5">
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleMediaFilePicked}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="min-w-[40px] min-h-[40px] rounded-xl text-slate-500 dark:text-[#94A3B8] hover:text-[#3B6DFF] hover:bg-slate-100 dark:hover:bg-[#0B0F19] flex items-center justify-center cursor-pointer shrink-0"
              aria-label="إرفاق صورة أو فيديو"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowStickers((s) => !s);
                setShowEmojiPicker(false);
              }}
              className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${
                showStickers
                  ? 'text-[#3B6DFF] bg-[#3B6DFF]/10'
                  : 'text-slate-500 dark:text-[#94A3B8] hover:text-[#3B6DFF]'
              }`}
              aria-label="ملصقات"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker((e) => !e);
                setShowStickers(false);
              }}
              className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${
                showEmojiPicker
                  ? 'text-[#3B6DFF] bg-[#3B6DFF]/10'
                  : 'text-slate-500 dark:text-[#94A3B8] hover:text-[#3B6DFF]'
              }`}
              aria-label="إيموجي"
            >
              <Smile className="w-5 h-5" />
            </button>

            {isRecording ? (
              <div className="flex-1 min-w-0 min-h-[42px] px-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-600 dark:text-red-400 font-bold">
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                  <span>جاري التسجيل {formatDuration(recordSeconds)}</span>
                </span>
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  className="px-3 py-1 rounded-xl bg-red-600 text-white text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>إيقاف</span>
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={messageText}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder="اكتب رسالتك هنا..."
                className="flex-1 min-w-0 min-h-[42px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl px-3.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none transition-colors"
              />
            )}

            {!messageText.trim() && !pendingMedia && !recordedAudio && !isRecording ? (
              <button
                type="button"
                onClick={startVoiceRecording}
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF] text-[#3B6DFF] flex items-center justify-center cursor-pointer shrink-0"
                aria-label="تسجيل صوتي"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  sending ||
                  pendingMedia?.uploading ||
                  recordedAudio?.uploading ||
                  isRecording
                }
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] disabled:opacity-40 text-white flex items-center justify-center transition-all active:scale-95 shadow-md shadow-[#3B6DFF]/30 cursor-pointer shrink-0"
                aria-label="إرسال"
              >
                {sending || pendingMedia?.uploading || recordedAudio?.uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            )}
          </form>
        </div>

        {/* Chat Background Picker Modal */}
        <ChatBackgroundPicker
          isOpen={showBgPicker}
          onClose={() => setShowBgPicker(false)}
          title="تخصيص خلفية المحادثة"
          currentPresetId={
            (activeConvId && currentUser?.customization?.chatPreferences?.dmBackgrounds?.[activeConvId]?.presetId) ||
            currentUser?.customization?.chatPreferences?.defaultDmBgPresetId ||
            'default'
          }
          currentImageURL={
            activeConvId && currentUser?.customization?.chatPreferences?.dmBackgrounds?.[activeConvId]
              ? currentUser.customization.chatPreferences.dmBackgrounds[activeConvId]?.imageURL || ''
              : currentUser?.customization?.chatPreferences?.defaultDmBgImageURL || ''
          }
          allowScopeChoice
          uploadFolder="chats"
          onApply={handleApplyDmBackground}
          onResetToDefault={handleResetDmBackground}
        />

        {/* Lightbox for Chat Images */}
        {lightboxUrl && (
          <div
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 end-4 min-w-[44px] min-h-[44px] rounded-full bg-white/10 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl max-h-[90vh] w-full flex items-center justify-center"
            >
              <MediaImage
                src={lightboxUrl}
                alt=""
                variant="post"
                containerClassName="max-w-full max-h-[90vh] rounded-xl overflow-hidden"
                className="max-w-full max-h-[90vh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}

        {/* Long-Press Mobile Action Sheet */}
        {actionSheetMsg && (
          <div
            onClick={() => setActionSheetMsg(null)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-t-3xl sm:rounded-3xl p-4 space-y-2.5 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#2A2F3A]">
                <div className="flex items-center gap-1.5">
                  {MESSAGE_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        if (currentUser) {
                          void toggleDirectMessageReaction(activeConvId, actionSheetMsg, emoji, currentUser.id);
                        }
                        setActionSheetMsg(null);
                      }}
                      className="min-w-[40px] min-h-[40px] rounded-full bg-slate-100 dark:bg-[#0B0F19] text-lg flex items-center justify-center cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActionSheetMsg(null)}
                  className="p-2 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(actionSheetMsg);
                  setEditingMsg(null);
                  setActionSheetMsg(null);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <Reply className="w-4 h-4 text-[#3B6DFF]" />
                <span>رد</span>
              </button>
              {actionSheetMsg.text && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(actionSheetMsg.text);
                    showToast('تم نسخ نص الرسالة', 'success');
                    setActionSheetMsg(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>نسخ النص</span>
                </button>
              )}
              {actionSheetMsg.senderId === currentUser?.id && actionSheetMsg.text && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsg(actionSheetMsg);
                    setMessageText(actionSheetMsg.text);
                    setReplyingTo(null);
                    setActionSheetMsg(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-emerald-500" />
                  <span>تعديل الرسالة</span>
                </button>
              )}
              {actionSheetMsg.senderId === currentUser?.id ? (
                <button
                  type="button"
                  onClick={() => {
                    void deleteDirectMessage(activeConvId, actionSheetMsg.id);
                    setActionSheetMsg(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-red-500/10 flex items-center gap-3 text-xs font-bold text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الرسالة</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReportTargetMsg(actionSheetMsg);
                    setReportReason('');
                    setActionSheetMsg(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-amber-500/10 flex items-center gap-3 text-xs font-bold text-amber-600 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                  <span>إبلاغ عن الرسالة</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Report DM Message Modal */}
        {reportTargetMsg && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!currentUser || !reportReason.trim()) return;
                try {
                  setSubmittingReport(true);
                  await submitReport({
                    reporterId: currentUser.id,
                    reporterName: currentUser.displayName,
                    targetType: 'dm_message',
                    targetId: reportTargetMsg.id,
                    conversationId: activeConvId,
                    targetContentSnippet: `${reportTargetMsg.senderName}: ${(reportTargetMsg.text || '[وسائط]').slice(0, 120)}`,
                    reason: reportReason.trim(),
                  });
                  setReportTargetMsg(null);
                  setReportReason('');
                  showToast('تم إرسال البلاغ للإدارة.', 'success');
                } catch {
                  showToast('تعذر إرسال البلاغ.', 'error');
                } finally {
                  setSubmittingReport(false);
                }
              }}
              className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 font-ar"
            >
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">الإبلاغ عن رسالة خاصة</h3>
              <textarea
                rows={3}
                required
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="اذكر سبب الإبلاغ..."
                className="w-full rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] p-3 text-xs text-slate-900 dark:text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReportTargetMsg(null)}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingReport ? 'جاري الإرسال...' : 'إرسال البلاغ'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // INBOX LIST VIEW
  // ============================================================================
  const unreadCount = conversations.filter((c) => isConversationUnread(c)).length;

  const filteredConversations = conversations
    .filter((c) => {
      if (activeTab === 'groups') return !!c.isGroup;
      if (activeTab === 'unread') return isConversationUnread(c);
      return !c.isGroup;
    })
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const participantFields: Array<string | undefined> = [];
      (c.participantIds || []).forEach((pid) => {
        if (pid === currentUser?.id) return;
        const live = liveProfiles[pid];
        const snap = c.participantDetails?.[pid];
        participantFields.push(live?.displayName, live?.handle, snap?.displayName, snap?.handle);
      });
      return matchesSearchQuery(
        searchQuery,
        c.groupName,
        c.groupDescription,
        c.lastMessageText,
        ...participantFields
      );
    });

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4 font-ar">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2A2F3A]">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="رجوع"
            >
              <BackArrow className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('messages')}</h1>
        </div>

        <button
          onClick={handleOpenCompose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-[#94A3B8] hover:text-[#3B6DFF] hover:border-[#3B6DFF]/40 transition-all active:scale-90 shadow-sm cursor-pointer"
          title="محادثة جديدة"
          aria-label="محادثة جديدة"
        >
          <SquarePen className="w-5 h-5 stroke-[2]" />
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchChats')}
          className="w-full min-h-[44px] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none shadow-sm text-start"
        />
        <Search className="absolute end-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-[#64748B]" />
      </div>

      {/* Filter Tabs: Direct / Unread / Group Chats & Rooms */}
      <div className="flex items-center border-b border-slate-200 dark:border-[#2A2F3A]">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 min-h-[44px] py-2.5 text-xs font-bold text-center transition-all relative cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'text-[#3B6DFF]'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('directChats')}
          {activeTab === 'all' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('unread')}
          className={`flex-1 min-h-[44px] py-2.5 text-xs font-bold text-center transition-all relative cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'unread'
              ? 'text-[#3B6DFF]'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>غير مقروءة</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#3B6DFF] text-white text-[10px] tabular-nums">
              {unreadCount}
            </span>
          )}
          {activeTab === 'unread' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 min-h-[44px] py-2.5 text-xs font-bold text-center transition-all relative cursor-pointer whitespace-nowrap ${
            activeTab === 'groups'
              ? 'text-[#3B6DFF]'
              : 'text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('groups')}
          {activeTab === 'groups' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6DFF] rounded-full" />
          )}
        </button>
      </div>

      <div className="space-y-3">
        {loadingConvs ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-slate-200/70 dark:bg-[#161B26]/60 animate-pulse border border-slate-200 dark:border-[#2A2F3A]" />
            ))}
          </div>
        ) : activeTab === 'groups' ? (
          <div className="space-y-4">
            {/* Action Buttons: Create Group Chat + Open Standalone Chat Rooms */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenGroupChatModal}
                className="min-h-[44px] px-3 py-2.5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-[#3B6DFF]/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>{t('createGroupChat')}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenRoomsTab?.()}
                className="min-h-[44px] px-3 py-2.5 rounded-2xl bg-white dark:bg-[#161B26] hover:bg-slate-50 dark:hover:bg-[#1E2536] border border-slate-200 dark:border-[#2A2F3A] text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <MessagesSquare className="w-4 h-4 text-[#3B6DFF] shrink-0" />
                <span>غرف الدردشة</span>
              </button>
            </div>

            {/* Standalone Group Conversations List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  {t('groupChatsList')} ({filteredConversations.length})
                </h2>
              </div>

              {filteredConversations.length > 0 ? (
                filteredConversations.map((conv) => {
                  const unread = isConversationUnread(conv);
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setConversationOpen(conv.id)}
                      className={`w-full p-3.5 rounded-2xl bg-white dark:bg-[#161B26] hover:bg-slate-50 dark:hover:bg-[#1E1E2E] border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm text-start ${
                        unread
                          ? 'border-[#3B6DFF]/60'
                          : 'border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MediaImage
                          src={conv.groupAvatar}
                          alt={conv.groupName || 'دردشة جماعية'}
                          variant="avatar"
                          fallbackText={conv.groupName || 'Q'}
                          containerClassName="w-12 h-12 rounded-full overflow-hidden border border-[#3B6DFF]/30 shrink-0"
                          className="w-full h-full object-cover"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                            {conv.groupName || 'دردشة جماعية'}
                          </span>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              unread
                                ? 'text-slate-900 dark:text-white font-bold'
                                : 'text-slate-500 dark:text-[#94A3B8]'
                            }`}
                          >
                            {conv.participantIds.length} أعضاء · {conv.lastMessageText || 'دردشة جماعية نشطة'}
                          </p>
                        </div>
                      </div>
                      <div className="text-end shrink-0 flex flex-col items-end gap-1.5">
                        <span className="text-[10px] text-slate-400 dark:text-[#64748B] font-mono-subtle">
                          {formatRelativeTime(conv.updatedAt)}
                        </span>
                        {unread && <span className="w-2.5 h-2.5 rounded-full bg-[#3B6DFF]" />}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-10 px-6 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] text-center space-y-3 shadow-xs">
                  <Users className="w-8 h-8 text-slate-400 dark:text-[#64748B] mx-auto" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    لا توجد دردشات جماعية بعد
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    ابدأ دردشة جماعية خاصة مع أصدقائك، أو تصفح غرف الدردشة المفتوحة في منصة Q.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const otherId = conv.participantIds.find((id) => id !== currentUser?.id);
            const otherDetail = otherId ? resolveConvParticipant(conv, otherId) : undefined;
            const title = conv.isGroup
              ? conv.groupName || 'دردشة جماعية'
              : otherDetail?.displayName || conv.groupName || 'محادثة';
            const avatar = conv.isGroup
              ? conv.groupAvatar
              : otherDetail?.photoURL || conv.groupAvatar;
            const isVerified = !conv.isGroup && Boolean(otherDetail?.isVerified);
            const isOnline = conv.isGroup
              ? conv.participantIds.some((id) => id !== currentUser?.id && onlineSet.has(id))
              : Boolean(otherId && onlineSet.has(otherId));
            const unread = isConversationUnread(conv);

            return (
              <div
                key={conv.id}
                onClick={() => setConversationOpen(conv.id)}
                className={`p-3.5 rounded-2xl bg-white dark:bg-[#161B26] hover:bg-slate-50 dark:hover:bg-[#1E1E2E] border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm ${
                  unread
                    ? 'border-[#3B6DFF]/60'
                    : 'border-slate-200 dark:border-[#2A2F3A] hover:border-[#3B6DFF]/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <MediaImage
                      src={avatar}
                      alt={title}
                      variant="avatar"
                      fallbackText={title}
                      containerClassName="w-12 h-12 rounded-full overflow-hidden border border-[#3B6DFF]/30"
                      className="w-full h-full object-cover"
                    />
                    {isOnline && (
                      <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#161B26]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {title}
                      </span>
                      {isVerified && (
                        <VerifiedBadge
                          category={otherDetail?.verificationCategory || 'blue'}
                          className="w-3 h-3"
                        />
                      )}
                    </div>
                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        unread
                          ? 'text-slate-900 dark:text-white font-bold'
                          : 'text-slate-500 dark:text-[#94A3B8]'
                      }`}
                    >
                      {conv.lastMessageText || 'محادثة جديدة'}
                    </p>
                  </div>
                </div>

                <div className="text-end shrink-0 flex flex-col items-end gap-1.5">
                  <span className="text-[10px] text-slate-400 dark:text-[#64748B]">
                    {formatRelativeTime(conv.updatedAt)}
                  </span>
                  {unread && <span className="w-2.5 h-2.5 rounded-full bg-[#3B6DFF]" />}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-6 space-y-3 shadow-sm">
            <MessageSquare className="w-8 h-8 text-slate-400 dark:text-[#64748B] mx-auto" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {activeTab === 'unread' ? 'لا توجد رسائل غير مقروءة' : 'لا توجد محادثات نشطة'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-xs mx-auto">
              ابدأ محادثة مباشرة أو دردشة جماعية مع أصدقائك بالضغط على أيقونة القلم في الأعلى.
            </p>
            <button
              onClick={handleOpenCompose}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold transition-all shadow-md shadow-[#3B6DFF]/25 active:scale-95 cursor-pointer"
            >
              محادثة جديدة
            </button>
          </div>
        )}
      </div>

      {/* New Chat Compose Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2F3A] pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">بدء محادثة جديدة</h3>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenGroupChatModal}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/20 border border-[#3B6DFF]/30 text-[#3B6DFF] text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>إنشاء دردشة جماعية جديدة</span>
              </span>
              <Plus className="w-4 h-4" />
            </button>

            <div className="relative">
              <input
                type="text"
                placeholder="ابحث عن عضو بالاسم أو المعرف..."
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                className="w-full min-h-[42px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {loadingUsers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
                </div>
              ) : (
                availableUsers
                  .filter((u) => matchesSearchQuery(userSearchText, u.displayName, u.handle))
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartChat(u)}
                      className="w-full min-h-[44px] p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E1E2E] flex items-center justify-between text-start transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <MediaImage
                            src={u.photoURL}
                            alt={u.displayName}
                            variant="avatar"
                            fallbackText={u.displayName}
                            containerClassName="w-9 h-9 rounded-full overflow-hidden border border-[#3B6DFF]/30"
                            className="w-full h-full object-cover"
                          />
                          {onlineSet.has(u.id) && (
                            <span className="absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#161B26]" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{u.displayName}</span>
                            {u.isVerified && <VerifiedBadge className="w-3 h-3" interactive={false} />}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-handle">@{u.handle}</span>
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Standalone Group Chat Modal */}
      {groupChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-md">
          <form
            onSubmit={handleCreateGroupChat}
            className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2F3A] pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                إنشاء دردشة جماعية جديدة
              </h3>
              <button
                type="button"
                onClick={() => setGroupChatModalOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={groupAvatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleGroupAvatarPick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => groupAvatarInputRef.current?.click()}
                className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-[#0B0F19] border border-dashed border-slate-300 dark:border-[#2A2F3A] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer relative"
                title="صورة الدردشة الجماعية"
              >
                {uploadingGroupAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
                ) : newGroupAvatar ? (
                  <MediaImage
                    src={newGroupAvatar}
                    alt=""
                    variant="avatar"
                    containerClassName="w-full h-full overflow-hidden"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Camera className="w-5 h-5 text-slate-400" />
                )}
              </button>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="اسم الدردشة الجماعية (مطلوب)..."
                  required
                  className="w-full min-h-[42px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="وصف مختصر (اختياري)..."
                  className="w-full min-h-[40px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>اختر الأعضاء ({selectedGroupMemberIds.length} محدد)</span>
              </div>
              <input
                type="text"
                value={groupMemberSearch}
                onChange={(e) => setGroupMemberSearch(e.target.value)}
                placeholder="ابحث عن الأعضاء لإضافتهم..."
                className="w-full min-h-[40px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] focus:border-[#3B6DFF] rounded-xl px-3 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <div className="max-h-52 overflow-y-auto space-y-1 border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-2 bg-slate-50/70 dark:bg-[#0B0F19]/60">
                {loadingUsers ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-[#3B6DFF]" />
                  </div>
                ) : (
                  availableUsers
                    .filter((u) => matchesSearchQuery(groupMemberSearch, u.displayName, u.handle))
                    .map((u) => {
                      const selected = selectedGroupMemberIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() =>
                            setSelectedGroupMemberIds((prev) =>
                              prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                            )
                          }
                          className={`w-full min-h-[44px] px-2.5 py-2 rounded-xl flex items-center justify-between text-start transition-colors cursor-pointer ${
                            selected
                              ? 'bg-[#3B6DFF]/15 border border-[#3B6DFF]/40'
                              : 'hover:bg-white dark:hover:bg-[#161B26]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MediaImage
                              src={u.photoURL}
                              alt={u.displayName}
                              variant="avatar"
                              fallbackText={u.displayName}
                              containerClassName="w-8 h-8 rounded-full overflow-hidden shrink-0"
                              className="w-full h-full object-cover"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                                {u.displayName}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-handle truncate block">
                                @{u.handle}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              selected
                                ? 'bg-[#3B6DFF] border-[#3B6DFF] text-white'
                                : 'border-slate-300 dark:border-[#2A2F3A]'
                            }`}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGroupChatModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={creatingGroupChat || uploadingGroupAvatar}
                className="min-h-[44px] px-5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {creatingGroupChat && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>إنشاء الدردشة</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
