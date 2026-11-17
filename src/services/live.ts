import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import {
  LiveBroadcast,
  LiveBroadcastMessage,
  LiveBroadcastMode,
  LiveBroadcastReaction,
  LiveBroadcastSignal,
  LivePlaybackState,
  UserProfile
} from '../types';
import { recordAuditLog } from './firestore';

export function extractYoutubeVideoId(url: string): string | null {
  const clean = url.trim();
  if (!clean) return null;
  try {
    const u = new URL(clean);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      const vParam = u.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{6,20}$/.test(vParam)) return vParam;
      const parts = u.pathname.split('/').filter(Boolean);
      const markerIdx = parts.findIndex((p) => p === 'live' || p === 'embed' || p === 'shorts');
      if (markerIdx >= 0 && parts[markerIdx + 1] && /^[a-zA-Z0-9_-]{6,20}$/.test(parts[markerIdx + 1])) {
        return parts[markerIdx + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function listenToLiveBroadcasts(
  callback: (items: LiveBroadcast[]) => void
): Unsubscribe {
  const q = query(collection(db, 'liveBroadcasts'), orderBy('startedAt', 'desc'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const items: LiveBroadcast[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiveBroadcast));
      items.sort((a, b) => {
        if (a.status === b.status) {
          return (b.startedAt || '').localeCompare(a.startedAt || '');
        }
        return a.status === 'live' ? -1 : 1;
      });
      callback(items);
    },
    () => callback([])
  );
}

export function listenToLiveBroadcast(
  broadcastId: string,
  callback: (item: LiveBroadcast | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'liveBroadcasts', broadcastId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as LiveBroadcast) : null),
    () => callback(null)
  );
}

export async function createLiveBroadcast(
  payload: {
    title: string;
    description?: string;
    coverURL?: string;
    mode: LiveBroadcastMode;
    sourceUrl?: string;
    roomId?: string;
  },
  host: UserProfile
): Promise<LiveBroadcast> {
  const broadcastId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `liveBroadcasts/${broadcastId}`;
  const youtubeVideoId =
    payload.mode === 'youtube_embed' && payload.sourceUrl
      ? extractYoutubeVideoId(payload.sourceUrl) || undefined
      : undefined;

  if (payload.mode === 'youtube_embed' && !youtubeVideoId) {
    throw new Error('يرجى إدخال رابط بث أو فيديو YouTube صحيح.');
  }
  if (payload.mode === 'external_stream' && (!payload.sourceUrl || !/^https?:\/\//i.test(payload.sourceUrl.trim()))) {
    throw new Error('يرجى إدخال رابط بث مباشر يبدأ بـ https://');
  }

  const now = new Date().toISOString();
  const broadcast: LiveBroadcast = {
    id: broadcastId,
    title: payload.title.trim().slice(0, 120),
    description: (payload.description || '').trim().slice(0, 400),
    coverURL: payload.coverURL || '',
    mode: payload.mode,
    sourceUrl: (payload.sourceUrl || '').trim(),
    ...(youtubeVideoId ? { youtubeVideoId } : {}),
    ...(payload.roomId ? { roomId: payload.roomId } : {}),
    hostId: host.id,
    hostName: host.displayName,
    hostPhotoURL: host.photoURL || '',
    status: 'live',
    playbackState: 'playing',
    playbackPositionSec: 0,
    playbackUpdatedAt: now,
    isChatEnabled: true,
    mutedUserIds: [],
    bannedUserIds: [],
    viewerCount: 1,
    startedAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'liveBroadcasts', broadcastId), broadcast);
    void recordAuditLog({
      actorId: host.id,
      actorName: host.displayName,
      actorRole: host.role,
      actionType: 'live_start',
      targetType: 'live_broadcast',
      targetId: broadcastId,
      targetDetails: `Started live broadcast "${broadcast.title}" (${broadcast.mode})`,
    });
    return broadcast;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLivePlaybackState(
  broadcastId: string,
  playbackState: LivePlaybackState,
  playbackPositionSec: number
): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'liveBroadcasts', broadcastId), {
    playbackState,
    playbackPositionSec: Math.max(0, Math.round(playbackPositionSec)),
    playbackUpdatedAt: now,
    updatedAt: now,
  }).catch(() => {});
}

