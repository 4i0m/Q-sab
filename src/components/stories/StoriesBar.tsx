import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Story } from '../../types';
import { listenToStories } from '../../services/firestore';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewerModal } from './StoryViewerModal';

export function StoriesBar() {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const [stories, setStories] = useState<Story[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = listenToStories((loadedStories) => {
      setStories(loadedStories);
    });
    return () => unsub();
  }, []);

  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-none">
      <div className="flex items-center gap-3.5 px-1 min-w-max">
        
        {/* Add Story Button (Matching Screen 2) */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="w-16 h-16 rounded-full border border-dashed border-[#3B6DFF]/60 hover:border-[#4F8CFF] bg-[#161B26] flex items-center justify-center text-[#4F8CFF] transition-all hover:scale-105 active:scale-95 group cursor-pointer shadow-md"
          >
            <Plus className="w-6 h-6 group-hover:scale-110 transition-transform stroke-[2.5]" />
          </button>
          <span className="text-[11px] font-tajawal text-[#94A3B8] tracking-tight">
            {t('addStory')}
          </span>
        </div>

        {/* Stories list with glowing electric blue / cyan rim matching Screen 2 */}
        {stories.map((story, index) => {
          const hasViewed = currentUser?.id ? story.viewers?.includes(currentUser.id) : false;

          return (
            <div key={story.id} className="flex flex-col items-center gap-1.5 shrink-0">
              <button
                onClick={() => setActiveStoryIndex(index)}
                className={`w-16 h-16 rounded-full p-[2.5px] transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                  hasViewed
                    ? 'border border-[#2A2F3A]'
                    : 'bg-gradient-to-tr from-[#3B6DFF] via-[#4F8CFF] to-[#93C5FD] shadow-[0_2px_12px_rgba(59,109,255,0.45)]'
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-[#0B0F19] p-[1.5px]">
                  <img
                    src={story.authorPhotoURL || story.mediaURL}
                    alt={story.authorName}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </button>
              <span className="text-[11px] font-tajawal text-[#F8FAFC] max-w-[64px] truncate text-center">
                {story.authorName}
              </span>
            </div>
          );
        })}
      </div>

      <CreateStoryModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {activeStoryIndex !== null && (
        <StoryViewerModal
          stories={stories}
          initialIndex={activeStoryIndex}
          isOpen={true}
          onClose={() => setActiveStoryIndex(null)}
        />
      )}
    </div>
  );
}
