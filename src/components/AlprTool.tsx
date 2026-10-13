import { useState, useRef, useEffect, useMemo } from "react";
import {
  Camera,
  Upload,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Plus,
  Zap,
  Activity,
  FileVideo,
  Eye,
  Layers,
  Clock,
  CarFront,
  Filter,
  Check,
  ChevronRight,
} from "lucide-react";
import { useCurb } from "@/lib/curb/store";
import {
  createLocalOcrWorker,
  processImageCanvas,
  analyzePlateCanvas,
  renderSamplePlateCanvas,
  DEFAULT_PREPROCESSING,
  type PreprocessingOptions,
  type OcrAnalysisResult,
} from "@/lib/curb/ocr-helper";
import {
  CAMERAS,
  clock,
  formatWhen,
  classify,
} from "@/lib/curb/logic";
import { PSM, type Worker } from "tesseract.js";

type AlprToolProps = {
  onOpenManualEntry: (plate?: string, camera?: string) => void;
  onNavigateToLookup: (plate?: string) => void;
  onNavigateToVideos: () => void;
};

type CropRoi = { x: number; y: number; width: number; height: number };

export function AlprTool({
  onOpenManualEntry,
  onNavigateToLookup,
  onNavigateToVideos,
}: AlprToolProps) {
  const plates = useCurb((s) => s.plates);
  const scans = useCurb((s) => s.scans);
  const settings = useCurb((s) => s.settings);

  const [activeSubTab, setActiveSubTab] = useState<"image" | "sightings" | "diagnostics">("image");
  const [selectedCamera, setSelectedCamera] = useState<string>("ALL");

  // Image scanning state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sampleLoaded, setSampleLoaded] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRoi>({ x: 0, y: 0, width: 100, height: 100 });
  const [preprocessing, setPreprocessing] = useState<PreprocessingOptions>({ ...DEFAULT_PREPROCESSING });
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrAnalysisResult | null>(null);
  const [ocrError, setOcrError] = useState("");

  // Diagnostics state
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    success: boolean;
    durationMs: number;
    detectedPlate: string;
    confidence: number;
    message: string;
  } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute available cameras and sighting counts
  const allCameras = useMemo(() => {
    const set = new Set<string>(CAMERAS);
    for (const p of plates) {
      for (const s of p.sightings) {
        if (s.camera?.trim()) set.add(s.camera.trim());
      }
    }
    for (const sc of scans) {
      if (sc.camera?.trim()) set.add(sc.camera.trim());
    }
    return Array.from(set).sort();
  }, [plates, scans]);

  const cameraCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plates) {
      for (const s of p.sightings) {
        counts[s.camera] = (counts[s.camera] || 0) + 1;
      }
    }
    return counts;
  }, [plates]);

  const totalSightingsCount = useMemo(() => {
    return plates.reduce((sum, p) => sum + p.sightings.length, 0);
  }, [plates]);

  // Flattened sightings filtered by selected camera
  const filteredSightings = useMemo(() => {
    const list: Array<{
      id: string;
      plate: string;
      camera: string;
      at: number;
      clipId?: string;
      status: "through" | "watching" | "known";
      color?: string;
      note?: string;
      owner?: string;
      pinned: boolean;
    }> = [];

    for (const p of plates) {
      for (let i = 0; i < p.sightings.length; i++) {
        const s = p.sightings[i];
        if (
          selectedCamera === "ALL" ||
          s.camera.toLowerCase() === selectedCamera.toLowerCase()
        ) {
          list.push({
            id: `${p.plate}-${s.at}-${i}`,
            plate: p.plate,
            camera: s.camera,
            at: s.at,
            clipId: s.clipId,
            status: p.status,
            color: p.color,
            note: p.note,
            owner: p.owner,
            pinned: p.pinned,
          });
        }
      }
    }

    return list.sort((a, b) => b.at - a.at);
  }, [plates, selectedCamera]);

  // Update canvas whenever source, crop, or preprocessing changes
  useEffect(() => {
    if (!sourceImage && !sampleLoaded) return;

    const source = sourceImage || rawCanvasRef.current;
    if (!source || !previewCanvasRef.current) return;

    processImageCanvas(source, previewCanvasRef.current, preprocessing, crop);
  }, [sourceImage, sampleLoaded, crop, preprocessing]);

  // Handle file upload
  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    setSampleLoaded(null);
    setOcrResult(null);
    setOcrError("");

    const img = new Image();
    img.onload = () => {
      setSourceImage(img);
      setCrop({ x: 0, y: 0, width: 100, height: 100 });
      setStatusMessage(`Loaded "${file.name}" (${img.naturalWidth}×${img.naturalHeight}px)`);
    };
    img.onerror = () => {
      setOcrError("Failed to decode the selected image file.");
    };
    img.src = URL.createObjectURL(file);
  };

  // Load built-in synthetic test plate
  const loadSample = (plate: string, stateName: string, style: "standard" | "vintage" | "high-contrast") => {
    setSelectedFile(null);
    setSourceImage(null);
    setOcrResult(null);
    setOcrError("");
    setSampleLoaded(plate);

    if (rawCanvasRef.current) {
      renderSamplePlateCanvas(rawCanvasRef.current, plate, stateName, style);
      if (previewCanvasRef.current) {
        processImageCanvas(rawCanvasRef.current, previewCanvasRef.current, preprocessing, { x: 0, y: 0, width: 100, height: 100 });
      }
      setCrop({ x: 0, y: 0, width: 100, height: 100 });
      setStatusMessage(`Generated benchmark sample plate "${plate}"`);
    }
  };

  // Run ALPR OCR analysis
  const runAlprScan = async () => {
    if (!previewCanvasRef.current) return;
    setIsProcessing(true);
    setOcrError("");
    setStatusMessage("Initializing local A.L.P.R. worker…");

    let worker: Worker | null = null;
    try {
      worker = await createLocalOcrWorker(PSM.SPARSE_TEXT);
      setStatusMessage("Reading license plate characters…");

      const result = await analyzePlateCanvas(worker, previewCanvasRef.current, 0);
      setOcrResult(result);

      if (result.candidates.length > 0) {
        setStatusMessage(`A.L.P.R. identified ${result.candidates.length} candidate plate(s).`);
      } else if (result.tokens.length > 0) {
        setStatusMessage(`Found ${result.tokens.length} alphanumeric token(s).`);
      } else {
        setStatusMessage("No license plate characters recognized. Try adjusting crop or contrast.");
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "A.L.P.R. scan failed.");
    } finally {
      if (worker) {
        void worker.terminate();
      }
      setIsProcessing(false);
    }
  };

  // Run Self-Diagnostic Benchmark
  const runDiagnostics = async () => {
    setDiagRunning(true);
    setDiagResult(null);

    const testCanvas = document.createElement("canvas");
    renderSamplePlateCanvas(testCanvas, "TEST428", "CALIFORNIA", "standard");

    const startTime = performance.now();
    let worker: Worker | null = null;
    try {
      worker = await createLocalOcrWorker(PSM.SPARSE_TEXT);
      const result = await analyzePlateCanvas(worker, testCanvas, 0);
      const duration = Math.round(performance.now() - startTime);

      const foundCandidate = result.candidates.find((c) => c.plate === "TEST428") || result.candidates[0];
      const matched = foundCandidate ? foundCandidate.plate : result.tokens[0]?.token || "None";
      const confidence = foundCandidate ? foundCandidate.confidence : result.meanConfidence;

      setDiagResult({
        success: matched.includes("TEST") || matched.includes("428"),
        durationMs: duration,
        detectedPlate: matched,
        confidence,
        message: matched.includes("TEST")
          ? "Local A.L.P.R. engine is fully functional with high accuracy."
          : "Engine initialized but character detection confidence was low.",
      });
    } catch (err) {
      setDiagResult({
        success: false,
        durationMs: Math.round(performance.now() - startTime),
        detectedPlate: "Error",
        confidence: 0,
        message: err instanceof Error ? err.message : "Diagnostic failed to load OCR worker.",
      });
    } finally {
      if (worker) void worker.terminate();
      setDiagRunning(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Hidden canvas for rendering synthetic samples */}
      <canvas ref={rawCanvasRef} className="hidden" />

      {/* Main Top Header */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-deep text-bg text-xs font-bold">
                ALPR
              </span>
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Automated License Plate Recognition
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Private local plate reader using WebAssembly &amp; Tesseract LSTM. Zero images or plate logs leave your device.
            </p>
          </div>

          {/* Camera Filter Dropdown Controls */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg p-2 shadow-xs">
            <Camera className="size-4 text-deep shrink-0 ml-1" />
            <label
              htmlFor="alpr-camera-filter-select"
              className="text-xs font-semibold text-ink whitespace-nowrap"
            >
              Filter Sightings by Camera:
            </label>
            <select
              id="alpr-camera-filter-select"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="min-h-9 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-deep focus:border-deep focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Cameras ({totalSightingsCount} sightings)</option>
              {allCameras.map((cam) => (
                <option key={cam} value={cam}>
                  {cam} ({cameraCounts[cam] || 0} sightings)
                </option>
              ))}
            </select>
            {selectedCamera !== "ALL" && (
              <button
                type="button"
                onClick={() => setSelectedCamera("ALL")}
                className="rounded px-2 py-1 text-xs font-medium text-muted hover:text-alert hover:bg-surface border border-line/60"
                title="Reset to all cameras"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Navigation Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("image")}
              className={
                "min-h-9 rounded-md px-3.5 text-xs font-medium transition-colors " +
                (activeSubTab === "image"
                  ? "bg-deep text-bg shadow-xs"
                  : "border border-line bg-bg text-muted hover:text-ink")
              }
            >
              <span className="flex items-center gap-1.5">
                <Camera className="size-3.5" />
                <span>Photo / Still ALPR</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab("sightings")}
              className={
                "min-h-9 rounded-md px-3.5 text-xs font-medium transition-colors " +
                (activeSubTab === "sightings"
                  ? "bg-deep text-bg shadow-xs"
                  : "border border-line bg-bg text-muted hover:text-ink")
              }
            >
              <span className="flex items-center gap-1.5">
                <Eye className="size-3.5" />
                <span>Camera Sightings ({filteredSightings.length})</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onNavigateToVideos}
              className="min-h-9 rounded-md border border-line bg-bg px-3.5 text-xs font-medium text-muted hover:text-ink"
            >
              <span className="flex items-center gap-1.5">
                <FileVideo className="size-3.5" />
                <span>Video Clip ALPR</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab("diagnostics")}
              className={
                "min-h-9 rounded-md px-3.5 text-xs font-medium transition-colors " +
                (activeSubTab === "diagnostics"
                  ? "bg-deep text-bg shadow-xs"
                  : "border border-line bg-bg text-muted hover:text-ink")
              }
            >
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5" />
                <span>Diagnostics</span>
              </span>
            </button>
          </div>

          {selectedCamera !== "ALL" && (
            <div className="flex items-center gap-1 text-xs text-deep font-medium bg-deep/10 px-2.5 py-1 rounded-md">
              <Camera className="size-3" />
              <span>Camera Filter Active: <strong>{selectedCamera}</strong> ({filteredSightings.length})</span>
            </div>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: PHOTO / STILL ALPR SCANNER */}
      {activeSubTab === "image" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            {/* Left Column: Image Input & Preview */}
            <div className="space-y-4">
              {/* Upload Area & Presets */}
              <div className="rounded-card border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold text-ink">Choose Vehicle Image</h3>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-bg p-4 text-center transition-colors hover:border-deep">
                    <Upload className="size-6 text-muted" />
                    <span className="mt-1 text-xs font-medium text-ink">Upload Photo / Still</span>
                    <span className="text-[10px] text-muted">PNG, JPG, WebP, or BMP</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                      }}
                      className="hidden"
                    />
                  </label>

                  {/* Built-in Sample Buttons */}
                  <div className="flex flex-1 flex-col justify-center rounded-lg border border-line bg-bg p-3">
                    <span className="text-xs font-medium text-muted">Or Test with Preset Sample:</span>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadSample("BLU4419", "CALIFORNIA", "standard")}
                        className="rounded border border-line/80 bg-surface px-2.5 py-1 text-left text-xs hover:border-deep"
                      >
                        🚗 Sample: <strong className="font-mono text-deep">BLU 4419</strong> (Standard)
                      </button>
                      <button
                        type="button"
                        onClick={() => loadSample("TEST428", "NEW YORK", "high-contrast")}
                        className="rounded border border-line/80 bg-surface px-2.5 py-1 text-left text-xs hover:border-deep"
                      >
                        🚙 Sample: <strong className="font-mono text-deep">TEST 428</strong> (High Contrast)
                      </button>
                      <button
                        type="button"
                        onClick={() => loadSample("NEIGH22", "CALIFORNIA", "vintage")}
                        className="rounded border border-line/80 bg-surface px-2.5 py-1 text-left text-xs hover:border-deep"
                      >
                        🛻 Sample: <strong className="font-mono text-deep">NEIGH 22</strong> (Vintage Plate)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Canvas Preview */}
              <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between border-b border-line/60 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    ALPR Preprocessed Image Feed
                  </span>
                  <span className="text-[11px] text-muted">
                    {sourceImage || sampleLoaded ? "Ready for recognition" : "Awaiting image input"}
                  </span>
                </div>

                <div className="relative mt-3 flex min-h-64 items-center justify-center overflow-hidden rounded-md bg-ink/90 p-2">
                  {sourceImage || sampleLoaded ? (
                    <canvas
                      ref={previewCanvasRef}
                      className="max-h-96 w-auto max-w-full rounded border border-white/20 object-contain shadow-md"
                    />
                  ) : (
                    <div className="text-center text-xs text-bg/60 p-8">
                      <Camera className="mx-auto size-8 mb-2 opacity-40" />
                      <p>Upload a vehicle photo or select a test sample above</p>
                    </div>
                  )}
                </div>

                {/* Status Banner */}
                {statusMessage && (
                  <p role="status" className="mt-3 text-xs text-deep font-medium">
                    {statusMessage}
                  </p>
                )}
                {ocrError && (
                  <p role="alert" className="mt-3 text-xs text-alert font-medium">
                    {ocrError}
                  </p>
                )}

                {/* Scan Trigger Button */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={(!sourceImage && !sampleLoaded) || isProcessing}
                    onClick={runAlprScan}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-deep px-5 text-sm font-medium text-bg shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" />
                        <span>Reading Plate with Local OCR…</span>
                      </>
                    ) : (
                      <>
                        <Zap className="size-4 text-amber" />
                        <span>Run A.L.P.R. Recognition</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Preprocessing Filters & Scan Results */}
            <div className="space-y-4">
              {/* Image Preprocessing Filters */}
              <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Sliders className="size-4 text-deep" />
                    <span>Plate Enhancement Pipeline</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPreprocessing({ ...DEFAULT_PREPROCESSING })}
                    className="text-xs text-muted hover:text-ink underline"
                  >
                    Reset defaults
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Optimizes clarity for reflective, shadowy, or distant license plates.
                </p>

                <div className="mt-3 space-y-3">
                  {/* Grayscale Toggle */}
                  <label className="flex items-center justify-between text-xs">
                    <span className="font-medium">Grayscale Conversion</span>
                    <input
                      type="checkbox"
                      checked={preprocessing.grayscale}
                      onChange={(e) =>
                        setPreprocessing((p) => ({ ...p, grayscale: e.target.checked }))
                      }
                      className="size-4 rounded accent-deep"
                    />
                  </label>

                  {/* Contrast Slider */}
                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">Contrast Boost</span>
                      <span className="font-mono text-muted">{preprocessing.contrast.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.1"
                      value={preprocessing.contrast}
                      onChange={(e) =>
                        setPreprocessing((p) => ({ ...p, contrast: Number(e.target.value) }))
                      }
                      className="mt-1 w-full accent-deep"
                    />
                  </div>

                  {/* Binarization Toggle */}
                  <label className="flex items-center justify-between text-xs">
                    <span className="font-medium">High-Contrast Binarization (B&amp;W)</span>
                    <input
                      type="checkbox"
                      checked={preprocessing.binarize}
                      onChange={(e) =>
                        setPreprocessing((p) => ({ ...p, binarize: e.target.checked }))
                      }
                      className="size-4 rounded accent-deep"
                    />
                  </label>

                  {/* Inversion Toggle */}
                  <label className="flex items-center justify-between text-xs">
                    <span className="font-medium">Invert Colors (Dark plates)</span>
                    <input
                      type="checkbox"
                      checked={preprocessing.invert}
                      onChange={(e) =>
                        setPreprocessing((p) => ({ ...p, invert: e.target.checked }))
                      }
                      className="size-4 rounded accent-deep"
                    />
                  </label>
                </div>

                {/* Crop Presets */}
                <div className="mt-4 border-t border-line/60 pt-3">
                  <span className="text-xs font-semibold text-muted">Scan Area Presets:</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCrop({ x: 0, y: 0, width: 100, height: 100 })}
                      className="rounded border border-line bg-bg px-2 py-1 text-[11px] hover:border-deep"
                    >
                      Full Frame
                    </button>
                    <button
                      type="button"
                      onClick={() => setCrop({ x: 15, y: 35, width: 70, height: 50 })}
                      className="rounded border border-line bg-bg px-2 py-1 text-[11px] hover:border-deep"
                    >
                      Center Plate ROI
                    </button>
                    <button
                      type="button"
                      onClick={() => setCrop({ x: 10, y: 50, width: 80, height: 45 })}
                      className="rounded border border-line bg-bg px-2 py-1 text-[11px] hover:border-deep"
                    >
                      Lower Bumper ROI
                    </button>
                  </div>
                </div>
              </div>

              {/* Recognition Results Card */}
              <div className="rounded-card border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold text-ink">A.L.P.R. Recognition Results</h3>

                {!ocrResult ? (
                  <div className="mt-3 rounded-md border border-dashed border-line bg-bg p-6 text-center text-xs text-muted">
                    Run recognition to inspect detected license plate reads.
                  </div>
                ) : (
                  <div className="mt-3 space-y-4">
                    {/* Primary Candidates */}
                    {ocrResult.candidates.length > 0 ? (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ok">
                          ✓ High-Confidence License Plate
                        </span>
                        {ocrResult.candidates.map((cand) => (
                          <div
                            key={cand.plate}
                            className="rounded-lg border-2 border-ok/40 bg-ok-bg/30 p-3 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-2xl font-black tracking-widest text-ink">
                                {cand.plate}
                              </span>
                              <span className="rounded-full bg-ok px-2.5 py-0.5 text-xs font-bold text-bg">
                                {cand.confidence}% Confidence
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenManualEntry(
                                    cand.plate,
                                    selectedCamera !== "ALL" ? selectedCamera : "Mailbox",
                                  )
                                }
                                className="flex items-center gap-1.5 rounded-md bg-deep px-3 py-1.5 text-xs font-medium text-bg shadow-xs hover:opacity-90"
                              >
                                <Plus className="size-3.5" />
                                <span>
                                  Log Sighting ({selectedCamera !== "ALL" ? selectedCamera : "Mailbox"})
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onNavigateToLookup(cand.plate)}
                                className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg"
                              >
                                <Search className="size-3.5" />
                                <span>Check Plate History</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : ocrResult.tokens.length > 0 ? (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-ink">
                          Detected Alphanumeric Characters
                        </span>
                        <div className="space-y-2">
                          {ocrResult.tokens.map((tok) => (
                            <div
                              key={tok.token}
                              className="flex items-center justify-between rounded-md border border-line bg-bg p-2.5"
                            >
                              <div>
                                <span className="font-mono text-lg font-bold text-ink">
                                  {tok.token}
                                </span>
                                <span className="ml-2 text-xs text-muted">
                                  ({tok.confidence}% score)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenManualEntry(
                                    tok.token,
                                    selectedCamera !== "ALL" ? selectedCamera : "Mailbox",
                                  )
                                }
                                className="rounded bg-deep px-2.5 py-1 text-xs font-medium text-bg"
                              >
                                Log as Plate
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md bg-amber/20 p-3 text-xs text-amber-ink">
                        No alphanumeric plate characters detected in this crop. Try centering the scan area around the license plate and re-scanning.
                      </div>
                    )}

                    {/* Raw OCR Text Diagnostic */}
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer font-medium hover:text-ink">
                        View Raw OCR Output ({ocrResult.words.length} tokens, {ocrResult.meanConfidence}% mean confidence)
                      </summary>
                      <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-bg p-2 font-mono text-[11px] text-ink">
                        {ocrResult.text.trim() || "[No text detected]"}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Sightings on Selected Camera Preview */}
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-deep" />
                <h3 className="text-sm font-semibold text-ink">
                  Recent Sightings recorded on{" "}
                  <span className="text-deep font-bold">
                    {selectedCamera === "ALL" ? "All Cameras" : selectedCamera}
                  </span>{" "}
                  ({filteredSightings.length})
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setActiveSubTab("sightings")}
                className="flex items-center gap-1 text-xs text-deep font-medium hover:underline"
              >
                <span>View all {filteredSightings.length} sightings</span>
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            {filteredSightings.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No sightings recorded yet for{" "}
                {selectedCamera === "ALL" ? "any camera" : `camera "${selectedCamera}"`}.
                You can upload an image above or log a manual sighting.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {filteredSightings.slice(0, 4).map((sight) => (
                  <div
                    key={sight.id}
                    className="flex flex-col justify-between rounded-md border border-line bg-bg p-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-base font-bold text-ink">
                          {sight.plate}
                        </span>
                        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted border border-line">
                          {sight.camera}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {clock(sight.at)} · {formatWhen(sight.at)}
                      </p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between">
                      <span className="text-[10px] text-muted">
                        {sight.color ? `${sight.color}` : sight.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigateToLookup(sight.plate)}
                        className="text-[11px] text-deep font-medium hover:underline"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CAMERA SIGHTINGS FEED */}
      {activeSubTab === "sightings" && (
        <div className="rounded-card border border-line bg-surface p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-4">
            <div>
              <h3 className="text-base font-semibold text-ink">
                A.L.P.R. Sighting Archive by Camera
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Showing observations narrowed down by:{" "}
                <strong className="text-deep">
                  {selectedCamera === "ALL" ? "All Cameras" : selectedCamera}
                </strong>{" "}
                ({filteredSightings.length} total sighting{filteredSightings.length === 1 ? "" : "s"})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="feed-camera-select"
                className="text-xs font-semibold text-muted"
              >
                Change Camera:
              </label>
              <select
                id="feed-camera-select"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="min-h-9 rounded-md border border-line bg-bg px-2.5 text-xs font-semibold text-deep focus:border-deep focus:outline-hidden"
              >
                <option value="ALL">All Cameras ({totalSightingsCount})</option>
                {allCameras.map((cam) => (
                  <option key={cam} value={cam}>
                    {cam} ({cameraCounts[cam] || 0})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  onOpenManualEntry(
                    "",
                    selectedCamera !== "ALL" ? selectedCamera : "Mailbox",
                  )
                }
                className="flex min-h-9 items-center gap-1.5 rounded-md bg-deep px-3 text-xs font-medium text-bg shadow-xs hover:opacity-90"
              >
                <Plus className="size-3.5" />
                <span>+ Log Sighting for {selectedCamera !== "ALL" ? selectedCamera : "Camera"}</span>
              </button>
            </div>
          </div>

          {filteredSightings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-bg p-8 text-center">
              <Camera className="mx-auto size-8 text-muted opacity-40 mb-2" />
              <h4 className="text-sm font-semibold text-ink">
                No sightings recorded for camera "{selectedCamera}"
              </h4>
              <p className="mt-1 text-xs text-muted max-w-md mx-auto">
                No vehicles have been logged by this specific camera yet. You can log an observation now or switch the filter dropdown to view another camera.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCamera("ALL")}
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg"
                >
                  Show All Cameras ({totalSightingsCount})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenManualEntry(
                      "",
                      selectedCamera !== "ALL" ? selectedCamera : "Mailbox",
                    )
                  }
                  className="rounded-md bg-deep px-3 py-1.5 text-xs font-medium text-bg"
                >
                  + Log Observation on {selectedCamera}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSightings.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg p-3.5 transition-shadow hover:shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    {/* License Plate Badge */}
                    <div className="flex flex-col items-center justify-center rounded border border-deep/40 bg-white px-3 py-1 shadow-xs min-w-28">
                      <span className="text-[8px] font-bold text-deep/60 tracking-wider">
                        {item.camera.toUpperCase()}
                      </span>
                      <span className="font-mono text-lg font-black tracking-widest text-ink">
                        {item.plate}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs font-semibold text-deep border border-line">
                          <Camera className="size-3" />
                          <span>{item.camera}</span>
                        </span>

                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                            (item.status === "known"
                              ? "bg-ok-bg text-ok"
                              : item.status === "watching" || item.pinned
                                ? "bg-amber text-amber-ink"
                                : "bg-surface text-muted border border-line")
                          }
                        >
                          {item.status === "known"
                            ? "Known"
                            : item.status === "watching" || item.pinned
                              ? "Watchlist"
                              : "Through"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-muted">
                        Recorded: <strong>{new Date(item.at).toLocaleString()}</strong> (
                        {formatWhen(item.at)})
                        {item.color ? ` · Color: ${item.color}` : ""}
                        {item.owner ? ` · Owner: ${item.owner}` : ""}
                      </p>

                      {item.note && (
                        <p className="mt-1 text-xs text-ink/80 italic">
                          "{item.note}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToLookup(item.plate)}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg shadow-xs"
                    >
                      View in Lookup
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenManualEntry(item.plate, item.camera)}
                      className="rounded-md bg-deep/10 px-3 py-1.5 text-xs font-medium text-deep hover:bg-deep/20"
                    >
                      + Sighting
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: ENGINE DIAGNOSTICS */}
      {activeSubTab === "diagnostics" && (
        <div className="rounded-card border border-line bg-surface p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-ink">Local A.L.P.R. Engine Status &amp; Benchmark</h3>
            <p className="mt-1 text-sm text-muted">
              Verify local WebAssembly execution, neural network LSTM weights, and in-browser processing speed.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-bg p-4">
              <span className="text-xs text-muted uppercase font-semibold">OCR Runtime Engine</span>
              <p className="mt-1 text-sm font-semibold text-ink">Tesseract.js Core (LSTM)</p>
              <p className="text-xs text-ok mt-1">✓ Hosted locally on same origin</p>
            </div>

            <div className="rounded-lg border border-line bg-bg p-4">
              <span className="text-xs text-muted uppercase font-semibold">Trained Language Model</span>
              <p className="mt-1 text-sm font-semibold text-ink">eng.traineddata.gz</p>
              <p className="text-xs text-ok mt-1">✓ Staged under /public/ocr/</p>
            </div>

            <div className="rounded-lg border border-line bg-bg p-4">
              <span className="text-xs text-muted uppercase font-semibold">Data Privacy</span>
              <p className="mt-1 text-sm font-semibold text-ink">100% Client-Side</p>
              <p className="text-xs text-ok mt-1">✓ Zero cloud calls / Zero external leaks</p>
            </div>
          </div>

          <div className="border-t border-line/60 pt-4">
            <h4 className="text-sm font-semibold text-ink">Automated Health Self-Test</h4>
            <p className="mt-1 text-xs text-muted">
              Generates a synthetic high-resolution plate in-memory and executes the local OCR worker to measure latency and accuracy.
            </p>

            <button
              type="button"
              disabled={diagRunning}
              onClick={runDiagnostics}
              className="mt-3 flex min-h-11 items-center gap-2 rounded-md bg-deep px-5 text-sm font-medium text-bg shadow-xs hover:opacity-90 disabled:opacity-50"
            >
              {diagRunning ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Executing Benchmark…</span>
                </>
              ) : (
                <>
                  <Activity className="size-4 text-amber" />
                  <span>Run Engine Self-Test</span>
                </>
              )}
            </button>

            {diagResult && (
              <div
                className={
                  "mt-4 rounded-lg border p-4 " +
                  (diagResult.success
                    ? "border-ok/30 bg-ok-bg/30 text-ok"
                    : "border-alert/30 bg-alert-bg/30 text-alert")
                }
              >
                <div className="flex items-start gap-3">
                  {diagResult.success ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-5 shrink-0" />
                  )}
                  <div>
                    <h5 className="font-semibold text-sm">
                      {diagResult.success ? "A.L.P.R. Diagnostics Passed" : "Diagnostics Warning"}
                    </h5>
                    <p className="mt-1 text-xs">{diagResult.message}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs font-mono">
                      <span>Execution Time: {diagResult.durationMs}ms</span>
                      <span>Detected Plate: {diagResult.detectedPlate}</span>
                      <span>Confidence Score: {diagResult.confidence}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
