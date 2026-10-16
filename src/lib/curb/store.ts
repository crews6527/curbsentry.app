import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  classify,
  normalisePlate,
  getCameraLocation,
  type PlateRecord,
  type Settings,
} from "./logic.ts";
import {
  validateCapture,
  validateCrop,
  type PlateCandidate,
  type Crop,
} from "./scan-logic.ts";

export type SettingsState = Settings & { setupDone: boolean };
export type ScanRead = PlateCandidate & {
  id: string;
  originalPlate?: string;
  status: "unconfirmed" | "confirmed" | "dismissed";
  frameCount: number;
};
export type ScanRecord = {
  id: string;
  digest: string;
  name: string;
  camera: string;
  capturedAt: number;
  crop: Crop;
  status: "scanning" | "complete" | "cancelled" | "error";
  frames: number;
  total: number;
  duration?: number;
  message: string;
  reads: ScanRead[];
};
export type ReadInput = {
  plate: string;
  camera: string;
  color?: string;
  note?: string;
  at?: number;
  clipId?: string;
  initialStatus?: "watching" | "known" | "through";
  owner?: string;
  lat?: number;
  lng?: number;
  locationName?: string;
};
type Store = {
  settings: SettingsState;
  plates: PlateRecord[];
  scans: ScanRecord[];
  lastAlert: string;
  completeSetup: (patch: Partial<SettingsState>) => void;
  updateSettings: (patch: Partial<SettingsState>) => void;
  logRead: (input: ReadInput) => string;
  markKnown: (plate: string, owner: string) => void;
  markPlatesKnown: (plates: string[], owner?: string) => void;
  keepWatching: (plate: string) => void;
  setNote: (plate: string, note: string, color: string) => void;
  removeKnown: (plate: string) => void;
  deletePlate: (plate: string) => void;
  deletePlates: (plates: string[]) => void;
  deleteSighting: (plate: string, at: number) => void;
  updatePlateDetails: (
    plate: string,
    patch: {
      note?: string;
      color?: string;
      owner?: string;
      status?: "through" | "watching" | "known";
      geofenceEnabled?: boolean;
      usualCamera?: string;
    },
  ) => void;
  toggleGeofence: (plate: string, enabled: boolean, usualCamera?: string) => void;
  setUsualCamera: (plate: string, camera: string) => void;
  dismissGeofenceAlert: (plate: string) => void;
  resetLog: () => void;
  beginScan: (
    data: Omit<
      ScanRecord,
      "id" | "status" | "frames" | "total" | "message" | "reads"
    >,
  ) => ScanRecord;
  recordFrame: (
    id: string,
    reads: PlateCandidate[],
    frames: number,
    total: number,
    duration?: number,
  ) => void;
  finishScan: (
    id: string,
    status: ScanRecord["status"],
    message: string,
  ) => void;
  confirmRead: (scanId: string, readId: string, plate: string) => string;
  dismissRead: (scanId: string, readId: string) => void;
  logClipRead: (scanId: string, plate: string, offset: number) => string;
  restoreBackup: (data: unknown) => void;
};

export const defaultSettings = (): SettingsState => ({
  setupDone: false,
  street: "Our street",
  repeatCount: 3,
  windowHours: 2,
  busStart: "14:30",
  busEnd: "16:00",
  busDays: [1, 2, 3, 4, 5],
  busCount: 2,
});

