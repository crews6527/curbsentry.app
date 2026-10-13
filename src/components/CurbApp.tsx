import { useEffect, useMemo, useState } from "react";
import {
  CarFront,
  Copy,
  Download,
  Check,
  Eye,
  House,
  Plus,
  ShieldCheck,
  Terminal,
  Search,
  Zap,
} from "lucide-react";
import {
  classify,
  clock,
  formatWhen,
  inBusWindow,
  normalisePlate,
  exportKnownPlatesToCsv,
  type PlateRecord,
} from "@/lib/curb/logic";
import { useCurb, type SettingsState } from "@/lib/curb/store";
import { VideoPane } from "./VideoPane";
import { BackupControls } from "./BackupControls";
import { PlateLookup } from "./PlateLookup";
import { AlprTool } from "./AlprTool";
import { ManualEntryModal } from "./ManualEntryModal";
import { ComplianceHubModal, type PolicyTab } from "./ComplianceHubModal";
import { RecentActivityFeed } from "./RecentActivityFeed";
import { BulkActionBar } from "./BulkActionBar";

type Tab = "lookup" | "alpr" | "videos" | "watch" | "through" | "known" | "agent";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function bandLabel(band: string): string {
  if (band === "bus") return "Bus window";
  if (band === "repeat") return "Repeating";
  if (band === "known") return "Known";
  return "Through traffic";
}

export function CurbApp() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("lookup");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualInitialPlate, setManualInitialPlate] = useState("");
  const [manualInitialCamera, setManualInitialCamera] = useState("Mailbox");
  const [lookupInitialQuery, setLookupInitialQuery] = useState("");
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [complianceInitialTab, setComplianceInitialTab] =
    useState<PolicyTab>("privacy");
  const settings = useCurb((s) => s.settings);

  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useCurb.persist.onFinishHydration(finish);
    if (useCurb.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  if (!hydrated || !settings.setupDone) {
    return <Setup ready={hydrated} />;
  }

  const handleOpenManualEntry = (plate = "", camera = "Mailbox") => {
    setManualInitialPlate(plate);
    setManualInitialCamera(camera || "Mailbox");
    setManualModalOpen(true);
  };

  const handleNavigateToLookup = (plate = "") => {
    if (plate) setLookupInitialQuery(plate);
    setTab("lookup");
  };

  const handleOpenCompliance = (subTab: PolicyTab = "privacy") => {
    setComplianceInitialTab(subTab);
    setComplianceModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Header
        tab={tab}
        onTab={setTab}
        onOpenManualEntry={() => handleOpenManualEntry()}
        onQuickSearch={(query) => handleNavigateToLookup(query)}
      />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {tab === "lookup" && (
          <PlateLookup
            initialQuery={lookupInitialQuery}
            onOpenManualEntry={handleOpenManualEntry}
          />
        )}
        {tab === "alpr" && (
          <AlprTool
            onOpenManualEntry={handleOpenManualEntry}
            onNavigateToLookup={handleNavigateToLookup}
            onNavigateToVideos={() => setTab("videos")}
          />
        )}
        {tab === "videos" && <VideoPane />}
        {tab === "watch" && (
          <WatchPane
            onOpenManualEntry={handleOpenManualEntry}
            onNavigateToLookup={handleNavigateToLookup}
          />
        )}
        {tab === "through" && (
          <ThroughPane onOpenManualEntry={handleOpenManualEntry} />
        )}
        {tab === "known" && <KnownPane />}
        {tab === "agent" && (
          <AgentPane onOpenCompliance={handleOpenCompliance} />
        )}
      </main>

      <ManualEntryModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        initialPlate={manualInitialPlate}
        initialCamera={manualInitialCamera}
      />

      <ComplianceHubModal
        isOpen={complianceModalOpen}
        onClose={() => setComplianceModalOpen(false)}
        initialTab={complianceInitialTab}
      />

      <footer className="mx-auto max-w-5xl px-4 pb-12 pt-8 border-t border-line/60 text-xs text-muted">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-ink text-sm">
              CurbSentry 0.3.0 · Private by Default
            </p>
            <p className="text-[11px] text-muted mt-0.5">
              Client-side Automated License Plate Reader (ALPR) & Video Security Log
            </p>
          </div>
          <nav
            aria-label="Compliance and Legal policies"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"
          >
            <button
              type="button"
              onClick={() => handleOpenCompliance("privacy")}
              className="hover:text-ink underline transition font-medium"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("labels")}
              className="hover:text-ink underline transition font-medium"
            >
              Store Privacy Labels
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("terms")}
              className="hover:text-ink underline transition font-medium"
            >
              Terms of Use
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("accessibility")}
              className="hover:text-ink underline transition font-medium"
            >
              Accessibility (WCAG 2.2 AA)
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("ai-notice")}
              className="hover:text-ink underline transition font-medium"
            >
              A.I. &amp; OCR Notice
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("security")}
              className="hover:text-ink underline transition font-medium"
            >
              Security Architecture
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("cookies")}
              className="hover:text-ink underline transition font-medium"
            >
              Cookies & Storage
            </button>
            <span aria-hidden="true" className="text-line">·</span>
            <button
              type="button"
              onClick={() => handleOpenCompliance("deletion")}
              className="text-alert hover:underline transition font-semibold"
            >
              Delete All Data
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}


