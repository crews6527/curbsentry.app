import { useState, useEffect } from "react";
import {
  X,
  Plus,
  CarFront,
  ShieldCheck,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Camera,
} from "lucide-react";
import { useCurb } from "@/lib/curb/store";
import { normalisePlate, CAMERAS, classify, clock, formatWhen } from "@/lib/curb/logic";

type ManualEntryProps = {
  isOpen: boolean;
  onClose: () => void;
  initialPlate?: string;
  initialCamera?: string;
  initialCaptureTime?: number;
  initialStatus?: "through" | "watching" | "known";
  onSaved?: (plate: string) => void;
};

export function ManualEntryModal({
  isOpen,
  onClose,
  initialPlate = "",
  initialCamera = "Mailbox",
  initialCaptureTime,
  initialStatus = "through",
  onSaved,
}: ManualEntryProps) {
  const logRead = useCurb((s) => s.logRead);
  const settings = useCurb((s) => s.settings);
  const plates = useCurb((s) => s.plates);

  const [rawPlate, setRawPlate] = useState(initialPlate);
  const [camera, setCamera] = useState(initialCamera);
  const [customCamera, setCustomCamera] = useState("");
  const [isCustomCamera, setIsCustomCamera] = useState(false);
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [owner, setOwner] = useState("");
  const [statusChoice, setStatusChoice] = useState<"through" | "watching" | "known">(initialStatus);
  const [captureTimeStr, setCaptureTimeStr] = useState("");
  const [error, setError] = useState("");
  const [savedPlate, setSavedPlate] = useState<string | null>(null);

  // Initialize capture time string
  useEffect(() => {
    if (isOpen) {
      setRawPlate(initialPlate);
      setCamera(initialCamera);
      setIsCustomCamera(false);
      setCustomCamera("");
      setStatusChoice(initialStatus);
      setColor("");
      setNote("");
      setOwner("");
      setError("");
      setSavedPlate(null);

      const d = initialCaptureTime ? new Date(initialCaptureTime) : new Date();
      // Format as YYYY-MM-DDTHH:mm:ss for datetime-local
      const pad = (n: number) => String(n).padStart(2, "0");
      const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      setCaptureTimeStr(localIso);
    }
  }, [isOpen, initialPlate, initialCamera, initialCaptureTime, initialStatus]);

  if (!isOpen) return null;

  const normalized = normalisePlate(rawPlate);
  const isValidLength = normalized.length >= 4 && normalized.length <= 8;
  const existingRecord = plates.find((p) => p.plate === normalized);

  const setTimeOffset = (minutesAgo: number) => {
    const d = new Date(Date.now() - minutesAgo * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    setCaptureTimeStr(localIso);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidLength) {
      setError(
        normalized.length < 4
          ? `Plate must have at least 4 letters or numbers (currently ${normalized.length}).`
          : `Plate must have at most 8 letters or numbers (currently ${normalized.length}).`,
      );
      return;
    }

    const effectiveCamera = isCustomCamera ? customCamera.trim() : camera.trim();
    if (!effectiveCamera) {
      setError("Please specify a camera name.");
      return;
    }

    let timestamp = Date.now();
    if (captureTimeStr) {
      const parsed = new Date(captureTimeStr).getTime();
      if (Number.isFinite(parsed) && parsed >= Date.UTC(2000, 0, 1)) {
        timestamp = Math.min(parsed, Date.now());
      }
    }

    try {
      const saved = logRead({
        plate: normalized,
        camera: effectiveCamera,
        color: color.trim(),
        note: note.trim(),
        at: timestamp,
        initialStatus: statusChoice,
        owner: owner.trim(),
      });

      if (!saved) {
        setError("Could not save plate. Check formatting and try again.");
        return;
      }

      setSavedPlate(saved);
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving observation.");
    }
  };

  const newlySavedRecord = savedPlate ? plates.find((p) => p.plate === savedPlate) : null;
  const classification = newlySavedRecord ? classify(newlySavedRecord, settings) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-xl rounded-card border border-line bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-deep text-bg">
              <Plus className="size-5" />
            </div>
            <div>
              <h2 id="manual-entry-title" className="text-xl font-semibold text-ink">
                Manual License Plate Entry
              </h2>
              <p className="text-xs text-muted">Log an observation directly to CurbSentry records</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-md border border-line text-muted hover:text-ink"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Success View */}
        {savedPlate && newlySavedRecord ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-ok/30 bg-ok-bg p-4 text-ok">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <h3 className="font-semibold">Plate {savedPlate} Successfully Saved!</h3>
                  <p className="mt-1 text-xs">
                    Recorded to local storage with {newlySavedRecord.sightings.length} total sighting(s).
                  </p>
                </div>
              </div>
            </div>

            {/* Saved Card Preview */}
            <div className="rounded-lg border border-line bg-bg p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold tracking-wider text-ink">
                  {newlySavedRecord.plate}
                </span>
                <span
                  className={
                    "rounded-full px-3 py-1 text-xs font-semibold " +
                    (newlySavedRecord.status === "known"
                      ? "bg-ok-bg text-ok"
                      : newlySavedRecord.status === "watching"
                        ? "bg-alert-bg text-alert"
                        : "bg-surface text-muted border border-line")
                  }
                >
                  {newlySavedRecord.status === "known"
                    ? "Known Vehicle"
                    : newlySavedRecord.status === "watching"
                      ? "Watchlist"
                      : "Through Traffic"}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted">
                {newlySavedRecord.color ? `${newlySavedRecord.color} · ` : ""}
                {newlySavedRecord.sightings.length} total pass(es) · Last seen{" "}
                {newlySavedRecord.sightings.length > 0
                  ? formatWhen(newlySavedRecord.sightings[newlySavedRecord.sightings.length - 1].at)
                  : "just now"}
              </div>
              {newlySavedRecord.note && (
                <p className="mt-2 rounded-md bg-surface p-2 text-xs text-ink">
                  Note: {newlySavedRecord.note}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSavedPlate(null);
                  setRawPlate("");
                  setNote("");
                  setColor("");
                  setOwner("");
                }}
                className="min-h-11 flex-1 rounded-md bg-deep px-4 text-sm font-medium text-bg"
              >
                + Log Another Sighting
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-ink"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Plate Input with live helper */}
            <div>
              <label className="block text-sm font-medium text-ink">
                License Plate Number <span className="text-alert">*</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={rawPlate}
                  onChange={(e) => setRawPlate(e.target.value)}
                  placeholder="e.g. 7XYZ890 or BLU 4419"
                  maxLength={16}
                  autoFocus
                  autoComplete="off"
                  className="min-h-11 w-full rounded-md border border-line bg-bg px-3 font-mono text-lg font-semibold uppercase tracking-wider text-ink"
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-muted">
                  Normalized:{" "}
                  <strong className="font-mono text-deep">
                    {normalized || "—"}
                  </strong>{" "}
                  ({normalized.length} characters)
                </span>
                <span
                  className={
                    isValidLength ? "font-medium text-ok" : "text-muted"
                  }
                >
                  {isValidLength
                    ? "✓ Valid plate length"
                    : "Must be 4–8 characters"}
                </span>
              </div>
              {existingRecord && (
                <p className="mt-1 text-xs text-amber-ink bg-amber/20 px-2 py-1 rounded">
                  ℹ Plate already in system ({existingRecord.sightings.length} previous sightings, currently: {existingRecord.status}). This will add a new sighting.
                </p>
              )}
            </div>

            {/* Date & Time of Sighting */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink">
                  Observation Date & Time <span className="text-alert">*</span>
                </label>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTimeOffset(0)}
                    className="rounded border border-line bg-bg px-1.5 py-0.5 text-muted hover:text-ink"
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOffset(15)}
                    className="rounded border border-line bg-bg px-1.5 py-0.5 text-muted hover:text-ink"
                  >
                    -15m
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOffset(60)}
                    className="rounded border border-line bg-bg px-1.5 py-0.5 text-muted hover:text-ink"
                  >
                    -1h
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeOffset(1440)}
                    className="rounded border border-line bg-bg px-1.5 py-0.5 text-muted hover:text-ink"
                  >
                    Yesterday
                  </button>
                </div>
              </div>
              <input
                type="datetime-local"
                step="1"
                value={captureTimeStr}
                onChange={(e) => setCaptureTimeStr(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
                required
              />
            </div>

            {/* Camera Selection */}
            <div>
              <label className="block text-sm font-medium text-ink">
                Camera Location <span className="text-alert">*</span>
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  value={isCustomCamera ? "custom" : camera}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setIsCustomCamera(true);
                    } else {
                      setIsCustomCamera(false);
                      setCamera(e.target.value);
                    }
                  }}
                  className="min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
                >
                  {CAMERAS.map((cam) => (
                    <option key={cam} value={cam}>
                      {cam}
                    </option>
                  ))}
                  <option value="custom">+ Custom Camera...</option>
                </select>

                {isCustomCamera ? (
                  <input
                    type="text"
                    value={customCamera}
                    onChange={(e) => setCustomCamera(e.target.value)}
                    placeholder="Enter camera name"
                    maxLength={100}
                    className="min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
                    required
                  />
                ) : (
                  <div className="flex items-center text-xs text-muted px-2">
                    <Camera className="size-4 mr-1 text-muted" /> Configured camera
                  </div>
                )}
              </div>
            </div>

            {/* List & Priority Target */}
            <div>
              <label className="block text-sm font-medium text-ink">
                Registry Classification
              </label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatusChoice("through")}
                  className={
                    "flex flex-col items-center justify-center rounded-md border p-2 text-center text-xs " +
                    (statusChoice === "through"
                      ? "border-deep bg-deep/10 font-semibold text-deep"
                      : "border-line bg-bg text-muted hover:text-ink")
                  }
                >
                  <CarFront className="size-4 mb-1" />
                  <span>Standard Pass</span>
                  <span className="text-[10px] text-muted">Repeat rule check</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusChoice("watching")}
                  className={
                    "flex flex-col items-center justify-center rounded-md border p-2 text-center text-xs " +
                    (statusChoice === "watching"
                      ? "border-alert bg-alert-bg font-semibold text-alert"
                      : "border-line bg-bg text-muted hover:text-ink")
                  }
                >
                  <Eye className="size-4 mb-1" />
                  <span>Watch Immediately</span>
                  <span className="text-[10px] text-muted">Pin to Watchlist</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusChoice("known")}
                  className={
                    "flex flex-col items-center justify-center rounded-md border p-2 text-center text-xs " +
                    (statusChoice === "known"
                      ? "border-ok bg-ok-bg font-semibold text-ok"
                      : "border-line bg-bg text-muted hover:text-ink")
                  }
                >
                  <ShieldCheck className="size-4 mb-1" />
                  <span>Known Vehicle</span>
                  <span className="text-[10px] text-muted">No repeat alerts</span>
                </button>
              </div>
            </div>

            {/* Optional Details (Color & Owner) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted">
                  Vehicle Color / Make
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Silver sedan, Blue SUV"
                  maxLength={100}
                  className="mt-1 min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
                />
              </div>

              <div>
                <label className="block text-sm text-muted">
                  {statusChoice === "known" ? "Neighbor / Owner" : "Label (Optional)"}
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder={statusChoice === "known" ? "e.g. 104 Oak St (Bob)" : "e.g. Postal, Delivery"}
                  maxLength={100}
                  className="mt-1 min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
                />
              </div>
            </div>

            {/* Observation Notes */}
            <div>
              <label className="block text-sm text-muted">
                Observation Note (Optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Details of vehicle behavior, travel direction, occupants, etc."
                rows={2}
                maxLength={1000}
                className="mt-1 w-full rounded-md border border-line bg-bg p-3 text-sm text-ink"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-alert-bg p-3 text-sm text-alert">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit & Cancel */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-md border border-line px-4 text-sm font-medium text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValidLength}
                className="min-h-11 rounded-md bg-deep px-5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
              >
                Save Plate Observation
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
