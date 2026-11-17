import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  Unsubscribe,
  Query,
  DocumentData
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import {
  ChatRoom,
  ChatRoomAnnouncement,
  ChatRoomAppearance,
  ChatRoomMember,
  ChatRoomMessage,
  ChatRoomModerationLog,
  ChatRoomVisibility,
  RoomPermissions,
  UserProfile
} from '../types';
import { awardUserXp, createNotification, recordAuditLog } from './firestore';

function cleanObj<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out as T;
}

export function listenToChatRooms(
  user: UserProfile | null,
  callback: (rooms: ChatRoom[]) => void
): Unsubscribe {
  const buckets = new Map<string, Map<string, ChatRoom>>();
  const unsubs: Unsubscribe[] = [];

  const isStaff =
    user?.role === 'owner' ||
    user?.role === 'admin' ||
    user?.role === 'assistant_admin' ||
    user?.role === 'room_leader' ||
    user?.role === 'moderator' ||
    Boolean(user?.globalPermissions?.manageRooms);

  const emitMerged = () => {
    const merged = new Map<string, ChatRoom>();
    buckets.forEach((bucketMap) => {
      bucketMap.forEach((room, roomId) => {
        merged.set(roomId, room);
      });
    });

    const visible: ChatRoom[] = [];
    merged.forEach((room) => {
      if (user && (room.bannedUserIds || []).includes(user.id)) return;
      const canSee =
        room.visibility === 'public' ||
        (user &&
          (isStaff ||
            room.ownerId === user.id ||
            (room.leaderIds || []).includes(user.id) ||
            (room.moderatorIds || []).includes(user.id) ||
            (room.deputyIds || []).includes(user.id) ||
            (room.allowedUserIds || []).includes(user.id)));
      if (canSee) {
        visible.push(room);
      }
    });

    visible.sort((a, b) =>
      (b.lastMessageAt || b.createdAt || '').localeCompare(a.lastMessageAt || a.createdAt || '')
    );
    callback(visible);
  };

  const attachBucket = (key: string, qRef: Query<DocumentData>) => {
    buckets.set(key, new Map());
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const nextMap = new Map<string, ChatRoom>();
        snap.forEach((d) => {
          nextMap.set(d.id, { id: d.id, ...(d.data() as Record<string, any>) } as ChatRoom);
        });
        buckets.set(key, nextMap);
        emitMerged();
      },
      () => {
        buckets.set(key, new Map());
        emitMerged();
      }
    );
    unsubs.push(unsub);
  };

  attachBucket(
    'public',
    query(collection(db, 'chatRooms'), where('visibility', '==', 'public'), limit(300))
  );

  if (user?.id) {
    attachBucket(
      'owner',
      query(collection(db, 'chatRooms'), where('ownerId', '==', user.id), limit(100))
    );
    attachBucket(
      'allowed',
      query(collection(db, 'chatRooms'), where('allowedUserIds', 'array-contains', user.id), limit(100))
    );
    attachBucket(
      'leader',
      query(collection(db, 'chatRooms'), where('leaderIds', 'array-contains', user.id), limit(100))
    );
    attachBucket(
      'moderator',
      query(collection(db, 'chatRooms'), where('moderatorIds', 'array-contains', user.id), limit(100))
    );
    attachBucket(
      'deputy',
      query(collection(db, 'chatRooms'), where('deputyIds', 'array-contains', user.id), limit(100))
    );
    if (isStaff) {
      attachBucket('staff_all', query(collection(db, 'chatRooms'), limit(300)));
    }
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // ignore cleanup error
      }
    });
  };
}

export function listenToAllChatRoomsForAdmin(
  callback: (rooms: ChatRoom[]) => void
): Unsubscribe {
  const q = query(collection(db, 'chatRooms'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const items: ChatRoom[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Record<string, any>) } as ChatRoom));
      items.sort((a, b) =>
        (b.lastMessageAt || b.createdAt || '').localeCompare(a.lastMessageAt || a.createdAt || '')
      );
      callback(items);
    },
    () => callback([])
  );
}

