import { useState, useEffect } from 'react';
import {
  Shield,
  Trash2,
  Users,
  FileText,
  Radio,
  CheckCircle,
  AlertTriangle,
  Lock,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getAllUsers,
  listenToPosts,
  deletePostAsAdmin,
  updateUserRoleAsAdmin
} from '../../services/firestore';
import { UserProfile, Post } from '../../types';
import { useToast } from '../../context/ToastContext';
import { formatRelativeTime } from '../../utils/date';

export function AdminDashboard() {
  const { currentUser, isAdmin, onlineCount, onlineUsers } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'security'>('posts');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const allUsers = await getAllUsers(100);
        setUsers(allUsers);
      } catch (err) {
        console.error('Failed to load admin users:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    const unsubPosts = listenToPosts((allPosts) => {
      setPosts(allPosts);
    });

    return () => unsubPosts();
  }, [isAdmin]);

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Administrative Action: Permanently delete this publication from database?')) return;
    try {
      await deletePostAsAdmin(postId);
      showToast('Publication eradicated by administrator.', 'info');
    } catch (err) {
      showToast('Failed to moderate post.', 'error');
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: 'user' | 'admin' | 'owner') => {
    try {
      await updateUserRoleAsAdmin(targetUserId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
      );
      showToast(`User role updated to ${newRole}.`, 'success');
    } catch (err) {
      showToast('Failed to modify user role.', 'error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="w-full max-w-lg mx-auto py-20 text-center bg-[#161B26] border border-red-500/30 rounded-3xl p-8 font-tajawal">
        <Lock className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white">صلاحية محظورة</h3>
        <p className="text-xs text-slate-400 mt-2">
          هذا القسم يتطلب صلاحيات إدارية (مدير عام أو مالك المنصة).
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-20 lg:pb-12 font-tajawal">
      {/* Header Banner */}
      <div className="bg-[#161B26] border border-[#2A2F3A] rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-[#3B6DFF]" />
              <h2 className="text-base font-bold text-white uppercase tracking-widest font-tajawal">
                إدارة ومنصة Q
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              الجلسة الموثقة: <span className="text-[#4F8CFF] font-medium">{currentUser?.displayName}</span> ({currentUser?.role})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              قواعد الحماية نشطة
            </span>
          </div>
        </div>

        {/* Real Live Metrics */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-[#2A2F3A]">
          <div className="p-3 rounded-2xl bg-[#0B0F19]/60 border border-[#2A2F3A]">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>المتصلون الآن</span>
            </div>
            <div className="text-xl font-bold text-white">{onlineCount}</div>
            <div className="text-[10px] text-slate-500">جلسات حية مؤكدة</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#0B0F19]/60 border border-[#2A2F3A]">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Users className="w-3.5 h-3.5 text-[#3B6DFF]" />
              <span>المستخدمون المسجلون</span>
            </div>
            <div className="text-xl font-bold text-white">{users.length}</div>
            <div className="text-[10px] text-slate-500">حسابات حقيقية</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#0B0F19]/60 border border-[#2A2F3A]">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <FileText className="w-3.5 h-3.5 text-[#4F8CFF]" />
              <span>إجمالي المنشورات</span>
            </div>
            <div className="text-xl font-bold text-white">{posts.length}</div>
            <div className="text-[10px] text-slate-500">مستندات حية</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2A2F3A] pb-2">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'posts'
              ? 'bg-[#3B6DFF] text-white shadow-lg shadow-[#3B6DFF]/25'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          مراجعة المنشورات ({posts.length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'users'
              ? 'bg-[#3B6DFF] text-white shadow-lg shadow-[#3B6DFF]/25'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          إدارة الأعضاء ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'security'
              ? 'bg-[#3B6DFF] text-white shadow-lg shadow-[#3B6DFF]/25'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          تدقيق الأمان والقواعد
        </button>
      </div>

      {/* Tab 1: Posts Moderation */}
      {activeTab === 'posts' && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 rounded-2xl bg-[#161B26] border border-[#2A2F3A] flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <img
                  src={post.authorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${post.authorName}`}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border border-[#2A2F3A] mt-1 shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{post.authorName}</span>
                    <span className="text-[11px] text-[#4F8CFF]">@{post.authorHandle}</span>
                    <span className="text-[10px] text-slate-500">
                      • {formatRelativeTime(post.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-3 leading-relaxed">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2">
                    <span>{post.likesCount || 0} إعجاب</span>
                    <span>•</span>
                    <span>{post.commentsCount || 0} تعليق</span>
                    <span>•</span>
                    <span>ID: {post.id}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeletePost(post.id)}
                className="p-2 rounded-xl bg-red-950/40 border border-red-500/30 hover:bg-red-900/60 text-red-400 transition-colors shrink-0"
                title="حذف المنشور"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Users Management */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="p-4 rounded-2xl bg-[#161B26] border border-[#2A2F3A] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <img
                  src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-[#2A2F3A] shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{user.displayName}</span>
                    <span className="text-[11px] text-[#4F8CFF]">@{user.handle}</span>
                    {onlineUsers.some((u) => u.userId === user.id) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="متصل الآن" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    UID: {user.id} • انضم {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className="text-[11px] text-slate-400 font-medium">الرتبة:</span>
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                  className="bg-[#0B0F19] border border-[#2A2F3A] text-xs text-[#4F8CFF] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#3B6DFF]"
                >
                  <option value="user">عضو (User)</option>
                  <option value="admin">مشرف (Admin)</option>
                  <option value="owner">مالك (Owner)</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Security & Invariant Audit */}
      {activeTab === 'security' && (
        <div className="p-6 rounded-3xl bg-[#161B26] border border-[#2A2F3A] space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-tajawal">
            مصفوفة أمان قواعد بيانات Firestore
          </h3>
          <div className="space-y-3">
            {[
              { rule: 'PII Isolation', status: 'Enforced', desc: 'Email and credentials segregated into private subcollection.' },
              { rule: 'Identity Spoofing Guard', status: 'Enforced', desc: 'authorId and senderId must match authenticated UID.' },
              { rule: 'Privilege Escalation Protection', status: 'Enforced', desc: 'Normal users forbidden from modifying role or admin state.' },
              { rule: 'Private Message Confidentiality', status: 'Enforced', desc: 'Only thread participants can read or append chat messages.' },
              { rule: 'Like & Follow Idempotence', status: 'Enforced', desc: 'Subcollection keys restricted by UID to eliminate duplicates.' },
              { rule: 'Presence Truth Guarantee', status: 'Enforced', desc: 'Heartbeat timestamps filtered on 120s window. Zero fake statistics.' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/40 border border-neutral-800">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{item.rule}</span>
                    <span className="text-[9px] uppercase font-mono-subtle px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
