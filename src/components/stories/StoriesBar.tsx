import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Story } from '../../types';
import { listenToStories, hasViewedStory } from '../../services/firestore';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewerModal } from './StoryViewerModal';
import { MediaImage } from '../common/MediaImage';
import { useLiveUserProfiles } from '../../hooks/useUserProfiles';

interface AuthorStoryGroup {
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  stories: Story[];
  hasUnviewed: boolean;
  latestCreatedAt: string;
}

interface StoriesBarProps {
  onSelectAuthor?: (authorId: string) => void;
}

export function StoriesBar({ onSelectAuthor }: StoriesBarProps) {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const [stories, setStories] = useState<Story[]>([]);
  const [viewedMap, setViewedMap] = useState<Record<string, boolean>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const liveAuthors = useLiveUserProfiles(stories.map((s) => s.authorId));

  useEffect(() => {
    const unsub = listenToStories(currentUser?.id, (loadedStories) => {
      setStories(loadedStories);
    });
    return () => unsub();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || stories.length === 0) {
      return;
    }
    let cancelled = false;
    const uid = currentUser.id;
    Promise.all(
      stories.map(async (s) => {
        if (s.viewers?.includes(uid) || viewedMap[s.id]) {
          return [s.id, true] as const;
        }
        const seen = await hasViewedStory(s.id, uid).catch(() => false);
        return [s.id, seen] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setViewedMap((prev) => {
        const next = { ...prev };
        let changed = false;
        entries.forEach(([id, seen]) => {
          if (next[id] !== seen) {
            next[id] = seen;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [stories, currentUser?.id]);

  const { authorGroups, orderedStories, startIndexByAuthor } = useMemo(() => {
    const map = new Map<string, AuthorStoryGroup>();

    stories.forEach((story) => {
      const viewed = currentUser?.id
        ? Boolean(viewedMap[story.id] || story.viewers?.includes(currentUser.id))
        : false;
      const liveAuthor = liveAuthors[story.authorId];
      const resolvedName = liveAuthor?.displayName || story.authorName;
      const resolvedPhoto = liveAuthor ? liveAuthor.photoURL : story.authorPhotoURL;
      const existing = map.get(story.authorId);
      if (!existing) {
        map.set(story.authorId, {
          authorId: story.authorId,
          authorName: resolvedName,
          authorPhotoURL: resolvedPhoto,
          stories: [story],
          hasUnviewed: !viewed,
          latestCreatedAt: story.createdAt,
        });
      } else {
        existing.stories.push(story);
        if (!viewed) existing.hasUnviewed = true;
        if (story.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = story.createdAt;
          if (!liveAuthor && story.authorPhotoURL) existing.authorPhotoURL = story.authorPhotoURL;
        }
      }
    });

    const groups = Array.from(map.values()).map((g) => ({
      ...g,
      stories: [...g.stories].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));

    groups.sort((a, b) => {
      if (currentUser?.id) {
        if (a.authorId === currentUser.id && b.authorId !== currentUser.id) return -1;
        if (b.authorId === currentUser.id && a.authorId !== currentUser.id) return 1;
      }
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return b.latestCreatedAt.localeCompare(a.latestCreatedAt);
    });

    const flat: Story[] = [];
    const startIdxMap: Record<string, number> = {};

    groups.forEach((g) => {
      const groupStart = flat.length;
      const firstUnviewedOffset = currentUser?.id
        ? g.stories.findIndex((s) => !(viewedMap[s.id] || s.viewers?.includes(currentUser.id)))
        : 0;
      startIdxMap[g.authorId] = groupStart + (firstUnviewedOffset >= 0 ? firstUnviewedOffset : 0);
      flat.push(...g.stories);
    });

    return {
      authorGroups: groups,
      orderedStories: flat,
      startIndexByAuthor: startIdxMap,
    };
  }, [stories, currentUser?.id, viewedMap, liveAuthors]);

  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-none">
      <div className="flex items-center gap-3.5 px-1 min-w-max">
        {/* Add Story Button */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="relative w-16 h-16 rounded-full border-2 border-dashed border-[#3B6DFF]/60 hover:border-[#4F8CFF] bg-white dark:bg-[#161B26] flex items-center justify-center text-[#3B6DFF] dark:text-[#4F8CFF] transition-all hover:scale-105 active:scale-95 group cursor-pointer shadow-sm"
          >
            {currentUser?.photoURL ? (
              <>
                <MediaImage
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  variant="avatar"
                  fallbackText={currentUser.displayName}
                  containerClassName="w-full h-full rounded-full overflow-hidden opacity-85"
                  className="w-full h-full rounded-full object-cover"
                />
                <span className="absolute -bottom-0.5 -end-0.5 w-6 h-6 rounded-full bg-[#3B6DFF] text-white border-2 border-white dark:border-[#0B0F19] flex items-center justify-center shadow">
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              </>
            ) : (
              <Plus className="w-6 h-6 group-hover:scale-110 transition-transform stroke-[2.5]" />
            )}
          </button>
          <span className="text-[11px] font-tajawal text-slate-600 dark:text-[#94A3B8] tracking-tight">
            {t('addStory')}
          </span>
        </div>

        {/* Grouped Per-Author Story Circles */}
        {authorGroups.map((group) => {
          return (
            <div key={group.authorId} className="flex flex-col items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveStoryIndex(startIndexByAuthor[group.authorId] ?? 0)}
                className={`relative w-16 h-16 rounded-full p-[2.5px] transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                  group.hasUnviewed
                    ? 'bg-gradient-to-tr from-[#3B6DFF] via-[#4F8CFF] to-[#60A5FA] shadow-[0_2px_12px_rgba(59,109,255,0.35)]'
                    : 'border-2 border-slate-300 dark:border-[#2A2F3A]'
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-[#0B0F19] p-[1.5px]">
                  <MediaImage
                    src={
                      group.authorPhotoURL ||
                      group.stories.find((s) => s.mediaURL && s.mediaType !== 'video')?.mediaURL
                    }
                    alt={group.authorName}
                    variant="avatar"
                    fallbackText={group.authorName}
                    containerClassName="w-full h-full rounded-full overflow-hidden"
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                {group.stories.length > 1 && (
                  <span className="absolute -bottom-0.5 -end-0.5 px-1.5 py-0.5 rounded-full bg-[#3B6DFF] text-white text-[9px] font-bold border border-white dark:border-[#0B0F19] tabular-nums">
                    {group.stories.length}
                  </span>
                )}
              </button>
              <span className="text-[11px] font-tajawal text-slate-800 dark:text-[#F8FAFC] max-w-[64px] truncate text-center">
                {group.authorId === currentUser?.id ? 'قصتك' : group.authorName}
              </span>
            </div>
          );
        })}
      </div>

      <CreateStoryModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {activeStoryIndex !== null && orderedStories.length > 0 && (
        <StoryViewerModal
          stories={orderedStories}
          initialIndex={Math.min(activeStoryIndex, orderedStories.length - 1)}
          isOpen={true}
          onClose={() => setActiveStoryIndex(null)}
          onSelectAuthor={onSelectAuthor}
          onStoryViewed={(storyId) =>
            setViewedMap((prev) => (prev[storyId] ? prev : { ...prev, [storyId]: true }))
          }
        />
      )}
    </div>
  );
}