export function addSighting(
  plates: PlateRecord[],
  input: ReadInput,
): PlateRecord[] {
  const clean = normalisePlate(input.plate);
  if (clean.length < 4 || clean.length > 8 || !input.camera.trim())
    throw new Error(
      "Use a plate of 4 to 8 letters or numbers and a camera name.",
    );
  const rawAt = input.at ?? Date.now();
  const safeAt = Math.min(Math.max(rawAt, Date.UTC(2000, 0, 1)), Date.now());
  const at = validateCapture(safeAt);
  const old = plates.find((row) => row.plate === clean);
  if (input.clipId && old?.sightings.some((s) => s.clipId === input.clipId))
    return plates;
  const targetStatus = input.initialStatus ?? old?.status ?? "through";
  const camLoc = getCameraLocation(input.camera.trim());
  const lat = input.lat ?? camLoc.lat;
  const lng = input.lng ?? camLoc.lng;
  const locationName = input.locationName?.trim() || camLoc.description;

  const next: PlateRecord = {
    plate: clean,
    status: targetStatus,
    owner: input.owner?.trim() || old?.owner || "",
    color: input.color?.trim() || old?.color || "",
    note: input.note?.trim() || old?.note || "",
    pinned: input.initialStatus === "watching" ? true : (old?.pinned ?? false),
    geofenceEnabled: old?.geofenceEnabled ?? false,
    ...(old?.usualCamera ? { usualCamera: old.usualCamera } : {}),
    ...(old?.geofenceAlert ? { geofenceAlert: old.geofenceAlert } : {}),
    sightings: [
      ...(old?.sightings ?? []),
      {
        at,
        camera: input.camera.trim(),
        lat,
        lng,
        locationName,
        ...(input.clipId ? { clipId: input.clipId } : {}),
      },
    ].sort((a, b) => a.at - b.at),
  };
  return [next, ...plates.filter((row) => row.plate !== clean)];
}

export function mergeReads(
  old: ScanRead[],
  candidates: PlateCandidate[],
): ScanRead[] {
  const next = old.map((row) => ({ ...row }));
  for (const candidate of candidates) {
    const plate = normalisePlate(candidate.plate);
    if (
      !/^[A-Z0-9]{4,8}$/.test(plate) ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 65 ||
      candidate.confidence > 100 ||
      !Number.isFinite(candidate.offsetSeconds) ||
      candidate.offsetSeconds < 0 ||
      candidate.offsetSeconds > 600
    )
      continue;
    const existing = next.find(
      (row) => (row.originalPlate ?? row.plate) === plate,
    );
    if (existing) {
      existing.frameCount++;
      existing.offsetSeconds = Math.min(
        existing.offsetSeconds,
        candidate.offsetSeconds,
      );
      existing.confidence = Math.max(existing.confidence, candidate.confidence);
    } else if (next.length < 100)
      next.push({
        ...candidate,
        plate,
        originalPlate: plate,
        id: crypto.randomUUID(),
        status: "unconfirmed",
        frameCount: 1,
      });
  }
  return next;
}

