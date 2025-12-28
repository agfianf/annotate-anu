/**
 * Explore View Context
 * Manages full-view state for the Explore tab using URL parameters
 */

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

interface ExploreViewContextType {
  isFullView: boolean;
  toggleFullView: () => void;
  exitFullView: () => void;
}

const ExploreViewContext = createContext<ExploreViewContextType | undefined>(undefined);

export function ExploreViewProvider({ children }: { children: ReactNode }) {
  const search = useSearch({ strict: false }) as { fullview?: boolean; [key: string]: unknown };
  const navigate = useNavigate();
  const isFullView = search.fullview === true;

  const toggleFullView = () => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        fullview: isFullView ? undefined : true,
      }),
    });
  };

  const exitFullView = () => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const { fullview: _, ...rest } = prev;
        return rest;
      },
    });
  };

  return (
    <ExploreViewContext.Provider value={{ isFullView, toggleFullView, exitFullView }}>
      {children}
    </ExploreViewContext.Provider>
  );
}

export function useExploreView() {
  const context = useContext(ExploreViewContext);
  if (!context) {
    throw new Error('useExploreView must be used within ExploreViewProvider');
  }
  return context;
}
