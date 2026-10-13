import { useState } from "react";
import {
  ShieldCheck,
  Trash2,
  X,
  AlertTriangle,
  CheckSquare,
  MinusSquare,
  Square,
} from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onMoveToKnown: () => void;
  onDeleteSelected: () => void;
  targetListName: string;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  isAllSelected,
  onToggleSelectAll,
  onClearSelection,
  onMoveToKnown,
  onDeleteSelected,
  targetListName,
}: BulkActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (totalCount === 0) return null;

  return (
    <div
      role="region"
      aria-label={`Bulk actions for ${targetListName}`}
      className={`rounded-card border transition-all p-3 sm:p-4 ${
        selectedCount > 0
          ? "border-deep/70 bg-deep/5 shadow-xs"
          : "border-line bg-surface/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Select All Checkbox & Counter */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(el) => {
                if (el) {
                  el.indeterminate = selectedCount > 0 && !isAllSelected;
                }
              }}
              onChange={onToggleSelectAll}
              className="size-5 rounded border-line text-deep focus:ring-deep cursor-pointer accent-deep"
              aria-label={
                isAllSelected
                  ? `Deselect all ${totalCount} vehicles in ${targetListName}`
                  : `Select all ${totalCount} vehicles in ${targetListName}`
              }
            />
            <span className="text-sm font-semibold text-deep">
              {selectedCount > 0 ? (
                <>
                  {selectedCount} of {totalCount} selected
                </>
              ) : (
                <>Select all ({totalCount})</>
              )}
            </span>
          </label>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted hover:text-ink hover:bg-bg transition"
              title="Clear selection"
            >
              <X className="size-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onMoveToKnown}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-ok px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90 transition shadow-2xs"
              title={`Move ${selectedCount} selected vehicle(s) to Known list so they never trigger alerts`}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span>Move to Known ({selectedCount})</span>
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-1.5 rounded-md border border-alert/50 bg-alert-bg p-1 text-xs">
                <AlertTriangle className="size-3.5 text-alert ml-1" aria-hidden="true" />
                <span className="font-semibold text-alert">
                  Delete {selectedCount} plate(s)?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSelected();
                    setConfirmDelete(false);
                  }}
                  className="rounded bg-alert px-2.5 py-1 font-semibold text-white hover:opacity-90"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded border border-line bg-bg px-2 py-1 text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-bg px-3 py-1.5 text-xs font-medium text-alert hover:border-alert hover:bg-alert-bg/50 transition shadow-2xs"
                title={`Delete ${selectedCount} selected vehicle records`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span>Delete ({selectedCount})</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
