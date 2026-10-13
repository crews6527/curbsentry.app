export type Sighting = {
  at: number;
  camera: string;
  clipId?: string;
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
