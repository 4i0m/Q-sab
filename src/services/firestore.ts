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
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import {
  UserProfile,
  Post,
  Comment,
  FollowRelationship,
  Conversation,
  Message,
  Story,
  NotificationItem,
  PresenceRecord,
  VerificationCategory,
  VerificationRequest,
  AuditLog,
  ModerationAppeal,
  UserCustomization,
  UserRole
} from '../types';

/* =========================================================================
   USER PROFILES & PII ISOLATION
   ========================================================================= */

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncUserProfile(
  user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
  overrideRole?: 'user' | 'admin' | 'owner'
): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const existing = await getUserProfile(user.uid);
    const now = new Date().toISOString();

    const isAdminEmail = user.email === 'sabosenpai33@gmail.com';
    const assignedRole = overrideRole || (existing ? existing.role : (isAdminEmail ? 'admin' : 'user'));

    // Generate clean handle
    const rawName = user.displayName || user.email?.split('@')[0] || 'Member';
    const fallbackHandle = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || `q_${user.uid.slice(0, 5)}`;

    if (!existing) {
      const newProfile: UserProfile = {
        id: user.uid,
        displayName: user.displayName || 'Distinguished Member',
        handle: fallbackHandle,
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(rawName)}`,
        bannerURL: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80',
        bio: '',
        role: assignedRole,
        isVerified: Boolean(isAdminEmail || assignedRole === 'owner' || assignedRole === 'admin'),
        level: 0,
        xp: 0,
        isSpecial: false,
        achievements: [],
        isOnline: true,
        lastActiveAt: now,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        createdAt: now,
      };

      await setDoc(doc(db, 'users', user.uid), newProfile);

      // PII subcollection isolation
      if (user.email) {
        await setDoc(doc(db, 'users', user.uid, 'private', 'info'), {
          email: user.email,
          role: assignedRole,
          createdAt: now,
        });
      }

      return newProfile;
    } else {
      // Preserve existing profile and update activity
      const updates: Partial<UserProfile> = {
        lastActiveAt: now,
      };
      if (existing.isVerified === undefined && (isAdminEmail || existing.role === 'owner' || existing.role === 'admin')) {
        updates.isVerified = true;
      }
      if (user.photoURL && !existing.photoURL) {
        updates.photoURL = user.photoURL;
      }
      if (user.displayName && !existing.displayName) {
        updates.displayName = user.displayName;
      }
      await updateDoc(doc(db, 'users', user.uid), updates);
      return { ...existing, ...updates };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...data,
      lastActiveAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserBanner(userId: string, bannerURL: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      bannerURL,
      lastActiveAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   REAL PRESENCE & HEARTBEAT (TRUTHFUL COUNTER, NO FAKE DATA)
   ========================================================================= */

export async function sendPresenceHeartbeat(
  userId: string,
  displayName: string,
  photoURL?: string,
  isOnline = true
): Promise<void> {
  const path = `presence/${userId}`;
  try {
    await setDoc(doc(db, 'presence', userId), {
      userId,
      displayName,
      photoURL: photoURL || '',
      isOnline,
      lastSeen: new Date().toISOString(),
    });
  } catch (error) {
    // Non-blocking error handling for background presence
    console.error('Failed to update presence heartbeat:', error);
  }
}

export function listenToActivePresence(
  callback: (onlineUsers: PresenceRecord[], totalActiveCount: number) => void
): Unsubscribe {
  const path = 'presence';
  const q = collection(db, 'presence');

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const twoMinutesMs = 2 * 60 * 1000;
      const activeList: PresenceRecord[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PresenceRecord;
        if (data.isOnline && data.lastSeen) {
          const lastSeenTime = new Date(data.lastSeen).getTime();
          // User is strictly active if heartbeat occurred within last 2 minutes
          if (now - lastSeenTime <= twoMinutesMs) {
            activeList.push(data);
          }
        }
      });

      // Truthful real active count: accurately returns exact distinct connected members
      callback(activeList, activeList.length);
    },
    (error) => {
      callback([], 0);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/* =========================================================================
   POSTS
   ========================================================================= */

export function listenToPosts(callback: (posts: Post[]) => void): Unsubscribe {
  const path = 'posts';
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const posts: Post[] = [];
      snapshot.forEach((docSnap) => {
        posts.push({ id: docSnap.id, ...docSnap.data() } as Post);
      });
      callback(posts);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createPost(post: Omit<Post, 'id' | 'likesCount' | 'commentsCount'>): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `posts/${postId}`;
  try {
    const newPost: Post = {
      ...post,
      id: postId,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      bookmarksCount: 0,
    };
    await setDoc(doc(db, 'posts', postId), newPost);

    // Increment author's post count
    await updateDoc(doc(db, 'users', post.authorId), {
      postsCount: increment(1),
    }).catch(() => {});

    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePostContent(postId: string, content: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      content,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    await updateDoc(doc(db, 'users', authorId), {
      postsCount: increment(-1),
    }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* =========================================================================
   LIKES (PREVENT DUPLICATES, ATOMIC COUNTER)
   ========================================================================= */

export async function checkUserLiked(postId: string, userId: string): Promise<boolean> {
  const path = `posts/${postId}/likes/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'posts', postId, 'likes', userId));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function togglePostLike(
  postId: string,
  userId: string,
  userProfile: { displayName: string; photoURL?: string },
  postAuthorId: string
): Promise<boolean> {
  const path = `posts/${postId}/likes/${userId}`;
  try {
    const likeRef = doc(db, 'posts', postId, 'likes', userId);
    const snap = await getDoc(likeRef);

    if (snap.exists()) {
      // Unlike
      await deleteDoc(likeRef);
      await updateDoc(doc(db, 'posts', postId), {
        likesCount: increment(-1),
      });
      return false;
    } else {
      // Like
      await setDoc(likeRef, {
        userId,
        postId,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'posts', postId), {
        likesCount: increment(1),
      });

      // Send real notification to author (unless self-like)
      if (postAuthorId !== userId) {
        await createNotification({
          recipientId: postAuthorId,
          senderId: userId,
          senderName: userProfile.displayName,
          senderPhotoURL: userProfile.photoURL,
          type: 'like',
          targetId: postId,
          message: 'liked your post.',
        });
      }
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* =========================================================================
   BOOKMARKS
   ========================================================================= */

export async function checkUserBookmarked(userId: string, postId: string): Promise<boolean> {
  const path = `users/${userId}/bookmarks/${postId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'bookmarks', postId));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return false;
  }
}

export async function toggleBookmark(
  userId: string,
  postId: string,
  postSnippet?: Partial<Post>
): Promise<boolean> {
  const path = `users/${userId}/bookmarks/${postId}`;
  try {
    const bookmarkRef = doc(db, 'users', userId, 'bookmarks', postId);
    const snap = await getDoc(bookmarkRef);
    if (snap.exists()) {
      await deleteDoc(bookmarkRef);
      await updateDoc(doc(db, 'posts', postId), {
        bookmarksCount: increment(-1),
      }).catch(() => {});
      return false;
    } else {
      await setDoc(bookmarkRef, {
        userId,
        postId,
        savedAt: new Date().toISOString(),
        ...postSnippet,
      });
      await updateDoc(doc(db, 'posts', postId), {
        bookmarksCount: increment(1),
      }).catch(() => {});
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

export async function deleteUserProfile(userId: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await deleteDoc(doc(db, 'users', userId));
    await deleteDoc(doc(db, 'presence', userId)).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* =========================================================================
   COMMENTS
   ========================================================================= */

export function listenToComments(postId: string, callback: (comments: Comment[]) => void): Unsubscribe {
  const path = `posts/${postId}/comments`;
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const comments: Comment[] = [];
      snapshot.forEach((docSnap) => {
        comments.push({ id: docSnap.id, ...docSnap.data() } as Comment);
      });
      callback(comments);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addComment(
  postId: string,
  author: { id: string; name: string; handle: string; photoURL?: string },
  text: string,
  postAuthorId: string
): Promise<string> {
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `posts/${postId}/comments/${commentId}`;
  try {
    const comment: Comment = {
      id: commentId,
      postId,
      authorId: author.id,
      authorName: author.name,
      authorHandle: author.handle,
      authorPhotoURL: author.photoURL,
      text,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'posts', postId, 'comments', commentId), comment);
    await updateDoc(doc(db, 'posts', postId), {
      commentsCount: increment(1),
    });

    if (postAuthorId !== author.id) {
      await createNotification({
        recipientId: postAuthorId,
        senderId: author.id,
        senderName: author.name,
        senderPhotoURL: author.photoURL,
        type: 'comment',
        targetId: postId,
        message: `commented: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`,
      });
    }

    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const path = `posts/${postId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
    await updateDoc(doc(db, 'posts', postId), {
      commentsCount: increment(-1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* =========================================================================
   FOLLOWS / RELATIONSHIPS
   ========================================================================= */

export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  const followId = `${followerId}_${followingId}`;
  const path = `follows/${followId}`;
  try {
    const snap = await getDoc(doc(db, 'follows', followId));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function toggleFollow(
  followerId: string,
  followingId: string,
  followerProfile: { displayName: string; photoURL?: string }
): Promise<boolean> {
  if (followerId === followingId) return false;
  const followId = `${followerId}_${followingId}`;
  const path = `follows/${followId}`;
  try {
    const followRef = doc(db, 'follows', followId);
    const snap = await getDoc(followRef);

    if (snap.exists()) {
      // Unfollow
      await deleteDoc(followRef);
      await updateDoc(doc(db, 'users', followerId), { followingCount: increment(-1) }).catch(() => {});
      await updateDoc(doc(db, 'users', followingId), { followersCount: increment(-1) }).catch(() => {});
      return false;
    } else {
      // Follow
      await setDoc(followRef, {
        id: followId,
        followerId,
        followingId,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'users', followerId), { followingCount: increment(1) }).catch(() => {});
      await updateDoc(doc(db, 'users', followingId), { followersCount: increment(1) }).catch(() => {});

      await createNotification({
        recipientId: followingId,
        senderId: followerId,
        senderName: followerProfile.displayName,
        senderPhotoURL: followerProfile.photoURL,
        type: 'follow',
        targetId: followerId,
        message: 'started following you.',
      });

      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function listenToUserFollowers(
  userId: string,
  callback: (followers: FollowRelationship[]) => void
): Unsubscribe {
  const path = 'follows';
  const q = query(collection(db, 'follows'), where('followingId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const follows: FollowRelationship[] = [];
      snapshot.forEach((docSnap) => {
        follows.push(docSnap.data() as FollowRelationship);
      });
      callback(follows);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function listenToUserFollowing(
  userId: string,
  callback: (following: FollowRelationship[]) => void
): Unsubscribe {
  const path = 'follows';
  const q = query(collection(db, 'follows'), where('followerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const following: FollowRelationship[] = [];
      snapshot.forEach((docSnap) => {
        following.push(docSnap.data() as FollowRelationship);
      });
      callback(following);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/* =========================================================================
   STORIES (WITH 24H EXPIRATION & VIEWER REGISTRATION)
   ========================================================================= */

export function listenToStories(callback: (stories: Story[]) => void): Unsubscribe {
  const path = 'stories';
  const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const now = new Date().toISOString();
      const stories: Story[] = [];
      snapshot.forEach((docSnap) => {
        const story = { id: docSnap.id, ...docSnap.data() } as Story;
        // Filter out expired stories (over 24h old)
        if (story.expiresAt > now) {
          stories.push(story);
        }
      });
      callback(stories);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createStory(story: {
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  mediaURL: string;
  caption?: string;
}): Promise<string> {
  const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `stories/${storyId}`;
  try {
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const newStory: Story = {
      ...story,
      id: storyId,
      viewers: [],
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    await setDoc(doc(db, 'stories', storyId), newStory);
    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordStoryView(storyId: string, viewerId: string): Promise<void> {
  const path = `stories/${storyId}`;
  try {
    await updateDoc(doc(db, 'stories', storyId), {
      viewers: arrayUnion(viewerId),
    });
  } catch (error) {
    // Non-blocking
    console.error('Failed to record story view:', error);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  const path = `stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* =========================================================================
   MESSAGING & REAL-TIME CONVERSATIONS
   ========================================================================= */

export function listenToConversations(
  userId: string,
  callback: (conversations: Conversation[]) => void
): Unsubscribe {
  const path = 'conversations';
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const convs: Conversation[] = [];
      snapshot.forEach((docSnap) => {
        convs.push({ id: docSnap.id, ...docSnap.data() } as Conversation);
      });
      // Sort in memory by updatedAt
      convs.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
      callback(convs);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function listenToMessages(
  conversationId: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  const path = `conversations/${conversationId}/messages`;
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
      });
      callback(msgs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function getOrCreateConversation(
  currentUser: UserProfile,
  targetUser: UserProfile
): Promise<string> {
  const path = 'conversations';
  try {
    // Check if conversation already exists
    const q = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', currentUser.id)
    );
    const snap = await getDocs(q);

    let existingId: string | null = null;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Conversation;
      if (data.participantIds.includes(targetUser.id)) {
        existingId = docSnap.id;
      }
    });

    if (existingId) return existingId;

    // Create new conversation
    const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newConv: Conversation = {
      id: convId,
      participantIds: [currentUser.id, targetUser.id],
      participantDetails: {
        [currentUser.id]: {
          displayName: currentUser.displayName,
          handle: currentUser.handle,
          photoURL: currentUser.photoURL,
        },
        [targetUser.id]: {
          displayName: targetUser.displayName,
          handle: targetUser.handle,
          photoURL: targetUser.photoURL,
        },
      },
      lastMessageText: '',
      lastMessageSenderId: '',
      lastMessageTimestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'conversations', convId), newConv);
    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function sendMessage(
  conversationId: string,
  sender: UserProfile,
  recipientId: string,
  text: string,
  mediaURL?: string
): Promise<string> {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `conversations/${conversationId}/messages/${msgId}`;
  try {
    const now = new Date().toISOString();
    const msg: Message = {
      id: msgId,
      conversationId,
      senderId: sender.id,
      senderName: sender.displayName,
      text,
      mediaURL: mediaURL || '',
      createdAt: now,
    };

    await setDoc(doc(db, 'conversations', conversationId, 'messages', msgId), msg);
    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessageText: text,
      lastMessageSenderId: sender.id,
      lastMessageTimestamp: now,
      updatedAt: now,
    });

    await createNotification({
      recipientId,
      senderId: sender.id,
      senderName: sender.displayName,
      senderPhotoURL: sender.photoURL,
      type: 'message',
      targetId: conversationId,
      message: `sent you a message: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`,
    });

    return msgId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */

export async function createNotification(
  notif: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>
): Promise<void> {
  if (notif.recipientId === notif.senderId) return; // Never notify self
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `notifications/${notifId}`;
  try {
    const item: NotificationItem = {
      ...notif,
      id: notifId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'notifications', notifId), item);
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

export function listenToNotifications(
  userId: string,
  callback: (notifications: NotificationItem[]) => void
): Unsubscribe {
  const path = 'notifications';
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId),
    limit(40)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: NotificationItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as NotificationItem);
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    const updates = snap.docs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
    await Promise.all(updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   COMMUNITY DIRECTORY & ADMIN / MODERATION ACTIONS
   ========================================================================= */

export async function getAllUsers(limitCount = 50): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(collection(db, 'users'), limit(limitCount));
    const snap = await getDocs(q);
    const users: UserProfile[] = [];
    snap.forEach((docSnap) => {
      users.push(docSnap.data() as UserProfile);
    });
    return users;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deletePostAsAdmin(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateUserRoleAsAdmin(targetUserId: string, newRole: 'user' | 'moderator' | 'admin' | 'owner'): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), { role: newRole });
    await updateDoc(doc(db, 'users', targetUserId, 'private', 'info'), { role: newRole }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserVerification(targetUserId: string, isVerified: boolean): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), { isVerified });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   REPORTS & MODERATION
   ========================================================================= */

export async function submitReport(report: {
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'user' | 'comment';
  targetId: string;
  targetContentSnippet?: string;
  reason: string;
}): Promise<string> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `reports/${reportId}`;
  try {
    const item = {
      ...report,
      id: reportId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'reports', reportId), item);
    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function listenToReports(callback: (reports: any[]) => void): Unsubscribe {
  const path = 'reports';
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((d) => items.push(d.data()));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function updateReportResolution(
  reportId: string,
  status: 'reviewed' | 'resolved' | 'dismissed',
  actionTaken?: string
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      actionTaken: actionTaken || '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   EVENTS
   ========================================================================= */

export function listenToEvents(callback: (events: any[]) => void): Unsubscribe {
  const path = 'events';
  const q = collection(db, 'events');
  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((d) => items.push(d.data()));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function registerForCommunityEvent(
  eventId: string,
  userId: string
): Promise<void> {
  const path = `events/${eventId}`;
  try {
    const eventRef = doc(db, 'events', eventId);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) {
      throw new Error(`الفعالية المطلوبة غير موجودة في قاعدة البيانات (ID: ${eventId})`);
    }
    await updateDoc(eventRef, {
      registeredUserIds: arrayUnion(userId),
      participantsCount: increment(1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function leaveCommunityEvent(eventId: string, userId: string): Promise<void> {
  const path = `events/${eventId}`;
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      registeredUserIds: arrayRemove(userId),
      participantsCount: increment(-1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

/* =========================================================================
   FOUR-TIER VERIFICATION SYSTEM
   ========================================================================= */

export async function submitVerificationRequest(request: {
  userId: string;
  userHandle: string;
  userDisplayName: string;
  userPhotoURL?: string;
  category: VerificationCategory;
  legalName?: string;
  documentType?: string;
  documentURL?: string;
  organizationName?: string;
  officialWebsite?: string;
  evidenceDetails: string;
}): Promise<string> {
  const requestId = `vreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `verification_requests/${requestId}`;
  try {
    const item: VerificationRequest = {
      ...request,
      id: requestId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'verification_requests', requestId), item);
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function listenToVerificationRequests(
  callback: (requests: VerificationRequest[]) => void
): Unsubscribe {
  const path = 'verification_requests';
  const q = query(collection(db, 'verification_requests'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: VerificationRequest[] = [];
      snapshot.forEach((d) => items.push(d.data() as VerificationRequest));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function listenToUserVerificationRequest(
  userId: string,
  callback: (request: VerificationRequest | null) => void
): Unsubscribe {
  const path = 'verification_requests';
  const q = query(collection(db, 'verification_requests'), where('userId', '==', userId), limit(1));
  return onSnapshot(
    q,
    (snapshot) => {
      if (!snapshot.empty) {
        callback(snapshot.docs[0].data() as VerificationRequest);
      } else {
        callback(null);
      }
    },
    () => {
      callback(null);
    }
  );
}

export async function reviewVerificationRequest(
  requestId: string,
  targetUserId: string,
  category: VerificationCategory,
  status: 'approved' | 'rejected' | 'more_info_needed',
  reviewer: { id: string; name: string; role: UserRole },
  reviewerNotes?: string
): Promise<void> {
  const path = `verification_requests/${requestId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'verification_requests', requestId), {
      status,
      reviewerId: reviewer.id,
      reviewerNotes: reviewerNotes || '',
      reviewedAt: now,
    });

    if (status === 'approved') {
      await updateDoc(doc(db, 'users', targetUserId), {
        isVerified: true,
        verificationCategory: category,
      });

      // Audit log
      await recordAuditLog({
        actorId: reviewer.id,
        actorName: reviewer.name,
        actorRole: reviewer.role,
        actionType: 'verify_approve',
        targetType: 'verification',
        targetId: targetUserId,
        targetDetails: `Approved ${category} verification badge. Notes: ${reviewerNotes || 'None'}`,
      });

      // Notification
      await createNotification({
        recipientId: targetUserId,
        senderId: reviewer.id,
        senderName: 'Q Verification Desk',
        type: 'verification',
        message: `تهانينا! تمت الموافقة على طلب توثيق حسابك (${category === 'silver' ? 'الفضي' : category === 'institution' ? 'المؤسسي' : category === 'blood_red' ? 'الملكي الخاص' : 'الأزرق'}).`,
      });
    } else {
      // Audit log
      await recordAuditLog({
        actorId: reviewer.id,
        actorName: reviewer.name,
        actorRole: reviewer.role,
        actionType: 'verify_reject',
        targetType: 'verification',
        targetId: targetUserId,
        targetDetails: `Rejected ${category} verification request. Reason: ${reviewerNotes || 'None'}`,
      });

      // Notification
      await createNotification({
        recipientId: targetUserId,
        senderId: reviewer.id,
        senderName: 'Q Verification Desk',
        type: 'verification',
        message: `تم تحديث حالة طلب التوثيق: ${status === 'rejected' ? 'مرفوض' : 'مطلوب معلومات إضافية'}. ملاحظة: ${reviewerNotes || ''}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserVerificationDirect(
  targetUserId: string,
  isVerified: boolean,
  category: VerificationCategory,
  actor: { id: string; name: string; role: UserRole },
  reason?: string
): Promise<void> {
  // Blood-Red verification strictly restricted to platform owner
  if (category === 'blood_red' && actor.role !== 'owner') {
    throw new Error('فقط مالك المنصة مخول بمنح أو سحب التوثيق الملكي الخاص.');
  }

  const path = `users/${targetUserId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'users', targetUserId), {
      isVerified,
      verificationCategory: isVerified ? category : 'blue',
      verificationStatus: isVerified ? 'verified' : 'not_verified',
      verifiedAt: isVerified ? now : null,
      verifiedBy: isVerified ? actor.id : null,
      verificationNote: reason || '',
    });

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: isVerified ? 'verify_approve' : 'verify_revoke',
      targetType: 'user',
      targetId: targetUserId,
      reason: reason || undefined,
      targetDetails: `${isVerified ? 'Granted' : 'Revoked'} ${category} verification badge. ${reason ? `Note: ${reason}` : ''}`,
    });

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: 'Q Administration',
      type: 'verification',
      message: isVerified
        ? `تهانينا! تم منح حسابك شارة التوثيق المعتمدة في منصة Q (${category}).`
        : `تم إلغاء شارة التوثيق من حسابك بواسطة الإدارة.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function checkHandleAvailability(handle: string, currentUserId: string): Promise<boolean> {
  const cleanHandle = handle.toLowerCase().trim().replace(/^@/, '');
  if (!cleanHandle) return false;
  try {
    const q = query(collection(db, 'users'), where('handle', '==', cleanHandle), limit(2));
    const snap = await getDocs(q);
    if (snap.empty) return true;
    return snap.docs.every((d) => d.id === currentUserId);
  } catch (error) {
    console.error('Handle check error:', error);
    return true;
  }
}

export async function searchUsersDirectory(searchQuery: string): Promise<UserProfile[]> {
  const clean = searchQuery.toLowerCase().trim().replace(/^@/, '');
  if (!clean) return [];
  try {
    const q = query(collection(db, 'users'), limit(50));
    const snap = await getDocs(q);
    const results: UserProfile[] = [];
    snap.forEach((d) => {
      const user = d.data() as UserProfile;
      if (
        user.id.toLowerCase().includes(clean) ||
        (user.handle && user.handle.toLowerCase().includes(clean)) ||
        (user.displayName && user.displayName.toLowerCase().includes(clean))
      ) {
        results.push(user);
      }
    });
    return results;
  } catch (error) {
    console.error('Directory search error:', error);
    return [];
  }
}

/* =========================================================================
   AUDIT LOGS & ADMINISTRATIVE GOVERNANCE
   ========================================================================= */

export async function recordAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `audit_logs/${logId}`;
  try {
    const item: AuditLog = {
      ...log,
      id: logId,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'audit_logs', logId), item);
  } catch (error) {
    console.error('Audit log non-blocking error:', error);
  }
}

export function listenToAuditLogs(
  callback: (logs: AuditLog[]) => void
): Unsubscribe {
  const path = 'audit_logs';
  const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditLog[] = [];
      snapshot.forEach((d) => items.push(d.data() as AuditLog));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function warnUser(
  targetUserId: string,
  reason: string,
  actor: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), {
      warningCount: increment(1),
    });

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: 'user_warn',
      targetType: 'user',
      targetId: targetUserId,
      reason,
      targetDetails: `Issued formal warning to user. Reason: ${reason}`,
    });

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: 'Q Moderation Center',
      type: 'moderation',
      message: `تنبيه إداري: تم توجيه إنذار رسمي لحسابك لمخالفة الإرشادات. السبب: ${reason}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function suspendUser(
  targetUserId: string,
  reason: string,
  actor: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), {
      isSuspended: true,
      suspensionReason: reason,
    });

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: 'user_suspend',
      targetType: 'user',
      targetId: targetUserId,
      reason,
      targetDetails: `Suspended user account. Reason: ${reason}`,
    });

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: 'Q Moderation Center',
      type: 'moderation',
      message: `تم تعليق حسابك مؤقتاً. السبب: ${reason}. يمكنك تقديم طلب تظلم.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function banUser(
  targetUserId: string,
  reason: string,
  actor: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), {
      isBanned: true,
      bannedReason: reason,
    });

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: 'user_ban',
      targetType: 'user',
      targetId: targetUserId,
      reason,
      targetDetails: `Permanently banned user account. Reason: ${reason}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function restoreUser(
  targetUserId: string,
  actor: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), {
      isSuspended: false,
      isBanned: false,
      suspensionReason: '',
      bannedReason: '',
    });

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: 'user_restore',
      targetType: 'user',
      targetId: targetUserId,
      targetDetails: 'Restored user account from suspension/ban.',
    });

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: 'Q Moderation Center',
      type: 'moderation',
      message: 'تم رفع العقوبة واستعادة حسابك بالكامل.',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function togglePostHidden(
  postId: string,
  isHidden: boolean,
  actor: { id: string; name: string; role: UserRole },
  reason?: string
): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), { isHidden });
    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: isHidden ? 'post_delete' : 'post_restore',
      targetType: 'post',
      targetId: postId,
      targetDetails: `${isHidden ? 'Hidden/Suppressed' : 'Restored'} publication. ${reason ? `Reason: ${reason}` : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   APPEALS SYSTEM
   ========================================================================= */

export async function submitModerationAppeal(appeal: {
  userId: string;
  userHandle: string;
  userDisplayName: string;
  actionAppealed: string;
  targetContentSnippet?: string;
  appealReason: string;
}): Promise<string> {
  const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `appeals/${appealId}`;
  try {
    const item: ModerationAppeal = {
      ...appeal,
      id: appealId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'appeals', appealId), item);
    return appealId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function listenToModerationAppeals(
  callback: (appeals: ModerationAppeal[]) => void
): Unsubscribe {
  const path = 'appeals';
  const q = query(collection(db, 'appeals'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ModerationAppeal[] = [];
      snapshot.forEach((d) => items.push(d.data() as ModerationAppeal));
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function decideModerationAppeal(
  appealId: string,
  targetUserId: string,
  status: 'approved' | 'rejected',
  actor: { id: string; name: string; role: UserRole },
  decisionNotes?: string
): Promise<void> {
  const path = `appeals/${appealId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'appeals', appealId), {
      status,
      reviewerId: actor.id,
      decisionNotes: decisionNotes || '',
      decidedAt: now,
    });

    if (status === 'approved') {
      await restoreUser(targetUserId, actor);
    }

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: 'appeal_decide',
      targetType: 'appeal',
      targetId: appealId,
      targetDetails: `Appeal ${status}. Decision: ${decisionNotes || 'None'}`,
    });

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: 'Q Moderation Board',
      type: 'moderation',
      message: `تم الفصل في تظلمك: ${status === 'approved' ? 'قبول التظلم وإلغاء الإجراء' : 'رفض التظلم'}. ملاحظات: ${decisionNotes || ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   PROFILE CUSTOMIZATION & PRIVACY
   ========================================================================= */

export async function updateUserProfileCustomization(
  userId: string,
  customization: UserCustomization
): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      customization,
      lastActiveAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function pinPostToProfile(
  userId: string,
  postId?: string
): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      'customization.pinnedPostId': postId || '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* =========================================================================
   REAL PLATFORM STATS (NO FAKE DATA)
   ========================================================================= */

export async function getPlatformOverviewStats(): Promise<{
  totalUsers: number;
  totalPosts: number;
  pendingReports: number;
  pendingVerifications: number;
  pendingAppeals: number;
}> {
  try {
    const [usersSnap, postsSnap, reportsSnap, vreqsSnap, appealsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), limit(200))),
      getDocs(query(collection(db, 'posts'), limit(200))),
      getDocs(query(collection(db, 'reports'), where('status', '==', 'pending'), limit(50))),
      getDocs(query(collection(db, 'verification_requests'), where('status', '==', 'pending'), limit(50))),
      getDocs(query(collection(db, 'appeals'), where('status', '==', 'pending'), limit(50))),
    ]);

    return {
      totalUsers: usersSnap.size,
      totalPosts: postsSnap.size,
      pendingReports: reportsSnap.size,
      pendingVerifications: vreqsSnap.size,
      pendingAppeals: appealsSnap.size,
    };
  } catch (error) {
    console.error('Failed to get platform stats:', error);
    return {
      totalUsers: 0,
      totalPosts: 0,
      pendingReports: 0,
      pendingVerifications: 0,
      pendingAppeals: 0,
    };
  }
}