export function listenToChatRoom(
  roomId: string,
  callback: (room: ChatRoom | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'chatRooms', roomId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as ChatRoom) : null),
    () => callback(null)
  );
}

export function listenToChatRoomMembers(
  roomId: string,
  callback: (members: ChatRoomMember[]) => void
): Unsubscribe {
  const q = query(collection(db, 'chatRooms', roomId, 'members'), limit(150));
  return onSnapshot(
    q,
    (snap) => {
      const items: ChatRoomMember[] = [];
      snap.forEach((d) => items.push(d.data() as ChatRoomMember));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToChatRoomMessages(
  roomId: string,
  callback: (messages: ChatRoomMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chatRooms', roomId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: ChatRoomMessage[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as ChatRoomMessage));
      callback(items);
    },
    () => callback([])
  );
}

export async function createChatRoom(
  payload: {
    title: string;
    description: string;
    topic?: string;
    visibility: ChatRoomVisibility;
    imageURL?: string;
    coverURL?: string;
    coverPath?: string;
    appearance?: ChatRoomAppearance;
    invitedUserIds?: string[];
  },
  owner: UserProfile
): Promise<ChatRoom> {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `chatRooms/${roomId}`;
  try {
    const now = new Date().toISOString();
    const room: ChatRoom = cleanObj({
      id: roomId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      topic: payload.topic?.trim() || '',
      imageURL: payload.imageURL || '',
      coverURL: payload.coverURL || '',
      coverPath: payload.coverPath || undefined,
      visibility: payload.visibility,
      ownerId: owner.id,
      ownerName: owner.displayName,
      leaderIds: [owner.id],
      moderatorIds: [],
      deputyIds: [],
      allowedUserIds: Array.from(new Set([owner.id, ...(payload.invitedUserIds || [])])),
      bannedUserIds: [],
      mutedUserIds: [],
      pinnedMessageIds: [],
      appearance: payload.appearance || {
        accentColor: '#3B6DFF',
        bubbleTheme: 'classic',
      },
      isReadOnly: false,
      memberCount: 1,
      lastMessageText: '',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'chatRooms', roomId), room);

    const ownerMember: ChatRoomMember = cleanObj({
      userId: owner.id,
      roomId,
      displayName: owner.displayName,
      handle: owner.handle,
      photoURL: owner.photoURL || '',
      role: 'owner',
      isVerified: owner.isVerified,
      verificationCategory: owner.verificationCategory,
      customTitle: owner.customTitle || null,
      customTitles: owner.customTitles || (owner.customTitle ? [owner.customTitle] : []),
      lastReadAt: now,
      joinedAt: now,
    });

    await setDoc(doc(db, 'chatRooms', roomId, 'members', owner.id), ownerMember);
    return room;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function joinChatRoom(room: ChatRoom, user: UserProfile): Promise<void> {
  if ((room.bannedUserIds || []).includes(user.id)) {
    throw new Error('تم حظرك من دخول هذه الغرفة.');
  }
  const canJoinPrivate =
    room.visibility !== 'private' ||
    room.ownerId === user.id ||
    (room.allowedUserIds || []).includes(user.id) ||
    user.role === 'owner' ||
    user.role === 'admin' ||
    user.role === 'assistant_admin';

  if (!canJoinPrivate) {
    throw new Error('هذه غرفة خاصة وتحتاج إلى دعوة من قائد الغرفة.');
  }

  const memberRef = doc(db, 'chatRooms', room.id, 'members', user.id);
  const existing = await getDoc(memberRef).catch(() => null);
  if (existing?.exists()) return;

  const memberRole: ChatRoomMember['role'] =
    room.ownerId === user.id
      ? 'owner'
      : (room.leaderIds || []).includes(user.id)
      ? 'room_leader'
      : (room.moderatorIds || []).includes(user.id)
      ? 'moderator'
      : (room.deputyIds || []).includes(user.id)
      ? 'deputy_moderator'
      : 'member';

  const member: ChatRoomMember = cleanObj({
    userId: user.id,
    roomId: room.id,
    displayName: user.displayName,
    handle: user.handle,
    photoURL: user.photoURL || '',
    role: memberRole,
    isVerified: user.isVerified,
    verificationCategory: user.verificationCategory,
    customTitle: user.customTitle || null,
    customTitles: user.customTitles || (user.customTitle ? [user.customTitle] : []),
    lastReadAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  });

  await setDoc(memberRef, member);
  await updateDoc(doc(db, 'chatRooms', room.id), {
    memberCount: increment(1),
    updatedAt: new Date().toISOString(),
  }).catch(() => {});
}

export async function leaveChatRoom(roomId: string, userId: string): Promise<void> {
  const memberRef = doc(db, 'chatRooms', roomId, 'members', userId);
  const snap = await getDoc(memberRef).catch(() => null);
  if (snap?.exists()) {
    await deleteDoc(memberRef);
    await updateDoc(doc(db, 'chatRooms', roomId), {
      memberCount: increment(-1),
      leaderIds: arrayRemove(userId),
      moderatorIds: arrayRemove(userId),
      deputyIds: arrayRemove(userId),
    }).catch(() => {});
  }
}

export async function sendChatRoomMessage(
  room: ChatRoom,
  sender: UserProfile,
  payload: {
    text: string;
    messageType?: ChatRoomMessage['messageType'];
    mediaURL?: string;
    mediaType?: 'image' | 'video';
    audioURL?: string;
    audioDurationSec?: number;
    stickerId?: string;
    stickerUrl?: string;
    stickerPackId?: string;
    replyTo?: ChatRoomMessage['replyTo'];
  }
): Promise<string> {
  if ((room.bannedUserIds || []).includes(sender.id)) {
    throw new Error('لا يمكنك الإرسال لأنك محظور في هذه الغرفة.');
  }
  if ((room.mutedUserIds || []).includes(sender.id)) {
    throw new Error('تم كتمك من الكتابة في هذه الغرفة مؤقتاً.');
  }
  const msgId = `rmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `chatRooms/${room.id}/messages/${msgId}`;
  const now = new Date().toISOString();
  const senderRoomRole: ChatRoomMember['role'] =
    room.ownerId === sender.id
      ? 'owner'
      : (room.leaderIds || []).includes(sender.id)
      ? 'room_leader'
      : (room.moderatorIds || []).includes(sender.id)
      ? 'moderator'
      : (room.deputyIds || []).includes(sender.id)
      ? 'deputy_moderator'
      : 'member';

  const messageType: ChatRoomMessage['messageType'] =
    payload.messageType ||
    (payload.stickerUrl || payload.stickerId
      ? 'sticker'
      : payload.audioURL
      ? 'audio'
      : payload.mediaURL
      ? payload.mediaType === 'video'
        ? 'video'
        : 'image'
      : 'text');

  try {
    const msg: ChatRoomMessage = cleanObj({
      id: msgId,
      roomId: room.id,
      senderId: sender.id,
      senderName: sender.displayName,
      senderHandle: sender.handle,
      senderPhotoURL: sender.photoURL || '',
      senderRole: sender.role,
      senderRoomRole,
      senderCustomTitle: sender.customTitle || null,
      senderCustomTitles: sender.customTitles || (sender.customTitle ? [sender.customTitle] : []),
      messageType,
      text: payload.text.trim(),
      mediaURL: payload.mediaURL || '',
      mediaType: payload.mediaType,
      audioURL: payload.audioURL || '',
      audioDurationSec: payload.audioDurationSec,
      stickerId: payload.stickerId,
      stickerUrl: payload.stickerUrl,
      stickerPackId: payload.stickerPackId,
      replyTo: payload.replyTo,
      reactions: {},
      createdAt: now,
    });

    await setDoc(doc(db, 'chatRooms', room.id, 'messages', msgId), msg);
    const preview =
      payload.text.trim() ||
      (messageType === 'sticker'
        ? '✨ ملصق'
        : payload.mediaType === 'video'
        ? 'فيديو مرفق'
        : payload.mediaURL
        ? 'صورة مرفقة'
        : payload.audioURL
        ? 'رسالة صوتية'
        : '');

    await updateDoc(doc(db, 'chatRooms', room.id), {
      lastMessageText: preview.slice(0, 120),
      lastMessageSenderId: sender.id,
      lastMessageSenderName: sender.displayName,
      lastMessageAt: now,
      updatedAt: now,
    }).catch(() => {});

    void awardUserXp('room_message');
    return msgId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function inviteUserToChatRoom(
  room: ChatRoom,
  inviter: UserProfile,
  targetUser: UserProfile
): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', room.id), {
    allowedUserIds: arrayUnion(targetUser.id),
    bannedUserIds: arrayRemove(targetUser.id),
    updatedAt: new Date().toISOString(),
  });
  await createNotification({
    recipientId: targetUser.id,
    senderId: inviter.id,
    senderName: inviter.displayName,
    senderPhotoURL: inviter.photoURL,
    type: 'room_invite',
    roomId: room.id,
    roomName: room.title,
    targetId: room.id,
    message: `دعاك للانضمام إلى غرفة الدردشة "${room.title}".`,
  });
}

export async function kickOrBanRoomMember(
  room: ChatRoom,
  targetUserId: string,
  targetUserName: string,
  mode: 'kick' | 'ban' | 'unban',
  actor: UserProfile,
  reason?: string
): Promise<void> {
  if (targetUserId === room.ownerId) {
    throw new Error('لا يمكن طرد أو حظر منشئ الغرفة.');
  }
  const now = new Date().toISOString();
  if (mode === 'kick') {
    await deleteDoc(doc(db, 'chatRooms', room.id, 'members', targetUserId)).catch(() => {});
    await updateDoc(doc(db, 'chatRooms', room.id), {
      memberCount: increment(-1),
      leaderIds: arrayRemove(targetUserId),
      moderatorIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  } else if (mode === 'ban') {
    await deleteDoc(doc(db, 'chatRooms', room.id, 'members', targetUserId)).catch(() => {});
    await updateDoc(doc(db, 'chatRooms', room.id), {
      memberCount: increment(-1),
      bannedUserIds: arrayUnion(targetUserId),
      allowedUserIds: arrayRemove(targetUserId),
      leaderIds: arrayRemove(targetUserId),
      moderatorIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  } else {
    await updateDoc(doc(db, 'chatRooms', room.id), {
      bannedUserIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  }

  await recordAuditLog({
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    actionType: mode === 'ban' ? 'room_ban' : 'room_kick',
    targetType: 'room',
    targetId: room.id,
    reason: reason || undefined,
    targetDetails: `${mode.toUpperCase()} user ${targetUserName} (${targetUserId}) in room "${room.title}"`,
  });
}

export async function setChatRoomMemberRole(
  room: ChatRoom,
  targetUserId: string,
  targetUserName: string,
  nextRole: 'room_leader' | 'moderator' | 'member',
  actor: UserProfile
): Promise<void> {
  const now = new Date().toISOString();
  if (nextRole === 'room_leader') {
    await updateDoc(doc(db, 'chatRooms', room.id), {
      leaderIds: arrayUnion(targetUserId),
      moderatorIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  } else if (nextRole === 'moderator') {
    await updateDoc(doc(db, 'chatRooms', room.id), {
      moderatorIds: arrayUnion(targetUserId),
      leaderIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  } else {
    await updateDoc(doc(db, 'chatRooms', room.id), {
      leaderIds: arrayRemove(targetUserId),
      moderatorIds: arrayRemove(targetUserId),
      updatedAt: now,
    });
  }

  await updateDoc(doc(db, 'chatRooms', room.id, 'members', targetUserId), {
    role: nextRole,
  }).catch(() => {});

  await recordAuditLog({
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    actionType: 'room_promote',
    targetType: 'room',
    targetId: room.id,
    targetDetails: `Set ${targetUserName} as ${nextRole} in room "${room.title}"`,
  });
}

export async function editChatRoomMessage(
  roomId: string,
  messageId: string,
  newText: string
): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
    text: newText.trim().slice(0, 2000),
    editedAt: new Date().toISOString(),
  });
}

export async function deleteOwnChatRoomMessage(
  roomId: string,
  messageId: string
): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
    text: '',
    mediaURL: '',
    audioURL: '',
    isDeleted: true,
    deletedByName: 'المرسل',
  });
}

export async function toggleChatRoomReaction(
  roomId: string,
  message: ChatRoomMessage,
  emoji: string,
  userId: string
): Promise<void> {
  const existing = { ...(message.reactions || {}) };
  const users = new Set(existing[emoji] || []);
  if (users.has(userId)) {
    users.delete(userId);
  } else {
    users.add(userId);
  }
  if (users.size === 0) {
    delete existing[emoji];
  } else {
    existing[emoji] = Array.from(users);
  }
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', message.id), {
    reactions: existing,
  });
}

export async function toggleRoomNotificationsMute(
  roomId: string,
  userId: string,
  isMuted: boolean
): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'members', userId), {
    isNotificationsMuted: isMuted,
  });
}

export async function markChatRoomRead(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'members', userId), {
    lastReadAt: new Date().toISOString(),
  }).catch(() => {});
}

export function listenToRoomAnnouncements(
  roomId: string,
  callback: (items: ChatRoomAnnouncement[]) => void
): Unsubscribe {
  const q = query(collection(db, 'chatRooms', roomId, 'announcements'), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      const items: ChatRoomAnnouncement[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as ChatRoomAnnouncement));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToRoomModerationLogs(
  roomId: string,
  callback: (logs: ChatRoomModerationLog[]) => void
): Unsubscribe {
  const q = query(collection(db, 'chatRooms', roomId, 'moderationLogs'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items: ChatRoomModerationLog[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as ChatRoomModerationLog));
      callback(items);
    },
    () => callback([])
  );
}

export async function performRoomModerationAction(payload: {
  roomId: string;
  action:
    | 'appoint_moderator'
    | 'appoint_deputy'
    | 'update_deputy_permissions'
    | 'demote_member'
    | 'transfer_ownership'
    | 'kick'
    | 'ban'
    | 'unban'
    | 'mute_member'
    | 'unmute_member'
    | 'pin_message'
    | 'unpin_message'
    | 'mod_delete_message'
    | 'announcement_create'
    | 'announcement_update'
    | 'announcement_delete'
    | 'update_appearance';
  targetUserId?: string;
  targetUserName?: string;
  messageId?: string;
  announcementId?: string;
  title?: string;
  content?: string;
  imageURL?: string;
  reason?: string;
  permissions?: RoomPermissions;
  appearance?: ChatRoomAppearance & {
    imageURL?: string;
    coverURL?: string;
    title?: string;
    description?: string;
  };
}): Promise<{ ok: boolean; action?: string }> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('يجب تسجيل الدخول لتنفيذ هذا الإجراء.');
  }
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/rooms/moderate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تنفيذ إجراء الغرفة.');
  }
  return data;
}

export async function deleteChatRoom(roomId: string): Promise<void> {
  const members = await getDocs(collection(db, 'chatRooms', roomId, 'members')).catch(() => null);
  if (members) {
    await Promise.all(members.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
  const msgs = await getDocs(collection(db, 'chatRooms', roomId, 'messages')).catch(() => null);
  if (msgs) {
    await Promise.all(msgs.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
  const anns = await getDocs(collection(db, 'chatRooms', roomId, 'announcements')).catch(() => null);
  if (anns) {
    await Promise.all(anns.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
  await deleteDoc(doc(db, 'chatRooms', roomId));
}
