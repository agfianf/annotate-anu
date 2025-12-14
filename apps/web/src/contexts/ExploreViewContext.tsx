/**
 * Explore View Context
 * Manages full-view state for the Explore tab using URL parameters
 */

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ExploreViewContextType {
  isFullView: boolean;
  toggleFullView: () => void;
  exitFullView: () => void;
}

const ExploreViewContext = createContext<ExploreViewContextType | undefined>(undefined);

export function ExploreViewProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFullView = searchParams.get('fullview') === 'true';

  const toggleFullView = () => {
    const newParams = new URLSearchParams(searchParams);
    if (isFullView) {
      newParams.delete('fullview');
    } else {
      newParams.set('fullview', 'true');
    }
    setSearchParams(newParams);
  };

  const exitFullView = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('fullview');
    setSearchParams(newParams);
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
