import { useState, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Settings,
  Heart,
  MessageCircle,
  UserPlus,
  Calendar,
  Award,
  CheckCheck
} from 'lucide-react';
import { NotificationItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  listenToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../../services/firestore';
import { formatRelativeTime } from '../../utils/date';

interface NotificationsViewProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  onSelectTarget?: (targetId?: string, type?: string) => void;
}

export function NotificationsView({
  onBack,
  onOpenSettings,
  onSelectTarget,
}: NotificationsViewProps) {
  const { currentUser } = useAuth();
  const { isRTL, t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'follows' | 'likes_comments' | 'messages'>('all');

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = listenToNotifications(currentUser.id, (loaded) => {
      setNotifications(loaded);
    });
    return () => unsub();
  }, [currentUser?.id]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'follows') return notif.type === 'follow';
    if (filter === 'likes_comments') return notif.type === 'like' || notif.type === 'comment';
    if (filter === 'messages') return notif.type === 'message';
    return true;
  });

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }
    if (onSelectTarget) {
      onSelectTarget(notif.targetId, notif.type);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto pb-24 space-y-4">
      {/* Top Bar matching Screen 6 */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2F3A]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-white font-tajawal">{t('notifications')}</h1>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && currentUser?.id && (
            <button
              onClick={() => markAllNotificationsAsRead(currentUser.id)}
              className="p-1.5 text-xs text-[#4F8CFF] hover:text-white transition-colors flex items-center gap-1 font-tajawal cursor-pointer"
              title="تحديد الكل كمقروء"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills matching Screen 6: الكل | الإعجابات | التعليقات | الرسائل */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold font-tajawal transition-all shrink-0 cursor-pointer ${
            filter === 'all'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-white'
          }`}
        >
          {t('all')}
        </button>

        <button
          onClick={() => setFilter('likes_comments')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold font-tajawal transition-all shrink-0 cursor-pointer ${
            filter === 'likes_comments'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-white'
          }`}
        >
          {t('likesAndComments')}
        </button>

        <button
          onClick={() => setFilter('follows')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold font-tajawal transition-all shrink-0 cursor-pointer ${
            filter === 'follows'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-white'
          }`}
        >
          متابعات
        </button>

        <button
          onClick={() => setFilter('messages')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold font-tajawal transition-all shrink-0 cursor-pointer ${
            filter === 'messages'
              ? 'bg-[#3B6DFF] text-white shadow-md shadow-[#3B6DFF]/25'
              : 'bg-[#161B26] border border-[#2A2F3A] text-[#94A3B8] hover:text-white'
          }`}
        >
          {t('messages')}
        </button>
      </div>

      {/* Notification Items List matching Screen 6 */}
      <div className="space-y-2">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleItemClick(notif)}
              className={`w-full p-3.5 rounded-2xl flex items-center justify-between gap-3 text-start transition-all border cursor-pointer ${
                notif.read
                  ? 'bg-[#161B26] border-[#2A2F3A] hover:border-[#3B6DFF]/40'
                  : 'bg-[#1E1E2E] border-[#3B6DFF]/40 shadow-md shadow-[#3B6DFF]/10'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar with type badge */}
                <div className="relative shrink-0">
                  <img
                    src={notif.senderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${notif.senderName}`}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover border border-[#3B6DFF]/30"
                  />
                  <div className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-[#0B0F19] flex items-center justify-center p-0.5 border border-[#2A2F3A]">
                    {notif.type === 'follow' && <UserPlus className="w-3 h-3 text-[#3B6DFF]" />}
                    {notif.type === 'like' && <Heart className="w-3 h-3 text-red-400 fill-red-400" />}
                    {notif.type === 'comment' && <MessageCircle className="w-3 h-3 text-[#4F8CFF] fill-[#4F8CFF]" />}
                    {notif.type === 'event' && <Calendar className="w-3 h-3 text-[#3B6DFF]" />}
                    {notif.type === 'badge' && <Award className="w-3 h-3 text-[#4F8CFF]" />}
                    {notif.type === 'message' && <MessageCircle className="w-3 h-3 text-emerald-400" />}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs text-white font-tajawal font-medium leading-relaxed truncate">
                    <span className="font-bold">{notif.senderName} </span>
                    {notif.message}
                  </p>
                  <span className="text-[10px] text-[#64748B] font-mono-subtle mt-0.5 block">
                    {formatRelativeTime(notif.createdAt)}
                  </span>
                </div>
              </div>

              {/* Thumbnail preview if present */}
              {notif.postThumbnail && (
                <img
                  src={notif.postThumbnail}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover border border-[#2A2F3A] shrink-0"
                />
              )}
            </button>
          ))
        ) : (
          <div className="py-16 text-center bg-[#161B26] border border-[#2A2F3A] rounded-2xl p-6">
            <p className="text-xs text-[#94A3B8] font-tajawal">لا توجد إشعارات حالياً.</p>
          </div>
        )}
      </div>
    </div>
  );
}