export async function joinLiveViewerPresence(
  broadcastId: string,
  user: UserProfile
): Promise<void> {
  const viewerRef = doc(db, 'liveBroadcasts', broadcastId, 'viewers', user.id);
  const existing = await getDoc(viewerRef).catch(() => null);
  const now = new Date().toISOString();
  await setDoc(viewerRef, {
    userId: user.id,
    displayName: user.displayName,
    photoURL: user.photoURL || '',
    joinedAt: existing?.exists() ? existing.data()?.joinedAt || now : now,
    lastSeenAt: now,
  }).catch(() => {});

  if (!existing?.exists()) {
    await updateDoc(doc(db, 'liveBroadcasts', broadcastId), {
      viewerCount: increment(1),
      updatedAt: now,
    }).catch(() => {});
  }
}

export async function leaveLiveViewerPresence(
  broadcastId: string,
  userId: string
): Promise<void> {
  const viewerRef = doc(db, 'liveBroadcasts', broadcastId, 'viewers', userId);
  const existing = await getDoc(viewerRef).catch(() => null);
  if (existing?.exists()) {
    await deleteDoc(viewerRef).catch(() => {});
    await updateDoc(doc(db, 'liveBroadcasts', broadcastId), {
      viewerCount: increment(-1),
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
}

export function listenToLiveMessages(
  broadcastId: string,
  callback: (messages: LiveBroadcastMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'liveBroadcasts', broadcastId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: LiveBroadcastMessage[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiveBroadcastMessage));
      callback(items);
    },
    () => callback([])
  );
}

export async function sendLiveMessage(
  broadcastId: string,
  user: UserProfile,
  text: string
): Promise<void> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  const msgId = `lmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const msg: LiveBroadcastMessage = {
    id: msgId,
    broadcastId,
    senderId: user.id,
    senderName: user.displayName,
    senderPhotoURL: user.photoURL || '',
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'liveBroadcasts', broadcastId, 'messages', msgId), msg);
}

export async function deleteLiveMessage(
  broadcastId: string,
  messageId: string
): Promise<void> {
  await deleteDoc(doc(db, 'liveBroadcasts', broadcastId, 'messages', messageId));
}

export function listenToLiveReactions(
  broadcastId: string,
  callback: (reactions: LiveBroadcastReaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'liveBroadcasts', broadcastId, 'reactions'),
    orderBy('createdAt', 'desc'),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: LiveBroadcastReaction[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiveBroadcastReaction));
      callback(items);
    },
    () => callback([])
  );
}

export async function sendLiveReaction(
  broadcastId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const id = `lrx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  await setDoc(doc(db, 'liveBroadcasts', broadcastId, 'reactions', id), {
    id,
    broadcastId,
    userId,
    emoji,
    createdAt: new Date().toISOString(),
  }).catch(() => {});
}

export async function sendLiveSignal(
  broadcastId: string,
  signal: Omit<LiveBroadcastSignal, 'id' | 'broadcastId' | 'createdAt'>
): Promise<void> {
  const id = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await setDoc(doc(db, 'liveBroadcasts', broadcastId, 'signals', id), {
    id,
    broadcastId,
    ...signal,
    createdAt: new Date().toISOString(),
  });
}

export function listenToLiveSignals(
  broadcastId: string,
  myUserId: string,
  callback: (signals: LiveBroadcastSignal[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'liveBroadcasts', broadcastId, 'signals'),
    where('toUserId', '==', myUserId),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: LiveBroadcastSignal[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LiveBroadcastSignal));
      items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
}

export async function deleteLiveSignal(
  broadcastId: string,
  signalId: string
): Promise<void> {
  await deleteDoc(doc(db, 'liveBroadcasts', broadcastId, 'signals', signalId)).catch(() => {});
}

export async function moderateLiveBroadcast(payload: {
  broadcastId: string;
  action: 'end_broadcast' | 'toggle_chat' | 'mute_viewer' | 'unmute_viewer' | 'ban_viewer';
  targetUserId?: string;
  reason?: string;
}): Promise<{ ok: boolean }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يجب تسجيل الدخول.');
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/live/moderate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تنفيذ إجراء إدارة البث.');
  }
  return data;
}

export async function awardLiveXp(
  broadcastId: string,
  role: 'watch' | 'host'
): Promise<{ awarded: boolean; xpDelta?: number; reason?: string } | null> {
  try {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/live/xp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ broadcastId, role }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
