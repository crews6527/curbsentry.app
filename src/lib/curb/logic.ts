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
