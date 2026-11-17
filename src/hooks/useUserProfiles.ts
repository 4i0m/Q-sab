import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserProfile, UserRole, VerificationCategory } from '../types';

export interface IdentityFallback {
  displayName?: string;
  handle?: string;
  photoURL?: string;
  role?: UserRole;
  isVerified?: boolean;
  verificationCategory?: VerificationCategory;
  level?: number;
}

export interface LiveIdentity {
  id: string;
  displayName: string;
  handle: string;
  photoURL: string;
  role?: UserRole;
  isVerified: boolean;
  verificationCategory?: VerificationCategory;
  level: number;
  isBanned?: boolean;
  isSuspended?: boolean;
  isUnavailable: boolean;
  isLoaded: boolean;
}

interface CacheEntry {
  profile: UserProfile | null | undefined; // undefined = still loading
  listeners: Set<() => void>;
  unsub?: () => void;
}

const profileCache = new Map<string, CacheEntry>();

function notifyEntry(entry: CacheEntry) {
  entry.listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber callback error
    }
  });
}

function subscribeToUser(userId: string, onUpdate: () => void): () => void {
  if (!userId) return () => {};

  let entry = profileCache.get(userId);
  if (!entry) {
    entry = {
      profile: undefined,
      listeners: new Set(),
    };
    profileCache.set(userId, entry);
  }

  entry.listeners.add(onUpdate);

  if (!entry.unsub) {
    const targetEntry = entry;
    targetEntry.unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        targetEntry.profile = snap.exists() ? (snap.data() as UserProfile) : null;
        notifyEntry(targetEntry);
      },
      () => {
        if (targetEntry.profile === undefined) {
          targetEntry.profile = null;
          notifyEntry(targetEntry);
        }
      }
    );
  }

  return () => {
    const current = profileCache.get(userId);
    if (!current) return;
    current.listeners.delete(onUpdate);
    if (current.listeners.size === 0 && current.unsub) {
      current.unsub();
      current.unsub = undefined;
    }
  };
}

export function seedUserProfileCache(user: UserProfile): void {
  if (!user?.id) return;
  let entry = profileCache.get(user.id);
  if (!entry) {
    entry = {
      profile: user,
      listeners: new Set(),
    };
    profileCache.set(user.id, entry);
  } else {
    entry.profile = user;
    notifyEntry(entry);
  }
}

export function resolveLiveIdentity(
  userId: string,
  profile: UserProfile | null | undefined,
  fallback?: IdentityFallback
): LiveIdentity {
  const isLoaded = profile !== undefined;

  if (profile === null) {
    return {
      id: userId,
      displayName: 'حساب غير متاح',
      handle: 'unavailable',
      photoURL: '',
      role: 'user',
      isVerified: false,
      level: 1,
      isUnavailable: true,
      isLoaded: true,
    };
  }

  if (profile) {
    if (profile.isBanned) {
      return {
        id: userId,
        displayName: 'حساب محظور',
        handle: 'banned',
        photoURL: '',
        role: profile.role,
        isVerified: false,
        level: 1,
        isBanned: true,
        isSuspended: Boolean(profile.isSuspended),
        isUnavailable: true,
        isLoaded: true,
      };
    }

    return {
      id: userId,
      displayName: profile.displayName || fallback?.displayName || 'مستخدم Q',
      handle: profile.handle || fallback?.handle || 'member',
      photoURL: profile.photoURL || '',
      role: profile.role || fallback?.role,
      isVerified: Boolean(profile.isVerified),
      verificationCategory: profile.verificationCategory,
      level: Math.max(1, Number(profile.level || fallback?.level || 1)),
      isBanned: Boolean(profile.isBanned),
      isSuspended: Boolean(profile.isSuspended),
      isUnavailable: false,
      isLoaded: true,
    };
  }

  return {
    id: userId,
    displayName: fallback?.displayName || 'مستخدم Q',
    handle: fallback?.handle || 'member',
    photoURL: fallback?.photoURL || '',
    role: fallback?.role,
    isVerified: Boolean(fallback?.isVerified),
    verificationCategory: fallback?.verificationCategory,
    level: Math.max(1, Number(fallback?.level || 1)),
    isUnavailable: false,
    isLoaded,
  };
}

export function useLiveUserProfile(
  userId?: string,
  fallback?: IdentityFallback
): LiveIdentity {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    return subscribeToUser(userId, () => {
      setTick((t) => t + 1);
    });
  }, [userId]);

  const entry = userId ? profileCache.get(userId) : undefined;
  return resolveLiveIdentity(userId || '', entry?.profile, fallback);
}

export function useLiveUserProfiles(
  userIds: Array<string | undefined | null>
): Record<string, LiveIdentity> {
  const [, setTick] = useState(0);

  const uniqueIdsKey = useMemo(() => {
    const clean = Array.from(
      new Set(userIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    ).sort();
    return clean.join('|');
  }, [userIds]);

  const uniqueIds = useMemo(
    () => (uniqueIdsKey ? uniqueIdsKey.split('|') : []),
    [uniqueIdsKey]
  );

  useEffect(() => {
    if (uniqueIds.length === 0) return;
    const unsubs = uniqueIds.map((uid) =>
      subscribeToUser(uid, () => {
        setTick((t) => t + 1);
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [uniqueIds]);

  const map: Record<string, LiveIdentity> = {};
  for (const uid of uniqueIds) {
    const entry = profileCache.get(uid);
    if (entry?.profile !== undefined) {
      map[uid] = resolveLiveIdentity(uid, entry.profile);
    }
  }
  return map;
}