function Header({
  tab,
  onTab,
  onOpenManualEntry,
  onQuickSearch,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onOpenManualEntry: () => void;
  onQuickSearch: (query: string) => void;
}) {
  const settings = useCurb((s) => s.settings);
  const plates = useCurb((s) => s.plates);
  const [headerSearch, setHeaderSearch] = useState("");
  const watchCount = plates.filter(
    (row) => row.status === "watching" || row.pinned,
  ).length;
  const throughCount = plates.filter(
    (row) => row.status === "through" && !row.pinned,
  ).length;
  const knownCount = plates.filter((row) => row.status === "known").length;
  const busNow = inBusWindow(new Date(), settings);

  const items: { id: Tab; label: string; count?: number }[] = [
    { id: "lookup", label: "Plate Lookup", count: plates.length },
    { id: "alpr", label: "A.L.P.R." },
    { id: "videos", label: "Videos" },
    { id: "watch", label: "Watch", count: watchCount },
    { id: "through", label: "Through traffic", count: throughCount },
    { id: "known", label: "Known cars", count: knownCount },
    { id: "agent", label: "Export & backup" },
  ];

  return (
    <header className="border-b border-line bg-deep text-bg">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-amber">
            CURBSENTRY
          </p>
          <h1 className="text-2xl font-semibold leading-tight">
            {settings.street}
          </h1>
          <p className="text-sm text-bg/80">
            {busNow
              ? "Bus window is open. Unknown repeats are flagged sooner."
              : "Known cars stay quiet. One pass is not an alert."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (headerSearch.trim()) {
                onQuickSearch(headerSearch.trim());
                setHeaderSearch("");
              }
            }}
            className="relative flex items-center"
          >
            <Search className="absolute left-2.5 size-4 text-bg/60" />
            <input
              type="text"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="Look up plate..."
              className="h-10 w-36 sm:w-44 rounded-full border border-white/20 bg-white/10 pl-8 pr-3 text-xs text-bg placeholder:text-bg/60 focus:bg-white/20 focus:outline-hidden"
            />
          </form>

          {/* Log Sighting Button */}
          <button
            type="button"
            onClick={onOpenManualEntry}
            className="flex h-10 items-center gap-1.5 rounded-full bg-amber px-4 text-xs font-semibold text-amber-ink shadow-xs hover:brightness-105"
          >
            <Plus className="size-4" />
            <span>+ Log Sighting</span>
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="mx-auto max-w-5xl px-4 pb-3">
        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              className={
                "min-h-10 rounded-full px-4 text-xs font-medium transition-colors " +
                (tab === item.id
                  ? "bg-amber text-amber-ink font-semibold"
                  : "bg-white/10 text-bg hover:bg-white/20")
              }
            >
              {item.label}
              {item.count !== undefined ? ` (${item.count})` : ""}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function LogForm({
  onSavedRecord,
}: {
  onSavedRecord?: (plate: string) => void;
}) {
  const logRead = useCurb((s) => s.logRead);
  const keepWatching = useCurb((s) => s.keepWatching);
  const [plate, setPlate] = useState("");
  const [camera, setCamera] = useState("Mailbox");
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [statusTarget, setStatusTarget] = useState<"watching" | "through">("watching");
  const [error, setError] = useState("");
  const [recentSaved, setRecentSaved] = useState<{ plate: string; status: string } | null>(null);

  return (
    <form
      className="rounded-card border border-line bg-surface p-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        const clean = normalisePlate(plate);
        if (clean.length < 4 || clean.length > 8) {
          setError("Use 4 to 8 letters or numbers. Spaces and dashes are fine.");
          return;
        }
        const saved = logRead({
          plate: clean,
          camera,
          color,
          note,
          initialStatus: statusTarget,
        });
        if (!saved) {
          setError("Could not save read. Check plate formatting.");
          return;
        }
        setRecentSaved({ plate: saved, status: statusTarget });
        if (onSavedRecord) onSavedRecord(saved);
        setPlate("");
        setColor("");
        setNote("");
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-deep">
          <Plus className="size-4" aria-hidden="true" />
          <span>Manual License Plate Entry</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Target list:</span>
          <button
            type="button"
            onClick={() => setStatusTarget("watching")}
            className={
              "rounded px-2.5 py-1 font-medium " +
              (statusTarget === "watching"
                ? "bg-amber text-amber-ink font-semibold"
                : "border border-line text-muted bg-bg")
            }
          >
            Watch immediately
          </button>
          <button
            type="button"
            onClick={() => setStatusTarget("through")}
            className={
              "rounded px-2.5 py-1 font-medium " +
              (statusTarget === "through"
                ? "bg-deep text-bg font-semibold"
                : "border border-line text-muted bg-bg")
            }
          >
            Standard pass
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-1">
          <span className="text-muted">Plate Number *</span>
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3 font-mono font-bold uppercase tracking-wider"
            placeholder="BLU 4419"
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Camera</span>
          <select
            value={camera}
            onChange={(event) => setCamera(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
          >
            <option>Mailbox</option>
            <option>Front door</option>
            <option>Driveway</option>
            <option>Garage</option>
            <option>Blink side</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Color / Make</span>
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
            placeholder="Blue sedan"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-deep px-4 text-sm font-medium text-bg shadow-xs hover:opacity-90"
          >
            Save Plate Read
          </button>
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-muted">Observation note</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
          placeholder="Details of vehicle, direction of travel, suspicious behavior..."
        />
      </label>

      {error ? (
        <div className="rounded-md bg-alert-bg p-2 text-xs text-alert font-medium">
          {error}
        </div>
      ) : null}

      {recentSaved ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ok/40 bg-ok-bg p-2.5 text-xs text-ok">
          <div>
            <strong>✓ Successfully saved plate {recentSaved.plate}</strong>
            {recentSaved.status === "through"
              ? " (Recorded under Through traffic. It will alert if it repeats)."
              : " (Added to Watchlist immediately)."}
          </div>
          {recentSaved.status === "through" && (
            <button
              type="button"
              onClick={() => {
                keepWatching(recentSaved.plate);
                setRecentSaved((p) => (p ? { ...p, status: "watching" } : null));
              }}
              className="underline font-semibold text-deep"
            >
              Pin to Watchlist now
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}

function WatchPane({
  onOpenManualEntry,
  onNavigateToLookup,
}: {
  onOpenManualEntry?: (plate?: string) => void;
  onNavigateToLookup?: (plate?: string) => void;
}) {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const markPlatesKnown = useCurb((s) => s.markPlatesKnown);
  const deletePlates = useCurb((s) => s.deletePlates);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);

  const rows = plates.filter(
    (row) =>
      row.status === "watching" || (row.pinned && row.status !== "known"),
  );

  const visibleRowPlates = rows.map((r) => r.plate);
  const activeSelected = selectedPlates.filter((p) =>
    visibleRowPlates.includes(p),
  );
  const isAllSelected = rows.length > 0 && activeSelected.length === rows.length;

  const handleToggleSelect = (plate: string) => {
    setSelectedPlates((prev) =>
      prev.includes(plate) ? prev.filter((p) => p !== plate) : [...prev, plate],
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPlates((prev) =>
        prev.filter((p) => !visibleRowPlates.includes(p)),
      );
    } else {
      setSelectedPlates((prev) =>
        Array.from(new Set([...prev, ...visibleRowPlates])),
      );
    }
  };

  const handleMoveToKnown = () => {
    if (activeSelected.length === 0) return;
    markPlatesKnown(activeSelected);
    setSelectedPlates((prev) =>
      prev.filter((p) => !activeSelected.includes(p)),
    );
  };

  const handleDeleteSelected = () => {
    if (activeSelected.length === 0) return;
    deletePlates(activeSelected);
    setSelectedPlates((prev) =>
      prev.filter((p) => !activeSelected.includes(p)),
    );
  };

  return (
    <section className="space-y-6">
      <LogForm />

      {/* Chronological Activity Feed showing most recent 10 sightings across all plates */}
      <RecentActivityFeed
        plates={plates}
        onNavigateToLookup={onNavigateToLookup}
        onOpenManualEntry={onOpenManualEntry}
      />

      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2">
          <div>
            <h2 className="text-base font-semibold text-deep">
              Watchlist Vehicles ({rows.length})
            </h2>
            <p className="text-xs text-muted">
              Auto-promoted after {settings.repeatCount} reads inside{" "}
              {settings.windowHours}h, or {settings.busCount} in bus window ({settings.busStart}–{settings.busEnd}).
            </p>
          </div>
        </div>

        {rows.length > 0 && (
          <BulkActionBar
            selectedCount={activeSelected.length}
            totalCount={rows.length}
            isAllSelected={isAllSelected}
            onToggleSelectAll={handleToggleSelectAll}
            onClearSelection={() =>
              setSelectedPlates((prev) =>
                prev.filter((p) => !visibleRowPlates.includes(p)),
              )
            }
            onMoveToKnown={handleMoveToKnown}
            onDeleteSelected={handleDeleteSelected}
            targetListName="Watchlist"
          />
        )}

        {rows.length === 0 ? (
          <Empty
            title="Nothing repeating right now"
            body="Unknown cars that pass once sit under Through traffic. They are saved, but they do not raise a watch."
          />
        ) : (
          rows.map((row) => (
            <PlateCard
              key={row.plate}
              row={row}
              mode="watch"
              selected={activeSelected.includes(row.plate)}
              onToggleSelect={handleToggleSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ThroughPane({
  onOpenManualEntry,
}: {
  onOpenManualEntry?: (plate?: string) => void;
}) {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const markPlatesKnown = useCurb((s) => s.markPlatesKnown);
  const deletePlates = useCurb((s) => s.deletePlates);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);

  const rows = plates.filter((row) => {
    if (row.status !== "through" || row.pinned) return false;
    return classify(row, settings).count > 0;
  });

  const visibleRowPlates = rows.map((r) => r.plate);
  const activeSelected = selectedPlates.filter((p) =>
    visibleRowPlates.includes(p),
  );
  const isAllSelected = rows.length > 0 && activeSelected.length === rows.length;

  const handleToggleSelect = (plate: string) => {
    setSelectedPlates((prev) =>
      prev.includes(plate) ? prev.filter((p) => p !== plate) : [...prev, plate],
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPlates((prev) =>
        prev.filter((p) => !visibleRowPlates.includes(p)),
      );
    } else {
      setSelectedPlates((prev) =>
        Array.from(new Set([...prev, ...visibleRowPlates])),
      );
    }
  };

  const handleMoveToKnown = () => {
    if (activeSelected.length === 0) return;
    markPlatesKnown(activeSelected);
    setSelectedPlates((prev) =>
      prev.filter((p) => !activeSelected.includes(p)),
    );
  };

  const handleDeleteSelected = () => {
    if (activeSelected.length === 0) return;
    deletePlates(activeSelected);
    setSelectedPlates((prev) =>
      prev.filter((p) => !activeSelected.includes(p)),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          These plates passed once inside the time window. They are written down
          so you do not lose the number. If you recognize a neighbor, mark them known.
        </p>
        {onOpenManualEntry && (
          <button
            type="button"
            onClick={() => onOpenManualEntry()}
            className="flex items-center gap-1.5 rounded-md bg-deep px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90"
          >
            <Plus className="size-3.5" />
            <span>Manual Entry</span>
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <BulkActionBar
          selectedCount={activeSelected.length}
          totalCount={rows.length}
          isAllSelected={isAllSelected}
          onToggleSelectAll={handleToggleSelectAll}
          onClearSelection={() =>
            setSelectedPlates((prev) =>
              prev.filter((p) => !visibleRowPlates.includes(p)),
            )
          }
          onMoveToKnown={handleMoveToKnown}
          onDeleteSelected={handleDeleteSelected}
          targetListName="Through traffic"
        />
      )}

      {rows.length === 0 ? (
        <Empty
          title="No one-time plates in this window"
          body="New reads that do not repeat will show up here."
        />
      ) : (
        rows.map((row) => (
          <PlateCard
            key={row.plate}
            row={row}
            mode="through"
            selected={activeSelected.includes(row.plate)}
            onToggleSelect={handleToggleSelect}
          />
        ))
      )}
    </section>
  );
}

function KnownPane() {
  const plates = useCurb((s) => s.plates);
  const markKnown = useCurb((s) => s.markKnown);
  const removeKnown = useCurb((s) => s.removeKnown);
  const [plate, setPlate] = useState("");
  const [owner, setOwner] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const known = plates.filter((row) => row.status === "known");

  const handleDownloadCsv = () => {
    if (known.length === 0) return;

    const csvContent = exportKnownPlatesToCsv(plates);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `curbsentry-known-plates-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <section className="space-y-4">
      {/* Header with summary and Download CSV button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="size-5 text-ok" />
            <span>Household and Neighbor Vehicles</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Known vehicles are excluded from repeat alerts. {known.length} vehicle{known.length === 1 ? "" : "s"} registered.
          </p>
        </div>
        <button
          type="button"
          disabled={known.length === 0}
          onClick={handleDownloadCsv}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-bg px-4 text-sm font-medium hover:border-ink/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title={
            known.length === 0
              ? "No known vehicles to export yet"
              : "Download CSV file with all known license plates and their associated owners"
          }
        >
          {downloadSuccess ? (
            <>
              <Check className="size-4 text-ok" />
              <span className="text-ok font-medium">Downloaded CSV!</span>
            </>
          ) : (
            <>
              <Download className="size-4 text-deep" />
              <span>Download CSV ({known.length})</span>
            </>
          )}
        </button>
      </div>

      <form
        className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[1fr_1.4fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = normalisePlate(plate);
          if (clean.length < 4) return;
          const existing = plates.find((row) => row.plate === clean);
          if (!existing) {
            useCurb
              .getState()
              .logRead({ plate: clean, camera: "Known list", note: "" });
          }
          markKnown(clean, owner);
          setPlate("");
          setOwner("");
        }}
      >
        <label className="text-sm">
          <span className="text-muted">Plate you already know</span>
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3 font-mono uppercase"
            placeholder="NEIGH 22"
          />
        </label>
        <label className="text-sm">
          <span className="text-muted">Who it is</span>
          <input
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
            placeholder="Corner house, grey truck"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="min-h-11 rounded-md bg-ok px-4 text-sm font-medium text-bg hover:opacity-90 transition"
          >
            Add to known list
          </button>
        </div>
      </form>

      {known.length === 0 ? (
        <Empty
          title="No known vehicles registered yet"
          body="Add household or neighbor plates above to exclude them from repeating vehicle alerts."
        />
      ) : (
        <ul className="space-y-2">
          {known.map((row) => (
            <li
              key={row.plate}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
            >
              <div>
                <p className="font-mono text-lg font-semibold">{row.plate}</p>
                <p className="text-sm text-muted">
                  {row.owner || "Known on this street"}
                  {row.color ? ` · ${row.color}` : ""}
                  {row.sightings && row.sightings.length > 0
                    ? ` · ${row.sightings.length} sighting${row.sightings.length === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeKnown(row.plate)}
                className="min-h-11 rounded-md border border-line px-3 text-sm hover:border-alert hover:text-alert transition"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlateCard({
  row,
  mode,
  selected = false,
  onToggleSelect,
}: {
  row: PlateRecord;
  mode: "watch" | "through";
  selected?: boolean;
  onToggleSelect?: (plate: string) => void;
}) {
  const settings = useCurb((s) => s.settings);
  const markKnown = useCurb((s) => s.markKnown);
  const keepWatching = useCurb((s) => s.keepWatching);
  const setNote = useCurb((s) => s.setNote);
  const [owner, setOwner] = useState("");
  const [note, setLocalNote] = useState(row.note);
  const [color, setColor] = useState(row.color);
  const info = classify(row, settings);
  const tone =
    info.band === "bus"
      ? "bg-alert-bg text-alert"
      : info.band === "repeat"
        ? "bg-amber text-amber-ink"
        : "bg-bg text-muted";

  return (
    <article
      className={`rounded-card border transition p-4 ${
        selected
          ? "border-deep/80 bg-deep/5 ring-1 ring-deep/40 shadow-xs"
          : "border-line bg-surface"
      }`}
      aria-selected={selected}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {onToggleSelect && (
            <label className="flex items-center pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(row.plate)}
                className="size-5 rounded border-line text-deep focus:ring-deep cursor-pointer accent-deep"
                aria-label={`Select vehicle ${row.plate} for bulk action`}
              />
            </label>
          )}
          <div>
            <p className="font-mono text-2xl font-semibold tracking-wide">
              {row.plate}
            </p>
            <p className="text-sm text-muted">
              {row.color ? `${row.color}. ` : ""}
              {info.count} read{info.count === 1 ? "" : "s"} in the last{" "}
              {settings.windowHours} hours
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
        >
          {bandLabel(info.band)}
        </span>
      </div>
      {row.note ? <p className="mt-3 text-sm">{row.note}</p> : null}
      <ol className="mt-3 space-y-1 text-sm text-muted">
        {row.sightings
          .slice()
          .reverse()
          .slice(0, 6)
          .map((sight) => (
            <li key={sight.at + sight.camera}>
              {clock(sight.at)} · {sight.camera} · {formatWhen(sight.at)}
            </li>
          ))}
      </ol>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          placeholder="Neighbor name, if you know it"
          className="min-h-11 rounded-md border border-line bg-bg px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => markKnown(row.plate, owner)}
          className="min-h-11 rounded-md bg-ok px-3 text-sm font-medium text-bg"
        >
          Known neighbor
        </button>
        {mode === "through" ? (
          <button
            type="button"
            onClick={() => keepWatching(row.plate)}
            className="min-h-11 rounded-md bg-deep px-3 text-sm font-medium text-bg"
          >
            Keep watching
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setNote(row.plate, note, color)}
            className="min-h-11 rounded-md border border-line px-3 text-sm"
          >
            Save note
          </button>
        )}
      </div>
      {mode === "watch" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="min-h-11 rounded-md border border-line bg-bg px-3 text-sm"
            placeholder="Color"
          />
          <input
            value={note}
            onChange={(event) => setLocalNote(event.target.value)}
            className="min-h-11 rounded-md border border-line bg-bg px-3 text-sm"
            placeholder="What you saw"
          />
        </div>
      ) : null}
    </article>
  );
}

function AgentPane({
  onOpenCompliance,
}: {
  onOpenCompliance?: (tab: PolicyTab) => void;
}) {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const resetLog = useCurb((s) => s.resetLog);
  const [copied, setCopied] = useState(false);
  const payload = useMemo(() => {
    const watching = plates
      .filter((row) => row.status === "watching")
      .map((row) => {
        const info = classify(row, settings);
        return {
          plate: row.plate,
          color: row.color,
          note: row.note,
          reads_in_window: info.count,
          level: info.band,
          cameras: [...new Set(row.sightings.map((s) => s.camera))],
        };
      });
    return {
      product: "CurbSentry",
      street: settings.street,
      rules: {
        repeat: `${settings.repeatCount} reads inside ${settings.windowHours} hours`,
        bus_window: `${settings.busStart}-${settings.busEnd} weekdays, flag at ${settings.busCount}`,
      },
      watching,
      known_count: plates.filter((row) => row.status === "known").length,
      through_count: plates.filter(
        (row) => row.status === "through" && !row.pinned,
      ).length,
    };
  }, [plates, settings]);
  const text = JSON.stringify(payload, null, 2);

  return (
    <section className="space-y-4">
      {/* Store Compliance & Legal Disclosures Card */}
      {onOpenCompliance && (
        <div className="rounded-card border border-ok/30 bg-ok/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-ok" />
              <h2 className="text-sm font-semibold text-ink">
                Store Compliance & Legal Hub
              </h2>
            </div>
            <span className="rounded bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
              Apple & Google Play Ready
            </span>
          </div>
          <p className="text-xs text-muted">
            CurbSentry adheres strictly to App Store & Play Store privacy regulations, WCAG 2.2 AA accessibility, zero-cloud processing standards, and Global Privacy Control.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenCompliance("labels")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Privacy Labels
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("privacy")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("terms")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Terms of Use & Clauses
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("accessibility")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Accessibility (WCAG 2.2 AA)
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("ai-notice")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              A.I. & Local OCR Notice
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("security")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Security Architecture
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("cookies")}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg transition"
            >
              Cookies & Storage
            </button>
            <button
              type="button"
              onClick={() => onOpenCompliance("deletion")}
              className="rounded-md border border-alert/30 bg-alert-bg px-3 py-1.5 text-xs font-medium text-alert hover:bg-alert/15 transition"
            >
              Data Deletion Policy
            </button>
          </div>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-deep">
          <Terminal className="size-4" aria-hidden="true" />
          Export your confirmed watch status
        </div>
        <p className="mt-2 text-sm text-muted">
          Copy the confirmed watch status below to your assistant for review.
          Scan saved clips on Videos or enter a missed plate manually on Watch.
          This web app does not connect to camera accounts or a live stream.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex gap-2">
            <Eye
              className="mt-0.5 size-4 shrink-0 text-deep"
              aria-hidden="true"
            />
            Review scanned reads before they count toward alerts. Known cars
            stay excluded.
          </li>
          <li className="flex gap-2">
            <Copy
              className="mt-0.5 size-4 shrink-0 text-deep"
              aria-hidden="true"
            />
            Copy the status block to your assistant when you want a second look
            at repeat sightings.
          </li>
          <li className="flex gap-2">
            <House
              className="mt-0.5 size-4 shrink-0 text-deep"
              aria-hidden="true"
            />
            This browser copy saves its own log. The separate desktop service
            and its Strident bridge use a different data store.
          </li>
        </ul>
      </div>
      <div className="rounded-card bg-ink p-4 text-bg">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-mono text-xs tracking-wide text-amber">
            CURRENT WATCH STATUS
          </p>
          <button
            type="button"
            className="min-h-11 rounded-md bg-amber px-3 text-sm font-medium text-amber-ink"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy status"}
          </button>
        </div>
        <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-bg/90">
          {text}
        </pre>
      </div>
      <BackupControls />
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Clear this browser's plate log, video reads and settings? Download a backup first.",
            )
          )
            resetLog();
        }}
        className="min-h-11 text-sm text-alert underline"
      >
        Clear this browser's log
      </button>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-4 py-8">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function Setup({ ready }: { ready: boolean }) {
  const completeSetup = useCurb((s) => s.completeSetup);
  const [step, setStep] = useState(0);
  const [street, setStreet] = useState("Our street");
  const [busStart, setBusStart] = useState("14:30");
  const [busEnd, setBusEnd] = useState("16:00");
  const [plate, setPlate] = useState("");
  const [owner, setOwner] = useState("");

  const finish = (extraPlate: boolean) => {
    const patch: Partial<SettingsState> = { street, busStart, busEnd };
    completeSetup(patch);
    if (extraPlate) {
      const clean = normalisePlate(plate);
      if (clean.length >= 4) {
        useCurb.getState().logRead({ plate: clean, camera: "Known list" });
        useCurb.getState().markKnown(clean, owner);
      }
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <p className="font-mono text-xs tracking-[0.18em] text-deep">
        CURBSENTRY SETUP
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">
        Set up the street before the first watch
      </h1>
      <p className="mt-2 text-sm text-muted">
        Name your street, choose a bus window, and optionally add a known car.
        Your log starts empty.
      </p>
      <div className="mt-6 rounded-card border border-line bg-surface p-5">
        {step === 0 && (
          <label className="block text-sm">
            <span className="font-medium">
              What should the log call this street?
            </span>
            <input
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              className="mt-2 w-full min-h-11 rounded-md border border-line bg-bg px-3"
            />
          </label>
        )}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="font-medium">Bus window starts</span>
              <input
                type="time"
                value={busStart}
                onChange={(event) => setBusStart(event.target.value)}
                className="mt-2 w-full min-h-11 rounded-md border border-line bg-bg px-3"
              />
            </label>
            <label>
              <span className="font-medium">Ends</span>
              <input
                type="time"
                value={busEnd}
                onChange={(event) => setBusEnd(event.target.value)}
                className="mt-2 w-full min-h-11 rounded-md border border-line bg-bg px-3"
              />
            </label>
            <p className="col-span-2 text-muted">
              Weekdays only. An unknown plate seen twice in this window is
              flagged. Outside it, the plate needs three reads inside two hours.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="font-medium">
                One plate that should never alert
              </span>
              <input
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                placeholder="Optional"
                className="mt-2 w-full min-h-11 rounded-md border border-line bg-bg px-3 font-mono uppercase"
              />
            </label>
            <label className="block">
              <span className="font-medium">Whose car</span>
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                className="mt-2 w-full min-h-11 rounded-md border border-line bg-bg px-3"
              />
            </label>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {step < 2 ? (
            <button
              type="button"
              disabled={!ready}
              className="min-h-11 rounded-md bg-deep px-4 text-sm font-medium text-bg"
              onClick={() => setStep((n) => n + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready}
              className="min-h-11 rounded-md bg-deep px-4 text-sm font-medium text-bg"
              onClick={() => finish(true)}
            >
              Open the log
            </button>
          )}
          <button
            type="button"
            disabled={!ready}
            className="min-h-11 rounded-md px-4 text-sm text-muted"
            onClick={() => finish(false)}
          >
            Use default settings
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Step {step + 1} of 3. Days covered:{" "}
          {DAY_LABELS.filter((_, i) => [1, 2, 3, 4, 5].includes(i)).join(", ")}.
        </p>
      </div>
    </main>
  );
}
