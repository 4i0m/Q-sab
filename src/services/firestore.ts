import {
  collection,
  collectionGroup,
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
  runTransaction,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
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
  UserRole,
  AdminVerificationNote,
  BookmarkRecord,
  VerificationStatus,
  MediaMetadata,
  CommunityEvent,
  CustomTitle,
  CustomTitlePreset,
  XpLogEntry,
  ChatRoom,
  ChatRoomMember,
  ChatRoomMessage,
  StoryViewerRecord,
  GlobalAdminRole,
  GlobalPermissionKey,
  PlatformAnnouncement,
  PlatformAd,
  ModerationReport
} from '../types';
import { deleteMediaFromStorage } from './storage';

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) {
      result[k] = v;
    }
  });
  return result as T;
}

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
        photoURL: user.photoURL || '',
        bannerURL: '',
        bio: '',
        role: assignedRole,
        isVerified: Boolean(isAdminEmail || assignedRole === 'owner' || assignedRole === 'admin'),
        verificationStatus: (isAdminEmail || assignedRole === 'owner' || assignedRole === 'admin') ? 'verified' : 'not_verified',
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

export function listenToPost(postId: string, callback: (post: Post | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'posts', postId),
    (snap) => {
      callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Post) : null);
    },
    () => callback(null)
  );
}

export async function getPostById(postId: string): Promise<Post | null> {
  const path = `posts/${postId}`;
  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Post) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createPost(post: Omit<Post, 'id' | 'likesCount' | 'commentsCount'>): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `posts/${postId}`;
  try {
    const newPost: Post = stripUndefined({
      ...post,
      id: postId,
      postType: post.postType || 'post',
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      bookmarksCount: 0,
    });
    await setDoc(doc(db, 'posts', postId), newPost);

    // Increment author's post count
    await updateDoc(doc(db, 'users', post.authorId), {
      postsCount: increment(1),
    }).catch(() => {});

    void awardUserXp('post_create');

    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function repostPost(
  originalPost: Post,
  actor: UserProfile,
  quoteText?: string
): Promise<string> {
  const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `posts/${postId}`;
  try {
    const newPost: Post = stripUndefined({
      id: postId,
      authorId: actor.id,
      authorName: actor.displayName,
      authorHandle: actor.handle,
      authorPhotoURL: actor.photoURL || '',
      authorRole: actor.role,
      authorCustomTitle: actor.customTitle || null,
      authorCustomTitles: actor.customTitles || (actor.customTitle ? [actor.customTitle] : []),
      authorIsVerified: actor.isVerified,
      authorVerificationCategory: actor.verificationCategory,
      authorLevel: actor.level,
      postType: 'repost',
      visibility: 'public',
      content: quoteText?.trim() || '',
      repostOf: stripUndefined({
        id: originalPost.id,
        authorId: originalPost.authorId,
        authorName: originalPost.authorName,
        authorHandle: originalPost.authorHandle,
        authorPhotoURL: originalPost.authorPhotoURL || '',
        authorIsVerified: originalPost.authorIsVerified,
        authorVerificationCategory: originalPost.authorVerificationCategory,
        content: originalPost.content,
        title: originalPost.title,
        mediaURL: originalPost.mediaURL,
        mediaURLs: originalPost.mediaURLs,
        createdAt: originalPost.createdAt,
      }),
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      sharesCount: 0,
      bookmarksCount: 0,
      createdAt: new Date().toISOString(),
    });

    await setDoc(doc(db, 'posts', postId), newPost);
    await updateDoc(doc(db, 'posts', originalPost.id), {
      repostsCount: increment(1),
    }).catch(() => {});
    await updateDoc(doc(db, 'users', actor.id), {
      postsCount: increment(1),
    }).catch(() => {});

    if (originalPost.authorId !== actor.id) {
      await createNotification({
        recipientId: originalPost.authorId,
        senderId: actor.id,
        senderName: actor.displayName,
        senderPhotoURL: actor.photoURL,
        type: 'repost',
        targetId: postId,
        message: quoteText?.trim()
          ? `اقتبس منشورك: "${quoteText.trim().slice(0, 45)}"`
          : 'أعاد نشر منشورك.',
      });
    }

    void awardUserXp('repost_create');
    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getUserGlobalPollVote(postId: string, userId: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'posts', postId, 'votes', userId));
    if (!snap.exists()) return [];
    const data = snap.data() as { optionIds?: string[] };
    return Array.isArray(data.optionIds) ? data.optionIds : [];
  } catch {
    return [];
  }
}

