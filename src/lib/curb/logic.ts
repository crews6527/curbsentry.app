export type Sighting = {
  at: number;
  camera: string;
  clipId?: string;
  lat?: number;
  lng?: number;
  locationName?: string;
};

export type PlateRecord = {
  plate: string;
  status: "through" | "watching" | "known";
  owner: string;
  note: string;
  color: string;
  pinned: boolean;
  sightings: Sighting[];
};

export type Settings = {
  street: string;
  repeatCount: number;
  windowHours: number;
  busStart: string;
  busEnd: string;
  busDays: number[];
  busCount: number;
};

export const CAMERAS = [
  "Mailbox",
  "Front door",
  "Driveway",
  "Garage",
  "Blink side",
] as const;

export function normalisePlate(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function inBusWindow(date: Date, settings: Settings): boolean {
  if (!settings.busDays.includes(date.getDay())) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutes(settings.busStart);
  const end = minutes(settings.busEnd);
  if (end >= start) return now >= start && now <= end;
  return now >= start || now <= end;
}

export function sightingsInWindow(
  sightings: Sighting[],
  now: number,
  hours: number,
): Sighting[] {
  const cut = now - hours * 60 * 60 * 1000;
  return sightings.filter((row) => row.at >= cut && row.at <= now);
}

export type Band = "known" | "through" | "repeat" | "bus";

export function classify(
  record: PlateRecord,
  settings: Settings,
  now = Date.now(),
): {
  band: Band;
  count: number;
  threshold: number;
  duringBus: boolean;
} {
  const recent = sightingsInWindow(record.sightings, now, settings.windowHours);
  const latest = recent[recent.length - 1];
  const duringBus = latest ? inBusWindow(new Date(latest.at), settings) : false;
  const threshold = duringBus
    ? Math.min(settings.repeatCount, settings.busCount)
    : settings.repeatCount;
  if (record.status === "known") {
    return { band: "known", count: recent.length, threshold, duringBus };
  }
  if (recent.length >= threshold) {
    return {
      band: duringBus ? "bus" : "repeat",
      count: recent.length,
      threshold,
      duringBus,
    };
  }
  return { band: "through", count: recent.length, threshold, duringBus };
}

export function formatWhen(at: number, now = Date.now()): string {
  const delta = Math.max(0, now - at);
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export type DayDistribution = {
  day: string;
  date: string;
  fullDate: string;
  count: number;
  cameras: string;
};

export function get7DayDistribution(
  sightings: Sighting[],
  now = Date.now(),
): DayDistribution[] {
  const result: DayDistribution[] = [];
  const nowDate = new Date(now);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();

    const endD = new Date(d);
    endD.setHours(23, 59, 59, 999);
    const dayEnd = endD.getTime();

    const daySightings = sightings.filter(
      (s) => s.at >= dayStart && s.at <= dayEnd,
    );

    const dayName =
      i === 0
        ? "Today"
        : i === 1
          ? "Yesterday"
          : d.toLocaleDateString("en-US", { weekday: "short" });

    const dateFormatted = d.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    });

    const cameraMap: Record<string, number> = {};
    for (const s of daySightings) {
      cameraMap[s.camera] = (cameraMap[s.camera] || 0) + 1;
    }

    const camerasStr =
      Object.entries(cameraMap)
        .map(([cam, cnt]) => `${cam} (${cnt})`)
        .join(", ") || "None";

    result.push({
      day: dayName,
      date: dateFormatted,
      fullDate: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      count: daySightings.length,
      cameras: camerasStr,
    });
  }

  return result;
}

export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportKnownPlatesToCsv(plates: PlateRecord[]): string {
  const known = plates.filter((row) => row.status === "known");
  const headers = [
    "License Plate",
    "Associated Owner / Description",
    "Vehicle Color",
    "Total Sightings",
    "Last Sighting Date",
  ];

  const rows = known.map((row) => {
    const sightingsCount = row.sightings ? row.sightings.length : 0;
    const lastSeen =
      row.sightings && row.sightings.length > 0
        ? new Date(Math.max(...row.sightings.map((s) => s.at))).toLocaleString(
            "en-US",
          )
        : "None recorded";

    return [
      escapeCsvField(row.plate),
      escapeCsvField(row.owner || "Known on this street"),
      escapeCsvField(row.color || ""),
      escapeCsvField(sightingsCount),
      escapeCsvField(lastSeen),
    ].join(",");
  });

  return "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
}

export type ChronologicalSighting = {
  plate: string;
  at: number;
  camera: string;
  clipId?: string;
  status: "through" | "watching" | "known";
  owner: string;
  color: string;
  note: string;
  pinned: boolean;
};

