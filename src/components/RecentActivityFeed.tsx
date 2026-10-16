import { useMemo } from "react";
import {
  Activity,
  Camera,
  Car,
  Clock,
  ExternalLink,
  Eye,
  ShieldCheck,
  Tag,
  Radio,
} from "lucide-react";
import {
  getRecentSightingsActivity,
  clock,
  formatWhen,
  type PlateRecord,
  type ChronologicalSighting,
} from "@/lib/curb/logic";

interface RecentActivityFeedProps {
  plates: PlateRecord[];
  onNavigateToLookup?: (plate: string) => void;
  onOpenManualEntry?: (plate?: string, camera?: string) => void;
}

export function RecentActivityFeed({
  plates,
  onNavigateToLookup,
  onOpenManualEntry,
}: RecentActivityFeedProps) {
  const recentSightings = useMemo(() => {
    return getRecentSightingsActivity(plates, 10);
  }, [plates]);

  const totalSightingsAllTime = useMemo(() => {
    return plates.reduce((sum, p) => sum + (p.sightings?.length || 0), 0);
  }, [plates]);

  return (
    <section
      aria-label="Recent activity feed"
      className="rounded-card border border-line bg-surface p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line/70">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-amber/15 text-amber-ink">
            <Activity className="size-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-deep text-base">
                Recent Sightings Activity Feed
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-ok"></span>
                </span>
                Pulse
              </span>
            </div>
            <p className="text-xs text-muted">
              Chronological feed of the most recent 10 sightings across all plates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded bg-bg px-2.5 py-1 border border-line font-mono font-medium">
            {totalSightingsAllTime} total sighting{totalSightingsAllTime === 1 ? "" : "s"} logged
          </span>
        </div>
      </div>

      {recentSightings.length === 0 ? (
        <div className="py-8 text-center text-muted">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-bg border border-line">
            <Radio className="size-5 text-muted opacity-60" />
          </div>
          <p className="font-medium text-ink text-sm">No sightings recorded yet</p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Sightings captured by camera scans or manual plate logs will appear here in chronological order.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-line/60 pt-2" aria-label="Chronological list of 10 most recent sightings">
          {recentSightings.map((sighting, idx) => {
            const isWatching =
              sighting.status === "watching" || sighting.pinned;
            const isKnown = sighting.status === "known";

            const statusBadgeClass = isKnown
              ? "bg-ok-bg text-ok border-ok/30"
              : isWatching
                ? "bg-amber text-amber-ink border-amber/50 font-bold"
                : "bg-bg text-muted border-line";

            const statusLabel = isKnown
              ? sighting.owner
                ? `Known (${sighting.owner})`
                : "Known Neighbor"
              : isWatching
                ? "Watchlist"
                : "Through";

            return (
              <li
                key={`${sighting.plate}-${sighting.at}-${idx}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 first:pt-2 last:pb-1 hover:bg-bg/40 -mx-2 px-2 rounded-md transition"
              >
                {/* Left: Plate, Status, Camera & Details */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 font-mono text-base font-bold text-deep tracking-wider bg-bg px-2.5 py-1 rounded border border-line">
                    <Car className="size-3.5 text-muted opacity-70" aria-hidden="true" />
                    <span>{sighting.plate}</span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${statusBadgeClass}`}
                  >
                    {isKnown && <ShieldCheck className="size-3" aria-hidden="true" />}
                    {isWatching && <Eye className="size-3" aria-hidden="true" />}
                    <span>{statusLabel}</span>
                  </span>

                  {sighting.isGeofenceBreach && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-amber/40 bg-amber/20 text-amber-ink font-semibold"
                      title={`Spotted at ${sighting.camera} instead of designated ${sighting.usualCamera}`}
                    >
                      <span>⚠️ Geofence Breach</span>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 text-xs text-muted bg-bg/80 px-2 py-0.5 rounded border border-line/60">
                    <Camera className="size-3 text-muted" aria-hidden="true" />
                    <span>{sighting.camera}</span>
                  </span>

                  {sighting.color && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Tag className="size-3 text-muted" aria-hidden="true" />
                      <span>{sighting.color}</span>
                    </span>
                  )}

                  {sighting.note && (
                    <span className="text-xs text-muted/90 italic truncate max-w-[200px]" title={sighting.note}>
                      &ldquo;{sighting.note}&rdquo;
                    </span>
                  )}
                </div>

                {/* Right: Timestamp & Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Clock className="size-3 text-muted" aria-hidden="true" />
                    <span>{clock(sighting.at)}</span>
                    <span className="text-muted/60">·</span>
                    <span className="text-muted">{formatWhen(sighting.at)}</span>
                  </div>

                  {onNavigateToLookup && (
                    <button
                      type="button"
                      onClick={() => onNavigateToLookup(sighting.plate)}
                      className="inline-flex items-center gap-1 rounded border border-line bg-bg px-2 py-1 text-xs font-medium text-deep hover:border-deep/60 hover:text-ink transition shadow-2xs"
                      title={`Lookup full history and 7-day trend for ${sighting.plate}`}
                      aria-label={`Lookup vehicle ${sighting.plate}`}
                    >
                      <span>Lookup</span>
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
