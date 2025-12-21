import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface SidebarSectionProps {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  color?: string;
}

export function SidebarSection({
  title,
  icon,
  count,
  defaultExpanded = true,
  children,
  color,
}: SidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div 
      className="border-b border-emerald-100 group border-l-[3px] transition-colors"
      style={{ borderLeftColor: color || 'transparent' }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-mono text-emerald-900/80 hover:bg-emerald-50 data-[expanded=true]:bg-emerald-50/50 transition-colors uppercase tracking-wider"
        data-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <span className="opacity-70 group-hover:opacity-100 transition-opacity">{icon}</span>
          <span className="font-bold">{title}</span>
          {count !== undefined && (
            <span className="text-[10px] text-emerald-600/60">[{count}]</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-emerald-400" />
        ) : (
          <ChevronRight className="h-3 w-3 text-emerald-400" />
        )}
      </button>
      {isExpanded && <div className="px-3 pb-4 pt-2 bg-emerald-50/30 animate-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  );
}