export function validateBackup(data: unknown): {
  settings: SettingsState;
  plates: PlateRecord[];
  scans: ScanRecord[];
} {
  if (!data || typeof data !== "object")
    throw new Error("Choose a CurbSentry log backup.");
  const d = data as Record<string, unknown>;
  if (
    d.product !== "CurbSentry" ||
    d.version !== 1 ||
    !d.data ||
    typeof d.data !== "object"
  )
    throw new Error("Unsupported CurbSentry backup.");
  const value = d.data as {
    settings: SettingsState;
    plates: PlateRecord[];
    scans: ScanRecord[];
  };
  const s = value.settings;
  if (
    !s ||
    typeof s.setupDone !== "boolean" ||
    typeof s.street !== "string" ||
    s.street.length > 200 ||
    !Number.isInteger(s.repeatCount) ||
    s.repeatCount < 2 ||
    s.repeatCount > 20 ||
    !Number.isInteger(s.busCount) ||
    s.busCount < 2 ||
    s.busCount > 20 ||
    !Number.isInteger(s.windowHours) ||
    s.windowHours < 1 ||
    s.windowHours > 168 ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.busStart) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.busEnd) ||
    !Array.isArray(s.busDays) ||
    s.busDays.some((x) => !Number.isInteger(x) || x < 0 || x > 6) ||
    !Array.isArray(value.plates) ||
    value.plates.length > 10_000 ||
    !Array.isArray(value.scans) ||
    value.scans.length > 1000
  )
    throw new Error("The backup has invalid settings or records.");
  const text = (x: unknown, max = 1000) =>
    typeof x === "string" && x.length <= max;
  for (const p of value.plates) {
    if (
      !p ||
      !/^[A-Z0-9]{4,8}$/.test(p.plate) ||
      !["through", "watching", "known"].includes(p.status) ||
      !text(p.owner) ||
      !text(p.note) ||
      !text(p.color) ||
      typeof p.pinned !== "boolean" ||
      (p.geofenceEnabled !== undefined && typeof p.geofenceEnabled !== "boolean") ||
      (p.usualCamera !== undefined && !text(p.usualCamera, 100)) ||
      !Array.isArray(p.sightings) ||
      p.sightings.length > 100_000
    )
      throw new Error("The backup has an invalid plate record.");
    for (const row of p.sightings) {
      validateCapture(row.at);
      if (
        !text(row.camera, 100) ||
        (row.clipId !== undefined && !text(row.clipId, 100)) ||
        (row.locationName !== undefined && !text(row.locationName, 200)) ||
        (row.lat !== undefined && !Number.isFinite(row.lat)) ||
        (row.lng !== undefined && !Number.isFinite(row.lng))
      )
        throw new Error("Invalid sighting in backup.");
    }
  }
  for (const c of value.scans) {
    if (
      !c ||
      !text(c.id, 100) ||
      !/^[a-f0-9]{64}$/.test(c.digest) ||
      !text(c.name, 300) ||
      !text(c.camera, 100) ||
      !["scanning", "complete", "cancelled", "error"].includes(c.status) ||
      !text(c.message) ||
      !Number.isInteger(c.frames) ||
      c.frames < 0 ||
      c.frames > 60 ||
      !Number.isInteger(c.total) ||
      c.total < 0 ||
      c.total > 60 ||
      !c.crop ||
      (c.duration !== undefined &&
        (!Number.isFinite(c.duration) ||
          c.duration <= 0 ||
          c.duration > 600)) ||
      !Array.isArray(c.reads) ||
      c.reads.length > 100
    )
      throw new Error("Invalid scan in backup.");
    validateCapture(c.capturedAt);
    validateCrop(c.crop);
    for (const r of c.reads)
      if (
        !text(r.id, 100) ||
        !/^[A-Z0-9]{4,8}$/.test(r.plate) ||
        !["unconfirmed", "confirmed", "dismissed"].includes(r.status) ||
        !Number.isFinite(r.confidence) ||
        r.confidence < 0 ||
        r.confidence > 100 ||
        !Number.isFinite(r.offsetSeconds) ||
        r.offsetSeconds < 0 ||
        r.offsetSeconds > 600 ||
        (c.duration !== undefined && r.offsetSeconds > c.duration) ||
        (r.originalPlate !== undefined &&
          !/^[A-Z0-9]{4,8}$/.test(r.originalPlate)) ||
        !Number.isInteger(r.frameCount) ||
        r.frameCount < 1
      )
        throw new Error("Invalid OCR read in backup.");
  }
  if (
    new Set(value.plates.map((p) => p.plate)).size !== value.plates.length ||
    new Set(value.scans.map((s) => s.id)).size !== value.scans.length
  )
    throw new Error("Duplicate records in backup.");
  return value;
}

