import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { StickerItem, StickerPack, StickerPackStatus, UserProfile } from '../types';

export function listenToApprovedStickerPacks(
  callback: (packs: StickerPack[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'stickerPacks'),
    where('status', '==', 'approved'),
    where('isEnabled', '==', true),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StickerPack[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as StickerPack));
      items.sort((a, b) => (b.installsCount || 0) - (a.installsCount || 0));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToMyStickerPacks(
  userId: string,
  callback: (packs: StickerPack[]) => void
): Unsubscribe {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'stickerPacks'),
    where('authorId', '==', userId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StickerPack[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as StickerPack));
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToAllStickerPacks(
  callback: (packs: StickerPack[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'stickerPacks'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: StickerPack[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as StickerPack));
      callback(items);
    },
    () => callback([])
  );
}

export async function submitStickerPack(payload: {
  title: string;
  description?: string;
  coverURL?: string;
  stickers: StickerItem[];
}): Promise<StickerPack> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('يجب تسجيل الدخول لرفع حزمة ملصقات.');
  }
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/stickers/packs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.pack) {
    throw new Error(data?.error || 'تعذر حفظ حزمة الملصقات.');
  }
  return data.pack as StickerPack;
}

export async function moderateStickerPack(payload: {
  packId: string;
  action: 'approve' | 'reject' | 'disable' | 'enable' | 'delete';
  note?: string;
}): Promise<{ ok: boolean; status?: StickerPackStatus }> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('يجب تسجيل الدخول.');
  }
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/admin/stickers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تنفيذ إجراء الرقابة على حزمة الملصقات.');
  }
  return data;
}

export async function toggleSaveStickerPack(
  user: UserProfile,
  packId: string,
  save: boolean
): Promise<void> {
  await updateDoc(doc(db, 'users', user.id), {
    'customization.savedStickerPackIds': save ? arrayUnion(packId) : arrayRemove(packId),
  });

  await updateDoc(doc(db, 'stickerPacks', packId), {
    installsCount: increment(save ? 1 : -1),
  }).catch(() => {});
}

export async function recordRecentSticker(
  user: UserProfile,
  item: { packId: string; stickerId: string; url: string; label?: string }
): Promise<void> {
  const existing = user.customization?.recentStickers || [];
  const cleanItem = {
    packId: item.packId,
    stickerId: item.stickerId,
    url: item.url,
    label: item.label || '',
  };
  const deduped = [cleanItem, ...existing.filter((x) => x.stickerId !== item.stickerId)].slice(0, 18);
  await updateDoc(doc(db, 'users', user.id), {
    'customization.recentStickers': deduped,
  }).catch(() => {});
}
