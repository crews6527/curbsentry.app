import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  sampleOffsets,
  candidatesFromTsv,
  validateCrop,
  type Crop,
  type PlateCandidate,
} from "./scan-logic";

export async function fileDigest(file: File): Promise<string> {
  if (!crypto.subtle)
    throw new Error(
      "Video scanning needs HTTPS or a local development server.",
    );
  if (!file.size || file.size > 100 * 1024 * 1024)
    throw new Error("Choose a nonempty video smaller than 100 MiB.");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function cancelled() {
  return new DOMException(
    "Scan cancelled. Saved reads were retained.",
    "AbortError",
  );
}
function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeout = 20_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(cancelled());
    };
    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Video/OCR operation timed out. Try a smaller clip or a cropped scan area.",
        ),
      );
    }, timeout);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function eventReady(
  video: HTMLVideoElement,
  event: string,
  signal: AbortSignal,
  action: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(
        new Error(
          "This browser cannot decode the video. Convert it to MP4 (H.264) or WebM.",
        ),
      );
    };
    const abort = () => {
      cleanup();
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The video did not load or seek in time."));
    }, 15_000);
    if (signal.aborted) {
      abort();
      return;
    }
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    action();
  });
}

export async function scanVideo(
  file: File,
  crop: Crop,
  signal: AbortSignal,
  onFrame: (
    reads: PlateCandidate[],
    done: number,
    total: number,
    duration: number,
  ) => void,
  onStatus: (message: string) => void,
): Promise<{ frames: number; duration: number }> {
  validateCrop(crop);
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let worker: Worker | undefined;
  let finished = false;
  const terminate = () => {
    if (worker) {
      void worker.terminate();
      worker = undefined;
    }
  };
  signal.addEventListener("abort", terminate);
  try {
    onStatus("Reading video metadata…");
    await eventReady(video, "loadeddata", signal, () => {
      video.src = url;
      video.load();
    });
    const offsets = sampleOffsets(video.duration);
    const canvas = document.createElement("canvas");
    const sx = (video.videoWidth * crop.x) / 100,
      sy = (video.videoHeight * crop.y) / 100;
    const sw = (video.videoWidth * crop.width) / 100,
      sh = (video.videoHeight * crop.height) / 100;
    const scale = Math.min(2, 1920 / sw, 1920 / sh);
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot prepare video frames.");
    onStatus("Loading the local plate reader…");
    const root = new URL(import.meta.env.BASE_URL, location.href);
    const created = createWorker("eng", 1, {
      workerPath: new URL("ocr/runtime/worker.min.js", root).href,
      corePath: new URL("ocr/runtime/", root).href,
      langPath: new URL("ocr/", root).href.replace(/\/$/, ""),
      workerBlobURL: false,
    });
    // If initialization finishes after cancellation/deadline, release that worker too.
    void created.then(
      (value) => {
        if (finished || signal.aborted) void value.terminate();
      },
      () => {},
    );
    worker = await bounded(created, signal, 30_000);
    await bounded(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        user_defined_dpi: "300",
      }),
      signal,
    );
    for (let i = 0; i < offsets.length; i++) {
      if (signal.aborted) throw cancelled();
      const offset = offsets[i];
      if (Math.abs(video.currentTime - offset) > 0.001)
        await eventReady(video, "seeked", signal, () => {
          video.currentTime = offset;
        });
      context.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      onStatus(`Reading frame ${i + 1} of ${offsets.length}…`);
      const result = await bounded(
        worker!.recognize(canvas, {}, { text: true, tsv: true }),
        signal,
      );
      onFrame(
        candidatesFromTsv(result.data.tsv ?? "", offset),
        i + 1,
        offsets.length,
        video.duration,
      );
    }
    return { frames: offsets.length, duration: video.duration };
  } finally {
    finished = true;
    terminate();
    signal.removeEventListener("abort", terminate);
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
