import { useEffect, useRef, useState } from "react";
import { useCurb, type ScanRecord, type ScanRead } from "@/lib/curb/store";
import {
  FULL_FRAME,
  validateCapture,
  validateCrop,
  type Crop,
} from "@/lib/curb/scan-logic";
import { fileDigest, scanVideo } from "@/lib/curb/video-scan";

const inputStyle =
  "mt-1 min-h-11 w-full rounded-md border border-line bg-bg px-3";
const buttonStyle =
  "min-h-11 rounded-md bg-deep px-4 text-sm font-medium text-bg";

export function VideoPane() {
  const scans = useCurb((s) => s.scans);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [selectedDigest, setSelectedDigest] = useState("");
  const [capture, setCapture] = useState("");
  const [camera, setCamera] = useState("Mailbox");
  const [crop, setCrop] = useState<Crop>({ ...FULL_FRAME });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setSelectedDigest("");
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    void fileDigest(file).then(
      (digest) => {
        if (active) setSelectedDigest(digest);
      },
      () => {},
    );
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  async function start() {
    if (!file || running) return;
    setMessage("");
    setRunning(true);
    const abort = new AbortController();
    controller.current = abort;
    let scan: ScanRecord | undefined;
    try {
      const capturedAt = validateCapture(new Date(capture).getTime());
      validateCrop(crop);
      if (!camera.trim()) throw new Error("Enter the camera name.");
      const digest = await fileDigest(file);
      if (abort.signal.aborted)
        throw new DOMException("Scan cancelled.", "AbortError");
      scan = useCurb
        .getState()
        .beginScan({
          digest,
          name: file.name,
          camera: camera.trim(),
          capturedAt,
          crop: { ...crop },
        });
      if (scan.status === "complete") {
        setMessage(
          "This recording is already scanned. Its saved reads are shown below.",
        );
        return;
      }
      const id = scan.id;
      await scanVideo(
        file,
        scan.crop,
        abort.signal,
        (reads, done, total, duration) =>
          useCurb.getState().recordFrame(id, reads, done, total, duration),
        (message) => {
          if (mounted.current) setMessage(message);
        },
      );
      const saved = useCurb.getState().scans.find((row) => row.id === id)!;
      const message = saved.reads.length
        ? `Scan complete. ${saved.reads.length} possible plate number(s) saved automatically.`
        : "Scan complete. No readable plate found. Try a closer scan area or enter the plate manually.";
      useCurb.getState().finishScan(id, "complete", message);
      if (mounted.current) setMessage(message);
    } catch (error) {
      const cancelled = abort.signal.aborted;
      const message = cancelled
        ? "Scan cancelled. Any reads already saved are retained."
        : error instanceof Error
          ? error.message
          : "The video could not be scanned.";
      if (scan)
        useCurb
          .getState()
          .finishScan(scan.id, cancelled ? "cancelled" : "error", message);
      if (mounted.current) setMessage(message);
    } finally {
      controller.current = null;
      if (mounted.current) setRunning(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-xl font-semibold">Read a saved video</h2>
        <p className="mt-2 text-sm text-muted">
          Choose a camera clip, enter its recording start time, and scan it.
          Possible plate numbers are saved automatically on this browser. Review
          them before they count toward repeat alerts. Videos stay on your
          device.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            Video file
            <input
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm"
              disabled={running}
              className={inputStyle}
              onChange={(event) => {
                setFile(event.target.files?.[0]);
                setMessage("");
              }}
            />
          </label>
          <label className="block text-sm">
            Recording start time
            <input
              type="datetime-local"
              step="1"
              value={capture}
              disabled={running}
              onChange={(e) => setCapture(e.target.value)}
              className={inputStyle}
            />
          </label>
          <label className="block text-sm">
            Camera name
            <input
              value={camera}
              maxLength={100}
              disabled={running}
              onChange={(e) => setCamera(e.target.value)}
              className={inputStyle}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Use the time shown at the start of the recording, in this device's
          time zone. MP4 (H.264) and WebM are recommended. Limit: 100 MiB and
          ten minutes.
        </p>
        {preview && (
          <video
            ref={video}
            key={preview}
            src={preview}
            controls
            preload="metadata"
            className="mt-4 max-h-96 w-full rounded-md bg-ink"
          />
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Scan area (optional)
          </summary>
          <p className="mt-2 text-sm text-muted">
            Crop to the part of the picture where plates pass to reduce
            background text. Values are percentages of the frame.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key} className="text-sm">
                {
                  {
                    x: "Left %",
                    y: "Top %",
                    width: "Width %",
                    height: "Height %",
                  }[key]
                }
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={crop[key]}
                  disabled={running}
                  className={inputStyle}
                  onChange={(e) =>
                    setCrop((old) => ({
                      ...old,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!file || running}
            onClick={() => void start()}
            className={buttonStyle}
          >
            Scan video
          </button>
          {running && (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="min-h-11 rounded-md border border-alert px-4 text-sm text-alert"
            >
              Cancel scan
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-deep">
          {message}
        </p>
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-xl font-semibold">Video plate log</h2>
        <p className="mt-2 text-sm text-muted">
          Each number appears once per recording. Frame counts are supporting
          reads, not separate vehicle sightings. OCR can miss distant, blurred,
          angled, or obscured plates.
        </p>
        {!scans.length && (
          <p className="mt-4 text-sm">No videos scanned yet.</p>
        )}
        {scans.map((scan) => (
          <article
            key={scan.id}
            data-scan-id={scan.id}
            className="mt-4 rounded-md border border-line p-3"
          >
            <h3 className="break-words font-semibold">{scan.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {scan.camera} · {new Date(scan.capturedAt).toLocaleString()} ·{" "}
              {scan.status} · {scan.frames}/{scan.total} frames
            </p>
            {scan.message && <p className="mt-2 text-sm">{scan.message}</p>}
            {scan.reads
              .filter((read) => read.status !== "dismissed")
              .map((read) => (
                <ReadRow
                  key={read.id}
                  scan={scan}
                  read={read}
                  onEvidence={() => {
                    if (selectedDigest === scan.digest && video.current) {
                      video.current.currentTime = read.offsetSeconds;
                      video.current.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    } else
                      setMessage(
                        `Select ${scan.name} to review the frame at ${read.offsetSeconds.toFixed(1)} seconds.`,
                      );
                  }}
                />
              ))}
            <ManualClipRead scan={scan} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ManualClipRead({ scan }: { scan: ScanRecord }) {
  const [plate, setPlate] = useState("");
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">
        Enter a plate the reader missed
      </summary>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const saved = useCurb
              .getState()
              .logClipRead(scan.id, plate, offset);
            setMessage(
              saved
                ? `${saved} saved with this recording's capture time.`
                : "Check the plate and video offset.",
            );
          } catch {
            setMessage(
              "The read could not be saved. Download a backup and check browser storage.",
            );
          }
        }}
      >
        <label>
          Plate you reviewed
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="e.g. BLU 4419"
            autoComplete="off"
            className={inputStyle + " font-mono uppercase font-semibold"}
          />
        </label>
        <label>
          Seconds into this recording
          <input
            type="number"
            min={0}
            max={scan.duration ?? 600}
            step={0.1}
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            className={inputStyle}
          />
        </label>
        <button type="submit" className={buttonStyle}>
          Save reviewed plate
        </button>
      </form>
      <p role="status" className="mt-2">
        {message}
      </p>
    </details>
  );
}

function ReadRow({
  scan,
  read,
  onEvidence,
}: {
  scan: ScanRecord;
  read: ScanRead;
  onEvidence: () => void;
}) {
  const [plate, setPlate] = useState(read.plate);
  const [error, setError] = useState("");
  return (
    <div data-plate={read.plate} className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Possible plate
          <input
            aria-label={`Plate read ${read.plate}`}
            value={plate}
            maxLength={20}
            disabled={read.status !== "unconfirmed"}
            onChange={(e) => setPlate(e.target.value)}
            className={inputStyle + " font-mono uppercase"}
          />
        </label>
        <p className="text-xs text-muted">
          {read.status} · {read.confidence.toFixed(0)}% OCR score ·{" "}
          {read.frameCount} frame(s) · {read.offsetSeconds.toFixed(1)} sec
        </p>
        <button
          className="min-h-11 px-2 text-sm text-deep underline"
          onClick={onEvidence}
        >
          Review frame
        </button>
        {read.status === "unconfirmed" && (
          <>
            <button
              className={buttonStyle}
              onClick={() => {
                try {
                  const result = useCurb
                    .getState()
                    .confirmRead(scan.id, read.id, plate);
                  setError(result ? "" : "Use 4 to 8 letters or numbers.");
                } catch {
                  setError(
                    "The log could not be saved. Download a backup and check available browser storage.",
                  );
                }
              }}
            >
              Confirm read
            </button>
            <button
              className="min-h-11 px-2 text-sm text-alert underline"
              onClick={() => useCurb.getState().dismissRead(scan.id, read.id)}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
