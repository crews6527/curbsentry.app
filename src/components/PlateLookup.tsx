import { useState, useMemo, useEffect } from "react";
import {
  Search,
  CarFront,
  ShieldCheck,
  Eye,
  Plus,
  Clock,
  Trash2,
  Edit2,
  Calendar,
  Camera,
  Filter,
  Check,
  X,
  AlertTriangle,
  BarChart2,
  TrendingUp,
} from "lucide-react";
import { useCurb } from "@/lib/curb/store";
import {
  classify,
  formatWhen,
  clock,
  normalisePlate,
  type PlateRecord,
} from "@/lib/curb/logic";
import { PlateTrendChart } from "./PlateTrendChart";

type PlateLookupProps = {
  initialQuery?: string;
  onOpenManualEntry: (plate?: string) => void;
};

export function PlateLookup({
  initialQuery = "",
  onOpenManualEntry,
}: PlateLookupProps) {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const logRead = useCurb((s) => s.logRead);
  const deletePlate = useCurb((s) => s.deletePlate);
  const deleteSighting = useCurb((s) => s.deleteSighting);
  const markKnown = useCurb((s) => s.markKnown);
  const keepWatching = useCurb((s) => s.keepWatching);
  const updatePlateDetails = useCurb((s) => s.updatePlateDetails);

  const [query, setQuery] = useState(initialQuery);
  const [filterMode, setFilterMode] = useState<"all" | "watching" | "known" | "through" | "alert">("all");
  const [editingPlate, setEditingPlate] = useState<string | null>(null);
  const [editColor, setEditColor] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editNote, setEditNote] = useState("");
  const [expandedTimeline, setExpandedTimeline] = useState<Record<string, boolean>>({});
  const [expandedCharts, setExpandedCharts] = useState<Record<string, boolean>>({});
  const [quickRegisterNotice, setQuickRegisterNotice] = useState<string | null>(null);

  // Sync initialQuery when passed from header or other tabs
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const cleanQuery = normalisePlate(query);

  const toggleChart = (plate: string) => {
    setExpandedCharts((prev) => ({ ...prev, [plate]: !prev[plate] }));
  };

  const filteredPlates = useMemo(() => {
    return plates.filter((p) => {
      // 1. Text Search Filter
      if (query.trim()) {
        const cleanP = normalisePlate(p.plate);
        const matchesPlate =
          p.plate.includes(cleanQuery) ||
          cleanP.includes(cleanQuery) ||
          (cleanQuery.length >= 3 && cleanP.includes(cleanQuery)) ||
          (cleanQuery.length >= 3 && cleanQuery.includes(cleanP)) ||
          p.plate.toLowerCase().includes(query.toLowerCase().trim());
        const matchesOwner = p.owner.toLowerCase().includes(query.toLowerCase());
        const matchesColor = p.color.toLowerCase().includes(query.toLowerCase());
        const matchesNote = p.note.toLowerCase().includes(query.toLowerCase());
        const matchesCamera = p.sightings.some((s) => s.camera.toLowerCase().includes(query.toLowerCase()));

        if (!matchesPlate && !matchesOwner && !matchesColor && !matchesNote && !matchesCamera) {
          return false;
        }
      }

      // 2. Status Category Filter
      const classification = classify(p, settings);
      if (filterMode === "watching") return p.status === "watching" || p.pinned;
      if (filterMode === "known") return p.status === "known";
      if (filterMode === "through") return p.status === "through" && !p.pinned;
      if (filterMode === "alert") return classification.band === "bus" || classification.band === "repeat";

      return true;
    });
  }, [plates, query, cleanQuery, filterMode, settings]);

  const watchingCount = plates.filter((p) => p.status === "watching" || p.pinned).length;
  const knownCount = plates.filter((p) => p.status === "known").length;
  const throughCount = plates.filter((p) => p.status === "through" && !p.pinned).length;
  const alertCount = plates.filter((p) => {
    const c = classify(p, settings);
    return c.band === "bus" || c.band === "repeat";
  }).length;

  const startEdit = (p: PlateRecord) => {
    setEditingPlate(p.plate);
    setEditColor(p.color);
    setEditOwner(p.owner);
    setEditNote(p.note);
  };

  const saveEdit = (plate: string) => {
    updatePlateDetails(plate, {
      color: editColor,
      owner: editOwner,
      note: editNote,
    });
    setEditingPlate(null);
  };

  const toggleTimeline = (plate: string) => {
    setExpandedTimeline((prev) => ({ ...prev, [plate]: !prev[plate] }));
  };

  return (
    <section className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink">
              Plate Lookup & Registry
            </h2>
            <p className="mt-1 text-sm text-muted">
              Search all vehicle observations, view complete sighting timelines, and update classifications.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenManualEntry(cleanQuery.length >= 4 ? cleanQuery : undefined)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-deep px-4 text-sm font-medium text-bg shadow-xs hover:opacity-90"
          >
            <Plus className="size-4" />
            <span>Log New Sighting</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mt-4">
          <Search className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by plate number, color, neighbor, camera, or note..."
            className="min-h-12 w-full rounded-md border border-line bg-bg pl-11 pr-10 text-base text-ink placeholder:text-muted/70 focus:border-deep focus:outline-hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Quick Filter Tabs */}
        <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-line/60">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filterMode === "all"
                ? "bg-deep text-bg"
                : "border border-line bg-bg text-muted hover:text-ink")
            }
          >
            All Plates ({plates.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("watching")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filterMode === "watching"
                ? "bg-amber text-amber-ink"
                : "border border-line bg-bg text-muted hover:text-ink")
            }
          >
            Watchlist ({watchingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("alert")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filterMode === "alert"
                ? "bg-alert-bg text-alert font-semibold"
                : "border border-line bg-bg text-muted hover:text-ink")
            }
          >
            Repeat Alerts ({alertCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("known")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filterMode === "known"
                ? "bg-ok-bg text-ok font-semibold"
                : "border border-line bg-bg text-muted hover:text-ink")
            }
          >
            Known Vehicles ({knownCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("through")}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filterMode === "through"
                ? "bg-surface border border-deep text-deep font-semibold"
                : "border border-line bg-bg text-muted hover:text-ink")
            }
          >
            Through Traffic ({throughCount})
          </button>
        </div>
      </div>

      {/* Results Header / Stats */}
      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <span>
          Showing <strong>{filteredPlates.length}</strong> of {plates.length} recorded plate(s)
          {query.trim() ? ` matching "${query}"` : ""}
        </span>
        {query.trim() && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="underline hover:text-ink"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Plates List */}
      {quickRegisterNotice && (
        <div className="flex items-center justify-between rounded-card border border-ok/40 bg-ok-bg p-3 text-sm text-ok">
          <span>✓ {quickRegisterNotice}</span>
          <button
            type="button"
            onClick={() => setQuickRegisterNotice(null)}
            className="text-xs underline hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {filteredPlates.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
          {query.trim() ? (
            <div className="mx-auto max-w-lg space-y-4">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-deep/10 text-deep">
                <CarFront className="size-6" />
              </div>
              <div>
                <p className="text-lg font-bold text-ink">
                  No plate record matching "{query}"
                </p>
                <p className="mt-1 text-sm text-muted">
                  This plate is not yet in your local database. Quick-register it to the registry or log an observation.
                </p>
              </div>

              {cleanQuery.length >= 4 && cleanQuery.length <= 8 ? (
                <div className="rounded-lg border border-line bg-bg p-4 text-left shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xl font-bold uppercase tracking-wider text-deep">
                      {cleanQuery}
                    </span>
                    <span className="text-xs text-muted">Quick Register</span>
                  </div>

                  <p className="text-xs text-muted">
                    Choose a list to immediately register <strong>{cleanQuery}</strong>:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const saved = logRead({
                          plate: cleanQuery,
                          camera: "Manual Entry",
                          initialStatus: "known",
                          owner: "Known neighbor / resident",
                        });
                        if (saved) {
                          setQuickRegisterNotice(`Registered ${saved} as Known Vehicle.`);
                        }
                      }}
                      className="flex flex-col items-center justify-center rounded-md border border-ok/30 bg-ok-bg/70 hover:bg-ok-bg p-2 text-center text-xs font-medium text-ok transition"
                    >
                      <ShieldCheck className="size-4 mb-1" />
                      <span>Known Vehicle</span>
                      <span className="text-[10px] opacity-80">Resident/Neighbor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const saved = logRead({
                          plate: cleanQuery,
                          camera: "Manual Entry",
                          initialStatus: "watching",
                          note: "Manually registered to Watchlist",
                        });
                        if (saved) {
                          setQuickRegisterNotice(`Registered ${saved} on Watchlist.`);
                        }
                      }}
                      className="flex flex-col items-center justify-center rounded-md border border-alert/30 bg-alert-bg/70 hover:bg-alert-bg p-2 text-center text-xs font-medium text-alert transition"
                    >
                      <Eye className="size-4 mb-1" />
                      <span>Watchlist</span>
                      <span className="text-[10px] opacity-80">Track repeats</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const saved = logRead({
                          plate: cleanQuery,
                          camera: "Manual Entry",
                          initialStatus: "through",
                        });
                        if (saved) {
                          setQuickRegisterNotice(`Registered ${saved} under Through Traffic.`);
                        }
                      }}
                      className="flex flex-col items-center justify-center rounded-md border border-line bg-surface hover:bg-surface/80 p-2 text-center text-xs font-medium text-ink transition"
                    >
                      <CarFront className="size-4 mb-1" />
                      <span>Through Traffic</span>
                      <span className="text-[10px] text-muted">Standard pass</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs">
                    <span className="text-muted">Need custom camera or exact time?</span>
                    <button
                      type="button"
                      onClick={() => onOpenManualEntry(cleanQuery)}
                      className="font-medium text-deep underline hover:opacity-80"
                    >
                      Open detailed entry form →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted">
                    Plates must be between 4 and 8 characters long (currently {cleanQuery.length}).
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenManualEntry(cleanQuery || undefined)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-deep px-5 text-sm font-medium text-bg shadow-xs"
                  >
                    <Plus className="size-4" />
                    <span>Open Manual Entry Form</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <CarFront className="mx-auto size-10 text-muted" />
              <p className="text-base font-semibold text-ink">
                No plates found in this category
              </p>
              <p className="text-sm text-muted">
                Scan video clips with A.L.P.R. or use manual entry to log plates passing by.
              </p>
              <button
                type="button"
                onClick={() => onOpenManualEntry()}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md bg-deep px-4 text-sm font-medium text-bg"
              >
                <Plus className="size-4" />
                <span>Log a plate manually</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlates.map((record) => {
            const classification = classify(record, settings);
            const isEditing = editingPlate === record.plate;
            const isTimelineOpen = !!expandedTimeline[record.plate];
            const isChartOpen =
              expandedCharts[record.plate] ?? (filteredPlates.length === 1);

            const statusBadgeTone =
              record.status === "known"
                ? "bg-ok-bg text-ok border-ok/30"
                : record.status === "watching" || record.pinned
                  ? "bg-amber text-amber-ink border-amber/40"
                  : "bg-bg text-muted border-line";

            const alertBadgeTone =
              classification.band === "bus"
                ? "bg-alert-bg text-alert border-alert/30"
                : classification.band === "repeat"
                  ? "bg-amber text-amber-ink border-amber/30"
                  : "hidden";

            return (
              <article
                key={record.plate}
                className="rounded-card border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                {/* Main Card Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* License Plate Typography Box */}
                    <div className="flex flex-col items-center justify-center rounded-md border-2 border-deep/40 bg-white px-4 py-2 shadow-xs">
                      <span className="text-[9px] font-bold tracking-widest text-deep/70">
                        {settings.street.slice(0, 16).toUpperCase()}
                      </span>
                      <span className="font-mono text-2xl font-black tracking-widest text-ink">
                        {record.plate}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeTone}`}
                        >
                          {record.status === "known"
                            ? "Known Vehicle"
                            : record.status === "watching" || record.pinned
                              ? "Watchlist"
                              : "Through Traffic"}
                        </span>

                        {classification.band !== "through" && (
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${alertBadgeTone}`}
                          >
                            {classification.band === "bus"
                              ? "⚠️ Bus Window Sighting"
                              : "⚠️ Repeating Sighting"}
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 text-sm text-ink">
                        {record.color && <span className="font-medium">{record.color} · </span>}
                        {record.owner && <span className="text-muted">Owner: {record.owner} · </span>}
                        <span className="text-muted">
                          {record.sightings.length} total pass{record.sightings.length === 1 ? "" : "es"}
                          {" ("}
                          <strong className="text-deep">{classification.count}</strong> in active {settings.windowHours}hr window
                          {")"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleChart(record.plate)}
                      className={
                        "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors " +
                        (isChartOpen
                          ? "border-deep bg-deep text-bg shadow-xs"
                          : "border-line bg-bg text-deep hover:bg-deep/10")
                      }
                      title="View 7-day sighting distribution chart"
                    >
                      <BarChart2 className="size-3.5" />
                      <span>7-Day Trend</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenManualEntry(record.plate)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-deep/10 px-3 text-xs font-medium text-deep hover:bg-deep/20"
                      title="Log another sighting for this plate"
                    >
                      <Plus className="size-3.5" />
                      <span>Log Sighting</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startEdit(record)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-md border border-line bg-bg px-2.5 text-xs text-muted hover:text-ink"
                      title="Edit vehicle details"
                    >
                      <Edit2 className="size-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove plate ${record.plate} and its sightings?`)) {
                          deletePlate(record.plate);
                        }
                      }}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-line px-2 text-muted hover:text-alert"
                      title="Delete plate"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Edit Form Drawer */}
                {isEditing && (
                  <div className="mt-4 rounded-md border border-line bg-bg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-deep">Edit Details for {record.plate}</h4>
                      <button
                        type="button"
                        onClick={() => setEditingPlate(null)}
                        className="text-muted hover:text-ink text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs">
                        <span className="text-muted">Color / Make</span>
                        <input
                          type="text"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="mt-1 min-h-9 w-full rounded border border-line bg-surface px-2.5 text-xs"
                          placeholder="e.g. Blue Ford F-150"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="text-muted">Owner / Neighbor Label</span>
                        <input
                          type="text"
                          value={editOwner}
                          onChange={(e) => setEditOwner(e.target.value)}
                          className="mt-1 min-h-9 w-full rounded border border-line bg-surface px-2.5 text-xs"
                          placeholder="e.g. 102 Elm St or Delivery"
                        />
                      </label>
                    </div>
                    <label className="block text-xs">
                      <span className="text-muted">Observation Notes</span>
                      <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded border border-line bg-surface p-2 text-xs"
                        placeholder="Notes on vehicle behavior, travel patterns..."
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPlate(null)}
                        className="min-h-9 rounded border border-line px-3 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(record.plate)}
                        className="min-h-9 rounded bg-deep px-3 text-xs font-medium text-bg"
                      >
                        Save Details
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes Display */}
                {record.note && !isEditing && (
                  <p className="mt-3 rounded-md bg-bg p-2.5 text-xs text-ink/90">
                    <strong className="text-muted">Note:</strong> {record.note}
                  </p>
                )}

                {/* Classification Actions Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {record.status !== "known" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ownerName = prompt(`Enter owner or household name for ${record.plate}:`, record.owner || "Neighbor");
                          if (ownerName !== null) {
                            markKnown(record.plate, ownerName);
                          }
                        }}
                        className="rounded-md border border-ok/50 bg-ok-bg/50 px-2.5 py-1 text-ok font-medium hover:bg-ok-bg"
                      >
                        ✓ Mark Known Neighbor
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updatePlateDetails(record.plate, { status: "through" })}
                        className="rounded-md border border-line bg-bg px-2.5 py-1 text-muted hover:text-ink"
                      >
                        Remove from Known
                      </button>
                    )}

                    {record.status !== "watching" ? (
                      <button
                        type="button"
                        onClick={() => keepWatching(record.plate)}
                        className="rounded-md border border-deep/40 bg-deep/5 px-2.5 py-1 text-deep font-medium hover:bg-deep/10"
                      >
                        Pin to Watchlist
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updatePlateDetails(record.plate, { status: "through" })}
                        className="rounded-md border border-line bg-bg px-2.5 py-1 text-muted hover:text-ink"
                      >
                        Unpin from Watchlist
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleChart(record.plate)}
                      className="flex items-center gap-1 font-medium text-deep underline hover:opacity-80"
                    >
                      <TrendingUp className="size-3.5" />
                      <span>
                        {isChartOpen ? "Hide 7-Day Trend" : "7-Day Sighting Trend"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleTimeline(record.plate)}
                      className="flex items-center gap-1 font-medium text-deep underline hover:opacity-80"
                    >
                      <Clock className="size-3.5" />
                      <span>
                        {isTimelineOpen ? "Hide Sightings" : `View ${record.sightings.length} Sighting Timeline`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 7-Day Trend Chart Drawer */}
                {isChartOpen && (
                  <div className="mt-3 border-t border-line/60 pt-3">
                    <PlateTrendChart plate={record.plate} sightings={record.sightings} />
                  </div>
                )}

                {/* Sighting Timeline Drawer */}
                {isTimelineOpen && (
                  <div className="mt-3 border-t border-line/60 pt-3">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                      Chronological Sighting History
                    </h4>
                    {record.sightings.length === 0 ? (
                      <p className="text-xs text-muted">No individual sighting timestamps recorded.</p>
                    ) : (
                      <ol className="divide-y divide-line/40 rounded-md border border-line bg-bg">
                        {record.sightings
                          .slice()
                          .reverse()
                          .map((sight, idx) => (
                            <li
                              key={sight.at + sight.camera + idx}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-deep">
                                  {clock(sight.at)}
                                </span>
                                <span className="text-muted">·</span>
                                <span className="font-medium text-ink">{sight.camera}</span>
                                <span className="text-muted">·</span>
                                <span className="text-muted">{formatWhen(sight.at)}</span>
                                <span className="text-muted">
                                  ({new Date(sight.at).toLocaleDateString()})
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {sight.clipId && (
                                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted border border-line">
                                    Clip: {sight.clipId.slice(0, 8)}…
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm("Delete this single sighting timestamp?")) {
                                      deleteSighting(record.plate, sight.at);
                                    }
                                  }}
                                  className="text-muted hover:text-alert"
                                  title="Delete sighting"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            </li>
                          ))}
                      </ol>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
