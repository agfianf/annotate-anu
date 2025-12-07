/**
 * ProjectTabs Component
 * Tab navigation for project detail page sections
 */

import { BookOpen, History, Image, ListTodo, Settings } from 'lucide-react';

export type ProjectTabId = 'readme' | 'tasks' | 'configuration' | 'history' | 'explore';

interface ProjectTabsProps {
  activeTab: ProjectTabId;
  onTabChange: (tab: ProjectTabId) => void;
}

const tabs: { id: ProjectTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'readme', label: 'README', icon: BookOpen },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'configuration', label: 'Configuration', icon: Settings },
  { id: 'history', label: 'History', icon: History },
  { id: 'explore', label: 'Explore', icon: Image },
];

export default function ProjectTabs({ activeTab, onTabChange }: ProjectTabsProps) {
  return (
    <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
              transition-all duration-200
              ${isActive
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }
            `}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : ''}`} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