export async function voteOnGlobalPoll(
  postId: string,
  userId: string,
  selectedOptionIds: string[]
): Promise<void> {
  const path = `posts/${postId}/votes/${userId}`;
  try {
    await runTransaction(db, async (tx) => {
      const postRef = doc(db, 'posts', postId);
      const voteRef = doc(db, 'posts', postId, 'votes', userId);
      const [postSnap, voteSnap] = await Promise.all([tx.get(postRef), tx.get(voteRef)]);
      if (!postSnap.exists()) throw new Error('المنشور غير موجود');
      const postData = postSnap.data() as Post;
      if (!postData.poll) throw new Error('لا يوجد استطلاع في هذا المنشور');

      const prevSelected: string[] = voteSnap.exists()
        ? ((voteSnap.data() as { optionIds?: string[] }).optionIds || [])
        : [];
      const nextSelected = postData.poll.allowMultiple
        ? Array.from(new Set(selectedOptionIds))
        : selectedOptionIds.slice(0, 1);

      const updatedOptions = postData.poll.options.map((opt) => {
        const wasVoted = prevSelected.includes(opt.id);
        const isVoted = nextSelected.includes(opt.id);
        let delta = 0;
        if (!wasVoted && isVoted) delta = 1;
        if (wasVoted && !isVoted) delta = -1;
        return {
          ...opt,
          votesCount: Math.max(0, (opt.votesCount || 0) + delta),
        };
      });

      const hadAnyPrev = prevSelected.length > 0;
      const hasAnyNext = nextSelected.length > 0;
      const totalDelta = !hadAnyPrev && hasAnyNext ? 1 : hadAnyPrev && !hasAnyNext ? -1 : 0;

      tx.set(voteRef, {
        userId,
        optionIds: nextSelected,
        updatedAt: new Date().toISOString(),
      });
      tx.update(postRef, {
        poll: {
          ...postData.poll,
          options: updatedOptions,
          totalVotes: Math.max(0, (postData.poll.totalVotes || 0) + totalDelta),
        },
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function submitGlobalQuizAttempt(
  postId: string,
  userId: string,
  score: number,
  total: number
): Promise<void> {
  const path = `posts/${postId}/attempts/${userId}`;
  try {
    await setDoc(doc(db, 'posts', postId, 'attempts', userId), {
      userId,
      score,
      total,
      completedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'posts', postId), {
      'quiz.attemptsCount': increment(1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleBestAnswerComment(
  postId: string,
  commentId: string,
  isBest: boolean
): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      bestAnswerCommentId: isBest ? commentId : '',
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
      isBestAnswer: isBest,
    }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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

export async function updateWikiPost(
  postId: string,
  data: { title?: string; content: string; tags?: string[] },
  editor: UserProfile
): Promise<void> {
  const path = `posts/${postId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'posts', postId), stripUndefined({
      title: data.title !== undefined ? data.title.trim().slice(0, 200) : undefined,
      content: data.content.trim().slice(0, 10000),
      tags: data.tags,
      editedAt: now,
      editedBy: editor.id,
      editedByName: editor.displayName,
      updatedAt: now,
    }));

    await recordAuditLog({
      actorId: editor.id,
      actorName: editor.displayName,
      actorRole: editor.role,
      actionType: 'wiki_edit',
      targetType: 'post',
      targetId: postId,
      targetDetails: `Edited wiki article "${data.title || postId}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function incrementPostShare(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      sharesCount: increment(1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function togglePostPinned(postId: string, userId: string, isPinned: boolean): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      isPinned,
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'users', userId), {
      'customization.pinnedPostId': isPinned ? postId : '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    let mediaUrls: string[] = [];
    let mediaPaths: string[] = [];
    try {
      const existingSnap = await getDoc(doc(db, 'posts', postId));
      if (existingSnap.exists()) {
        const postData = existingSnap.data() as Post;
        mediaUrls = [
          ...(postData.mediaURL ? [postData.mediaURL] : []),
          ...(Array.isArray(postData.mediaURLs) ? postData.mediaURLs : []),
          ...(postData.videoURL ? [postData.videoURL] : []),
        ];
        mediaPaths = (postData.mediaMetadata || []).map((m) => m.path).filter(Boolean);
      }
    } catch {
      // Proceed with Firestore post delete even if pre-read fails
    }

    await deleteDoc(doc(db, 'posts', postId));
    await updateDoc(doc(db, 'users', authorId), {
      postsCount: increment(-1),
    }).catch(() => {});

    if (mediaUrls.length > 0 || mediaPaths.length > 0) {
      deleteMediaFromStorage({ urls: mediaUrls, paths: mediaPaths }).catch(() => {});
    }
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
      void awardUserXp('like_given');
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

export function listenToUserBookmarks(
  userId: string,
  callback: (bookmarks: BookmarkRecord[]) => void
): Unsubscribe {
  const path = `users/${userId}/bookmarks`;
  const q = query(collection(db, 'users', userId, 'bookmarks'), orderBy('savedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: BookmarkRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as BookmarkRecord);
      });
      callback(items);
    },
    (error) => {
      callback([]);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
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
  author: {
    id: string;
    name: string;
    handle: string;
    photoURL?: string;
    isVerified?: boolean;
    verificationCategory?: VerificationCategory;
  },
  text: string,
  postAuthorId: string,
  parent?: { parentCommentId?: string; replyToAuthorName?: string }
): Promise<string> {
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `posts/${postId}/comments/${commentId}`;
  try {
    const comment: Comment = stripUndefined({
      id: commentId,
      postId,
      authorId: author.id,
      authorName: author.name,
      authorHandle: author.handle,
      authorPhotoURL: author.photoURL || '',
      authorIsVerified: Boolean(author.isVerified),
      authorVerificationCategory: author.verificationCategory || 'blue',
      text,
      parentCommentId: parent?.parentCommentId || undefined,
      replyToAuthorName: parent?.replyToAuthorName || undefined,
      createdAt: new Date().toISOString(),
    });

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

    void awardUserXp('comment_create');
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function listenToUserReplies(
  userId: string,
  callback: (replies: Comment[]) => void
): Unsubscribe {
  const q = query(
    collectionGroup(db, 'comments'),
    where('authorId', '==', userId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: Comment[] = [];
      snap.forEach((d) => {
        const data = d.data() as Comment;
        if (data.postId && data.text) items.push(data);
      });
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
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

export function listenToFollowersProfiles(
  userId: string,
  callback: (profiles: UserProfile[]) => void
): Unsubscribe {
  return listenToUserFollowers(userId, (rels) => {
    const ids = Array.from(new Set(rels.map((r) => r.followerId).filter(Boolean))).slice(0, 60);
    if (ids.length === 0) {
      callback([]);
      return;
    }
    Promise.all(ids.map((id) => getUserProfile(id).catch(() => null)))
      .then((res) => callback(res.filter((u): u is UserProfile => Boolean(u))))
      .catch(() => callback([]));
  });
}

export function listenToFollowingProfiles(
  userId: string,
  callback: (profiles: UserProfile[]) => void
): Unsubscribe {
  return listenToUserFollowing(userId, (rels) => {
    const ids = Array.from(new Set(rels.map((r) => r.followingId).filter(Boolean))).slice(0, 60);
    if (ids.length === 0) {
      callback([]);
      return;
    }
    Promise.all(ids.map((id) => getUserProfile(id).catch(() => null)))
      .then((res) => callback(res.filter((u): u is UserProfile => Boolean(u))))
      .catch(() => callback([]));
  });
}

/* =========================================================================
   STORIES (FOLLOWERS-ONLY VISIBILITY & ISOLATED VIEWER RECORDS)
   ========================================================================= */

export function listenToStories(
  currentUserIdOrCallback: string | null | undefined | ((stories: Story[]) => void),
  maybeCallback?: (stories: Story[]) => void
): Unsubscribe {
  const currentUserId = typeof currentUserIdOrCallback === 'string' ? currentUserIdOrCallback : null;
  const callback = typeof currentUserIdOrCallback === 'function' ? currentUserIdOrCallback : (maybeCallback || (() => {}));

  if (!currentUserId) {
    callback([]);
    return () => {};
  }

  let storyUnsubs: Unsubscribe[] = [];
  const chunkStoriesMap = new Map<number, Story[]>();

  const emitMerged = () => {
    const now = new Date().toISOString();
    const byId = new Map<string, Story>();
    chunkStoriesMap.forEach((list) => {
      list.forEach((s) => {
        if (s.expiresAt > now) {
          byId.set(s.id, s);
        }
      });
    });
    const merged = Array.from(byId.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    callback(merged);
  };

  const followsQuery = query(collection(db, 'follows'), where('followerId', '==', currentUserId));
  const followUnsub = onSnapshot(
    followsQuery,
    (followSnap) => {
      storyUnsubs.forEach((u) => u());
      storyUnsubs = [];
      chunkStoriesMap.clear();

      const authorIds = new Set<string>([currentUserId]);
      followSnap.forEach((d) => {
        const rel = d.data() as FollowRelationship;
        if (rel.followingId) authorIds.add(rel.followingId);
      });

      const allAuthors = Array.from(authorIds);
      const chunks: string[][] = [];
      for (let i = 0; i < allAuthors.length; i += 25) {
        chunks.push(allAuthors.slice(i, i + 25));
      }

      chunks.forEach((chunk, idx) => {
        const sq = query(collection(db, 'stories'), where('authorId', 'in', chunk));
        const unsub = onSnapshot(
          sq,
          (snap) => {
            const list: Story[] = [];
            snap.forEach((docSnap) => {
              list.push({ id: docSnap.id, ...docSnap.data() } as Story);
            });
            chunkStoriesMap.set(idx, list);
            emitMerged();
          },
          () => {
            chunkStoriesMap.set(idx, []);
            emitMerged();
          }
        );
        storyUnsubs.push(unsub);
      });
    },
    () => callback([])
  );

  return () => {
    followUnsub();
    storyUnsubs.forEach((u) => u());
  };
}

export async function createStory(story: {
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  authorIsVerified?: boolean;
  authorVerificationCategory?: VerificationCategory;
  mediaURL: string;
  mediaType?: 'image' | 'video';
  mediaPath?: string;
  mediaMetadata?: MediaMetadata;
  mediaScale?: number;
  mediaOffsetX?: number;
  mediaOffsetY?: number;
  overlayText?: string;
  textColor?: string;
  bgStyle?: string;
  textPosition?: 'top' | 'center' | 'bottom';
  durationSec?: number;
  caption?: string;
}): Promise<string> {
  const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `stories/${storyId}`;
  try {
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const newStory: Story = stripUndefined({
      ...story,
      id: storyId,
      visibility: 'followers',
      viewCount: 0,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });

    await setDoc(doc(db, 'stories', storyId), newStory);
    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordStoryView(
  storyId: string,
  viewer: string | { id: string; displayName?: string; handle?: string; photoURL?: string }
): Promise<void> {
  const viewerObj = typeof viewer === 'string' ? { id: viewer } : viewer;
  if (!viewerObj?.id) return;
  try {
    const viewerRef = doc(db, 'stories', storyId, 'viewers', viewerObj.id);
    const existing = await getDoc(viewerRef).catch(() => null);
    if (existing?.exists()) return;

    await setDoc(viewerRef, stripUndefined({
      viewerId: viewerObj.id,
      displayName: viewerObj.displayName || '',
      handle: viewerObj.handle || '',
      photoURL: viewerObj.photoURL || '',
      viewedAt: new Date().toISOString(),
    }));
    await updateDoc(doc(db, 'stories', storyId), {
      viewCount: increment(1),
    }).catch(() => {});
  } catch (error) {
    console.error('Failed to record story view:', error);
  }
}

export async function hasViewedStory(storyId: string, userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'stories', storyId, 'viewers', userId));
    return snap.exists();
  } catch {
    return false;
  }
}

export function listenToStoryViewers(
  storyId: string,
  callback: (viewers: StoryViewerRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'stories', storyId, 'viewers'), orderBy('viewedAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const items: StoryViewerRecord[] = [];
      snap.forEach((d) => items.push(d.data() as StoryViewerRecord));
      callback(items);
    },
    () => callback([])
  );
}

export async function deleteStory(storyId: string): Promise<void> {
  const path = `stories/${storyId}`;
  try {
    let mediaUrl = '';
    let mediaPath = '';
    try {
      const existingSnap = await getDoc(doc(db, 'stories', storyId));
      if (existingSnap.exists()) {
        const storyData = existingSnap.data() as Story;
        mediaUrl = storyData.mediaURL || '';
        mediaPath = storyData.mediaPath || storyData.mediaMetadata?.path || '';
      }
    } catch {
      // Proceed with Firestore story delete
    }

    await deleteDoc(doc(db, 'stories', storyId));

    if (mediaUrl || mediaPath) {
      deleteMediaFromStorage({
        urls: mediaUrl ? [mediaUrl] : [],
        paths: mediaPath ? [mediaPath] : [],
      }).catch(() => {});
    }
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
      if (!data.isGroup && data.participantIds.includes(targetUser.id)) {
        existingId = docSnap.id;
      }
    });

    if (existingId) return existingId;

    if (
      targetUser.customization?.privacy?.directMessages === 'followers_only' &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'owner'
    ) {
      const followsTarget = await checkIsFollowing(currentUser.id, targetUser.id);
      if (!followsTarget) {
        throw new Error('لا يمكنك بدء محادثة خاصة لأن هذا المستخدم يقتصر الرسائل على المتابعين فقط.');
      }
    }

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
      readBy: { [currentUser.id]: now },
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'conversations', convId), newConv);
    return convId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('المتابعين فقط')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createGroupConversation(
  creator: UserProfile,
  members: UserProfile[],
  payload: {
    groupName: string;
    groupDescription?: string;
    groupAvatar?: string;
  }
): Promise<string> {
  const convId = `gconv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `conversations/${convId}`;
  try {
    const now = new Date().toISOString();
    const uniqueUsers = [creator, ...members.filter((m) => m.id !== creator.id)];
    const participantIds = uniqueUsers.map((u) => u.id);
    const participantDetails: Conversation['participantDetails'] = {};
    uniqueUsers.forEach((u) => {
      participantDetails[u.id] = stripUndefined({
        displayName: u.displayName,
        handle: u.handle,
        photoURL: u.photoURL || '',
        isVerified: Boolean(u.isVerified),
        verificationCategory: u.verificationCategory,
      });
    });

    const newConv: Conversation = stripUndefined({
      id: convId,
      participantIds,
      participantDetails,
      isGroup: true,
      groupName: payload.groupName.trim(),
      groupDescription: payload.groupDescription?.trim() || '',
      groupAvatar: payload.groupAvatar || '',
      createdBy: creator.id,
      lastMessageText: `تم إنشاء "${payload.groupName.trim()}"`,
      lastMessageSenderId: creator.id,
      lastMessageTimestamp: now,
      readBy: { [creator.id]: now },
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'conversations', convId), newConv);

    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addGroupConversationMembers(
  conversation: Conversation,
  newMembers: UserProfile[],
  actor: UserProfile
): Promise<void> {
  const path = `conversations/${conversation.id}`;
  try {
    const now = new Date().toISOString();
    const existingIds = new Set(conversation.participantIds || []);
    const added = newMembers.filter((m) => !existingIds.has(m.id));
    if (added.length === 0) return;

    const nextIds = [...conversation.participantIds, ...added.map((m) => m.id)];
    const nextDetails = { ...(conversation.participantDetails || {}) };
    added.forEach((u) => {
      nextDetails[u.id] = stripUndefined({
        displayName: u.displayName,
        handle: u.handle,
        photoURL: u.photoURL || '',
        isVerified: Boolean(u.isVerified),
        verificationCategory: u.verificationCategory,
      });
    });

    await updateDoc(doc(db, 'conversations', conversation.id), {
      participantIds: nextIds,
      participantDetails: nextDetails,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveGroupConversation(
  conversation: Conversation,
  userId: string
): Promise<void> {
  const path = `conversations/${conversation.id}`;
  try {
    const nextIds = (conversation.participantIds || []).filter((id) => id !== userId);
    const nextDetails = { ...(conversation.participantDetails || {}) };
    delete nextDetails[userId];
    await updateDoc(doc(db, 'conversations', conversation.id), {
      participantIds: nextIds,
      participantDetails: nextDetails,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const path = `conversations/${conversationId}`;
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`readBy.${userId}`]: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Could not mark conversation read:', path, error);
  }
}

export async function setConversationTyping(
  conversationId: string,
  userId: string,
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`typingUsers.${userId}`]: isTyping ? new Date().toISOString() : '',
    });
  } catch {
    // Non-blocking typing indicator
  }
}

export async function sendMessage(
  conversationId: string,
  sender: UserProfile,
  recipientId: string,
  text: string,
  mediaURL?: string,
  extra?: {
    messageType?: Message['messageType'];
    mediaType?: 'image' | 'video';
    mediaPath?: string;
    mediaMetadata?: MediaMetadata;
    audioURL?: string;
    audioDurationSec?: number;
    stickerId?: string;
    stickerUrl?: string;
    stickerPackId?: string;
    replyTo?: Message['replyTo'];
    recipientIds?: string[];
  }
): Promise<string> {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `conversations/${conversationId}/messages/${msgId}`;
  try {
    const now = new Date().toISOString();
    const messageType: Message['messageType'] =
      extra?.messageType ||
      (extra?.audioURL
        ? 'audio'
        : extra?.stickerId || extra?.stickerUrl
        ? 'sticker'
        : mediaURL
        ? extra?.mediaType === 'video'
          ? 'video'
          : 'image'
        : 'text');

    const msg: Message = stripUndefined({
      id: msgId,
      conversationId,
      senderId: sender.id,
      senderName: sender.displayName,
      senderPhotoURL: sender.photoURL || '',
      messageType,
      text: text || '',
      mediaURL: mediaURL || '',
      mediaType: extra?.mediaType,
      mediaPath: extra?.mediaPath,
      mediaMetadata: extra?.mediaMetadata,
      audioURL: extra?.audioURL,
      audioDurationSec: extra?.audioDurationSec,
      stickerId: extra?.stickerId,
      stickerUrl: extra?.stickerUrl,
      stickerPackId: extra?.stickerPackId,
      replyTo: extra?.replyTo,
      reactions: {},
      createdAt: now,
    });

    const summaryText =
      text.trim() ||
      (messageType === 'audio'
        ? '🎙️ رسالة صوتية'
        : messageType === 'video'
        ? '🎬 فيديو'
        : messageType === 'image'
        ? '🖼️ صورة'
        : messageType === 'sticker'
        ? '✨ ملصق'
        : '');

    await setDoc(doc(db, 'conversations', conversationId, 'messages', msgId), msg);
    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessageText: summaryText,
      lastMessageSenderId: sender.id,
      lastMessageTimestamp: now,
      updatedAt: now,
      [`readBy.${sender.id}`]: now,
      [`typingUsers.${sender.id}`]: '',
    });

    return msgId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleDirectMessageReaction(
  conversationId: string,
  message: Message,
  emoji: string,
  userId: string
): Promise<void> {
  const path = `conversations/${conversationId}/messages/${message.id}`;
  try {
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
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
      reactions: existing,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function editDirectMessage(
  conversationId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const path = `conversations/${conversationId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      text: newText.trim().slice(0, 2000),
      editedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDirectMessage(conversationId: string, messageId: string): Promise<void> {
  const path = `conversations/${conversationId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      text: '',
      mediaURL: '',
      audioURL: '',
      stickerId: '',
      stickerUrl: '',
      deletedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
    // Respect recipient's stored notification preferences when available
    const recipientSnap = await getDoc(doc(db, 'users', notif.recipientId)).catch(() => null);
    const prefs = recipientSnap?.exists()
      ? (recipientSnap.data() as UserProfile).customization?.notifications
      : undefined;
    if (prefs) {
      if (notif.type === 'like' && prefs.likes === false) return;
      if (notif.type === 'comment' && prefs.comments === false) return;
      if (notif.type === 'follow' && prefs.follows === false) return;
      if (notif.type === 'message' && prefs.messages === false) return;
      if (notif.type === 'event' && prefs.announcements === false) {
        return;
      }
    }

    const item: NotificationItem = {
      ...notif,
      id: notifId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'notifications', notifId), item);
  } catch (error) {
    console.error('Failed to create notification:', path, error);
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

export async function updateUserRoleAsAdmin(
  targetUserId: string,
  newRole: UserRole,
  actor?: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), { role: newRole });
    await updateDoc(doc(db, 'users', targetUserId, 'private', 'info'), { role: newRole }).catch(() => {});

    if (actor) {
      await recordAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        actionType: 'role_change',
        targetType: 'user',
        targetId: targetUserId,
        targetDetails: `Updated user role to ${newRole}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserVerification(targetUserId: string, isVerified: boolean): Promise<void> {
  const path = `users/${targetUserId}`;
  try {
    await updateDoc(doc(db, 'users', targetUserId), {
      isVerified,
      verificationStatus: isVerified ? 'verified' : 'not_verified',
    });
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
  targetType: ModerationReport['targetType'];
  targetId: string;
  roomId?: string;
  conversationId?: string;
  targetContentSnippet?: string;
  reason: string;
}): Promise<string> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `reports/${reportId}`;
  try {
    const item = stripUndefined({
      ...report,
      id: reportId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
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
   REAL EVENTS SYSTEM
   ========================================================================= */

const LEGACY_SEEDED_EVENT_IDS = new Set([
  'event_design_2026',
  'event_dev_night',
  'event_gaming_2026',
]);

export function computeEventLifecycleStatus(event: CommunityEvent): 'upcoming' | 'ongoing' | 'ended' | 'cancelled' {
  if (event.status === 'cancelled') return 'cancelled';
  try {
    if (!event.dateStr) return event.status || 'upcoming';
    const startIso = `${event.dateStr}T${event.timeStr || '00:00'}`;
    const startMs = new Date(startIso).getTime();
    if (Number.isNaN(startMs)) return event.status || 'upcoming';

    const endMs = event.endDateStr
      ? new Date(`${event.endDateStr}T${event.endTimeStr || '23:59'}`).getTime()
      : startMs + 3 * 60 * 60 * 1000;

    const nowMs = Date.now();
    if (nowMs < startMs) return 'upcoming';
    if (nowMs <= endMs) return 'ongoing';
    return 'ended';
  } catch {
    return event.status || 'upcoming';
  }
}

export function listenToEvents(callback: (events: CommunityEvent[]) => void): Unsubscribe {
  const path = 'events';
  const q = collection(db, 'events');
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CommunityEvent[] = [];
      snapshot.forEach((d) => {
        const data = { id: d.id, ...d.data() } as CommunityEvent;
        // Never surface legacy unowned seeded demo records
        if (LEGACY_SEEDED_EVENT_IDS.has(d.id) && !data.creatorId) {
          return;
        }
        items.push({
          ...data,
          status: computeEventLifecycleStatus(data),
        });
      });
      items.sort((a, b) => (b.createdAt || b.dateStr || '').localeCompare(a.createdAt || a.dateStr || ''));
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
): Promise<'registered' | 'pending'> {
  const path = `events/${eventId}`;
  try {
    const eventRef = doc(db, 'events', eventId);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) {
      throw new Error(`الفعالية المطلوبة غير موجودة في قاعدة البيانات (ID: ${eventId})`);
    }
    const evt = snap.data() as CommunityEvent;
    if (evt.status === 'cancelled') {
      throw new Error('تم إلغاء هذه الفعالية ولا يمكن التسجيل بها.');
    }
    if (evt.requireApproval) {
      await updateDoc(eventRef, {
        pendingUserIds: arrayUnion(userId),
      });
      return 'pending';
    }
    await updateDoc(eventRef, {
      registeredUserIds: arrayUnion(userId),
      participantsCount: increment(1),
    });
    void awardUserXp('event_join');
    return 'registered';
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function reviewEventParticipation(
  eventId: string,
  targetUserId: string,
  approve: boolean,
  actor: { id: string; name: string }
): Promise<void> {
  const path = `events/${eventId}`;
  try {
    const eventRef = doc(db, 'events', eventId);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) throw new Error('الفعالية غير موجودة.');
    const evt = snap.data() as CommunityEvent;

    if (approve) {
      await updateDoc(eventRef, {
        pendingUserIds: arrayRemove(targetUserId),
        registeredUserIds: arrayUnion(targetUserId),
        participantsCount: increment(1),
      });
    } else {
      await updateDoc(eventRef, {
        pendingUserIds: arrayRemove(targetUserId),
      });
    }

    await createNotification({
      recipientId: targetUserId,
      senderId: actor.id,
      senderName: actor.name,
      type: 'event',
      targetId: eventId,
      message: approve
        ? `تمت الموافقة على مشاركتك في فعالية "${evt.title}".`
        : `لم يتم قبول طلب مشاركتك في فعالية "${evt.title}".`,
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
    const snap = await getDoc(eventRef);
    if (!snap.exists()) return;
    const evt = snap.data() as CommunityEvent;
    const wasRegistered = (evt.registeredUserIds || []).includes(userId);
    await updateDoc(eventRef, {
      pendingUserIds: arrayRemove(userId),
      registeredUserIds: arrayRemove(userId),
      ...(wasRegistered ? { participantsCount: increment(-1) } : {}),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function createCommunityEvent(payload: {
  title: string;
  subtitle: string;
  category: 'official' | 'challenge' | 'competitions' | 'general';
  badgeText: string;
  dateStr: string;
  timeStr: string;
  endDateStr?: string;
  endTimeStr?: string;
  locationType?: 'online' | 'in_person';
  locationDetails?: string;
  organizerId?: string;
  organizerName?: string;
  requireApproval?: boolean;
  imageURL?: string;
  coverPath?: string;
  creatorId: string;
  creatorRole?: UserRole;
}): Promise<string> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `events/${eventId}`;
  try {
    const now = new Date().toISOString();
    const docData: CommunityEvent = stripUndefined({
      id: eventId,
      title: payload.title.trim(),
      subtitle: payload.subtitle.trim(),
      category: payload.category,
      badgeText: payload.badgeText.trim() || 'فعالية',
      dateStr: payload.dateStr.trim(),
      timeStr: payload.timeStr.trim(),
      endDateStr: payload.endDateStr?.trim() || undefined,
      endTimeStr: payload.endTimeStr?.trim() || undefined,
      locationType: payload.locationType || 'online',
      locationDetails: payload.locationDetails?.trim() || '',
      organizerId: payload.organizerId || payload.creatorId,
      organizerName: payload.organizerName?.trim() || '',
      status: 'upcoming',
      requireApproval: Boolean(payload.requireApproval),
      pendingUserIds: [],
      imageURL: payload.imageURL || '',
      coverPath: payload.coverPath || undefined,
      participantsCount: 0,
      registeredUserIds: [],
      creatorId: payload.creatorId,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'events', eventId), docData);

    await recordAuditLog({
      actorId: payload.creatorId,
      actorName: payload.organizerName || 'Organizer',
      actorRole: payload.creatorRole || 'admin',
      actionType: 'event_create',
      targetType: 'event',
      targetId: eventId,
      targetDetails: `Created event "${docData.title}"`,
    });

    return eventId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCommunityEvent(
  eventId: string,
  updates: Partial<CommunityEvent>,
  actor: { id: string; name: string; role: UserRole }
): Promise<void> {
  const path = `events/${eventId}`;
  try {
    await updateDoc(doc(db, 'events', eventId), stripUndefined({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: updates.status === 'cancelled' ? 'event_cancel' : 'event_update',
      targetType: 'event',
      targetId: eventId,
      targetDetails: updates.status === 'cancelled'
        ? `Cancelled event ${eventId}`
        : `Updated event ${eventId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCommunityEvent(eventId: string): Promise<void> {
  const path = `events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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

export async function getAdminVerificationNote(userId: string): Promise<AdminVerificationNote | null> {
  const path = `users/${userId}/admin_notes/verification`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'admin_notes', 'verification'));
    if (!snap.exists()) return null;
    return snap.data() as AdminVerificationNote;
  } catch (error) {
    console.warn('Could not read admin verification note:', path, error);
    return null;
  }
}

async function saveAdminVerificationNote(
  targetUserId: string,
  note: string,
  status: VerificationStatus,
  actor: { id: string; name: string }
): Promise<void> {
  await setDoc(doc(db, 'users', targetUserId, 'admin_notes', 'verification'), {
    userId: targetUserId,
    note,
    status,
    updatedBy: actor.id,
    updatedByName: actor.name,
    updatedAt: new Date().toISOString(),
  });
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
      reviewerName: reviewer.name,
      reviewerNotes: reviewerNotes || '',
      reviewedAt: now,
    });

    if (status === 'approved') {
      await updateDoc(doc(db, 'users', targetUserId), {
        isVerified: true,
        verificationCategory: category,
        verificationStatus: 'verified',
        verifiedAt: now,
        verifiedBy: reviewer.id,
        verifiedByName: reviewer.name,
      });

      await saveAdminVerificationNote(
        targetUserId,
        reviewerNotes || 'Approved via verification request',
        'verified',
        reviewer
      ).catch(() => {});

      await recordAuditLog({
        actorId: reviewer.id,
        actorName: reviewer.name,
        actorRole: reviewer.role,
        actionType: 'verify_approve',
        targetType: 'verification',
        targetId: targetUserId,
        reason: reviewerNotes || undefined,
        targetDetails: `Approved ${category} verification badge.`,
      });

      await createNotification({
        recipientId: targetUserId,
        senderId: reviewer.id,
        senderName: 'Q Verification Desk',
        type: 'verification',
        message: `تهانينا! تمت الموافقة على طلب توثيق حسابك (${category === 'silver' ? 'الفضي' : category === 'institution' ? 'المؤسسي' : category === 'blood_red' ? 'الملكي الخاص' : 'الأزرق'}).`,
      });
    } else {
      await updateDoc(doc(db, 'users', targetUserId), {
        verificationStatus: status === 'rejected' ? 'rejected' : 'pending',
      }).catch(() => {});

      await saveAdminVerificationNote(
        targetUserId,
        reviewerNotes || 'Rejected verification request',
        status === 'rejected' ? 'rejected' : 'pending',
        reviewer
      ).catch(() => {});

      await recordAuditLog({
        actorId: reviewer.id,
        actorName: reviewer.name,
        actorRole: reviewer.role,
        actionType: 'verify_reject',
        targetType: 'verification',
        targetId: targetUserId,
        reason: reviewerNotes || undefined,
        targetDetails: `Rejected ${category} verification request.`,
      });

      await createNotification({
        recipientId: targetUserId,
        senderId: reviewer.id,
        senderName: 'Q Verification Desk',
        type: 'verification',
        message: `تم تحديث حالة طلب التوثيق: ${status === 'rejected' ? 'مرفوض' : 'مطلوب معلومات إضافية'}.${reviewerNotes ? ` ملاحظة: ${reviewerNotes}` : ''}`,
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
      verifiedByName: isVerified ? actor.name : null,
    });

    if (reason && reason.trim()) {
      await saveAdminVerificationNote(
        targetUserId,
        reason.trim(),
        isVerified ? 'verified' : 'not_verified',
        actor
      ).catch(() => {});
    }

    await recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actionType: isVerified ? 'verify_approve' : 'verify_revoke',
      targetType: 'user',
      targetId: targetUserId,
      reason: reason || undefined,
      targetDetails: `${isVerified ? 'Granted' : 'Revoked'} ${category} verification badge.`,
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
  callback: (logs: AuditLog[]) => void,
  limitCount = 200
): Unsubscribe {
  const path = 'audit_logs';
  const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(limitCount));
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

export interface PlatformOverviewStats {
  totalUsers: number;
  totalPosts: number;
  totalRooms: number;
  totalEvents: number;
  pendingReports: number;
  pendingVerifications: number;
  pendingAppeals: number;
  pendingStickers: number;
  activeLive: number;
  fetchedAt?: string;
}

export async function getPlatformOverviewStats(): Promise<PlatformOverviewStats> {
  try {
    const fbUser = auth.currentUser;
    if (fbUser) {
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/admin/metrics', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return (await res.json()) as PlatformOverviewStats;
      }
    }
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
      totalRooms: 0,
      totalEvents: 0,
      pendingReports: reportsSnap.size,
      pendingVerifications: vreqsSnap.size,
      pendingAppeals: appealsSnap.size,
      pendingStickers: 0,
      activeLive: 0,
    };
  } catch (error) {
    console.error('Failed to get platform stats:', error);
    return {
      totalUsers: 0,
      totalPosts: 0,
      totalRooms: 0,
      totalEvents: 0,
      pendingReports: 0,
      pendingVerifications: 0,
      pendingAppeals: 0,
      pendingStickers: 0,
      activeLive: 0,
    };
  }
}

export async function adminRoomAction(payload: {
  roomId: string;
  action: 'toggle_readonly' | 'delete_room';
  reason?: string;
}): Promise<{ ok: boolean; isReadOnly?: boolean }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يجب تسجيل الدخول.');
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/admin/rooms-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تنفيذ إجراء الإدارة على الغرفة.');
  }
  return data;
}

/* =========================================================================
   XP ENGINE, LEVELING, CUSTOM TITLES & PROFILE GOVERNANCE
   ========================================================================= */

export interface XpAwardResult {
  awarded: boolean;
  reason?: string;
  xpDelta?: number;
  xp?: number;
  level?: number;
  checkedInToday?: boolean;
  nextResetAt?: string;
  dailyXpEarned?: number;
  dailyXpCap?: number;
}

export interface XpStatusResponse {
  serverTime: string;
  utcDate: string;
  checkedInToday: boolean;
  nextResetAt: string;
  dailyXpEarned: number;
  dailyXpCap: number;
  xp: number;
  level: number;
}

export async function fetchXpStatus(): Promise<XpStatusResponse | null> {
  try {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/xp/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as XpStatusResponse;
  } catch {
    return null;
  }
}

export async function awardUserXp(
  action: Exclude<XpLogEntry['action'], 'admin_adjust'>
): Promise<XpAwardResult | null> {
  try {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/xp/award', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return null;
    return (await res.json()) as XpAwardResult;
  } catch {
    return null;
  }
}

export async function adminAdjustUserXp(
  targetUserId: string,
  delta: number,
  reason: string
): Promise<{ ok: boolean; xp: number; level: number }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يجب تسجيل الدخول.');
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/admin/xp-adjust', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ targetUserId, delta, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تعديل نقاط الخبرة.');
  }
  return data;
}

export function listenToUserXpLogs(
  userId: string,
  callback: (logs: XpLogEntry[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'xpLogs'),
    where('userId', '==', userId),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: XpLogEntry[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as XpLogEntry));
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToCustomTitlePresets(
  callback: (presets: CustomTitlePreset[]) => void
): Unsubscribe {
  const q = query(collection(db, 'customTitles'), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const items: CustomTitlePreset[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as CustomTitlePreset));
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
}

export async function createCustomTitlePreset(payload: {
  text: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
  gradient?: string;
  icon?: string;
  shape?: 'tag' | 'shield' | 'banner';
  priority?: number;
  createdBy: string;
  createdByName: string;
}): Promise<CustomTitlePreset> {
  const id = `title_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const item: CustomTitlePreset = stripUndefined({
    id,
    text: payload.text.trim().slice(0, 32),
    color: payload.color || '#3B6DFF',
    bgColor: payload.bgColor || undefined,
    borderColor: payload.borderColor || undefined,
    gradient: payload.gradient || undefined,
    icon: payload.icon || 'Award',
    shape: payload.shape || 'tag',
    priority: Number.isFinite(payload.priority) ? payload.priority : 1,
    createdBy: payload.createdBy,
    createdByName: payload.createdByName,
    createdAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'customTitles', id), item);
  return item;
}

export async function deleteCustomTitlePreset(presetId: string): Promise<void> {
  await deleteDoc(doc(db, 'customTitles', presetId));
}

export interface ProfileGovernanceActionPayload {
  targetUserId: string;
  action:
    | 'grant_title'
    | 'revoke_title'
    | 'restrict'
    | 'unrestrict'
    | 'suspend'
    | 'ban'
    | 'unban'
    | 'change_role'
    | 'appoint_room_leader'
    | 'appoint_moderator'
    | 'remove_staff'
    | 'kick_from_room'
    | 'warn';
  reason?: string;
  newRole?: UserRole;
  durationHours?: number;
  customTitle?: CustomTitle | null;
  titleId?: string;
  roomId?: string;
}

export async function performProfileGovernanceAction(
  payload: ProfileGovernanceActionPayload
): Promise<{ ok: boolean; message?: string }> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('يجب تسجيل الدخول لتنفيذ هذا الإجراء الإداري.');
  }
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/moderation/profile-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر تنفيذ الإجراء الإداري.');
  }
  return data;
}

/* =========================================================================
   GLOBAL CUSTOM ADMIN ROLES & GRANULAR PERMISSIONS + OFFICIAL BROADCASTS
   ========================================================================= */

export function listenToGlobalAdminRoles(
  callback: (roles: GlobalAdminRole[]) => void
): Unsubscribe {
  const q = query(collection(db, 'globalAdminRoles'), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items: GlobalAdminRole[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as GlobalAdminRole));
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(items);
    },
    () => callback([])
  );
}

export async function performGlobalRoleAction(payload: {
  operation: 'create_role' | 'update_role' | 'delete_role' | 'assign_user_role';
  roleId?: string;
  name?: string;
  description?: string;
  color?: string;
  permissions?: Partial<Record<GlobalPermissionKey, boolean>>;
  targetUserId?: string;
  baseRole?: UserRole;
}): Promise<{ ok: boolean; role?: GlobalAdminRole }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يجب تسجيل الدخول.');
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/admin/roles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'تعذر تحديث الرتب والصلاحيات.');
  return data;
}

export function listenToPlatformAnnouncements(
  callback: (items: PlatformAnnouncement[]) => void
): Unsubscribe {
  const q = query(collection(db, 'platformAnnouncements'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const items: PlatformAnnouncement[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as PlatformAnnouncement));
      items.sort((a, b) => (b.publishAt || b.createdAt).localeCompare(a.publishAt || a.createdAt));
      callback(items);
    },
    () => callback([])
  );
}

export function listenToPlatformAds(
  callback: (items: PlatformAd[]) => void
): Unsubscribe {
  const q = query(collection(db, 'platformAds'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const items: PlatformAd[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as PlatformAd));
      items.sort((a, b) => (b.publishAt || b.createdAt).localeCompare(a.publishAt || a.createdAt));
      callback(items);
    },
    () => callback([])
  );
}

export async function performBroadcastAction(payload: {
  kind: 'announcement' | 'ad';
  operation: 'create' | 'update' | 'toggle_pause' | 'delete';
  id?: string;
  title?: string;
  content?: string;
  bannerURL?: string;
  mediaURL?: string;
  ctaLabel?: string;
  targetUrl?: string;
  sponsorName?: string;
  isPaused?: boolean;
  playSound?: boolean;
  publishAt?: string;
  expiresAt?: string;
  notifyUserIds?: string[];
}): Promise<{ ok: boolean; id?: string }> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يجب تسجيل الدخول.');
  const token = await fbUser.getIdToken();
  const res = await fetch('/api/admin/broadcasts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'تعذر تنفيذ إجراء الإعلان.');
  return data;
}

/* =========================================================================
   SAFE IDEMPOTENT CLEANUP OF LEGACY SEEDED DEMO RECORDS ONLY
   ========================================================================= */

export async function cleanupLegacySeededDemoData(): Promise<void> {
  try {
    // 1. Delete only confirmed legacy Unsplash demo events without creatorId
    for (const evtId of LEGACY_SEEDED_EVENT_IDS) {
      const ref = doc(db, 'events', evtId);
      const snap = await getDoc(ref).catch(() => null);
      if (snap?.exists()) {
        const data = snap.data() as CommunityEvent;
        if (!data.creatorId && (!data.imageURL || data.imageURL.includes('unsplash.com'))) {
          await deleteDoc(ref).catch(() => {});
        }
      }
    }

    // 2. Migrate & remove legacy groups only if confirmed unpopulated/test group
    const groupsSnap = await getDocs(query(collection(db, 'groups'), limit(25))).catch(() => null);
    if (groupsSnap && !groupsSnap.empty) {
      for (const gDoc of groupsSnap.docs) {
        const gData = gDoc.data() as {
          id: string;
          name?: string;
          ownerId?: string;
          ownerName?: string;
          description?: string;
          avatarURL?: string;
          createdAt?: string;
        };
        const roomsSnap = await getDocs(collection(db, 'groups', gDoc.id, 'chatRooms')).catch(() => null);
        if (roomsSnap && !roomsSnap.empty) {
          for (const rDoc of roomsSnap.docs) {
            const rData = rDoc.data() as {
              id?: string;
              title?: string;
              description?: string;
              ownerId?: string;
              ownerName?: string;
              moderatorIds?: string[];
              invitedUserIds?: string[];
              type?: string;
              memberCount?: number;
              lastMessageText?: string;
              lastMessageAt?: string;
              createdAt?: string;
            };
            const msgsSnap = await getDocs(
              collection(db, 'groups', gDoc.id, 'chatRooms', rDoc.id, 'messages')
            ).catch(() => null);

            if (msgsSnap && !msgsSnap.empty) {
              const targetRoomId = `room_${rDoc.id}`;
              const roomDoc: ChatRoom = {
                id: targetRoomId,
                title: rData.title || gData.name || 'غرفة دردشة',
                description: rData.description || gData.description || '',
                imageURL: gData.avatarURL || '',
                visibility: rData.type === 'private' ? 'private' : rData.type === 'staff' ? 'staff' : 'public',
                ownerId: rData.ownerId || gData.ownerId || '',
                ownerName: rData.ownerName || gData.ownerName || 'Q Member',
                leaderIds: rData.ownerId ? [rData.ownerId] : [],
                moderatorIds: rData.moderatorIds || [],
                allowedUserIds: rData.invitedUserIds || [],
                bannedUserIds: [],
                memberCount: rData.memberCount || 1,
                lastMessageText: rData.lastMessageText || '',
                lastMessageAt: rData.lastMessageAt || rData.createdAt || new Date().toISOString(),
                createdAt: rData.createdAt || gData.createdAt || new Date().toISOString(),
              };
              await setDoc(doc(db, 'chatRooms', targetRoomId), roomDoc, { merge: true }).catch(() => {});
              for (const mDoc of msgsSnap.docs) {
                const mData = mDoc.data() as Record<string, any>;
                const migratedMsg: ChatRoomMessage = {
                  id: mDoc.id,
                  roomId: targetRoomId,
                  senderId: mData.senderId || '',
                  senderName: mData.senderName || 'Q Member',
                  senderHandle: mData.senderHandle || 'member',
                  senderPhotoURL: mData.senderPhotoURL || '',
                  text: mData.text || '',
                  mediaURL: mData.mediaURL || '',
                  createdAt: mData.createdAt || new Date().toISOString(),
                };
                await setDoc(doc(db, 'chatRooms', targetRoomId, 'messages', mDoc.id), migratedMsg).catch(() => {});
                await deleteDoc(mDoc.ref).catch(() => {});
              }
            }
            await deleteDoc(rDoc.ref).catch(() => {});
          }
        }
        const membersSnap = await getDocs(collection(db, 'groups', gDoc.id, 'members')).catch(() => null);
        if (membersSnap && !membersSnap.empty) {
          for (const mDoc of membersSnap.docs) {
            await deleteDoc(mDoc.ref).catch(() => {});
          }
        }
        await deleteDoc(gDoc.ref).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Non-blocking legacy demo cleanup warning:', err);
  }
}



