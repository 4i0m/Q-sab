import { useState, useEffect } from 'react';
import { X, Eye, Trash2 } from 'lucide-react';
import { Story } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { recordStoryView, deleteStory } from '../../services/firestore';
import { formatRelativeTime } from '../../utils/date';
import { useToast } from '../../context/ToastContext';

interface StoryViewerModalProps {
  stories: Story[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function StoryViewerModal({
  stories,
  initialIndex,
  isOpen,
  onClose,
}: StoryViewerModalProps) {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showViewersList, setShowViewersList] = useState(false);

  const currentStory = stories[currentIndex];

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Record view on story mount
  useEffect(() => {
    if (!isOpen || !currentStory || !currentUser?.id) return;
    recordStoryView(currentStory.id, currentUser.id);
  }, [isOpen, currentStory?.id, currentUser?.id]);

  // Keyboard navigation & Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < stories.length - 1) setCurrentIndex((i) => i + 1);
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) setCurrentIndex((i) => i - 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, stories.length, onClose]);

  if (!isOpen || !currentStory) return null;

  const isAuthor = currentUser?.id === currentStory.authorId;
  const canDelete = isAuthor || isAdmin;

  const handleDelete = async () => {
    try {
      await deleteStory(currentStory.id);
      showToast('Story removed.', 'info');
      if (stories.length <= 1) {
        onClose();
      } else {
        setCurrentIndex(0);
      }
    } catch (err) {
      showToast('Failed to delete story.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in p-4">
      {/* Container */}
      <div className="relative w-full max-w-sm aspect-[9/16] bg-[#0A0A0A] rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col justify-between">
        
        {/* Story Media */}
        <img
          src={currentStory.mediaURL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Top Gradient & Controls */}
        <div className="relative z-10 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          {/* Progress Indicators */}
          <div className="flex gap-1 mb-3">
            {stories.map((_, idx) => (
              <div
                key={idx}
                className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden"
              >
                <div
                  className={`h-full bg-amber-400 transition-all duration-300 ${
                    idx < currentIndex
                      ? 'w-full'
                      : idx === currentIndex
                      ? 'w-full animate-pulse'
                      : 'w-0'
                  }`}
                />
              </div>
            ))}
          </div>

          {/* Author Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={currentStory.authorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentStory.authorName}`}
                alt=""
                className="w-8 h-8 rounded-full border border-amber-500/40 object-cover"
              />
              <div>
                <div className="text-xs font-semibold text-white drop-shadow">
                  {currentStory.authorName}
                </div>
                <div className="text-[10px] text-neutral-300 drop-shadow">
                  {formatRelativeTime(currentStory.createdAt)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {canDelete && (
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-red-950/80 text-neutral-300 hover:text-red-400 backdrop-blur-md transition-colors"
                  title="Delete Story"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-neutral-300 hover:text-white backdrop-blur-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Story Caption & Viewers Bottom Bar */}
        <div className="relative z-10 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
          {currentStory.caption && (
            <p className="text-xs text-white drop-shadow-md mb-3 leading-relaxed">
              {currentStory.caption}
            </p>
          )}

          {/* Real viewers information */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowViewersList(!showViewersList)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-neutral-700/60 text-xs text-neutral-200 hover:text-white"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentStory.viewers ? currentStory.viewers.length : 0} real viewers</span>
            </button>

            {/* Tap Navigation Hints */}
            <div className="text-[10px] text-neutral-400">
              {currentIndex + 1} of {stories.length}
            </div>
          </div>

          {/* Viewers Dropup */}
          {showViewersList && (
            <div className="mt-2 p-3 bg-neutral-900/95 border border-neutral-800 rounded-xl max-h-36 overflow-y-auto animate-slide-up">
              <div className="text-[11px] font-semibold text-neutral-300 mb-1">
                Verified Viewers ({currentStory.viewers?.length || 0}):
              </div>
              {currentStory.viewers && currentStory.viewers.length > 0 ? (
                <div className="space-y-1">
                  {currentStory.viewers.map((viewerId) => (
                    <div key={viewerId} className="text-[10px] text-neutral-400 font-mono-subtle">
                      User UID: {viewerId.slice(0, 10)}...
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-neutral-500">No views recorded yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