export function getRecentSightingsActivity(
  plates: PlateRecord[],
  limit = 10,
): ChronologicalSighting[] {
  const all: ChronologicalSighting[] = [];
  for (const plateRecord of plates) {
    if (!plateRecord.sightings || plateRecord.sightings.length === 0) continue;
    for (const s of plateRecord.sightings) {
      all.push({
        plate: plateRecord.plate,
        at: s.at,
        camera: s.camera,
        clipId: s.clipId,
        status: plateRecord.status,
        owner: plateRecord.owner,
        color: plateRecord.color,
        note: plateRecord.note,
        pinned: plateRecord.pinned,
      });
    }
  }

  // Sort chronologically descending (most recent first)
  all.sort((a, b) => b.at - a.at);

  return all.slice(0, limit);
}

export type CameraLocation = {
  name: string;
  lat: number;
  lng: number;
  x: number; // percentage (0-100) on street diagram
  y: number; // percentage (0-100) on street diagram
  direction: string;
  angle: number;
  description: string;
};

export const CAMERA_COORDINATES: Record<string, CameraLocation> = {
  "Mailbox": {
    name: "Mailbox",
    lat: 37.77492,
    lng: -122.41941,
    x: 25,
    y: 65,
    direction: "Eastbound Curb Approach",
    angle: 45,
    description: "Street curb and mailbox approach",
  },
  "Front door": {
    name: "Front door",
    lat: 37.77515,
    lng: -122.41935,
    x: 48,
    y: 35,
    direction: "Front Yard & Walkway",
    angle: 180,
    description: "Walkway and front yard facing street",
  },
  "Driveway": {
    name: "Driveway",
    lat: 37.77485,
    lng: -122.41922,
    x: 70,
    y: 58,
    direction: "Driveway Apron & Curb",
    angle: 215,
    description: "Driveway apron and incoming road angle",
  },
  "Garage": {
    name: "Garage",
    lat: 37.77472,
    lng: -122.41912,
    x: 85,
    y: 40,
    direction: "Garage Alley & Side Access",
    angle: 270,
    description: "Garage perimeter and side lane",
  },
  "Blink side": {
    name: "Blink side",
    lat: 37.77528,
    lng: -122.41958,
    x: 15,
    y: 30,
    direction: "Westbound Perimeter",
    angle: 90,
    description: "Side fence and westbound approach",
  },
};

export function getCameraLocation(cameraName: string, fallbackIdx = 0): CameraLocation {
  if (CAMERA_COORDINATES[cameraName]) {
    return CAMERA_COORDINATES[cameraName];
  }
  const defaults = Object.values(CAMERA_COORDINATES);
  const fallback = defaults[fallbackIdx % defaults.length];
  return {
    ...fallback,
    name: cameraName,
  };
}

export type DailyHeatmapData = {
  dateStr: string; // "YYYY-MM-DD"
  dateLabel: string; // "Oct 12"
  dayOfWeek: string; // "Sun", "Mon", etc.
  dayIndex: number; // 0=Sun .. 6=Sat
  weekIndex: number; // 0..N
  count: number;
  level: 0 | 1 | 2 | 3 | 4; // 0 = none, 1 = 1-2, 2 = 3-4, 3 = 5-7, 4 = 8+
  timestamp: number;
  plates: string[];
  cameras: string[];
};

export function getDailyHeatmap(
  plates: PlateRecord[],
  daysCount = 28,
  now = Date.now(),
): DailyHeatmapData[] {
  const result: DailyHeatmapData[] = [];
  const nowDate = new Date(now);

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const startMs = d.getTime();

    const endD = new Date(d);
    endD.setHours(23, 59, 59, 999);
    const endMs = endD.getTime();

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const date = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${date}`;

    const dateLabel = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayIndex = d.getDay();

    const platesFound = new Set<string>();
    const camerasFound = new Set<string>();
    let count = 0;

    for (const p of plates) {
      if (!p.sightings) continue;
      for (const s of p.sightings) {
        if (s.at >= startMs && s.at <= endMs) {
          count++;
          platesFound.add(p.plate);
          camerasFound.add(s.camera);
        }
      }
    }

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (count >= 8) level = 4;
    else if (count >= 5) level = 3;
    else if (count >= 3) level = 2;
    else if (count >= 1) level = 1;

    const weekIndex = Math.floor((daysCount - 1 - i) / 7);

    result.push({
      dateStr,
      dateLabel,
      dayOfWeek,
      dayIndex,
      weekIndex,
      count,
      level,
      timestamp: startMs,
      plates: Array.from(platesFound),
      cameras: Array.from(camerasFound),
    });
  }

  return result;
}