export const useCurb = create<Store>()(
  persist(
    (set, get) => ({
      settings: defaultSettings(),
      plates: [],
      scans: [],
      lastAlert: "",
      completeSetup: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch, setupDone: true },
        })),
      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),
      logRead: (input) => {
        let plates: PlateRecord[];
        try {
          plates = addSighting(get().plates, input);
        } catch (err) {
          console.warn("Failed to log plate read:", err);
          return "";
        }
        const clean = normalisePlate(input.plate);
        const record = plates.find((row) => row.plate === clean)!;
        const result = classify(record, get().settings, input.at ?? Date.now());
        if (
          record.status !== "known" &&
          (input.initialStatus === "watching" || ["bus", "repeat"].includes(result.band))
        ) {
          record.status = "watching";
          record.pinned = true;
        } else if (input.initialStatus === "known") {
          record.status = "known";
          if (input.owner) record.owner = input.owner.trim();
        }

        let alertMsg = "";
        const cameraName = input.camera.trim();
        const isOutOfZone =
          record.status === "known" &&
          !!record.geofenceEnabled &&
          !!record.usualCamera &&
          cameraName !== record.usualCamera &&
          cameraName !== "Known list" &&
          cameraName !== "Manual Entry";

        if (isOutOfZone) {
          const breachMsg = `⚠️ Geofence alert: Known vehicle ${clean} (${record.owner || "Resident"}) spotted at "${cameraName}" instead of usual "${record.usualCamera}"!`;
          record.geofenceAlert = {
            at: input.at ?? Date.now(),
            camera: cameraName,
            usualCamera: record.usualCamera!,
            message: breachMsg,
          };
          alertMsg = breachMsg;
        } else if (record.status === "known") {
          alertMsg = `${clean} logged on the known list. No alert.`;
        } else if (record.status === "watching") {
          alertMsg = `${clean} added to your watch list.`;
        } else {
          alertMsg = `${clean} saved. ${result.count} confirmed read(s) in the recording's time window.`;
        }

        set({
          plates,
          lastAlert: alertMsg,
        });
        return clean;
      },
      markKnown: (plate, owner) =>
        set((state) => ({
          plates: state.plates.map((row) =>
            row.plate === plate
              ? {
                  ...row,
                  status: "known",
                  owner: owner.trim() || "Known on this street",
                  pinned: false,
                }
              : row,
          ),
          lastAlert: `${plate} added to the known list.`,
        })),
      markPlatesKnown: (plates, owner = "Known on this street") =>
        set((state) => {
          const setOfPlates = new Set(plates);
          return {
            plates: state.plates.map((row) =>
              setOfPlates.has(row.plate)
                ? {
                    ...row,
                    status: "known",
                    owner: row.owner || owner.trim() || "Known on this street",
                    pinned: false,
                  }
                : row,
            ),
            lastAlert: `${plates.length} vehicle(s) moved to the known list.`,
          };
        }),
      keepWatching: (plate) =>
        set((state) => ({
          plates: state.plates.map((row) =>
            row.plate === plate && row.status !== "known"
              ? { ...row, status: "watching", pinned: true }
              : row,
          ),
        })),
      setNote: (plate, note, color) =>
        set((state) => ({
          plates: state.plates.map((row) =>
            row.plate === plate
              ? { ...row, note: note.trim(), color: color.trim() }
              : row,
          ),
        })),
      removeKnown: (plate) =>
        set((state) => ({
          plates: state.plates.map((row) =>
            row.plate === plate
              ? { ...row, status: "through", owner: "", pinned: false }
              : row,
          ),
        })),
      deletePlate: (plate) =>
        set((state) => ({
          plates: state.plates.filter((row) => row.plate !== plate),
          lastAlert: `Plate ${plate} removed from records.`,
        })),
      deletePlates: (plates) =>
        set((state) => {
          const setOfPlates = new Set(plates);
          return {
            plates: state.plates.filter((row) => !setOfPlates.has(row.plate)),
            lastAlert: `${plates.length} plate record(s) removed from records.`,
          };
        }),
      deleteSighting: (plate, at) =>
        set((state) => ({
          plates: state.plates
            .map((row) =>
              row.plate === plate
                ? {
                    ...row,
                    sightings: row.sightings.filter((s) => s.at !== at),
                  }
                : row,
            )
            .filter((row) => row.sightings.length > 0 || row.status === "known"),
        })),
      updatePlateDetails: (plate, patch) =>
        set((state) => ({
          plates: state.plates.map((row) =>
            row.plate === plate
              ? {
                  ...row,
                  ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
                  ...(patch.color !== undefined ? { color: patch.color.trim() } : {}),
                  ...(patch.owner !== undefined ? { owner: patch.owner.trim() } : {}),
                  ...(patch.status !== undefined
                    ? {
                        status: patch.status,
                        pinned: patch.status === "watching",
                      }
                    : {}),
                  ...(patch.geofenceEnabled !== undefined
                    ? { geofenceEnabled: patch.geofenceEnabled }
                    : {}),
                  ...(patch.usualCamera !== undefined
                    ? { usualCamera: patch.usualCamera.trim() }
                    : {}),
                }
              : row,
          ),
        })),
      toggleGeofence: (plate, enabled, usualCamera) =>
        set((state) => ({
          plates: state.plates.map((row) => {
            if (row.plate !== plate) return row;
            const defaultCam =
              usualCamera ||
              row.usualCamera ||
              row.sightings[row.sightings.length - 1]?.camera ||
              "Driveway";
            const updated: PlateRecord = {
              ...row,
              geofenceEnabled: enabled,
              ...(enabled ? { usualCamera: defaultCam } : (row.usualCamera ? { usualCamera: row.usualCamera } : {})),
            };
            if (!enabled) delete updated.geofenceAlert;
            return updated;
          }),
          lastAlert: enabled
            ? `Geofencing enabled for ${plate} (usual location: ${usualCamera || "Driveway"}).`
            : `Geofencing disabled for ${plate}.`,
        })),
      setUsualCamera: (plate, camera) =>
        set((state) => ({
          plates: state.plates.map((row) => {
            if (row.plate !== plate) return row;
            const updated: PlateRecord = {
              ...row,
              usualCamera: camera.trim(),
            };
            delete updated.geofenceAlert;
            return updated;
          }),
          lastAlert: `Usual location for ${plate} set to ${camera}.`,
        })),
      dismissGeofenceAlert: (plate) =>
        set((state) => ({
          plates: state.plates.map((row) => {
            if (row.plate !== plate) return row;
            const updated = { ...row };
            delete updated.geofenceAlert;
            return updated;
          }),
        })),
      resetLog: () =>
        set({
          settings: defaultSettings(),
          plates: [],
          scans: [],
          lastAlert: "",
        }),
      beginScan: (data) => {
        const old = get().scans.find((row) => row.digest === data.digest);
        if (old?.status === "complete") return old;
        validateCapture(data.capturedAt);
        const scan: ScanRecord = old
          ? { ...old, status: "scanning", message: "", frames: 0 }
          : {
              ...data,
              id: crypto.randomUUID(),
              status: "scanning",
              frames: 0,
              total: 0,
              message: "",
              reads: [],
            };
        set({
          scans: [scan, ...get().scans.filter((row) => row.id !== scan.id)],
        });
        return scan;
      },
      recordFrame: (id, candidates, frames, total, duration) =>
        set((state) => ({
          scans: state.scans.map((row) =>
            row.id === id
              ? {
                  ...row,
                  reads: mergeReads(row.reads, candidates),
                  frames,
                  total,
                  ...(duration ? { duration } : {}),
                }
              : row,
          ),
        })),
      finishScan: (id, status, message) =>
        set((state) => ({
          scans: state.scans.map((row) =>
            row.id === id ? { ...row, status, message } : row,
          ),
        })),
      confirmRead: (scanId, readId, plate) => {
        const scan = get().scans.find((row) => row.id === scanId);
        const read = scan?.reads.find((row) => row.id === readId);
        if (!scan || !read || read.status !== "unconfirmed") return "";
        const clean = get().logRead({
          plate,
          camera: scan.camera,
          at: scan.capturedAt + read.offsetSeconds * 1000,
          clipId: scan.digest,
        });
        if (clean)
          set((state) => ({
            scans: state.scans.map((row) =>
              row.id === scanId
                ? {
                    ...row,
                    reads: row.reads.map((r) =>
                      r.id === readId
                        ? { ...r, plate: clean, status: "confirmed" }
                        : r,
                    ),
                  }
                : row,
            ),
          }));
        return clean;
      },
      dismissRead: (scanId, readId) =>
        set((state) => ({
          scans: state.scans.map((row) =>
            row.id === scanId
              ? {
                  ...row,
                  reads: row.reads.map((r) =>
                    r.id === readId && r.status === "unconfirmed"
                      ? { ...r, status: "dismissed" }
                      : r,
                  ),
                }
              : row,
          ),
        })),
      logClipRead: (scanId, plate, offset) => {
        const scan = get().scans.find((row) => row.id === scanId);
        if (
          !scan ||
          !Number.isFinite(offset) ||
          offset < 0 ||
          offset > 600 ||
          (scan.duration && offset > scan.duration)
        )
          return "";
        return get().logRead({
          plate,
          camera: scan.camera,
          at: scan.capturedAt + offset * 1000,
          clipId: scan.digest,
        });
      },
      restoreBackup: (data) => {
        const value = validateBackup(data);
        set({ ...value, lastAlert: "Backup restored." });
      },
    }),
    {
      name: "curbsentry-preview-v1",
      version: 1,
      migrate: (stored: unknown) => ({ ...(stored as object), scans: [] }),
      merge: (persisted, current) => {
        const old = persisted as Partial<Store> | undefined;
        return {
          ...current,
          ...old,
          scans: (old?.scans ?? []).map((scan) =>
            scan.status === "scanning"
              ? {
                  ...scan,
                  status: "cancelled",
                  message:
                    "The page closed during this scan. Select the same clip to retry.",
                }
              : scan,
          ),
        };
      },
    },
  ),
);
