import { useEffect, useMemo, useState } from "react";
import {
  CarFront,
  Copy,
  Eye,
  House,
  Plus,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  classify,
  clock,
  formatWhen,
  inBusWindow,
  normalisePlate,
  type PlateRecord,
} from "@/lib/curb/logic";
import { useCurb, type SettingsState } from "@/lib/curb/store";
import { VideoPane } from "./VideoPane";
import { BackupControls } from "./BackupControls";

type Tab = "videos" | "watch" | "through" | "known" | "agent";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function bandLabel(band: string): string {
  if (band === "bus") return "Bus window";
  if (band === "repeat") return "Repeating";
  if (band === "known") return "Known";
  return "Through traffic";
}

export function CurbApp() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("videos");
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

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Header tab={tab} onTab={setTab} />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {tab === "videos" && <VideoPane />}
        {tab === "watch" && <WatchPane />}
        {tab === "through" && <ThroughPane />}
        {tab === "known" && <KnownPane />}
        {tab === "agent" && <AgentPane />}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-xs text-muted">
        CurbSentry 0.2.0 · Originally created with{" "}
        <a href="https://grok.com" className="underline">
          Grok
        </a>
      </footer>
    </div>
  );
}

function Header({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const settings = useCurb((s) => s.settings);
  const plates = useCurb((s) => s.plates);
  const now = Date.now();
  const watchCount = plates.filter(
    (row) => row.status === "watching" || row.pinned,
  ).length;
  const busNow = inBusWindow(new Date(), settings);
  const items: { id: Tab; label: string; count?: number }[] = [
    { id: "videos", label: "Videos" },
    { id: "watch", label: "Watch", count: watchCount },
    { id: "through", label: "Through traffic" },
    { id: "known", label: "Known cars" },
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
        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              className={
                "min-h-11 rounded-full px-4 text-sm font-medium " +
                (tab === item.id
                  ? "bg-amber text-amber-ink"
                  : "bg-white/10 text-bg")
              }
            >
              {item.label}
              {item.count ? ` (${item.count})` : ""}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function LogForm() {
  const logRead = useCurb((s) => s.logRead);
  const lastAlert = useCurb((s) => s.lastAlert);
  const [plate, setPlate] = useState("");
  const [camera, setCamera] = useState("Mailbox");
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="rounded-card border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const saved = logRead({ plate, camera, color, note });
        if (!saved) {
          setError(
            "Use 4 to 8 letters or numbers. Spaces and dashes are fine.",
          );
          return;
        }
        setError("");
        setPlate("");
        setColor("");
        setNote("");
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-deep">
        <Plus className="size-4" aria-hidden="true" />
        Log a plate from a clip or type one the camera missed
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-1">
          <span className="text-muted">Plate</span>
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3 font-mono uppercase"
            placeholder="BLU 4419"
            autoComplete="off"
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
          <span className="text-muted">Color, if you saw it</span>
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
            placeholder="Blue"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-deep px-4 text-sm font-medium text-bg"
          >
            Save read
          </button>
        </div>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-muted">Note you would forget later</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full min-h-11 rounded-md border border-line bg-bg px-3"
          placeholder="Parked at the empty house near the bus stop"
        />
      </label>
      {error ? <p className="mt-2 text-sm text-alert">{error}</p> : null}
      {lastAlert ? <p className="mt-2 text-sm text-deep">{lastAlert}</p> : null}
    </form>
  );
}

function WatchPane() {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const rows = plates.filter(
    (row) =>
      row.status === "watching" || (row.pinned && row.status !== "known"),
  );
  return (
    <section className="space-y-4">
      <LogForm />
      <p className="text-sm text-muted">
        A plate lands here after {settings.repeatCount} reads inside{" "}
        {settings.windowHours} hours, or {settings.busCount} reads during the
        weekday bus window ({settings.busStart}–{settings.busEnd}). A single
        drive-by does not.
      </p>
      {rows.length === 0 ? (
        <Empty
          title="Nothing repeating right now"
          body="Unknown cars that pass once sit under Through traffic. They are saved, but they do not raise a watch."
        />
      ) : (
        rows.map((row) => <PlateCard key={row.plate} row={row} mode="watch" />)
      )}
    </section>
  );
}

function ThroughPane() {
  const plates = useCurb((s) => s.plates);
  const settings = useCurb((s) => s.settings);
  const rows = plates.filter((row) => {
    if (row.status !== "through" || row.pinned) return false;
    return classify(row, settings).count > 0;
  });
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">
        These plates passed once inside the time window. They are written down
        so you do not lose the number. They are not emailed. If you recognize a
        neighbor, mark them known. If the pass felt wrong, keep watching.
      </p>
      {rows.length === 0 ? (
        <Empty
          title="No one-time plates in this window"
          body="New reads that do not repeat will show up here."
        />
      ) : (
        rows.map((row) => (
          <PlateCard key={row.plate} row={row} mode="through" />
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
  const known = plates.filter((row) => row.status === "known");

  return (
    <section className="space-y-4">
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
            className="min-h-11 rounded-md bg-ok px-4 text-sm font-medium text-bg"
          >
            Add to known list
          </button>
        </div>
      </form>
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
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeKnown(row.plate)}
              className="min-h-11 rounded-md border border-line px-3 text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlateCard({
  row,
  mode,
}: {
  row: PlateRecord;
  mode: "watch" | "through";
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
    <article className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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

function AgentPane() {
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
