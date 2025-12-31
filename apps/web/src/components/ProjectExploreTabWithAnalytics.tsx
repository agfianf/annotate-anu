/**
 * Project Explore Tab with Analytics
 * Wrapper component that adds analytics panel support to ProjectExploreTab
 */

import { useCallback } from 'react';
import { AnalyticsPanelProvider } from '@/contexts/AnalyticsPanelContext';
import ProjectExploreTab from './ProjectExploreTab';
import type { ExploreFilters } from '@/lib/data-management-client';

interface ProjectExploreTabWithAnalyticsProps {
  projectId: string;
}

export default function ProjectExploreTabWithAnalytics({
  projectId,
}: ProjectExploreTabWithAnalyticsProps) {
  // Handle filter updates from analytics panels
  const handlePanelFilterUpdate = useCallback((newFilters: Partial<ExploreFilters>) => {
    // TODO: Implement filter synchronization
    console.log('Panel filter update:', newFilters);
  }, []);

  return (
    <AnalyticsPanelProvider
      projectId={projectId}
      onFilterUpdate={handlePanelFilterUpdate}
    >
      <ProjectExploreTab projectId={projectId} />
    </AnalyticsPanelProvider>
  );
}
