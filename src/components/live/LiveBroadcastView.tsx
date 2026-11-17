import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio,
  Plus,
  Users,
  Send,
  X,
  ArrowRight,
  ArrowLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Youtube,
  Link2,
  Camera,
  Trash2,
  VolumeX,
  Volume2,
  Ban,
  MessageSquareOff,
  MessageSquare,
  Power,
  ImagePlus,
  Loader2,
  Play,
  Pause,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import {
  ChatRoom,
  LiveBroadcast,
  LiveBroadcastMessage,
  LiveBroadcastMode,
  LiveBroadcastReaction
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from '../common/MediaImage';
import { uploadMedia } from '../../services/storage';
import { listenToChatRooms } from '../../services/chatRooms';
import {
  awardLiveXp,
  createLiveBroadcast,
  deleteLiveMessage,
  deleteLiveSignal,
  extractYoutubeVideoId,
  joinLiveViewerPresence,
  leaveLiveViewerPresence,
  listenToLiveBroadcast,
  listenToLiveBroadcasts,
  listenToLiveMessages,
  listenToLiveReactions,
  listenToLiveSignals,
  moderateLiveBroadcast,
  sendLiveMessage,
  sendLiveReaction,
  sendLiveSignal,
  updateLivePlaybackState
} from '../../services/live';
import { formatRelativeTime } from '../../utils/date';

const LIVE_REACTIONS = ['❤️', '🔥', '👏', '😮', '🎉'] as const;
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

interface LiveBroadcastViewProps {
  onSelectAuthor?: (userId: string) => void;
  onBack?: () => void;
}

export function LiveBroadcastView({ onSelectAuthor, onBack }: LiveBroadcastViewProps) {
  const { currentUser, isAdmin } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const canManageLiveGlobal = isAdmin || Boolean(currentUser?.globalPermissions?.manageLive);

  // Directory state
  const [broadcasts, setBroadcasts] = useState<LiveBroadcast[]>([]);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);
  const [activeBroadcast, setActiveBroadcast] = useState<LiveBroadcast | null>(null);
  const [myRooms, setMyRooms] = useState<ChatRoom[]>([]);

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<LiveBroadcastMode>('youtube_embed');
  const [sourceUrl, setSourceUrl] = useState('');
  const [coverURL, setCoverURL] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // In-room chat & reactions
  const [messages, setMessages] = useState<LiveBroadcastMessage[]>([]);
  const [reactions, setReactions] = useState<LiveBroadcastReaction[]>([]);
  const [chatText, setChatText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [isEndingStream, setIsEndingStream] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // External <video> ref
  const externalVideoRef = useRef<HTMLVideoElement>(null);

  // WebRTC P2P camera/screen state
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());

  const [isStreamingLocal, setIsStreamingLocal] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [rtcStatus, setRtcStatus] = useState<string>('');

  // Listen to directory
  useEffect(() => {
    const unsub = listenToLiveBroadcasts(setBroadcasts);
    return () => unsub();
  }, []);

  // Optional rooms for host dropdown when create modal opens
  useEffect(() => {
    if (!isCreateOpen || !currentUser) return;
    const unsub = listenToChatRooms(currentUser, setMyRooms);
    return () => unsub();
  }, [isCreateOpen, currentUser]);

  // Listen to selected broadcast + chat + reactions + presence
  useEffect(() => {
    if (!selectedBroadcastId) {
      setActiveBroadcast(null);
      setMessages([]);
      setReactions([]);
      return;
    }

    const unsubDoc = listenToLiveBroadcast(selectedBroadcastId, setActiveBroadcast);
    const unsubMsgs = listenToLiveMessages(selectedBroadcastId, setMessages);
    const unsubReacts = listenToLiveReactions(selectedBroadcastId, setReactions);

    if (currentUser) {
      void joinLiveViewerPresence(selectedBroadcastId, currentUser);
    }

    return () => {
      unsubDoc();
      unsubMsgs();
      unsubReacts();
      if (currentUser) {
        void leaveLiveViewerPresence(selectedBroadcastId, currentUser.id);
      }
    };
  }, [selectedBroadcastId, currentUser?.id]);

  // Scroll chat to newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Sync external video playback state from host
  useEffect(() => {
    const vid = externalVideoRef.current;
    if (!vid || !activeBroadcast || activeBroadcast.mode !== 'external_stream') return;
    const isHost = currentUser?.id === activeBroadcast.hostId;
    if (isHost) return;

    const targetPos = activeBroadcast.playbackPositionSec || 0;
    if (Math.abs((vid.currentTime || 0) - targetPos) > 4) {
      try {
        vid.currentTime = targetPos;
      } catch {
        // Seek before metadata loaded
      }
    }
    if (activeBroadcast.playbackState === 'playing' && vid.paused) {
      void vid.play().catch(() => {});
    } else if (activeBroadcast.playbackState === 'paused' && !vid.paused) {
      vid.pause();
    }
  }, [
    activeBroadcast?.playbackState,
    activeBroadcast?.playbackPositionSec,
    activeBroadcast?.playbackUpdatedAt,
    activeBroadcast?.mode,
    currentUser?.id,
    activeBroadcast?.hostId,
  ]);

  // Periodic watch / host XP award every 3 minutes
  useEffect(() => {
    if (!activeBroadcast || activeBroadcast.status !== 'live' || !currentUser) return;
    const isHost = currentUser.id === activeBroadcast.hostId;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void awardLiveXp(activeBroadcast.id, isHost ? 'host' : 'watch').then((res) => {
        if (res?.awarded && res.xpDelta) {
          showToast(
            isHost
              ? `+${res.xpDelta} XP مكافأة استضافة البث المباشر`
              : `+${res.xpDelta} XP مكافأة متابعة البث المباشر`,
            'success'
          );
        }
      });
    }, 180_000);

    return () => clearInterval(timer);
  }, [activeBroadcast?.id, activeBroadcast?.status, activeBroadcast?.hostId, currentUser?.id]);

  // Cleanup WebRTC streams and peers on room exit / unmount
  const stopWebRtcEverything = () => {
    peersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    peersRef.current.clear();

    if (viewerPeerRef.current) {
      try {
        viewerPeerRef.current.close();
      } catch {
        // ignore
      }
      viewerPeerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    processedSignalIdsRef.current.clear();
    setIsStreamingLocal(false);
    setIsScreenSharing(false);
    setRtcStatus('');
  };

  useEffect(() => {
    return () => {
      stopWebRtcEverything();
    };
  }, [selectedBroadcastId]);

  // Attach local stream whenever video ref mounts
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isStreamingLocal]);

  // WebRTC signaling handler when mode === 'camera_webrtc'
  useEffect(() => {
    if (
      !activeBroadcast ||
      activeBroadcast.status !== 'live' ||
      activeBroadcast.mode !== 'camera_webrtc' ||
      !currentUser
    ) {
      return;
    }

    const broadcastId = activeBroadcast.id;
    const isHost = currentUser.id === activeBroadcast.hostId;

    // Viewer initiates readiness to receive offer from host
    if (!isHost) {
      setRtcStatus('بانتظار إشارة البث من المضيف...');
      void sendLiveSignal(broadcastId, {
        fromUserId: currentUser.id,
        toUserId: activeBroadcast.hostId,
        type: 'offer',
        payload: JSON.stringify({ ready: true }),
      }).catch(() => {});
    }

    const unsubSignals = listenToLiveSignals(broadcastId, currentUser.id, async (signals) => {
      for (const sig of signals) {
        if (processedSignalIdsRef.current.has(sig.id)) continue;
        processedSignalIdsRef.current.add(sig.id);
        void deleteLiveSignal(broadcastId, sig.id);

        try {
          const parsed = sig.payload
            ? (JSON.parse(sig.payload) as {
                ready?: boolean;
                sdp?: RTCSessionDescriptionInit;
                candidate?: RTCIceCandidateInit;
              })
            : {};

          if (isHost) {
            if (sig.type === 'offer' && parsed.ready) {
              const stream = localStreamRef.current;
              if (!stream) continue;

              const existing = peersRef.current.get(sig.fromUserId);
              if (existing) existing.close();

              const pc = new RTCPeerConnection(RTC_CONFIG);
              peersRef.current.set(sig.fromUserId, pc);
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));

              pc.onicecandidate = (ev) => {
                if (ev.candidate) {
                  void sendLiveSignal(broadcastId, {
                    fromUserId: currentUser.id,
                    toUserId: sig.fromUserId,
                    type: 'ice',
                    payload: JSON.stringify({ candidate: ev.candidate.toJSON() }),
                  });
                }
              };

              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await sendLiveSignal(broadcastId, {
                fromUserId: currentUser.id,
                toUserId: sig.fromUserId,
                type: 'offer',
                payload: JSON.stringify({ sdp: pc.localDescription }),
              });
            } else if (sig.type === 'answer' && parsed.sdp) {
              const pc = peersRef.current.get(sig.fromUserId);
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(parsed.sdp));
              }
            } else if (sig.type === 'ice' && parsed.candidate) {
              const pc = peersRef.current.get(sig.fromUserId);
              if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(parsed.candidate));
              }
            }
          } else {
            // Viewer side
            if (sig.type === 'offer' && parsed.sdp) {
              if (viewerPeerRef.current) viewerPeerRef.current.close();
              const pc = new RTCPeerConnection(RTC_CONFIG);
              viewerPeerRef.current = pc;

              pc.ontrack = (ev) => {
                const [remoteStream] = ev.streams;
                if (remoteVideoRef.current && remoteStream) {
                  remoteVideoRef.current.srcObject = remoteStream;
                  setRtcStatus('متصل بالبث المباشر');
                }
              };

              pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'failed') {
                  setRtcStatus('تعذر اتصال P2P المباشر (قد يتطلب خادم TURN على هذه الشبكة).');
                }
              };

              pc.onicecandidate = (ev) => {
                if (ev.candidate) {
                  void sendLiveSignal(broadcastId, {
                    fromUserId: currentUser.id,
                    toUserId: activeBroadcast.hostId,
                    type: 'ice',
                    payload: JSON.stringify({ candidate: ev.candidate.toJSON() }),
                  });
                }
              };

              await pc.setRemoteDescription(new RTCSessionDescription(parsed.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendLiveSignal(broadcastId, {
                fromUserId: currentUser.id,
                toUserId: activeBroadcast.hostId,
                type: 'answer',
                payload: JSON.stringify({ sdp: pc.localDescription }),
              });
            } else if (sig.type === 'ice' && parsed.candidate && viewerPeerRef.current) {
              await viewerPeerRef.current.addIceCandidate(new RTCIceCandidate(parsed.candidate));
            }
          }
        } catch {
          // Ignore malformed/outdated signaling packet
        }
      }
    });

    return () => unsubSignals();
  }, [
    activeBroadcast?.id,
    activeBroadcast?.status,
    activeBroadcast?.mode,
    activeBroadcast?.hostId,
    currentUser?.id,
    isStreamingLocal,
  ]);

  const startHostMedia = async (screenShare: boolean) => {
    if (!navigator.mediaDevices) {
      showToast('المتصفح لا يدعم الوصول إلى الكاميرا أو الشاشة هنا.', 'error');
      return;
    }
    try {
      stopWebRtcEverything();
      const stream = screenShare
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      localStreamRef.current = stream;
      setIsStreamingLocal(true);
      setIsScreenSharing(screenShare);
      setIsMicOn(true);
      setIsCamOn(true);
      setRtcStatus(screenShare ? 'تشارك الشاشة حالياً' : 'الكاميرا قيد البث المباشر');
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch {
      showToast('تعذر الوصول إلى الكاميرا/الشاشة أو تم إلغاء الإذن.', 'error');
    }
  };

  const toggleLocalAudio = () => {
    if (!localStreamRef.current) return;
    const next = !isMicOn;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setIsMicOn(next);
  };

  const toggleLocalVideo = () => {
    if (!localStreamRef.current) return;
    const next = !isCamOn;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setIsCamOn(next);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCover(true);
    try {
      const url = await uploadMedia(file, 'live');
      setCoverURL(url);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر رفع صورة الغلاف.', 'error');
    } finally {
      setIsUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('يجب تسجيل الدخول لبدء بث مباشر.', 'error');
      return;
    }
    if (!title.trim()) {
      showToast('عنوان البث مطلوب.', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const created = await createLiveBroadcast(
        {
          title: title.trim(),
          description: description.trim(),
          coverURL,
          mode,
          sourceUrl: mode === 'camera_webrtc' ? '' : sourceUrl.trim(),
          roomId: roomId || undefined,
        },
        currentUser
      );
      showToast('تم إطلاق البث المباشر بنجاح.', 'success');
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setSourceUrl('');
      setCoverURL('');
      setRoomId('');
      setSelectedBroadcastId(created.id);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر بدء البث المباشر.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBroadcast || !currentUser || !chatText.trim()) return;
    setIsSendingChat(true);
    try {
      await sendLiveMessage(activeBroadcast.id, currentUser, chatText);
      setChatText('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر إرسال الرسالة.', 'error');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleModerate = async (
    action: 'end_broadcast' | 'toggle_chat' | 'mute_viewer' | 'unmute_viewer' | 'ban_viewer',
    targetUserId?: string
  ) => {
    if (!activeBroadcast) return;
    try {
      await moderateLiveBroadcast({
        broadcastId: activeBroadcast.id,
        action,
        targetUserId,
      });
      if (action === 'end_broadcast') {
        stopWebRtcEverything();
        showToast('تم إنهاء البث المباشر.', 'info');
      } else if (action === 'toggle_chat') {
        showToast(
          activeBroadcast.isChatEnabled ? 'تم إغلاق دردشة البث مؤقتاً.' : 'تم فتح دردشة البث.',
          'info'
        );
      } else {
        showToast('تم تحديث صلاحية المشاهد في البث.', 'info');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء.', 'error');
    }
  };

  const youtubeStartSec = useMemo(() => {
    if (!activeBroadcast || activeBroadcast.mode !== 'youtube_embed') return 0;
    const base = activeBroadcast.playbackPositionSec || 0;
    if (activeBroadcast.playbackState !== 'playing' || !activeBroadcast.playbackUpdatedAt) return base;
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(activeBroadcast.playbackUpdatedAt).getTime()) / 1000)
    );
    return base + elapsed;
  }, [activeBroadcast?.id, activeBroadcast?.playbackPositionSec, activeBroadcast?.playbackState, activeBroadcast?.playbackUpdatedAt]);

  // ---------------- IN-ROOM BROADCAST VIEW ----------------
  if (selectedBroadcastId && activeBroadcast) {
    const isHost = currentUser?.id === activeBroadcast.hostId;
    const canModerate = isHost || canManageLiveGlobal;
    const isMuted = Boolean(currentUser && (activeBroadcast.mutedUserIds || []).includes(currentUser.id));
    const isBanned = Boolean(currentUser && (activeBroadcast.bannedUserIds || []).includes(currentUser.id));
    const ytId =
      activeBroadcast.youtubeVideoId ||
      (activeBroadcast.sourceUrl ? extractYoutubeVideoId(activeBroadcast.sourceUrl) : null);

    return (
      <div className="w-full max-w-3xl mx-auto pb-24 space-y-4 font-tajawal">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                stopWebRtcEverything();
                setSelectedBroadcastId(null);
              }}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
              aria-label="العودة لقائمة البث"
            >
              <BackArrow className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 ${
                    activeBroadcast.status === 'live'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {activeBroadcast.status === 'live' ? 'LIVE' : 'منتهي'}
                </span>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {activeBroadcast.title}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                <button
                  type="button"
                  onClick={() => onSelectAuthor?.(activeBroadcast.hostId)}
                  className="hover:underline cursor-pointer font-bold text-slate-700 dark:text-slate-300"
                >
                  {activeBroadcast.hostName}
                </button>
                <span>•</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Users className="w-3 h-3" />
                  {activeBroadcast.viewerCount || 0} مشاهد
                </span>
              </div>
            </div>
          </div>

          {canModerate && activeBroadcast.status === 'live' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleModerate('toggle_chat')}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                title={activeBroadcast.isChatEnabled ? 'إيقاف الدردشة' : 'فتح الدردشة'}
              >
                {activeBroadcast.isChatEnabled ? (
                  <MessageSquareOff className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span className="hidden sm:inline">
                  {activeBroadcast.isChatEnabled ? 'كتم الدردشة' : 'فتح الدردشة'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmEndOpen(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>إنهاء البث</span>
              </button>
            </div>
          )}
        </div>

        {/* Player Surface */}
        <div className="bg-black rounded-3xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A] shadow-xl">
          {activeBroadcast.status !== 'live' ? (
            <div className="aspect-video flex flex-col items-center justify-center text-center p-6 text-slate-300 space-y-2">
              <Radio className="w-10 h-10 text-slate-500" />
              <p className="text-sm font-bold text-white">انتهت جلسة البث المباشر</p>
              <p className="text-xs text-slate-400">يمكنك مراجعة رسائل الجلسة أدناه أو العودة لقائمة البث.</p>
            </div>
          ) : activeBroadcast.mode === 'youtube_embed' && ytId ? (
            <div className="aspect-video w-full">
              <iframe
                title={activeBroadcast.title}
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&start=${youtubeStartSec}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          ) : activeBroadcast.mode === 'external_stream' ? (
            <div className="relative">
              <video
                ref={externalVideoRef}
                src={activeBroadcast.sourceUrl}
                controls
                playsInline
                autoPlay
                className="w-full aspect-video bg-black"
                onPlay={() => {
                  if (isHost && externalVideoRef.current) {
                    void updateLivePlaybackState(
                      activeBroadcast.id,
                      'playing',
                      externalVideoRef.current.currentTime
                    );
                  }
                }}
                onPause={() => {
                  if (isHost && externalVideoRef.current) {
                    void updateLivePlaybackState(
                      activeBroadcast.id,
                      'paused',
                      externalVideoRef.current.currentTime
                    );
                  }
                }}
                onSeeked={() => {
                  if (isHost && externalVideoRef.current) {
                    void updateLivePlaybackState(
                      activeBroadcast.id,
                      externalVideoRef.current.paused ? 'paused' : 'playing',
                      externalVideoRef.current.currentTime
                    );
                  }
                }}
              />
              {isHost && (
                <div className="p-2.5 bg-[#0B1120] border-t border-slate-800 flex items-center justify-between text-xs text-slate-200">
                  <span className="text-[11px] text-slate-400">أدوات مزامنة المشاهدين:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const pos = externalVideoRef.current?.currentTime || 0;
                        void externalVideoRef.current?.play().catch(() => {});
                        void updateLivePlaybackState(activeBroadcast.id, 'playing', pos);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>تشغيل للجميع</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const pos = externalVideoRef.current?.currentTime || 0;
                        externalVideoRef.current?.pause();
                        void updateLivePlaybackState(activeBroadcast.id, 'paused', pos);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>إيقاف مؤقت</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Camera / Screen WebRTC P2P Mode */
            <div className="relative">
              {isHost ? (
                <div className="aspect-video w-full bg-[#0B1120] flex flex-col items-center justify-center relative">
                  {isStreamingLocal ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <Camera className="w-10 h-10 text-[#3B6DFF] mx-auto" />
                      <p className="text-xs font-bold text-white">
                        اختر مصدر البث المباشر عبر الكاميرا أو مشاركة الشاشة (WebRTC P2P)
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void startHostMedia(false)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Video className="w-4 h-4" />
                          <span>تشغيل الكاميرا</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void startHostMedia(true)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Monitor className="w-4 h-4" />
                          <span>مشاركة الشاشة</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {isStreamingLocal && (
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-2xl px-3 py-2">
                      <span className="text-[11px] text-emerald-400 font-bold">
                        {isScreenSharing ? 'مشاركة الشاشة نشطة' : 'البث بالكاميرا نشط'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleLocalAudio}
                          className={`p-2 rounded-xl border cursor-pointer ${
                            isMicOn
                              ? 'bg-slate-800 border-slate-700 text-white'
                              : 'bg-rose-600/20 border-rose-500/40 text-rose-400'
                          }`}
                          title={isMicOn ? 'كتم المايك' : 'تشغيل المايك'}
                        >
                          {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={toggleLocalVideo}
                          className={`p-2 rounded-xl border cursor-pointer ${
                            isCamOn
                              ? 'bg-slate-800 border-slate-700 text-white'
                              : 'bg-rose-600/20 border-rose-500/40 text-rose-400'
                          }`}
                          title={isCamOn ? 'إيقاف الفيديو' : 'تشغيل الفيديو'}
                        >
                          {isCamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void startHostMedia(!isScreenSharing)}
                          className="px-2.5 py-1.5 rounded-xl bg-[#3B6DFF]/20 border border-[#3B6DFF]/40 text-[#4F8CFF] text-[11px] font-bold cursor-pointer"
                        >
                          {isScreenSharing ? 'التبديل للكاميرا' : 'مشاركة الشاشة'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-video w-full bg-[#0B1120] relative flex items-center justify-center">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    controls
                    className="w-full h-full object-contain"
                  />
                  {rtcStatus && (
                    <div className="absolute top-3 start-3 px-3 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-200 flex items-center gap-2">
                      <span>{rtcStatus}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentUser) {
                            void sendLiveSignal(activeBroadcast.id, {
                              fromUserId: currentUser.id,
                              toUserId: activeBroadcast.hostId,
                              type: 'offer',
                              payload: JSON.stringify({ ready: true }),
                            });
                          }
                        }}
                        className="text-[#4F8CFF] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>إعادة الطلب</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reactions Bar + Description */}
        <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {LIVE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={!currentUser || activeBroadcast.status !== 'live'}
                onClick={() =>
                  currentUser && void sendLiveReaction(activeBroadcast.id, currentUser.id, emoji)
                }
                className="min-w-[40px] min-h-[38px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0F19] hover:bg-[#3B6DFF]/15 border border-slate-200 dark:border-[#2A2F3A] text-base transition-transform active:scale-90 cursor-pointer disabled:opacity-40"
              >
                {emoji}
              </button>
            ))}
          </div>

          {reactions.length > 0 && (
            <div className="flex items-center gap-1 text-base overflow-hidden">
              {reactions.slice(0, 8).map((rx) => (
                <span key={rx.id} className="animate-fade-in">
                  {rx.emoji}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Live Chat Panel */}
        <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
              دردشة البث المباشر ({messages.length})
            </h3>
            {!activeBroadcast.isChatEnabled && (
              <span className="text-[11px] font-bold text-amber-500">الدردشة مغلقة حالياً</span>
            )}
          </div>

          <div className="h-72 overflow-y-auto p-3.5 space-y-2.5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400">
                <MessageSquare className="w-7 h-7 mb-1.5 opacity-50" />
                <span>لا توجد رسائل بعد. كن أول من يشارك في الدردشة!</span>
              </div>
            ) : (
              messages.map((msg) => {
                const senderMuted = (activeBroadcast.mutedUserIds || []).includes(msg.senderId);
                return (
                  <div
                    key={msg.id}
                    className="flex items-start justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0B0F19]/60 border border-slate-200/70 dark:border-[#2A2F3A]/80 rounded-2xl p-2.5"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectAuthor?.(msg.senderId)}
                        className="shrink-0 cursor-pointer"
                      >
                        <MediaImage
                          src={msg.senderPhotoURL}
                          alt={msg.senderName}
                          variant="avatar"
                          fallbackText={msg.senderName}
                          containerClassName="w-7 h-7 rounded-full overflow-hidden"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onSelectAuthor?.(msg.senderId)}
                            className="font-bold text-slate-900 dark:text-white hover:underline cursor-pointer"
                          >
                            {msg.senderName}
                          </button>
                          {msg.senderId === activeBroadcast.hostId && (
                            <span className="px-1.5 py-0.5 rounded bg-[#3B6DFF]/15 text-[#3B6DFF] text-[9px] font-extrabold">
                              المضيف
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-200 mt-0.5 break-words">
                          {msg.text}
                        </p>
                      </div>
                    </div>

                    {canModerate && msg.senderId !== activeBroadcast.hostId && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void handleModerate(
                              senderMuted ? 'unmute_viewer' : 'mute_viewer',
                              msg.senderId
                            )
                          }
                          className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                          title={senderMuted ? 'فك الكتم' : 'كتم المشاهد'}
                        >
                          {senderMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleModerate('ban_viewer', msg.senderId)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                          title="طرد وحظر من البث"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteLiveMessage(activeBroadcast.id, msg.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="حذف الرسالة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {currentUser && activeBroadcast.status === 'live' && (
            <form
              onSubmit={handleSendChat}
              className="p-3 border-t border-slate-200 dark:border-[#2A2F3A] flex items-center gap-2"
            >
              {isBanned ? (
                <div className="w-full text-center text-xs text-rose-500 font-bold py-1.5">
                  تم حظرك من المشاركة في دردشة هذا البث.
                </div>
              ) : isMuted ? (
                <div className="w-full text-center text-xs text-amber-500 font-bold py-1.5">
                  تم كتمك من الكتابة في دردشة هذا البث.
                </div>
              ) : !activeBroadcast.isChatEnabled && !canModerate ? (
                <div className="w-full text-center text-xs text-slate-500 py-1.5">
                  قام المضيف بإيقاف الدردشة مؤقتاً.
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="اكتب تعليقاً مباشراً..."
                    maxLength={500}
                    className="flex-1 bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat || !chatText.trim()}
                    className="min-w-[44px] min-h-[42px] px-3.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white flex items-center justify-center disabled:opacity-50 cursor-pointer"
                  >
                    {isSendingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        {/* Confirm End Broadcast Modal */}
        {confirmEndOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-4">
              <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                إنهاء جلسة البث المباشر؟
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيتم إيقاف البث لجميع المشاهدين وتغيير حالته إلى منتهي.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isEndingStream}
                  onClick={async () => {
                    setIsEndingStream(true);
                    await handleModerate('end_broadcast');
                    setIsEndingStream(false);
                    setConfirmEndOpen(false);
                  }}
                  className="flex-1 min-h-[42px] py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  تأكيد الإنهاء
                </button>
                <button
                  type="button"
                  disabled={isEndingStream}
                  onClick={() => setConfirmEndOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- DIRECTORY VIEW ----------------
  const liveNow = broadcasts.filter((b) => b.status === 'live');
  const endedList = broadcasts.filter((b) => b.status === 'ended');

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-4 font-tajawal">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-2xl p-4">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <BackArrow className="w-4 h-4" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white">البث المباشر</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              مشاهدة تفاعلية متزامنة، دردشة فورية، وبث مباشر بالكاميرا أو الروابط
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              showToast('يرجى تسجيل الدخول لبدء بث مباشر.', 'info');
              return;
            }
            setIsCreateOpen(true);
          }}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>بدء بث مباشر</span>
        </button>
      </div>

      {/* Empty State */}
      {broadcasts.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
            <Radio className="w-7 h-7 text-rose-500" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            لا توجد جلسات بث مباشر حالياً
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            ابدأ أول جلسة بث مباشر عبر YouTube، رابط بث خارجي، أو الكاميرا/مشاركة الشاشة وتفاعل مع المتابعين.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                showToast('يرجى تسجيل الدخول لبدء بث مباشر.', 'info');
                return;
              }
              setIsCreateOpen(true);
            }}
            className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ بدء بث مباشر</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {liveNow.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-extrabold text-rose-500 px-1">
                مباشر الآن ({liveNow.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {liveNow.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBroadcastId(b.id)}
                    className="text-start bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] hover:border-rose-500/50 rounded-2xl overflow-hidden transition-colors cursor-pointer group"
                  >
                    <div className="aspect-video bg-slate-900 relative overflow-hidden">
                      {b.coverURL ? (
                        <img
                          src={b.coverURL}
                          alt={b.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : b.youtubeVideoId ? (
                        <img
                          src={`https://i.ytimg.com/vi/${b.youtubeVideoId}/hqdefault.jpg`}
                          alt={b.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#0B1120]">
                          <Radio className="w-10 h-10 text-rose-500/80" />
                        </div>
                      )}
                      <span className="absolute top-2.5 start-2.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold">
                        LIVE
                      </span>
                      <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[10px] font-bold flex items-center gap-1 tabular-nums">
                        <Users className="w-3 h-3" />
                        {b.viewerCount || 0}
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      <h3 className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1">
                        {b.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {b.hostName} •{' '}
                        {b.mode === 'youtube_embed'
                          ? 'YouTube'
                          : b.mode === 'external_stream'
                          ? 'بث خارجي'
                          : 'كاميرا / شاشة'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {endedList.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
                جلسات سابقة منتهية ({endedList.length})
              </h2>
              <div className="space-y-2">
                {endedList.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBroadcastId(b.id)}
                    className="w-full text-start p-3 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] flex items-center justify-between gap-3 hover:border-slate-400 dark:hover:border-slate-600 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {b.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">
                        {b.hostName} • {formatRelativeTime(b.endedAt || b.startedAt)}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#0B0F19] text-slate-500 text-[10px] font-bold shrink-0">
                      منتهي
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Broadcast Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBroadcast}
            className="w-full max-w-md bg-white dark:bg-[#161B26] border border-slate-200 dark:border-[#2A2F3A] rounded-3xl p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                بدء جلسة بث مباشر جديدة
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان البث المباشر..."
              maxLength={120}
              required
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="وصف مختصر للجلسة (اختياري)..."
              maxLength={400}
              className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF] resize-none"
            />

            {/* Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                طريقة البث:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('youtube_embed')}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                    mode === 'youtube_embed'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF]'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  <span>YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('external_stream')}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                    mode === 'external_stream'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF]'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  <span>رابط فيديو</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('camera_webrtc')}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                    mode === 'camera_webrtc'
                      ? 'bg-[#3B6DFF]/15 border-[#3B6DFF] text-[#3B6DFF]'
                      : 'bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-[#2A2F3A] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>كاميرا / شاشة</span>
                </button>
              </div>
            </div>

            {mode !== 'camera_webrtc' ? (
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                required
                placeholder={
                  mode === 'youtube_embed'
                    ? 'رابط فيديو أو بث YouTube (https://youtube.com/...)'
                    : 'رابط البث المباشر أو الفيديو (https://...)'
                }
                className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
              />
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  يعتمد هذا الوضع على WebRTC المباشر بين الأجهزة (P2P) عبر خادم STUN، وهو مثالي للغرف الصغيرة؛ أما للبث الجماهيري الواسع أو الشبكات المقيدة فيُنصح بـ YouTube أو رابط بث خارجي لعدم توفر خادم TURN/SFU مخصص.
                </span>
              </div>
            )}

            {myRooms.length > 0 && (
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="">بث عام على منصة Q (بدون ربط بغرفة)</option>
                {myRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    ربط بغرفة: {r.title}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploadingCover}
                onClick={() => coverInputRef.current?.click()}
                className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isUploadingCover ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-[#3B6DFF]" />
                )}
                <span>{coverURL ? 'تم رفع صورة الغلاف' : 'صورة غلاف للبث (اختياري)'}</span>
              </button>
              {coverURL && (
                <button
                  type="button"
                  onClick={() => setCoverURL('')}
                  className="p-2 rounded-xl bg-rose-500/10 text-rose-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              <span>إطلاق البث المباشر الآن</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
