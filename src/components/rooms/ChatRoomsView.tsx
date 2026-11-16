import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquarePlus,
  Users,
  Lock,
  Globe,
  Shield,
  Send,
  ImagePlus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  LogOut,
  Trash2,
  Crown,
  ShieldCheck,
  UserX,
  Ban,
  Search,
  X,
  CornerDownLeft,
  Sparkles,
  Check,
  Pin,
  PinOff,
  Megaphone,
  Palette,
  History,
  Bell,
  BellOff,
  VolumeX,
  Volume2,
  MoreHorizontal,
  Edit3,
  Flag,
  Copy,
  Info,
  Sliders
} from 'lucide-react';
import {
  ChatRoom,
  ChatRoomAnnouncement,
  ChatRoomAppearance,
  ChatRoomMember,
  ChatRoomMessage,
  ChatRoomModerationLog,
  ChatRoomVisibility,
  RoomPermissions,
  UserProfile,
  getSortedUserTitles
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  listenToChatRooms,
  listenToChatRoom,
  listenToChatRoomMembers,
  listenToChatRoomMessages,
  listenToRoomAnnouncements,
  listenToRoomModerationLogs,
  createChatRoom,
  joinChatRoom,
  leaveChatRoom,
  sendChatRoomMessage,
  editChatRoomMessage,
  deleteOwnChatRoomMessage,
  toggleChatRoomReaction,
  toggleRoomNotificationsMute,
  markChatRoomRead,
  inviteUserToChatRoom,
  performRoomModerationAction,
  deleteChatRoom
} from '../../services/chatRooms';
import {
  getAllUsers,
  submitReport,
  updateUserProfileCustomization
} from '../../services/firestore';
import { uploadMediaWithControl, detectMediaKind } from '../../services/storage';
import { MediaImage } from '../common/MediaImage';
import { CustomTitleBadge, RoleBadge, VerifiedBadge } from '../common/VerifiedBadge';
import { formatRelativeTime } from '../../utils/date';

interface ChatRoomsViewProps {
  onSelectAuthor: (userId: string) => void;
  initialRoomId?: string | null;
  onActiveRoomChange?: (roomId: string | null) => void;
}

