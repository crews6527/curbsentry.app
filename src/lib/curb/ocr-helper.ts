import { createWorker, PSM, type Worker } from "tesseract.js";
import { candidatesFromTsv, type PlateCandidate } from "./scan-logic";

export type OcrWord = {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrAnalysisResult = {
  text: string;
  meanConfidence: number;
  candidates: PlateCandidate[];
  words: OcrWord[];
  tokens: { token: string; confidence: number }[];
};

export type PreprocessingOptions = {
  grayscale: boolean;
  contrast: number; // 1 = normal, 1.5, 2.0
  binarize: boolean; // thresholding
  binarizeThreshold: number; // 0-255
  invert: boolean;
};

export const DEFAULT_PREPROCESSING: PreprocessingOptions = {
  grayscale: true,
  contrast: 1.4,
  binarize: false,
  binarizeThreshold: 128,
  invert: false,
};

/**
 * Creates and initializes a local Tesseract worker using local assets.
 */
export async function createLocalOcrWorker(
  psm: PSM = PSM.SPARSE_TEXT,
): Promise<Worker> {
  const root = new URL(import.meta.env.BASE_URL, window.location.href);
  const worker = await createWorker("eng", 1, {
    workerPath: new URL("ocr/runtime/worker.min.js", root).href,
    corePath: new URL("ocr/runtime/", root).href,
    langPath: new URL("ocr/", root).href.replace(/\/$/, ""),
    workerBlobURL: false,
  });

  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    user_defined_dpi: "300",
  });

  return worker;
}

/**
 * Applies filters (grayscale, contrast boost, binarization, inversion)
 * to an HTML5 canvas to maximize ALPR OCR clarity.
 */
export function processImageCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  destination: HTMLCanvasElement,
  options: PreprocessingOptions,
  cropArea?: { x: number; y: number; width: number; height: number }, // percentage 0-100
) {
  const ctx = destination.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  const crop = cropArea ?? { x: 0, y: 0, width: 100, height: 100 };
  const sx = (srcWidth * Math.max(0, Math.min(100, crop.x))) / 100;
  const sy = (srcHeight * Math.max(0, Math.min(100, crop.y))) / 100;
  const sw = (srcWidth * Math.max(1, Math.min(100, crop.width))) / 100;
  const sh = (srcHeight * Math.max(1, Math.min(100, crop.height))) / 100;

  // Set destination dimensions (scaled if small for OCR quality)
  const minDim = 320;
  const scale = Math.max(1, Math.min(3, minDim / Math.min(sw, sh)));
  destination.width = Math.max(1, Math.round(sw * scale));
  destination.height = Math.max(1, Math.round(sh * scale));

  ctx.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    destination.width,
    destination.height,
  );

  if (!options.grayscale && options.contrast === 1 && !options.binarize && !options.invert) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, destination.width, destination.height);
  const data = imageData.data;
  const contrastFactor = (259 * (options.contrast * 100 + 255)) / (255 * (259 - options.contrast * 100));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (options.grayscale || options.binarize) {
      // standard luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    if (options.contrast !== 1) {
      r = Math.min(255, Math.max(0, contrastFactor * (r - 128) + 128));
      g = Math.min(255, Math.max(0, contrastFactor * (g - 128) + 128));
      b = Math.min(255, Math.max(0, contrastFactor * (b - 128) + 128));
    }

    if (options.binarize) {
      const val = (r + g + b) / 3 >= options.binarizeThreshold ? 255 : 0;
      r = val;
      g = val;
      b = val;
    }

    if (options.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Runs OCR recognition on a canvas and extracts plate candidates and tokens.
 */
export async function analyzePlateCanvas(
  worker: Worker,
  canvas: HTMLCanvasElement,
  offsetSeconds = 0,
): Promise<OcrAnalysisResult> {
  const result = await worker.recognize(canvas, {}, { text: true, tsv: true });
  const rawText = result.data.text ?? "";
  const tsv = result.data.tsv ?? "";

  // 1. Strict Plate Candidates from TSV
  const candidates = candidatesFromTsv(tsv, offsetSeconds);

  // 2. Parsed individual words
  const words: OcrWord[] = [];
  const rawData = result.data as unknown as {
    words?: Array<{
      text: string;
      confidence: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    }>;
  };

  if (Array.isArray(rawData?.words)) {
    for (const w of rawData.words) {
      if (w.text && w.text.trim()) {
        words.push({
          text: w.text.trim(),
          confidence: w.confidence ?? 0,
          bbox: w.bbox,
        });
      }
    }
  }

  // Fallback to TSV lines if words array is not directly populated
  if (words.length === 0 && tsv) {
    const tsvLines = tsv.trim().split(/\r?\n/);
    for (const line of tsvLines) {
      const parts = line.split("\t");
      // Level 5 corresponds to word in Tesseract TSV
      if (parts[0] === "5" && parts[11]) {
        const text = parts[11].trim();
        const conf = Number(parts[10]) || 0;
        if (text) {
          words.push({
            text,
            confidence: conf,
            bbox: {
              x0: Number(parts[6]) || 0,
              y0: Number(parts[7]) || 0,
              x1: (Number(parts[6]) || 0) + (Number(parts[8]) || 0),
              y1: (Number(parts[7]) || 0) + (Number(parts[9]) || 0),
            },
          });
        }
      }
    }
  }

  // 3. Fallback Alphanumeric Plate-like Tokens
  // Matches 4-8 character tokens containing letters & numbers or standard license plates
  const tokens: { token: string; confidence: number }[] = [];
  const tokenSet = new Set<string>();

  // Extract from words
  for (const w of words) {
    const clean = w.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{4,8}$/.test(clean) && !tokenSet.has(clean)) {
      tokenSet.add(clean);
      tokens.push({ token: clean, confidence: Math.round(w.confidence) });
    }
  }

  // Also check consecutive joined words
  for (let i = 0; i < words.length - 1; i++) {
    const combined = (words[i].text + words[i + 1].text).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{4,8}$/.test(combined) && !tokenSet.has(combined)) {
      tokenSet.add(combined);
      tokens.push({
        token: combined,
        confidence: Math.round((words[i].confidence + words[i + 1].confidence) / 2),
      });
    }
  }

  return {
    text: rawText,
    meanConfidence: Math.round(result.data.confidence ?? 0),
    candidates,
    words,
    tokens,
  };
}

