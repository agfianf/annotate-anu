/**
 * ActionZone - Selection scope, Add Panel, and Export buttons
 * Right section of the toolbar for primary actions
 */

import { Check, CheckSquare, X } from '@/components/ui/icons';
import { PanelLibrary } from '../../analytics/PanelLibrary';

interface ActionZoneProps {
  onExport: () => void;
  // Panel count for layout mode toggle (optional)
  panelCount?: number;
  layoutMode?: 'tabs' | 'stacked';
  onLayoutModeChange?: (mode: 'tabs' | 'stacked') => void;
  isPanelsVisible?: boolean;

  /** Images currently materialised in the client. */
  loadedCount?: number;
  /** Server-reported total for the current filters. */
  matchingCount?: number;
  /** How many images are selected right now. */
  selectedCount?: number;
  /** Selects exactly the loaded images. Rendering of the selection controls is gated on this. */
  onSelectLoaded?: () => void;
  /** Clears the selection. */
  onClearSelection?: () => void;
  /** Selects every image matching the current filters, resolved server-side. */
  onSelectAllMatching?: () => void;
  /** True when the whole matching set is already selected. */
  isAllMatchingSelected?: boolean;
  /**
   * A filter change is committed but unresolved. Scope-describing actions are disabled while
   * true, so a bulk action can never be applied to a set other than the one on the label.
   */
  isResultsPending?: boolean;
}

export function ActionZone({
  onExport,
  loadedCount,
  matchingCount,
  selectedCount = 0,
  onSelectLoaded,
  onClearSelection,
  onSelectAllMatching,
  isAllMatchingSelected = false,
  isResultsPending = false,
}: ActionZoneProps) {
  const loaded = loadedCount ?? 0;
  const matching = matchingCount ?? loaded;
  const allLoadedSelected = loaded > 0 && selectedCount >= loaded;
  // Only worth offering when the matching set is genuinely larger than what is on screen.
  const canSelectAllMatching = Boolean(onSelectAllMatching) && matching > loaded;

  const pendingTitle = 'Results are still updating for the new filters';

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      {/* Selection scope — "loaded" and "matching" are different sets and are labelled as such */}
      {onSelectLoaded && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={allLoadedSelected && onClearSelection ? onClearSelection : onSelectLoaded}
            disabled={isResultsPending || loaded === 0}
            className="px-2.5 py-1.5 min-h-[32px] rounded-lg border border-gray-300 text-gray-600 text-sm font-medium flex items-center gap-1.5 transition-all hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isResultsPending ? pendingTitle : undefined}
          >
            {allLoadedSelected && onClearSelection ? (
              <>
                <X className="w-4 h-4" />
                <span className="whitespace-nowrap">Clear selection</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span className="whitespace-nowrap">
                  Select loaded <span className="tabular-nums">({loaded.toLocaleString()})</span>
                </span>
              </>
            )}
          </button>

          {canSelectAllMatching && (
            <button
              type="button"
              onClick={onSelectAllMatching}
              disabled={isResultsPending || isAllMatchingSelected}
              className="px-2.5 py-1.5 min-h-[32px] rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50/60 text-sm font-medium flex items-center gap-1.5 transition-all hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isResultsPending ? pendingTitle : `Select every image matching the current filters (${matching.toLocaleString()})`}
            >
              <CheckSquare className="w-4 h-4" />
              <span className="whitespace-nowrap">
                Select all <span className="tabular-nums">{matching.toLocaleString()}</span> matching
              </span>
            </button>
          )}
        </div>
      )}

      {/* Add Panel Button - using PanelLibrary component */}
      <PanelLibrary />

      {/* Export Button - Secondary/Outline style */}
      <button
        type="button"
        onClick={onExport}
        className="px-4 py-2 min-h-[32px] border border-gray-300 text-gray-600 rounded-lg transition-all flex items-center gap-2 text-sm font-medium hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
        title="Export filtered dataset"
      >
        <span>Export</span>
      </button>
    </div>
  );
}
