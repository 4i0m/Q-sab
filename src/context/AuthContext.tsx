import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, testConnection } from '../firebase/config';
import {
  UserProfile,
  PresenceRecord,
  UserRole,
  getRoleRank
} from '../types';
import {
  syncUserProfile,
  getUserProfile,
  sendPresenceHeartbeat,
  listenToActivePresence,
  cleanupLegacySeededDemoData
} from '../services/firestore';
import { useToast } from './ToastContext';

interface AuthContextValue {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  isAssistantAdmin: boolean;
  isRoomLeader: boolean;
  isOwner: boolean;
  isStaff: boolean;
  roleRank: number;
  onlineCount: number;
  onlineUsers: PresenceRecord[];
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [onlineUsers, setOnlineUsers] = useState<PresenceRecord[]>([]);
  const { showToast } = useToast();

  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupRanRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const updated = await getUserProfile(currentUser.id);
      if (updated) {
        setCurrentUser(updated);
      }
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const profile = await syncUserProfile({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || (fbUser.isAnonymous ? 'Q Member' : null),
            photoURL: fbUser.photoURL,
          });
          setCurrentUser(profile);
          void sendPresenceHeartbeat(profile.id, profile.displayName, profile.photoURL, true);

          if ((profile.role === 'owner' || profile.role === 'admin') && !cleanupRanRef.current) {
            cleanupRanRef.current = true;
            void cleanupLegacySeededDemoData();
          }
        } catch (err) {
          console.error('Error syncing user profile on auth change:', err);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.id) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    sendPresenceHeartbeat(currentUser.id, currentUser.displayName, currentUser.photoURL, true);

    heartbeatIntervalRef.current = setInterval(() => {
      sendPresenceHeartbeat(currentUser.id, currentUser.displayName, currentUser.photoURL, true);
    }, 45000);

    const handleBeforeUnload = () => {
      sendPresenceHeartbeat(currentUser.id, currentUser.displayName, currentUser.photoURL, false);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser?.id, currentUser?.displayName, currentUser?.photoURL]);

  useEffect(() => {
    const unsubPresence = listenToActivePresence((activeList, totalActive) => {
      setOnlineUsers(activeList);
      setOnlineCount(totalActive);
    });

    return () => unsubPresence();
  }, []);

  const loginWithGoogle = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      const profile = await syncUserProfile({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      });

      setCurrentUser(profile);
      showToast(`مرحباً بك في منصة Q، ${profile.displayName}. ✨`, 'success');
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        // Silent cancel
      } else if (err.code === 'auth/network-request-failed' || err.code === 'auth/popup-blocked') {
        showToast('تم حظر النافذة المنبثقة من قِبل المتصفح. يمكنك تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.', 'info');
      } else {
        showToast(err.message || 'فشل تسجيل الدخول. يرجى المحاولة ثانية.', 'error');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      setLoading(true);
      const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const profile = await syncUserProfile({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      });
      setCurrentUser(profile);
      showToast(`مرحباً بك مجدداً يا ${profile.displayName}. ✨`, 'success');
    } catch (err: any) {
      console.error('Email Sign-In Error:', err);
      let message = 'تعذر تسجيل الدخول بالبريد وكلمة المرور.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'صيغة البريد الإلكتروني غير صالحة.';
      }
      showToast(message, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string) => {
    try {
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await updateProfile(result.user, { displayName: displayName.trim() });
      const profile = await syncUserProfile({
        uid: result.user.uid,
        email: result.user.email,
        displayName: displayName.trim(),
        photoURL: undefined,
      });
      setCurrentUser(profile);
      showToast(`تم إنشاء حسابك في منصة Q بنجاح، أهلاً بك يا ${displayName.trim()}! 🎉`, 'success');
    } catch (err: any) {
      console.error('Email Registration Error:', err);
      let message = 'تعذر إنشاء الحساب.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.';
      } else if (err.code === 'auth/weak-password') {
        message = 'كلمة المرور ضعيفة. يجب أن تتكون من 6 أحرف على الأقل.';
      }
      showToast(message, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (currentUser?.id) {
      await sendPresenceHeartbeat(currentUser.id, currentUser.displayName, currentUser.photoURL, false);
    }
    await firebaseSignOut(auth);
    setCurrentUser(null);
    showToast('تم تسجيل الخروج من منصة Q.', 'info');
  };

  const role: UserRole = currentUser?.role || 'user';
  const roleRank = getRoleRank(role);
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || role === 'owner';
  const isAssistantAdmin = roleRank >= getRoleRank('assistant_admin');
  const isRoomLeader = roleRank >= getRoleRank('room_leader');
  const isStaff = roleRank >= getRoleRank('moderator');

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        loading,
        isAdmin,
        isAssistantAdmin,
        isRoomLeader,
        isOwner,
        isStaff,
        roleRank,
        onlineCount,
        onlineUsers,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
        signOut: logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