/**
 * Generates an authentic synthetic license plate canvas for fast testing
 * without needing user to supply an external image.
 */
export function renderSamplePlateCanvas(
  canvas: HTMLCanvasElement,
  plate: string,
  stateName = "CALIFORNIA",
  style: "standard" | "vintage" | "high-contrast" = "standard",
) {
  canvas.width = 600;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  if (style === "high-contrast") {
    ctx.fillStyle = "#FFFFFF";
  } else if (style === "vintage") {
    ctx.fillStyle = "#FFB81C"; // Yellow California plate
  } else {
    ctx.fillStyle = "#F5F5F0";
  }
  ctx.fillRect(0, 0, 600, 300);

  // Outer border & bolts
  ctx.lineWidth = 14;
  ctx.strokeStyle = style === "vintage" ? "#1A1A1A" : "#1E3A8A";
  ctx.strokeRect(10, 10, 580, 280);

  // Bolt holes
  ctx.fillStyle = "#A3A3A3";
  ctx.beginPath();
  ctx.arc(100, 45, 12, 0, Math.PI * 2);
  ctx.arc(500, 45, 12, 0, Math.PI * 2);
  ctx.arc(100, 255, 12, 0, Math.PI * 2);
  ctx.arc(500, 255, 12, 0, Math.PI * 2);
  ctx.fill();

  // State Name Header
  ctx.font = "bold 28px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style === "vintage" ? "#1A1A1A" : style === "high-contrast" ? "#000000" : "#DC2626";
  ctx.fillText(stateName, 300, 55);

  // Main Plate Characters (Embossed style)
  ctx.font = "bold 96px 'IBM Plex Mono', monospace";
  ctx.fillStyle = style === "vintage" ? "#000000" : style === "high-contrast" ? "#000000" : "#1E3A8A";
  ctx.fillText(plate.toUpperCase(), 300, 160);

  // Bottom text or registration sticker
  ctx.font = "bold 18px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = "#4B5563";
  ctx.fillText("SESQUICENTENNIAL - 150 YEARS", 300, 260);

  // Month & Year stickers
  ctx.fillStyle = "#DC2626";
  ctx.fillRect(45, 235, 45, 30);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("OCT", 67, 250);

  ctx.fillStyle = "#2563EB";
  ctx.fillRect(510, 235, 45, 30);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("2026", 532, 250);
}