const ROOM_REACTIONS = ['❤️', '👍', '😂', '🔥', '😮', '👏'];
const ACCENT_PRESETS = ['#3B6DFF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const BG_COLOR_PRESETS = ['', '#090D16', '#0F172A', '#13111C', '#0A1916', '#1F1215'];

const PERMISSION_LABELS: Array<{ key: keyof RoomPermissions; label: string }> = [
  { key: 'deleteMessages', label: 'حذف رسائل الأعضاء' },
  { key: 'pinMessages', label: 'تثبيت وإلغاء تثبيت الرسائل' },
  { key: 'muteMembers', label: 'كتم الأعضاء مؤقتاً' },
  { key: 'kickMembers', label: 'طرد الأعضاء من الغرفة' },
  { key: 'banMembers', label: 'حظر وفك حظر الأعضاء' },
  { key: 'manageAnnouncements', label: 'إدارة إعلانات الغرفة' },
  { key: 'manageAppearance', label: 'تخصيص مظهر الغرفة' },
  { key: 'inviteMembers', label: 'دعوة أعضاء جدد' },
];

function getDateLabel(iso: string): string {
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

export function ChatRoomsView({
  onSelectAuthor,
  initialRoomId,
  onActiveRoomChange
}: ChatRoomsViewProps) {
  const { currentUser, isAdmin, isStaff, onlineUsers } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine' | 'public' | 'private' | 'staff'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected room + live streams
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId || null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [members, setMembers] = useState<ChatRoomMember[]>([]);
  const [messages, setMessages] = useState<ChatRoomMessage[]>([]);
  const [announcements, setAnnouncements] = useState<ChatRoomAnnouncement[]>([]);
  const [modLogs, setModLogs] = useState<ChatRoomModerationLog[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Composer + Reply / Edit state
  const [msgText, setMsgText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatRoomMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatRoomMessage | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mobile Context Action Sheet & Lightbox & Report
  const [sheetMsg, setSheetMsg] = useState<ChatRoomMessage | null>(null);
  const [reportTargetMsg, setReportTargetMsg] = useState<ChatRoomMessage | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [dismissedAnnId, setDismissedAnnId] = useState<string | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create Room Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [roomTopic, setRoomTopic] = useState('');
  const [roomVisibility, setRoomVisibility] = useState<ChatRoomVisibility>('public');
  const [roomCoverFile, setRoomCoverFile] = useState<File | null>(null);
  const [roomCoverPreview, setRoomCoverPreview] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Room Info & Management Sheet
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [infoTab, setInfoTab] = useState<'members' | 'announcements' | 'appearance' | 'logs'>('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [deputyPermTarget, setDeputyPermTarget] = useState<ChatRoomMember | null>(null);
  const [deputyPermsDraft, setDeputyPermsDraft] = useState<RoomPermissions>({});
  const [savingPerm, setSavingPerm] = useState(false);

  // Announcements Draft
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [savingAnn, setSavingAnn] = useState(false);

  // Appearance Draft
  const [appTitle, setAppTitle] = useState('');
  const [appDesc, setAppDesc] = useState('');
  const [appBgColor, setAppBgColor] = useState('');
  const [appBgImageURL, setAppBgImageURL] = useState('');
  const [appCoverURL, setAppCoverURL] = useState('');
  const [appImageURL, setAppImageURL] = useState('');
  const [appAccentColor, setAppAccentColor] = useState('#3B6DFF');
  const [appBubbleTheme, setAppBubbleTheme] = useState<ChatRoomAppearance['bubbleTheme']>('classic');
  const [uploadingAppearanceMedia, setUploadingAppearanceMedia] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);

  // Personal Local Override toggle
  const [personalUseRoomTheme, setPersonalUseRoomTheme] = useState(
    currentUser?.customization?.chatPreferences?.useRoomTheme !== false
  );
  const [personalBubbleTheme, setPersonalBubbleTheme] = useState<ChatRoomAppearance['bubbleTheme']>(
    currentUser?.customization?.chatPreferences?.bubbleTheme || 'classic'
  );

  // Invite Modal & Delete / Transfer Confirmations
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [transferTarget, setTransferTarget] = useState<ChatRoomMember | null>(null);
  const [transferringOwnership, setTransferringOwnership] = useState(false);

  const onlineIds = useMemo(() => new Set(onlineUsers.map((u) => u.userId)), [onlineUsers]);

  useEffect(() => {
    setPersonalUseRoomTheme(currentUser?.customization?.chatPreferences?.useRoomTheme !== false);
    setPersonalBubbleTheme(currentUser?.customization?.chatPreferences?.bubbleTheme || 'classic');
  }, [
    currentUser?.customization?.chatPreferences?.useRoomTheme,
    currentUser?.customization?.chatPreferences?.bubbleTheme,
  ]);

  useEffect(() => {
    if (initialRoomId) setActiveRoomId(initialRoomId);
  }, [initialRoomId]);

  useEffect(() => {
    onActiveRoomChange?.(activeRoomId);
  }, [activeRoomId, onActiveRoomChange]);

  useEffect(() => {
    return () => {
      onActiveRoomChange?.(null);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [onActiveRoomChange]);

  useEffect(() => {
    setLoading(true);
    const unsub = listenToChatRooms(currentUser, (items) => {
      setRooms(items);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!activeRoomId) {
      setActiveRoom(null);
      setMembers([]);
      setMessages([]);
      setAnnouncements([]);
      setModLogs([]);
      return;
    }

    setLoadingMessages(true);
    const unsubRoom = listenToChatRoom(activeRoomId, (r) => setActiveRoom(r));
    const unsubMembers = listenToChatRoomMembers(activeRoomId, (m) => setMembers(m));
    const unsubMessages = listenToChatRoomMessages(activeRoomId, (msgs) => {
      setMessages(msgs);
      setLoadingMessages(false);
      if (currentUser?.id) {
        void markChatRoomRead(activeRoomId, currentUser.id);
      }
    });
    const unsubAnns = listenToRoomAnnouncements(activeRoomId, (anns) => setAnnouncements(anns));

    return () => {
      unsubRoom();
      unsubMembers();
      unsubMessages();
      unsubAnns();
    };
  }, [activeRoomId, currentUser?.id]);

  // Populate appearance editor whenever active room changes or opens
  useEffect(() => {
    if (!activeRoom) return;
    setAppTitle(activeRoom.title || '');
    setAppDesc(activeRoom.description || '');
    setAppBgColor(activeRoom.appearance?.bgColor || '');
    setAppBgImageURL(activeRoom.appearance?.bgImageURL || '');
    setAppCoverURL(activeRoom.coverURL || '');
    setAppImageURL(activeRoom.imageURL || '');
    setAppAccentColor(activeRoom.appearance?.accentColor || '#3B6DFF');
    setAppBubbleTheme(activeRoom.appearance?.bubbleTheme || 'classic');
  }, [activeRoom?.id, showInfoSheet]);

  const currentMember = useMemo(
    () => (currentUser ? members.find((m) => m.userId === currentUser.id) : undefined),
    [members, currentUser?.id]
  );

  const isRoomOwner = Boolean(currentUser && activeRoom && activeRoom.ownerId === currentUser.id);
  const isPlatformRoomAdmin = Boolean(
    currentUser &&
      (isAdmin ||
        currentUser.role === 'assistant_admin' ||
        currentUser.globalPermissions?.manageRooms)
  );
  const isRoomModerator = Boolean(
    currentUser &&
      activeRoom &&
      (isRoomOwner ||
        isPlatformRoomAdmin ||
        (activeRoom.leaderIds || []).includes(currentUser.id) ||
        (activeRoom.moderatorIds || []).includes(currentUser.id) ||
        isStaff)
  );
  const isDeputy = Boolean(
    currentUser &&
      activeRoom &&
      ((activeRoom.deputyIds || []).includes(currentUser.id) || currentMember?.role === 'deputy_moderator')
  );
  const deputyPerms = currentMember?.permissions || {};
  const canRoomPerm = (perm: keyof RoomPermissions): boolean => {
    if (isRoomOwner || isRoomModerator || isPlatformRoomAdmin) return true;
    return isDeputy && deputyPerms[perm] === true;
  };
  const isMember = Boolean(currentMember);
  const isMutedInRoom = Boolean(
    currentUser && activeRoom && (activeRoom.mutedUserIds || []).includes(currentUser.id)
  );

  // Subscribe to moderation logs only if user has moderation/deputy status
  useEffect(() => {
    if (!activeRoomId || (!isRoomModerator && !isDeputy)) {
      setModLogs([]);
      return;
    }
    const unsub = listenToRoomModerationLogs(activeRoomId, (logs) => setModLogs(logs));
    return () => unsub();
  }, [activeRoomId, isRoomModerator, isDeputy]);

  useEffect(() => {
    if (messages.length > 0 && !editingMsg) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, editingMsg]);

  const handleOpenRoom = async (room: ChatRoom, openInfo = false) => {
    setActiveRoomId(room.id);
    setInfoTab('members');
    setShowInfoSheet(openInfo);
    if (currentUser && !openInfo) {
      const alreadyMember =
        room.ownerId === currentUser.id ||
        (room.leaderIds || []).includes(currentUser.id) ||
        (room.moderatorIds || []).includes(currentUser.id) ||
        (room.deputyIds || []).includes(currentUser.id);
      if (!alreadyMember && room.visibility === 'public') {
        try {
          await joinChatRoom(room, currentUser);
        } catch {
          // User can preview info and click Join explicitly
        }
      }
    }
  };

  const handleJoinRoom = async () => {
    if (!currentUser || !activeRoom) {
      showToast('يرجى تسجيل الدخول للانضمام إلى الغرفة.', 'info');
      return;
    }
    try {
      await joinChatRoom(activeRoom, currentUser);
      showToast(`انضممت إلى غرفة "${activeRoom.title}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر الانضمام إلى الغرفة.', 'error');
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentUser || !activeRoom) return;
    if (activeRoom.ownerId === currentUser.id) {
      showToast('بصفتك منشئ الغرفة يمكنك نقل الملكية أولاً أو حذف الغرفة.', 'info');
      return;
    }
    try {
      await leaveChatRoom(activeRoom.id, currentUser.id);
      setShowInfoSheet(false);
      setActiveRoomId(null);
      showToast('غادرت غرفة الدردشة.', 'info');
    } catch {
      showToast('تعذر مغادرة الغرفة.', 'error');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('يجب تسجيل الدخول لإنشاء غرفة دردشة.', 'info');
      return;
    }
    if (!roomTitle.trim()) {
      showToast('يرجى إدخال اسم غرفة الدردشة.', 'error');
      return;
    }

    try {
      setCreatingRoom(true);
      let imageURL = '';
      let coverPath = '';

      if (roomCoverFile) {
        imageURL = await uploadMediaWithControl(roomCoverFile, 'rooms', {
          onMetadata: (meta) => {
            coverPath = meta.path;
          },
        }).promise;
      }

      const created = await createChatRoom(
        {
          title: roomTitle,
          description: roomDesc,
          topic: roomTopic,
          visibility: roomVisibility,
          imageURL,
          coverPath: coverPath || undefined,
        },
        currentUser
      );

      setShowCreateModal(false);
      setRoomTitle('');
      setRoomDesc('');
      setRoomTopic('');
      setRoomVisibility('public');
      setRoomCoverFile(null);
      if (roomCoverPreview) URL.revokeObjectURL(roomCoverPreview);
      setRoomCoverPreview(null);
      setActiveRoomId(created.id);
      showToast('تم إنشاء غرفة الدردشة بنجاح!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر إنشاء غرفة الدردشة.', 'error');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeRoom || !msgText.trim() || sendingMsg) return;

    if (editingMsg) {
      try {
        setSendingMsg(true);
        await editChatRoomMessage(activeRoom.id, editingMsg.id, msgText.trim());
        setEditingMsg(null);
        setMsgText('');
        showToast('تم تعديل الرسالة.', 'success');
      } catch (err: any) {
        showToast(err?.message || 'تعذر تعديل الرسالة.', 'error');
      } finally {
        setSendingMsg(false);
      }
      return;
    }

    if (!isMember) {
      try {
        await joinChatRoom(activeRoom, currentUser);
      } catch (err: any) {
        showToast(err?.message || 'انضم إلى الغرفة أولاً للمشاركة.', 'error');
        return;
      }
    }

    try {
      setSendingMsg(true);
      await sendChatRoomMessage(activeRoom, currentUser, {
        text: msgText.trim(),
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: (replyingTo.text || (replyingTo.mediaURL ? 'وسائط' : 'رسالة')).slice(0, 70),
            }
          : undefined,
      });
      setMsgText('');
      setReplyingTo(null);
    } catch (err: any) {
      showToast(err?.message || 'تعذر إرسال الرسالة.', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser || !activeRoom) return;

    if (!isMember) {
      try {
        await joinChatRoom(activeRoom, currentUser);
      } catch (err: any) {
        showToast(err?.message || 'انضم إلى الغرفة أولاً لإرسال الوسائط.', 'error');
        return;
      }
    }

    const kind = detectMediaKind(file);
    if (kind !== 'image' && kind !== 'video') {
      showToast('يرجى اختيار صورة أو فيديو مدعوم.', 'error');
      return;
    }

    try {
      setUploadingMedia(true);
      setUploadProgress(5);
      const url = await uploadMediaWithControl(file, 'rooms', {
        onProgress: (pct) => setUploadProgress(pct),
      }).promise;

      await sendChatRoomMessage(activeRoom, currentUser, {
        text: msgText.trim(),
        mediaURL: url,
        mediaType: kind === 'video' ? 'video' : 'image',
      });
      setMsgText('');
    } catch (err: any) {
      showToast(err?.message || 'فشل رفع الوسائط إلى الغرفة.', 'error');
    } finally {
      setUploadingMedia(false);
      setUploadProgress(0);
    }
  };

  const handleUploadAppearanceImage = async (
    file: File,
    field: 'bgImageURL' | 'coverURL' | 'imageURL'
  ) => {
    try {
      setUploadingAppearanceMedia(true);
      const url = await uploadMediaWithControl(file, 'rooms').promise;
      if (field === 'bgImageURL') setAppBgImageURL(url);
      if (field === 'coverURL') setAppCoverURL(url);
      if (field === 'imageURL') setAppImageURL(url);
      showToast('تم رفع الصورة بنجاح.', 'success');
    } catch {
      showToast('تعذر رفع الصورة.', 'error');
    } finally {
      setUploadingAppearanceMedia(false);
    }
  };

  const handleSaveRoomAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;
    try {
      setSavingAppearance(true);
      await performRoomModerationAction({
        roomId: activeRoom.id,
        action: 'update_appearance',
        appearance: {
          title: appTitle.trim() || activeRoom.title,
          description: appDesc.trim(),
          imageURL: appImageURL,
          coverURL: appCoverURL,
          bgColor: appBgColor,
          bgImageURL: appBgImageURL,
          accentColor: appAccentColor,
          bubbleTheme: appBubbleTheme,
        },
      });
      showToast('تم حفظ مظهر وإعدادات الغرفة.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر حفظ المظهر.', 'error');
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleSavePersonalPrefs = async (
    nextUseRoomTheme: boolean,
    nextBubbleTheme: ChatRoomAppearance['bubbleTheme']
  ) => {
    setPersonalUseRoomTheme(nextUseRoomTheme);
    setPersonalBubbleTheme(nextBubbleTheme);
    if (!currentUser) return;
    try {
      await updateUserProfileCustomization(currentUser.id, {
        ...(currentUser.customization || {}),
        chatPreferences: {
          ...(currentUser.customization?.chatPreferences || {}),
          useRoomTheme: nextUseRoomTheme,
          bubbleTheme: nextBubbleTheme,
        },
      });
      showToast('تم حفظ تفضيلات العرض الشخصية.', 'success');
    } catch {
      showToast('تعذر حفظ التفضيلات الشخصية.', 'error');
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !annTitle.trim() || !annContent.trim()) return;
    try {
      setSavingAnn(true);
      await performRoomModerationAction({
        roomId: activeRoom.id,
        action: 'announcement_create',
        title: annTitle.trim(),
        content: annContent.trim(),
      });
      setAnnTitle('');
      setAnnContent('');
      showToast('تم نشر إعلان الغرفة.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر نشر الإعلان.', 'error');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleSaveDeputyPermissions = async () => {
    if (!activeRoom || !deputyPermTarget) return;
    try {
      setSavingPerm(true);
      await performRoomModerationAction({
        roomId: activeRoom.id,
        action: deputyPermTarget.role === 'deputy_moderator' ? 'update_deputy_permissions' : 'appoint_deputy',
        targetUserId: deputyPermTarget.userId,
        targetUserName: deputyPermTarget.displayName,
        permissions: deputyPermsDraft,
      });
      showToast(`تم تحديث صلاحيات نائب المشرف ${deputyPermTarget.displayName}.`, 'success');
      setDeputyPermTarget(null);
    } catch (err: any) {
      showToast(err?.message || 'تعذر تحديث الصلاحيات.', 'error');
    } finally {
      setSavingPerm(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!activeRoom || !transferTarget) return;
    try {
      setTransferringOwnership(true);
      await performRoomModerationAction({
        roomId: activeRoom.id,
        action: 'transfer_ownership',
        targetUserId: transferTarget.userId,
        targetUserName: transferTarget.displayName,
      });
      showToast(`تم نقل ملكية الغرفة إلى ${transferTarget.displayName}.`, 'success');
      setTransferTarget(null);
    } catch (err: any) {
      showToast(err?.message || 'تعذر نقل الملكية.', 'error');
    } finally {
      setTransferringOwnership(false);
    }
  };

  const handleSubmitMessageReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeRoom || !reportTargetMsg || !reportReason.trim()) return;
    try {
      setSubmittingReport(true);
      await submitReport({
        reporterId: currentUser.id,
        reporterName: currentUser.displayName,
        targetType: 'room_message',
        targetId: reportTargetMsg.id,
        roomId: activeRoom.id,
        targetContentSnippet: `${reportTargetMsg.senderName}: ${(reportTargetMsg.text || '[وسائط]').slice(0, 120)}`,
        reason: reportReason.trim(),
      });
      setReportTargetMsg(null);
      setReportReason('');
      showToast('تم إرسال البلاغ للإدارة للمراجعة.', 'success');
    } catch {
      showToast('تعذر إرسال البلاغ.', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const openInviteUsersModal = async () => {
    setShowInviteModal(true);
    try {
      const users = await getAllUsers(80);
      setDirectoryUsers(users);
    } catch {
      setDirectoryUsers([]);
    }
  };

  const handleInviteUser = async (target: UserProfile) => {
    if (!currentUser || !activeRoom) return;
    try {
      setInvitingUserId(target.id);
      await inviteUserToChatRoom(activeRoom, currentUser, target);
      showToast(`تمت دعوة ${target.displayName} إلى الغرفة.`, 'success');
    } catch {
      showToast('تعذر إرسال الدعوة.', 'error');
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleDeleteRoom = async () => {
    if (!activeRoom) return;
    try {
      setDeletingRoom(true);
      await deleteChatRoom(activeRoom.id);
      setConfirmDeleteRoom(false);
      setShowInfoSheet(false);
      setActiveRoomId(null);
      showToast('تم حذف غرفة الدردشة نهائياً.', 'info');
    } catch {
      showToast('تعذر حذف الغرفة.', 'error');
    } finally {
      setDeletingRoom(false);
    }
  };

  const jumpToMessage = (msgId: string) => {
    const el = document.getElementById(`rmsg_${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
    }
  };

  // Filter rooms hub list
  const visibleRooms = rooms.filter((r) => {
    if (filter === 'mine' && currentUser) {
      const mine =
        r.ownerId === currentUser.id ||
        (r.leaderIds || []).includes(currentUser.id) ||
        (r.moderatorIds || []).includes(currentUser.id) ||
        (r.deputyIds || []).includes(currentUser.id) ||
        (r.allowedUserIds || []).includes(currentUser.id);
      if (!mine) return false;
    } else if (filter === 'public' && r.visibility !== 'public') {
      return false;
    } else if (filter === 'private' && r.visibility !== 'private') {
      return false;
    } else if (filter === 'staff' && r.visibility !== 'staff') {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.topic || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  // ============================================================================
  // AMINO-INSPIRED FULL-SCREEN CHAT ROOM THREAD VIEW
  // ============================================================================
  if (activeRoomId && activeRoom) {
    const activeAccent = activeRoom.appearance?.accentColor || '#3B6DFF';
    const effectiveBgColor = personalUseRoomTheme ? activeRoom.appearance?.bgColor || '' : '';
    const effectiveBgImg = personalUseRoomTheme ? activeRoom.appearance?.bgImageURL || '' : '';
    const effectiveBubbleTheme = personalUseRoomTheme
      ? activeRoom.appearance?.bubbleTheme || 'classic'
      : personalBubbleTheme || 'classic';

    const pinnedMessages = messages.filter(
      (m) => (m.isPinned || (activeRoom.pinnedMessageIds || []).includes(m.id)) && !m.isDeleted
    );
    const activePinnedMsg = pinnedMessages[pinnedIdx % Math.max(1, pinnedMessages.length)];
    const latestAnnouncement = announcements[0];
    const showAnnBanner = Boolean(latestAnnouncement && dismissedAnnId !== latestAnnouncement.id);
    const onlineMembersCount = members.filter((m) => onlineIds.has(m.userId)).length;

    const ownerMembers = members.filter((m) => m.userId === activeRoom.ownerId || m.role === 'owner');
    const modMembers = members.filter(
      (m) => m.userId !== activeRoom.ownerId && (m.role === 'moderator' || m.role === 'room_leader')
    );
    const deputyMembers = members.filter((m) => m.role === 'deputy_moderator');
    const regularMembers = members.filter(
      (m) =>
        m.userId !== activeRoom.ownerId &&
        m.role !== 'owner' &&
        m.role !== 'moderator' &&
        m.role !== 'room_leader' &&
        m.role !== 'deputy_moderator'
    );

    const startLongPress = (msg: ChatRoomMessage) => {
      if (msg.isDeleted) return;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        setSheetMsg(msg);
      }, 450);
    };
    const cancelLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const getBubbleClasses = (isMine: boolean, isGroupedNext: boolean) => {
      if (effectiveBubbleTheme === 'glass') {
        return isMine
          ? `backdrop-blur-md text-white shadow-lg border border-white/25 rounded-[20px] ${!isGroupedNext ? 'rounded-ee-[6px]' : ''}`
          : `backdrop-blur-md bg-white/85 dark:bg-[#161B26]/80 text-slate-900 dark:text-white border border-white/30 dark:border-white/15 rounded-[20px] ${!isGroupedNext ? 'rounded-es-[6px]' : ''}`;
      }
      if (effectiveBubbleTheme === 'minimal') {
        return isMine
          ? `bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl`
          : `bg-white dark:bg-[#1A202E] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#2A3142] rounded-2xl`;
      }
      if (effectiveBubbleTheme === 'gold') {
        return isMine
          ? `bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md rounded-[20px] ${!isGroupedNext ? 'rounded-ee-[6px]' : ''}`
          : `bg-white/95 dark:bg-[#1B1915]/95 text-slate-900 dark:text-amber-50 border border-amber-500/35 rounded-[20px] ${!isGroupedNext ? 'rounded-es-[6px]' : ''}`;
      }
      return isMine
        ? `text-white shadow-md rounded-[20px] ${!isGroupedNext ? 'rounded-ee-[6px]' : ''}`
        : `bg-white dark:bg-[#161B26] text-slate-900 dark:text-[#F8FAFC] border border-slate-200/90 dark:border-[#242B38] shadow-xs rounded-[20px] ${!isGroupedNext ? 'rounded-es-[6px]' : ''}`;
    };

    return (
      <div className="fixed inset-0 z-30 lg:static lg:z-auto w-full lg:max-w-3xl lg:mx-auto flex flex-col h-[100dvh] lg:h-[calc(100dvh-5.5rem)] bg-white dark:bg-[#0B0F19] lg:border lg:border-slate-200 lg:dark:border-[#242B38] lg:rounded-3xl overflow-hidden shadow-xl font-ar">
        {/* Top Native Header */}
        <header className="shrink-0 px-2.5 sm:px-4 py-2.5 border-b border-slate-200/80 dark:border-[#242B38] bg-white/95 dark:bg-[#111622]/95 backdrop-blur-xl flex items-center justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:pt-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveRoomId(null)}
              className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#1B2232] text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
              aria-label="العودة للغرف"
            >
              <BackIcon className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setInfoTab('members');
                setShowInfoSheet(true);
              }}
              className="flex items-center gap-2.5 text-start min-w-0 cursor-pointer group"
            >
              <MediaImage
                src={activeRoom.imageURL || activeRoom.coverURL}
                alt={activeRoom.title}
                variant="avatar"
                fallbackText={activeRoom.title}
                containerClassName="w-10 h-10 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A] shrink-0"
                className="w-full h-full object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-[#3B6DFF] transition-colors truncate">
                    {activeRoom.title}
                  </h2>
                  {activeRoom.visibility === 'private' ? (
                    <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : activeRoom.visibility === 'staff' ? (
                    <Shield className="w-3.5 h-3.5 text-[#3B6DFF] shrink-0" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] truncate tabular-nums">
                  {members.length || activeRoom.memberCount || 1} عضو
                  {onlineMembersCount > 0 ? ` · ${onlineMembersCount} متصل` : ''}
                  {activeRoom.topic ? ` · ${activeRoom.topic}` : ''}
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isMember && currentUser && (
              <button
                type="button"
                onClick={handleJoinRoom}
                style={{ backgroundColor: activeAccent }}
                className="min-h-[40px] px-3.5 rounded-xl text-white text-xs font-bold cursor-pointer shadow-sm"
              >
                انضمام
              </button>
            )}
            {canRoomPerm('inviteMembers') && (
              <button
                type="button"
                onClick={openInviteUsersModal}
                className="min-w-[44px] min-h-[44px] rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B2232] flex items-center justify-center cursor-pointer"
                title="دعوة أعضاء"
                aria-label="دعوة أعضاء"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setInfoTab('announcements');
                setShowInfoSheet(true);
              }}
              className="min-w-[44px] min-h-[44px] rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B2232] flex items-center justify-center cursor-pointer relative"
              title="إعلانات الغرفة"
              aria-label="إعلانات الغرفة"
            >
              <Megaphone className="w-4 h-4" />
              {announcements.length > 0 && (
                <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setInfoTab('members');
                setShowInfoSheet(true);
              }}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-[#1B2232] text-slate-700 dark:text-slate-200 hover:text-[#3B6DFF] flex items-center justify-center cursor-pointer"
              title="معلومات الغرفة والأعضاء"
              aria-label="معلومات الغرفة والأعضاء"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Pinned Message Strip */}
        {activePinnedMsg && (
          <div className="shrink-0 px-3 py-2 bg-slate-50/95 dark:bg-[#141B2B]/95 border-b border-slate-200 dark:border-[#242B38] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                jumpToMessage(activePinnedMsg.id);
                if (pinnedMessages.length > 1) {
                  setPinnedIdx((prev) => (prev + 1) % pinnedMessages.length);
                }
              }}
              className="flex-1 min-w-0 flex items-center gap-2 text-start cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5 shrink-0" style={{ color: activeAccent }} />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold block" style={{ color: activeAccent }}>
                  رسالة مثبتة ({(pinnedIdx % pinnedMessages.length) + 1}/{pinnedMessages.length}) · {activePinnedMsg.senderName}
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
                  {activePinnedMsg.text || (activePinnedMsg.mediaURL ? 'وسائط مرفقة' : '')}
                </p>
              </div>
            </button>
            {canRoomPerm('pinMessages') && (
              <button
                type="button"
                onClick={async () => {
                  await performRoomModerationAction({
                    roomId: activeRoom.id,
                    action: 'unpin_message',
                    messageId: activePinnedMsg.id,
                  });
                  showToast('تم إلغاء التثبيت.', 'info');
                }}
                className="min-w-[34px] min-h-[34px] rounded-lg text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer shrink-0"
                title="إلغاء تثبيت الرسالة"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Active Room Announcement Strip */}
        {showAnnBanner && latestAnnouncement && (
          <div className="shrink-0 px-3 py-2 bg-amber-500/10 border-b border-amber-500/25 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setInfoTab('announcements');
                setShowInfoSheet(true);
              }}
              className="flex-1 min-w-0 flex items-center gap-2 text-start cursor-pointer"
            >
              <Megaphone className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-900 dark:text-amber-200 font-bold truncate">
                {latestAnnouncement.title}: <span className="font-normal">{latestAnnouncement.content}</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDismissedAnnId(latestAnnouncement.id)}
              className="p-1 text-amber-600 dark:text-amber-300 cursor-pointer shrink-0"
              aria-label="إخفاء الإعلان"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Chat Stream Canvas with Custom Background & Protective Contrast Layer */}
        <div
          style={{
            ...(effectiveBgColor ? { backgroundColor: effectiveBgColor } : {}),
            ...(effectiveBgImg
              ? {
                  backgroundImage: `linear-gradient(rgba(9,13,22,0.58), rgba(9,13,22,0.68)), url(${effectiveBgImg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : {}),
          }}
          className={`flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1.5 ${
            !effectiveBgColor && !effectiveBgImg ? 'chat-canvas-pattern' : ''
          }`}
        >
          {/* Clickable Owner Intro Card */}
          <div className="mx-auto max-w-sm my-2 p-3.5 rounded-2xl bg-white/90 dark:bg-[#131926]/90 backdrop-blur-md border border-slate-200/80 dark:border-[#242B38] text-center space-y-1.5 shadow-xs">
            <p className="text-xs font-extrabold text-slate-900 dark:text-white">{activeRoom.title}</p>
            {activeRoom.description && (
              <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                {activeRoom.description}
              </p>
            )}
            <button
              type="button"
              onClick={() => onSelectAuthor(activeRoom.ownerId)}
              className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline cursor-pointer pt-0.5"
              style={{ color: activeAccent }}
            >
              <Crown className="w-3 h-3" />
              <span>بقيادة {activeRoom.ownerName}</span>
            </button>
          </div>

          {loadingMessages ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center">
              <span className="inline-block px-4 py-2 rounded-2xl bg-white/90 dark:bg-[#161B26]/90 text-xs text-slate-600 dark:text-[#94A3B8]">
                لا توجد رسائل بعد في هذه الغرفة. ابدأ الحديث!
              </span>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = currentUser?.id === msg.senderId;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
              const showDate = !prevMsg || getDateLabel(prevMsg.createdAt) !== getDateLabel(msg.createdAt);
              const isGroupedPrev = Boolean(prevMsg && prevMsg.senderId === msg.senderId && !showDate);
              const isGroupedNext = Boolean(
                nextMsg && nextMsg.senderId === msg.senderId && getDateLabel(nextMsg.createdAt) === getDateLabel(msg.createdAt)
              );
              const senderTitles = getSortedUserTitles({
                customTitle: msg.senderCustomTitle,
                customTitles: msg.senderCustomTitles,
              });
              const reactionsEntries = Object.entries(msg.reactions || {}).filter(([, u]) => u.length > 0);
              const isHighlighted = highlightedMsgId === msg.id;

              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="py-2.5 flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-300/60 dark:bg-white/15" />
                      <span className="px-3 py-0.5 rounded-full bg-white/90 dark:bg-[#161B26]/90 text-[10px] font-bold text-slate-600 dark:text-[#94A3B8]">
                        {getDateLabel(msg.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-slate-300/60 dark:bg-white/15" />
                    </div>
                  )}

                  <div
                    id={`rmsg_${msg.id}`}
                    className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'} ${
                      isGroupedPrev ? 'mt-0.5' : 'mt-3'
                    } ${isHighlighted ? 'ring-2 ring-[#3B6DFF] rounded-2xl p-1 transition-all' : ''}`}
                  >
                    {!isMine && (
                      <div className="w-8 shrink-0">
                        {!isGroupedNext && (
                          <button
                            type="button"
                            onClick={() => onSelectAuthor(msg.senderId)}
                            className="cursor-pointer block"
                          >
                            <MediaImage
                              src={msg.senderPhotoURL}
                              alt={msg.senderName}
                              variant="avatar"
                              fallbackText={msg.senderName}
                              containerClassName="w-8 h-8 rounded-full overflow-hidden border border-white/40 dark:border-[#2A2F3A]"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        )}
                      </div>
                    )}

                    <div className={`max-w-[82%] sm:max-w-[74%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      {!isGroupedPrev && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-1 px-1">
                          {!isMine && (
                            <button
                              type="button"
                              onClick={() => onSelectAuthor(msg.senderId)}
                              className={`text-[11px] font-extrabold cursor-pointer hover:underline ${
                                effectiveBgImg ? 'text-white drop-shadow-sm' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {msg.senderName}
                            </button>
                          )}
                          {msg.senderRoomRole === 'owner' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[9px] font-extrabold">
                              مالك الغرفة
                            </span>
                          )}
                          {(msg.senderRoomRole === 'moderator' || msg.senderRoomRole === 'room_leader') && (
                            <span className="px-1.5 py-0.5 rounded bg-[#3B6DFF]/20 text-[#3B6DFF] text-[9px] font-extrabold">
                              مشرف
                            </span>
                          )}
                          {msg.senderRoomRole === 'deputy_moderator' && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 text-[9px] font-extrabold">
                              نائب مشرف
                            </span>
                          )}
                          {msg.senderRole && msg.senderRole !== 'user' && <RoleBadge role={msg.senderRole} />}
                          {senderTitles.slice(0, 2).map((t, i) => (
                            <CustomTitleBadge key={t.id || `${t.text}_${i}`} title={t} compact />
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1 max-w-full">
                        {isMine && !msg.isDeleted && (
                          <button
                            type="button"
                            onClick={() => setSheetMsg(msg)}
                            className="p-1.5 rounded-full text-slate-400 hover:text-[#3B6DFF] opacity-70 sm:opacity-0 sm:hover:opacity-100 focus:opacity-100 cursor-pointer shrink-0"
                            aria-label="خيارات الرسالة"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div
                          onTouchStart={() => startLongPress(msg)}
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onContextMenu={(e) => {
                            if (!msg.isDeleted) {
                              e.preventDefault();
                              setSheetMsg(msg);
                            }
                          }}
                          style={
                            isMine &&
                            !msg.isDeleted &&
                            (effectiveBubbleTheme === 'classic' || effectiveBubbleTheme === 'glass')
                              ? { backgroundColor: effectiveBubbleTheme === 'glass' ? `${activeAccent}CC` : activeAccent }
                              : undefined
                          }
                          className={`relative px-3.5 py-2 text-[13.5px] leading-relaxed select-text ${
                            msg.isDeleted
                              ? 'bg-white/75 dark:bg-[#161B26]/75 border border-slate-200 dark:border-[#242B38] text-slate-400 italic rounded-2xl text-xs'
                              : getBubbleClasses(isMine, isGroupedNext)
                          }`}
                        >
                          {msg.isDeleted ? (
                            <span>تم حذف هذه الرسالة ({msg.deletedByName || 'إجراء إشرافي'})</span>
                          ) : (
                            <>
                              {msg.replyTo && (
                                <button
                                  type="button"
                                  onClick={() => jumpToMessage(msg.replyTo!.id)}
                                  className={`mb-1.5 w-full text-start p-2 rounded-xl text-[11px] border cursor-pointer ${
                                    isMine
                                      ? 'bg-black/20 border-white/25 text-white/95'
                                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  <span className="font-bold block">{msg.replyTo.senderName}</span>
                                  <span className="line-clamp-1 opacity-90">{msg.replyTo.text}</span>
                                </button>
                              )}

                              {msg.mediaURL && msg.mediaType === 'video' ? (
                                <video
                                  src={msg.mediaURL}
                                  controls
                                  playsInline
                                  className="mb-1.5 max-w-[260px] rounded-xl bg-black"
                                />
                              ) : msg.mediaURL ? (
                                <div
                                  onClick={() => setLightboxUrl(msg.mediaURL!)}
                                  className="mb-1.5 max-w-[260px] rounded-xl overflow-hidden border border-black/10 cursor-pointer"
                                >
                                  <MediaImage
                                    src={msg.mediaURL}
                                    alt=""
                                    variant="chat"
                                    containerClassName="w-full max-h-64 overflow-hidden"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : null}

                              {msg.text && (
                                <p className="whitespace-pre-line break-words text-start">{msg.text}</p>
                              )}

                              <div
                                className={`mt-1 flex items-center justify-end gap-1.5 text-[9.5px] tabular-nums ${
                                  isMine ? 'text-white/80' : 'text-slate-400 dark:text-[#64748B]'
                                }`}
                              >
                                {msg.isPinned && <Pin className="w-2.5 h-2.5" />}
                                {msg.editedAt && <span>(معدّلة)</span>}
                                <span>{formatRelativeTime(msg.createdAt)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {!isMine && !msg.isDeleted && (
                          <button
                            type="button"
                            onClick={() => setSheetMsg(msg)}
                            className="p-1.5 rounded-full text-slate-400 hover:text-[#3B6DFF] opacity-70 sm:opacity-0 sm:hover:opacity-100 focus:opacity-100 cursor-pointer shrink-0"
                            aria-label="خيارات الرسالة"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {reactionsEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 px-1">
                          {reactionsEntries.map(([emoji, users]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() =>
                                currentUser && toggleChatRoomReaction(activeRoom.id, msg, emoji, currentUser.id)
                              }
                              className={`px-2 py-0.5 rounded-full text-[10px] border shadow-xs flex items-center gap-1 cursor-pointer ${
                                currentUser && users.includes(currentUser.id)
                                  ? 'bg-[#3B6DFF]/15 border-[#3B6DFF]/50 text-[#3B6DFF]'
                                  : 'bg-white/95 dark:bg-[#161B26]/95 border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="tabular-nums font-bold">{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Safe-Area Composer */}
        <form
          onSubmit={handleSubmitMessage}
          className="shrink-0 p-2.5 sm:p-3 border-t border-slate-200 dark:border-[#242B38] bg-white/95 dark:bg-[#111622]/95 backdrop-blur-xl space-y-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
        >
          {(replyingTo || editingMsg) && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#3B6DFF]/10 text-xs text-[#3B6DFF]">
              <span className="truncate">
                {editingMsg ? (
                  <>
                    تعديل رسالتك: <strong>{editingMsg.text.slice(0, 45)}</strong>
                  </>
                ) : (
                  <>
                    الرد على <strong>{replyingTo?.senderName}</strong>: {(replyingTo?.text || '').slice(0, 45)}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  if (editingMsg) {
                    setEditingMsg(null);
                    setMsgText('');
                  }
                }}
                className="cursor-pointer shrink-0 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {uploadingMedia && (
            <div className="flex items-center gap-2 text-xs text-[#3B6DFF] px-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>جاري رفع الوسائط... {uploadProgress}%</span>
            </div>
          )}

          {isMutedInRoom ? (
            <div className="min-h-[44px] rounded-2xl bg-red-500/10 border border-red-500/25 px-4 flex items-center justify-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
              <VolumeX className="w-4 h-4 shrink-0" />
              <span>أنت مكتوم من إرسال الرسائل في هذه الغرفة حالياً.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                onChange={handleSendMedia}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!currentUser || uploadingMedia || Boolean(editingMsg)}
                className="min-w-[44px] min-h-[44px] rounded-2xl bg-slate-100 dark:bg-[#1B2232] text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] flex items-center justify-center cursor-pointer disabled:opacity-40"
                aria-label="إرفاق صورة أو فيديو"
              >
                <ImagePlus className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder={
                  editingMsg
                    ? 'اكتب النص المعدّل...'
                    : currentUser
                    ? 'اكتب رسالتك في الغرفة...'
                    : 'سجّل الدخول للمشاركة'
                }
                disabled={!currentUser || sendingMsg}
                className="flex-1 min-h-[44px] bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] focus:border-[#3B6DFF] rounded-2xl px-4 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none"
              />

              <button
                type="submit"
                disabled={!currentUser || !msgText.trim() || sendingMsg}
                style={{ backgroundColor: activeAccent }}
                className="min-w-[44px] min-h-[44px] rounded-2xl text-white flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-md"
                aria-label={editingMsg ? 'حفظ التعديل' : 'إرسال'}
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
        </form>

        {/* Mobile Long-Press / Contextual Action Bottom Sheet */}
        {sheetMsg && (
          <div
            onClick={() => setSheetMsg(null)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-t-3xl sm:rounded-3xl p-4 space-y-3 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#242B38]">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {ROOM_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={async () => {
                        if (currentUser) {
                          await toggleChatRoomReaction(activeRoom.id, sheetMsg, emoji, currentUser.id);
                        }
                        setSheetMsg(null);
                      }}
                      className="min-w-[40px] min-h-[40px] rounded-full bg-slate-100 dark:bg-[#0B0F19] hover:scale-110 transition-transform text-lg flex items-center justify-center cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSheetMsg(null)}
                  className="min-w-[36px] min-h-[36px] rounded-full text-slate-400 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(sheetMsg);
                    setEditingMsg(null);
                    setSheetMsg(null);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <CornerDownLeft className="w-4 h-4 text-[#3B6DFF]" />
                  <span>رد على الرسالة</span>
                </button>

                {sheetMsg.text && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(sheetMsg.text);
                      showToast('تم نسخ نص الرسالة.', 'success');
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>نسخ النص</span>
                  </button>
                )}

                {currentUser?.id === sheetMsg.senderId && sheetMsg.text && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMsg(sheetMsg);
                      setMsgText(sheetMsg.text);
                      setReplyingTo(null);
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 text-emerald-500" />
                    <span>تعديل رسالتي</span>
                  </button>
                )}

                {canRoomPerm('pinMessages') && (
                  <button
                    type="button"
                    onClick={async () => {
                      const isPinned = Boolean(
                        sheetMsg.isPinned || (activeRoom.pinnedMessageIds || []).includes(sheetMsg.id)
                      );
                      await performRoomModerationAction({
                        roomId: activeRoom.id,
                        action: isPinned ? 'unpin_message' : 'pin_message',
                        messageId: sheetMsg.id,
                      });
                      showToast(isPinned ? 'تم إلغاء التثبيت.' : 'تم تثبيت الرسالة في الغرفة.', 'success');
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2534] flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Pin className="w-4 h-4 text-amber-500" />
                    <span>
                      {sheetMsg.isPinned || (activeRoom.pinnedMessageIds || []).includes(sheetMsg.id)
                        ? 'إلغاء تثبيت الرسالة'
                        : 'تثبيت الرسالة'}
                    </span>
                  </button>
                )}

                {currentUser?.id === sheetMsg.senderId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteOwnChatRoomMessage(activeRoom.id, sheetMsg.id);
                      showToast('تم حذف رسالتك.', 'info');
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-red-500/10 flex items-center gap-3 text-xs font-bold text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف رسالتي</span>
                  </button>
                )}

                {currentUser?.id !== sheetMsg.senderId && canRoomPerm('deleteMessages') && (
                  <button
                    type="button"
                    onClick={async () => {
                      await performRoomModerationAction({
                        roomId: activeRoom.id,
                        action: 'mod_delete_message',
                        messageId: sheetMsg.id,
                        targetUserId: sheetMsg.senderId,
                        targetUserName: sheetMsg.senderName,
                      });
                      showToast('تم حذف الرسالة بواسطة المشرف.', 'info');
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-red-500/10 flex items-center gap-3 text-xs font-bold text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف كمشرف</span>
                  </button>
                )}

                {currentUser && currentUser.id !== sheetMsg.senderId && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportTargetMsg(sheetMsg);
                      setReportReason('');
                      setSheetMsg(null);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl hover:bg-amber-500/10 flex items-center gap-3 text-xs font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                  >
                    <Flag className="w-4 h-4" />
                    <span>إبلاغ عن الرسالة</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Room Info, Staff Roles, Announcements, Appearance & Moderation Logs Sheet */}
        {showInfoSheet && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg max-h-[90dvh] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl font-ar">
              {/* Cover Banner & Close */}
              <div className="relative h-28 bg-slate-900 shrink-0">
                {(activeRoom.coverURL || activeRoom.imageURL) ? (
                  <MediaImage
                    src={activeRoom.coverURL || activeRoom.imageURL}
                    alt={activeRoom.title}
                    variant="banner"
                    containerClassName="w-full h-full overflow-hidden"
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: `linear-gradient(135deg, ${activeAccent}66, #0B0F19)` }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <button
                  type="button"
                  onClick={() => setShowInfoSheet(false)}
                  className="absolute top-3 end-3 min-w-[36px] min-h-[36px] rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 start-4 end-14 flex items-center gap-3">
                  <MediaImage
                    src={activeRoom.imageURL}
                    alt={activeRoom.title}
                    variant="avatar"
                    fallbackText={activeRoom.title}
                    containerClassName="w-12 h-12 rounded-2xl border-2 border-white/80 overflow-hidden shrink-0"
                    className="w-full h-full object-cover"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-white truncate">{activeRoom.title}</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInfoSheet(false);
                        onSelectAuthor(activeRoom.ownerId);
                      }}
                      className="text-[11px] text-amber-300 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Crown className="w-3 h-3" />
                      <span>المالك: {activeRoom.ownerName}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons Bar (Join/Leave, Mute Notifications) */}
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#242B38] flex items-center justify-between gap-2 flex-wrap shrink-0">
                <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                  {members.length} عضو · {(activeRoom.mutedUserIds || []).length} مكتوم · {(activeRoom.bannedUserIds || []).length} محظور
                </span>
                <div className="flex items-center gap-1.5">
                  {isMember && currentUser && (
                    <button
                      type="button"
                      onClick={async () => {
                        const nextMute = !currentMember?.isNotificationsMuted;
                        await toggleRoomNotificationsMute(activeRoom.id, currentUser.id, nextMute);
                        showToast(nextMute ? 'تم كتم إشعارات الغرفة.' : 'تم تفعيل إشعارات الغرفة.', 'info');
                      }}
                      className="min-h-[36px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {currentMember?.isNotificationsMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      <span>{currentMember?.isNotificationsMuted ? 'مكتومة' : 'الإشعارات'}</span>
                    </button>
                  )}
                  {!isMember && currentUser && (
                    <button
                      type="button"
                      onClick={handleJoinRoom}
                      className="min-h-[36px] px-3 rounded-xl bg-[#3B6DFF] text-white text-[11px] font-bold cursor-pointer"
                    >
                      انضمام للغرفة
                    </button>
                  )}
                </div>
              </div>

              {/* Info Sub-tabs */}
              <div className="px-3 pt-2 border-b border-slate-200 dark:border-[#242B38] flex items-center gap-1 overflow-x-auto scrollbar-hide shrink-0">
                {[
                  { id: 'members', label: 'الأعضاء والصلاحيات', icon: Users },
                  { id: 'announcements', label: `الإعلانات (${announcements.length})`, icon: Megaphone },
                  { id: 'appearance', label: 'المظهر', icon: Palette },
                  ...(isRoomModerator || isDeputy ? [{ id: 'logs', label: 'سجل الإشراف', icon: History }] : []),
                ].map((t) => {
                  const Icon = t.icon;
                  const active = infoTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInfoTab(t.id as any)}
                      className={`min-h-[40px] px-3 rounded-t-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                        active
                          ? 'border-[#3B6DFF] text-[#3B6DFF]'
                          : 'border-transparent text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {infoTab === 'members' && (
                  <div className="space-y-4">
                    {activeRoom.description && (
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {activeRoom.description}
                      </div>
                    )}

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="ابحث بين أعضاء الغرفة..."
                        className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] ps-9 pe-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                      />
                    </div>

                    {[
                      { title: 'مالك الغرفة', list: ownerMembers },
                      { title: 'المشرفون', list: modMembers },
                      { title: 'نواب المشرفين', list: deputyMembers },
                      { title: 'الأعضاء', list: regularMembers },
                    ]
                      .filter((grp) => grp.list.length > 0)
                      .map((grp) => {
                        const filteredList = grp.list.filter(
                          (m) =>
                            !memberSearch.trim() ||
                            m.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
                            m.handle.toLowerCase().includes(memberSearch.toLowerCase())
                        );
                        if (filteredList.length === 0) return null;
                        return (
                          <div key={grp.title} className="space-y-1.5">
                            <h4 className="text-[11px] font-extrabold text-slate-500 dark:text-[#94A3B8] uppercase">
                              {grp.title} ({filteredList.length})
                            </h4>
                            {filteredList.map((m) => {
                              const isTargetOwner = m.userId === activeRoom.ownerId || m.role === 'owner';
                              const isTargetMuted = (activeRoom.mutedUserIds || []).includes(m.userId);
                              const canModThis = Boolean(
                                currentUser && m.userId !== currentUser.id && !isTargetOwner
                              );
                              return (
                                <div
                                  key={m.userId}
                                  className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowInfoSheet(false);
                                        onSelectAuthor(m.userId);
                                      }}
                                      className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
                                    >
                                      <MediaImage
                                        src={m.photoURL}
                                        alt={m.displayName}
                                        variant="avatar"
                                        fallbackText={m.displayName}
                                        containerClassName="w-9 h-9 rounded-full overflow-hidden shrink-0"
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                            {m.displayName}
                                          </span>
                                          {m.isVerified && (
                                            <VerifiedBadge
                                              category={m.verificationCategory || 'blue'}
                                              className="w-3.5 h-3.5"
                                              interactive={false}
                                            />
                                          )}
                                          {isTargetMuted && (
                                            <VolumeX className="w-3 h-3 text-red-500 shrink-0" />
                                          )}
                                        </div>
                                        <span className="font-handle text-[10px] text-slate-500 block">
                                          @{m.handle}
                                        </span>
                                      </div>
                                    </button>

                                    {canModThis && (
                                      <div className="flex items-center gap-1 flex-wrap justify-end">
                                        {(isRoomOwner || isPlatformRoomAdmin) && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const nextAction =
                                                  m.role === 'moderator' || m.role === 'room_leader'
                                                    ? 'demote_member'
                                                    : 'appoint_moderator';
                                                await performRoomModerationAction({
                                                  roomId: activeRoom.id,
                                                  action: nextAction,
                                                  targetUserId: m.userId,
                                                  targetUserName: m.displayName,
                                                });
                                                showToast('تم تحديث دور العضو.', 'success');
                                              }}
                                              className="px-2 py-1 rounded-lg bg-[#3B6DFF]/10 text-[#3B6DFF] text-[10px] font-bold cursor-pointer"
                                            >
                                              {m.role === 'moderator' || m.role === 'room_leader' ? 'إزالة الإشراف' : 'مشرف'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setDeputyPermTarget(m);
                                                setDeputyPermsDraft(m.permissions || { deleteMessages: true, pinMessages: true, muteMembers: true });
                                              }}
                                              className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                              title="صلاحيات نائب المشرف"
                                            >
                                              <Sliders className="w-3 h-3" />
                                              <span>نائب</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setTransferTarget(m)}
                                              className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold cursor-pointer"
                                              title="نقل ملكية الغرفة"
                                            >
                                              نقل الملكية
                                            </button>
                                          </>
                                        )}

                                        {canRoomPerm('muteMembers') && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await performRoomModerationAction({
                                                roomId: activeRoom.id,
                                                action: isTargetMuted ? 'unmute_member' : 'mute_member',
                                                targetUserId: m.userId,
                                                targetUserName: m.displayName,
                                              });
                                              showToast(isTargetMuted ? 'تم إلغاء كتم العضو.' : 'تم كتم العضو.', 'info');
                                            }}
                                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1B2232] cursor-pointer"
                                            title={isTargetMuted ? 'إلغاء الكتم' : 'كتم العضو'}
                                          >
                                            {isTargetMuted ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5" />}
                                          </button>
                                        )}

                                        {canRoomPerm('kickMembers') && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await performRoomModerationAction({
                                                roomId: activeRoom.id,
                                                action: 'kick',
                                                targetUserId: m.userId,
                                                targetUserName: m.displayName,
                                              });
                                              showToast(`تم طرد ${m.displayName}.`, 'info');
                                            }}
                                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10 cursor-pointer"
                                            title="طرد من الغرفة"
                                          >
                                            <UserX className="w-3.5 h-3.5" />
                                          </button>
                                        )}

                                        {canRoomPerm('banMembers') && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await performRoomModerationAction({
                                                roomId: activeRoom.id,
                                                action: 'ban',
                                                targetUserId: m.userId,
                                                targetUserName: m.displayName,
                                              });
                                              showToast(`تم حظر ${m.displayName}.`, 'info');
                                            }}
                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer"
                                            title="حظر من الغرفة"
                                          >
                                            <Ban className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}

                    {/* Banned Users Unban List */}
                    {(activeRoom.bannedUserIds || []).length > 0 && canRoomPerm('banMembers') && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#242B38]">
                        <h4 className="text-[11px] font-extrabold text-red-500">
                          المحظورون من الغرفة ({activeRoom.bannedUserIds.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {activeRoom.bannedUserIds.map((uid) => (
                            <button
                              key={uid}
                              type="button"
                              onClick={async () => {
                                await performRoomModerationAction({
                                  roomId: activeRoom.id,
                                  action: 'unban',
                                  targetUserId: uid,
                                });
                                showToast('تم رفع الحظر عن العضو.', 'success');
                              }}
                              className="px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/25 text-[11px] font-bold text-red-500 cursor-pointer"
                            >
                              رفع حظر {uid.slice(0, 8)}...
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {infoTab === 'announcements' && (
                  <div className="space-y-4">
                    {canRoomPerm('manageAnnouncements') && (
                      <form
                        onSubmit={handleCreateAnnouncement}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-2.5"
                      >
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">نشر إعلان جديد للغرفة</h4>
                        <input
                          type="text"
                          value={annTitle}
                          onChange={(e) => setAnnTitle(e.target.value)}
                          placeholder="عنوان الإعلان..."
                          required
                          className="w-full min-h-[38px] rounded-xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] px-3 text-xs text-slate-900 dark:text-white"
                        />
                        <textarea
                          rows={2}
                          value={annContent}
                          onChange={(e) => setAnnContent(e.target.value)}
                          placeholder="تفاصيل الإعلان والقوانين..."
                          required
                          className="w-full rounded-xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] p-2.5 text-xs text-slate-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          disabled={savingAnn}
                          className="min-h-[38px] px-4 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {savingAnn ? 'جاري النشر...' : 'نشر الإعلان'}
                        </button>
                      </form>
                    )}

                    {announcements.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">لا توجد إعلانات مثبتة في هذه الغرفة بعد.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {announcements.map((ann) => (
                          <div
                            key={ann.id}
                            className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/25 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="text-xs font-extrabold text-slate-900 dark:text-white">{ann.title}</h5>
                              {canRoomPerm('manageAnnouncements') && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await performRoomModerationAction({
                                      roomId: activeRoom.id,
                                      action: 'announcement_delete',
                                      announcementId: ann.id,
                                    });
                                    showToast('تم حذف الإعلان.', 'info');
                                  }}
                                  className="text-red-500 p-1 cursor-pointer"
                                  title="حذف الإعلان"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">{ann.content}</p>
                            <p className="text-[10px] text-slate-400">
                              بواسطة {ann.authorName} · {formatRelativeTime(ann.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {infoTab === 'appearance' && (
                  <div className="space-y-5">
                    {/* Personal Display Override (does not modify global room theme) */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">تفضيلات عرضي الشخصي</h4>
                          <p className="text-[11px] text-slate-500">تؤثر على جهازك فقط ولا تغير مظهر الغرفة لبقية الأعضاء</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSavePersonalPrefs(!personalUseRoomTheme, personalBubbleTheme)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer ${
                            personalUseRoomTheme
                              ? 'bg-[#3B6DFF] text-white'
                              : 'bg-slate-200 dark:bg-[#1B2232] text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {personalUseRoomTheme ? 'مظهر الغرفة مفعّل' : 'الوضع الافتراضي الهادئ'}
                        </button>
                      </div>
                      {!personalUseRoomTheme && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['classic', 'glass', 'minimal', 'gold'] as const).map((bt) => (
                            <button
                              key={bt}
                              type="button"
                              onClick={() => void handleSavePersonalPrefs(false, bt)}
                              className={`py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${
                                personalBubbleTheme === bt
                                  ? 'border-[#3B6DFF] bg-[#3B6DFF]/15 text-[#3B6DFF]'
                                  : 'border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {bt === 'classic' ? 'كلاسيكي' : bt === 'glass' ? 'زجاجي' : bt === 'minimal' ? 'بسيط' : 'ذهبي'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Global Room Appearance Editor (Owner / Moderator / Deputy with perm) */}
                    {canRoomPerm('manageAppearance') && (
                      <form onSubmit={handleSaveRoomAppearance} className="space-y-3.5">
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                          تخصيص المظهر العام للغرفة
                        </h4>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-slate-500">اسم الغرفة ووصفها</label>
                          <input
                            type="text"
                            value={appTitle}
                            onChange={(e) => setAppTitle(e.target.value)}
                            className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] px-3 text-xs text-slate-900 dark:text-white"
                          />
                          <textarea
                            rows={2}
                            value={appDesc}
                            onChange={(e) => setAppDesc(e.target.value)}
                            className="w-full rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] p-2.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'أيقونة الغرفة', field: 'imageURL' as const, val: appImageURL },
                            { label: 'غلاف الغرفة', field: 'coverURL' as const, val: appCoverURL },
                            { label: 'خلفية الدردشة', field: 'bgImageURL' as const, val: appBgImageURL },
                          ].map((item) => (
                            <label
                              key={item.field}
                              className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-dashed border-slate-300 dark:border-[#2A2F3A] text-center cursor-pointer space-y-1"
                            >
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleUploadAppearanceImage(f, item.field);
                                }}
                              />
                              <ImagePlus className="w-4 h-4 mx-auto text-[#3B6DFF]" />
                              <span className="text-[10px] font-bold block text-slate-700 dark:text-slate-200">{item.label}</span>
                              {item.val && <span className="text-[9px] text-emerald-500 block">محددة</span>}
                            </label>
                          ))}
                        </div>

                        {appBgImageURL && (
                          <button
                            type="button"
                            onClick={() => setAppBgImageURL('')}
                            className="text-[11px] font-bold text-red-500 cursor-pointer"
                          >
                            إزالة صورة خلفية الدردشة
                          </button>
                        )}

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-slate-500">لون التمييز</label>
                          <div className="flex items-center gap-2">
                            {ACCENT_PRESETS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setAppAccentColor(c)}
                                style={{ backgroundColor: c }}
                                className={`w-7 h-7 rounded-full cursor-pointer ${
                                  appAccentColor === c ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white' : ''
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-slate-500">لون الخلفية</label>
                          <div className="flex items-center gap-2">
                            {BG_COLOR_PRESETS.map((c) => (
                              <button
                                key={c || 'default'}
                                type="button"
                                onClick={() => setAppBgColor(c)}
                                style={{ backgroundColor: c || '#F1F5F9' }}
                                className={`w-7 h-7 rounded-full border border-slate-300 dark:border-white/20 cursor-pointer ${
                                  appBgColor === c ? 'ring-2 ring-offset-2 ring-[#3B6DFF]' : ''
                                }`}
                                title={c || 'افتراضي'}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-slate-500">نمط فقاعات الرسائل</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['classic', 'glass', 'minimal', 'gold'] as const).map((bt) => (
                              <button
                                key={bt}
                                type="button"
                                onClick={() => setAppBubbleTheme(bt)}
                                className={`py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${
                                  appBubbleTheme === bt
                                    ? 'border-[#3B6DFF] bg-[#3B6DFF]/15 text-[#3B6DFF]'
                                    : 'border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {bt === 'classic' ? 'كلاسيكي' : bt === 'glass' ? 'زجاجي' : bt === 'minimal' ? 'بسيط' : 'ذهبي'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={savingAppearance || uploadingAppearanceMedia}
                          className="w-full min-h-[42px] rounded-2xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {savingAppearance ? 'جاري الحفظ...' : 'حفظ مظهر الغرفة للجميع'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {infoTab === 'logs' && (
                  <div className="space-y-2">
                    {modLogs.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">لا توجد سجلات إشراف في هذه الغرفة بعد.</p>
                    ) : (
                      modLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] text-xs space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">{log.actorName}</span>
                            <span className="text-[10px] text-slate-400">{formatRelativeTime(log.createdAt)}</span>
                          </div>
                          <p className="text-[11px] text-[#3B6DFF] font-mono-subtle">{log.action}</p>
                          {log.targetName && <p className="text-[11px] text-slate-500">المستهدف: {log.targetName}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-3.5 border-t border-slate-200 dark:border-[#242B38] flex items-center justify-between gap-2 shrink-0">
                {!isRoomOwner && isMember && (
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    className="flex-1 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>مغادرة الغرفة</span>
                  </button>
                )}
                {(isRoomOwner || isPlatformRoomAdmin) && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRoom(true)}
                    className="flex-1 min-h-[42px] rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف الغرفة</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deputy Moderator Permission Editor Modal */}
        {deputyPermTarget && (
          <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 font-ar">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  صلاحيات نائب المشرف: {deputyPermTarget.displayName}
                </h3>
                <button
                  type="button"
                  onClick={() => setDeputyPermTarget(null)}
                  className="p-1 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {PERMISSION_LABELS.map((item) => {
                  const checked = Boolean(deputyPermsDraft[item.key]);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setDeputyPermsDraft((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                      }
                      className={`w-full min-h-[40px] px-3 rounded-xl border flex items-center justify-between text-xs font-bold cursor-pointer ${
                        checked
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span>{item.label}</span>
                      {checked && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeputyPermTarget(null)}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={savingPerm}
                  onClick={handleSaveDeputyPermissions}
                  className="py-2.5 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingPerm ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Ownership Confirm Modal */}
        {transferTarget && (
          <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 font-ar">
              <h3 className="text-sm font-extrabold text-amber-500">تأكيد نقل ملكية الغرفة</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                هل أنت متأكد من نقل ملكية الغرفة إلى <strong>{transferTarget.displayName}</strong>؟ ستصبح مشرفاً بعد النقل.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransferTarget(null)}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={transferringOwnership}
                  onClick={handleTransferOwnership}
                  className="py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {transferringOwnership ? 'جاري النقل...' : 'تأكيد النقل'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Report Message Modal */}
        {reportTargetMsg && (
          <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4">
            <form
              onSubmit={handleSubmitMessageReport}
              className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 font-ar"
            >
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">الإبلاغ عن رسالة في الغرفة</h3>
              <p className="text-xs text-slate-500 truncate">
                المرسل: {reportTargetMsg.senderName}
              </p>
              <textarea
                rows={3}
                required
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="اذكر سبب الإبلاغ..."
                className="w-full rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#242B38] p-3 text-xs text-slate-900 dark:text-white"
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

        {/* Invite Users Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">دعوة أعضاء إلى الغرفة</h3>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="ابحث بالاسم أو @اسم المستخدم..."
                className="w-full min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
              />
              <div className="max-h-72 overflow-y-auto space-y-2">
                {directoryUsers
                  .filter(
                    (u) =>
                      u.id !== currentUser?.id &&
                      (!inviteSearch.trim() ||
                        u.displayName.toLowerCase().includes(inviteSearch.toLowerCase()) ||
                        u.handle.toLowerCase().includes(inviteSearch.toLowerCase()))
                  )
                  .slice(0, 20)
                  .map((u) => {
                    const alreadyAllowed = (activeRoom.allowedUserIds || []).includes(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19]">
                        <div className="flex items-center gap-2 min-w-0">
                          <MediaImage
                            src={u.photoURL}
                            alt={u.displayName}
                            variant="avatar"
                            fallbackText={u.displayName}
                            containerClassName="w-8 h-8 rounded-full overflow-hidden shrink-0"
                            className="w-full h-full object-cover"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{u.displayName}</p>
                            <p className="font-handle text-[11px] text-slate-500">@{u.handle}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={invitingUserId === u.id || alreadyAllowed}
                          onClick={() => handleInviteUser(u)}
                          className="px-3 py-1.5 rounded-lg bg-[#3B6DFF] text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer"
                        >
                          {alreadyAllowed ? 'مدعو' : invitingUserId === u.id ? '...' : 'دعوة'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Delete Room Confirmation */}
        {confirmDeleteRoom && (
          <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 font-ar">
              <h3 className="text-sm font-extrabold text-red-600 dark:text-red-400">تأكيد حذف غرفة الدردشة</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيتم حذف الغرفة وجميع رسائلها بشكل نهائي. هل تريد المتابعة؟
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteRoom(false)}
                  className="py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={deletingRoom}
                  onClick={handleDeleteRoom}
                  className="py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {deletingRoom ? 'جاري الحذف...' : 'تأكيد الحذف'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Lightbox */}
        {lightboxUrl && (
          <div
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 end-4 min-w-[44px] min-h-[44px] rounded-full bg-white/10 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={lightboxUrl} alt="" className="max-w-full max-h-[90vh] object-contain rounded-xl" />
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // STANDALONE CHAT ROOMS HUB LIST
  // ============================================================================
  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-ar">
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">غرف الدردشة</h1>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
            غرف حوار حيّة ومباشرة بمظهر مخصص وصلاحيات متكاملة
          </p>
        </div>

        {currentUser && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[44px] px-4 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer shadow-lg shadow-[#3B6DFF]/20"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>إنشاء غرفة</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن غرفة دردشة أو موضوع..."
            className="w-full min-h-[44px] bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] focus:border-[#3B6DFF] rounded-2xl ps-10 pe-4 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'mine', label: 'غرفي' },
            { id: 'public', label: 'عامة' },
            { id: 'private', label: 'خاصة' },
            ...(isStaff ? [{ id: 'staff', label: 'الإشراف' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                filter === tab.id
                  ? 'bg-[#3B6DFF] text-white'
                  : 'bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#3B6DFF] mb-2" />
          <span className="text-xs">جاري تحميل غرف الدردشة...</span>
        </div>
      ) : visibleRooms.length === 0 ? (
        <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#3B6DFF]/10 text-[#3B6DFF] flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            لا توجد غرف دردشة متاحة حالياً
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-xs mx-auto leading-relaxed">
            أنشئ أول غرفة دردشة حقيقية لتبدأ النقاش المباشر مع الأعضاء وتدير الصلاحيات والمظهر بكل سهولة.
          </p>
          {currentUser && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-2 min-h-[44px] px-5 rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>إنشاء غرفة دردشة</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visibleRooms.map((room) => (
            <div
              key={room.id}
              className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#242B38] hover:border-[#3B6DFF]/50 rounded-2xl p-4 flex items-center gap-3.5 transition-all"
            >
              <button
                type="button"
                onClick={() => handleOpenRoom(room, false)}
                className="flex-1 min-w-0 flex items-center gap-3.5 text-start cursor-pointer group"
              >
                <MediaImage
                  src={room.imageURL || room.coverURL}
                  alt={room.title}
                  variant="avatar"
                  fallbackText={room.title}
                  containerClassName="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A] shrink-0"
                  className="w-full h-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-[#3B6DFF] transition-colors">
                        {room.title}
                      </h3>
                      {room.visibility === 'private' ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : room.visibility === 'staff' ? (
                        <Shield className="w-3.5 h-3.5 text-[#3B6DFF] shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {room.memberCount || 1} عضو
                    </span>
                  </div>

                  {room.description && (
                    <p className="text-xs text-slate-600 dark:text-[#94A3B8] truncate mt-0.5">
                      {room.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-[#64748B]">
                    <span className="truncate">
                      {room.lastMessageText
                        ? `${room.lastMessageSenderName || 'عضو'}: ${room.lastMessageText}`
                        : `بقيادة ${room.ownerName}`}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatRelativeTime(room.lastMessageAt || room.createdAt)}
                    </span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOpenRoom(room, true)}
                className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-500 hover:text-[#3B6DFF] flex items-center justify-center shrink-0 cursor-pointer"
                title="معلومات الغرفة"
                aria-label="معلومات الغرفة"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRoom}
            className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 space-y-4 shadow-2xl font-ar"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">إنشاء غرفة دردشة جديدة</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setRoomCoverFile(f);
                    setRoomCoverPreview(URL.createObjectURL(f));
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#2A2F3A] flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#0B0F19] shrink-0 cursor-pointer"
              >
                {roomCoverPreview ? (
                  <img src={roomCoverPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-slate-400" />
                )}
              </button>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-white">صورة الغرفة (اختياري)</p>
                <p className="text-[11px] text-slate-500">تُرفع مباشرة إلى Supabase Storage</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم الغرفة *</label>
                <input
                  type="text"
                  required
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="مثال: غرفة التصميم والمطورين"
                  className="w-full min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">وصف مختصر</label>
                <textarea
                  rows={2}
                  value={roomDesc}
                  onChange={(e) => setRoomDesc(e.target.value)}
                  placeholder="قواعد الغرفة وهدف النقاش..."
                  className="w-full rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] p-3 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">التصنيف / الموضوع</label>
                <input
                  type="text"
                  value={roomTopic}
                  onChange={(e) => setRoomTopic(e.target.value)}
                  placeholder="تقنية، نقاش عام، ألعاب..."
                  className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">صلاحية الوصول</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'public', label: 'عامة', icon: Globe },
                    { id: 'private', label: 'خاصة (بدعوة)', icon: Lock },
                    ...(isStaff ? [{ id: 'staff', label: 'طاقم الإدارة', icon: Shield }] : []),
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = roomVisibility === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRoomVisibility(opt.id as ChatRoomVisibility)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                          active
                            ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF]'
                            : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={creatingRoom}
              className="w-full min-h-[44px] rounded-2xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {creatingRoom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{creatingRoom ? 'جاري الإنشاء...' : 'إنشاء وفتح الغرفة'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
