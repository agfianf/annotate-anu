import type { TagCount } from '@/lib/data-management-client';
import { Tag } from 'lucide-react';
import { SidebarSection } from './SidebarSection';

interface TagFilterSectionProps {
  tags: TagCount[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
}

export function TagFilterSection({
  tags,
  selectedTagIds,
  onToggleTag,
}: TagFilterSectionProps) {
  if (tags.length === 0) {
    return (
      <SidebarSection title="Tags" icon={<Tag className="h-4 w-4" />} count={0}>
        <p className="text-xs text-emerald-900/50 py-2">No tags defined</p>
      </SidebarSection>
    );
  }

  return (
    <SidebarSection
      title="Tags"
      icon={<Tag className="h-4 w-4 text-orange-500" />}
      count={tags.length}
      color="#F97316"
    >
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <label
              key={tag.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-emerald-100/50 px-2 py-1 rounded text-sm group"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleTag(tag.id)}
                className="rounded border-emerald-200 bg-white text-emerald-500 focus:ring-emerald-500/50"
              />
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 truncate text-emerald-900/80 group-hover:text-emerald-900">
                {tag.name}
              </span>
              <span className="text-xs text-emerald-900/40">{tag.count}</span>
            </label>
          );
        })}
      </div>
    </SidebarSection>
  );
}
