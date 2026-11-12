import { Heart, MessageSquare, UserPlus, CheckCheck } from 'lucide-react';
import { NotificationItem } from '../../types';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../services/firestore';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/date';

interface NotificationsDrawerProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onSelectTarget: (targetId?: string, type?: string) => void;
}

export function NotificationsDrawer({
  notifications,
  onClose,
  onSelectTarget,
}: NotificationsDrawerProps) {
  const { currentUser } = useAuth();

  const handleMarkAll = async () => {
    if (!currentUser?.id) return;
    await markAllNotificationsAsRead(currentUser.id);
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }
    onSelectTarget(notif.targetId, notif.type);
    onClose();
  };

  return (
    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#161B26] border border-[#2A2F3A] rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up font-tajawal">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2F3A] bg-[#0B0F19]/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white tracking-wide">الإشعارات</span>
          {notifications.filter((n) => !n.read).length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#3B6DFF]/20 text-[#4F8CFF] text-[10px] font-bold border border-[#3B6DFF]/30">
              {notifications.filter((n) => !n.read).length} جديد
            </span>
          )}
        </div>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={handleMarkAll}
            className="flex items-center gap-1 text-[11px] text-[#4F8CFF] hover:text-white font-medium transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-[#2A2F3A]/60">
        {notifications.length > 0 ? (
          notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleItemClick(notif)}
              className={`w-full p-3 flex items-start gap-3 text-right transition-colors ${
                notif.read ? 'hover:bg-[#1E1E2E]/40 opacity-70' : 'bg-[#0B0F19]/40 hover:bg-[#1E1E2E]/70 border-r-2 border-[#3B6DFF]'
              }`}
            >
              <div className="relative shrink-0">
                <img
                  src={notif.senderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${notif.senderName}`}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border border-[#2A2F3A]"
                />
                <div className="absolute -bottom-1 -left-1 p-0.5 rounded-full bg-[#0B0F19]">
                  {notif.type === 'like' && <Heart className="w-3 h-3 text-red-500 fill-red-500" />}
                  {notif.type === 'comment' && <MessageSquare className="w-3 h-3 text-[#3B6DFF] fill-[#3B6DFF]" />}
                  {notif.type === 'follow' && <UserPlus className="w-3 h-3 text-[#4F8CFF]" />}
                  {notif.type === 'message' && <MessageSquare className="w-3 h-3 text-emerald-400" />}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{notif.senderName} </span>
                  {notif.message}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {formatRelativeTime(notif.createdAt)}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="p-8 text-center">
            <p className="text-xs text-slate-400">لا توجد إشعارات حالياً.</p>
            <p className="text-[11px] text-slate-600 mt-1">ستصلك التفاعلات الاجتماعية والأنشطة هنا فور حدوثها.</p>
          </div>
        )}
      </div>
    </div>
  );
}
