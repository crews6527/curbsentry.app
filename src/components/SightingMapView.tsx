import { useState, useMemo } from "react";
import {
  MapPin,
  Camera,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Check,
  Search,
  Filter,
  Layers,
  CarFront,
  Clock,
  Navigation,
  Info,
  ChevronRight,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import {
  type PlateRecord,
  type Sighting,
  type CameraLocation,
  CAMERA_COORDINATES,
  getCameraLocation,
  formatWhen,
  clock,
  classify,
} from "@/lib/curb/logic";
import { useCurb } from "@/lib/curb/store";

export type FlattenedSighting = {
  id: string;
  plate: string;
  at: number;
  camera: string;
  clipId?: string;
  lat: number;
  lng: number;
  locationName: string;
  status: "through" | "watching" | "known";
  owner: string;
  color: string;
  note: string;
  pinned: boolean;
  x: number;
  y: number;
};

type SightingMapViewProps = {
  plates: PlateRecord[];
  title?: string;
  subtitle?: string;
  onNavigateToLookup?: (plate: string) => void;
  onOpenManualEntry?: (plate?: string, camera?: string) => void;
  filterStatus?: "all" | "watching" | "through" | "known";
  initialCameraFilter?: string;
};

export function SightingMapView({
  plates,
  title = "Street Sighting Map",
  subtitle = "Sighting locations pinned to camera vantages and street coordinates",
  onNavigateToLookup,
  onOpenManualEntry,
  filterStatus = "all",
  initialCameraFilter = "all",
}: SightingMapViewProps) {
  const settings = useCurb((s) => s.settings);
  const markKnown = useCurb((s) => s.markKnown);
  const keepWatching = useCurb((s) => s.keepWatching);

  const [selectedCamera, setSelectedCamera] = useState<string>(initialCameraFilter);
  const [selectedStatus, setSelectedStatus] = useState<string>(filterStatus);
  const [showCones, setShowCones] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedSightingId, setSelectedSightingId] = useState<string | null>(null);

  // Flatten all sightings with their camera coordinate mappings
  const allSightings = useMemo(() => {
    const list: FlattenedSighting[] = [];
    plates.forEach((plateRec) => {
      if (!plateRec.sightings) return;
      plateRec.sightings.forEach((s, idx) => {
        const camLoc = getCameraLocation(s.camera);
        // Add subtle positional deterministic jitter so multiple sightings at the same camera don't perfectly stack
        const jitterAngle = (idx * 137.5 * Math.PI) / 180;
        const jitterDist = (idx % 4) * 2.5;
        const jitterX = Math.cos(jitterAngle) * jitterDist;
        const jitterY = Math.sin(jitterAngle) * jitterDist;

        list.push({
          id: `${plateRec.plate}-${s.at}-${idx}`,
          plate: plateRec.plate,
          at: s.at,
          camera: s.camera,
          clipId: s.clipId,
          lat: s.lat ?? camLoc.lat,
          lng: s.lng ?? camLoc.lng,
          locationName: s.locationName ?? camLoc.description,
          status: plateRec.status,
          owner: plateRec.owner,
          color: plateRec.color,
          note: plateRec.note,
          pinned: plateRec.pinned,
          x: Math.min(92, Math.max(8, camLoc.x + jitterX)),
          y: Math.min(88, Math.max(12, camLoc.y + jitterY)),
        });
      });
    });

    // Sort newest first
    return list.sort((a, b) => b.at - a.at);
  }, [plates]);

  // Filter sightings by camera and status
  const filteredSightings = useMemo(() => {
    return allSightings.filter((s) => {
      if (selectedCamera !== "all" && s.camera !== selectedCamera) return false;
      if (selectedStatus !== "all" && s.status !== selectedStatus) return false;
      return true;
    });
  }, [allSightings, selectedCamera, selectedStatus]);

  // Camera sighting counts
  const cameraCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filteredSightings) {
      counts[s.camera] = (counts[s.camera] || 0) + 1;
    }
    return counts;
  }, [filteredSightings]);

  // Selected sighting details
  const activeSighting = useMemo(() => {
    if (!selectedSightingId) {
      return filteredSightings[0] || null;
    }
    return filteredSightings.find((s) => s.id === selectedSightingId) || filteredSightings[0] || null;
  }, [filteredSightings, selectedSightingId]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(1.8, +(z + 0.2).toFixed(1)));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.8, +(z - 0.2).toFixed(1)));
  const handleResetZoom = () => setZoomLevel(1);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-4 shadow-xs">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-deep text-bg">
              <MapPin className="size-4" />
            </div>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            <span className="rounded-full bg-deep/10 px-2.5 py-0.5 text-[11px] font-mono font-bold text-deep">
              {filteredSightings.length} {filteredSightings.length === 1 ? "Sighting" : "Sightings"} Pinned
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Camera Filter */}
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1">
            <Camera className="size-3.5 text-muted" />
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="bg-transparent text-ink text-xs focus:outline-none"
            >
              <option value="all">All Cameras</option>
              {Object.keys(CAMERA_COORDINATES).map((cam) => (
                <option key={cam} value={cam}>
                  {cam} ({cameraCounts[cam] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1">
            <Filter className="size-3.5 text-muted" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-ink text-xs focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="watching">Watchlist Only</option>
              <option value="through">Through Traffic</option>
              <option value="known">Known Vehicles</option>
            </select>
          </div>

          {/* FOV Cones Toggle */}
          <button
            type="button"
            onClick={() => setShowCones((prev) => !prev)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 transition-colors ${
              showCones
                ? "border-deep/30 bg-deep/10 text-deep font-semibold"
                : "border-line bg-bg text-muted hover:text-ink"
            }`}
            title="Toggle camera field-of-view vantage cones"
          >
            <Compass className="size-3.5" />
            <span>FOV Cones</span>
          </button>
        </div>
      </div>

      {/* Main Map View Area */}
      <div className="relative w-full rounded-xl border border-line bg-[#0f172a] overflow-hidden select-none">
        {/* Zoom Controls Overlay */}
        <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 p-1 backdrop-blur-xs shadow-md">
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex size-7 items-center justify-center rounded text-slate-200 hover:bg-slate-800 transition-colors"
            title="Zoom In"
            aria-label="Zoom in on street map"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex size-7 items-center justify-center rounded text-slate-200 hover:bg-slate-800 transition-colors"
            title="Zoom Out"
            aria-label="Zoom out on street map"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="flex size-7 items-center justify-center rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-[10px] font-mono"
            title="Reset Zoom"
            aria-label="Reset zoom on street map"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        {/* Map Legend Overlay */}
        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-xs shadow-sm">
          <span className="font-semibold text-slate-200">Street Map Legend:</span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-red-500 ring-1 ring-red-300" />
            <span>Watchlist</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-blue-500 ring-1 ring-blue-300" />
            <span>Through</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-emerald-500 ring-1 ring-emerald-300" />
            <span>Known</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-xs bg-amber-400" />
            <span>Camera Vantage</span>
          </span>
        </div>

        {/* Street Name Badge */}
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1 text-xs text-slate-200 backdrop-blur-xs">
          <Navigation className="size-3.5 text-blue-400" />
          <span className="font-semibold">{settings.street || "Our street"}</span>
          <span className="text-[10px] text-slate-400">· Coordinates: 37.7749° N, 122.4194° W</span>
        </div>

        {/* SVG Street Grid & Vantages */}
        <div
          className="relative w-full h-[400px] sm:h-[480px] transition-transform duration-200 ease-out origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          <svg
            className="w-full h-full"
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Street surface gradient */}
              <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              {/* Property grass gradient */}
              <linearGradient id="lawnGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              {/* Camera FOV radar gradient */}
              <radialGradient id="fovCone" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background Property Parcels */}
            <rect x="0" y="0" width="1000" height="600" fill="url(#lawnGrad)" />

            {/* Property Boundaries (North & South lots) */}
            <line x1="0" y1="200" x2="1000" y2="200" stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="0" y1="420" x2="1000" y2="420" stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />

            {/* Cross Street (West side) */}
            <rect x="60" y="0" width="100" height="600" fill="#1e293b" />
            <line x1="110" y1="0" x2="110" y2="600" stroke="#fbbf24" strokeWidth="2" strokeDasharray="12 12" />

            {/* Main Roadway (East-West) */}
            <rect x="0" y="240" width="1000" height="140" fill="url(#roadGrad)" />

            {/* Curbs & Sidewalks */}
            <rect x="0" y="225" width="1000" height="15" fill="#64748b" opacity="0.6" />
            <rect x="0" y="380" width="1000" height="15" fill="#64748b" opacity="0.6" />

            {/* Yellow Center Double Line */}
            <line x1="0" y1="308" x2="1000" y2="308" stroke="#fbbf24" strokeWidth="2" strokeDasharray="16 12" />
            <line x1="0" y1="312" x2="1000" y2="312" stroke="#fbbf24" strokeWidth="2" strokeDasharray="16 12" />

            {/* Driveways */}
            <rect x="670" y="160" width="60" height="65" fill="#475569" opacity="0.8" />
            <polygon points="670,225 730,225 745,240 655,240" fill="#64748b" opacity="0.5" />

            {/* Property House Outlines */}
            {/* Main Residence */}
            <rect x="420" y="40" width="160" height="110" rx="6" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
            <text x="500" y="100" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">
              Main Residence
            </text>

            {/* Garage Structure */}
            <rect x="800" y="80" width="110" height="100" rx="4" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
            <text x="855" y="135" fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="middle">
              Garage
            </text>

            {/* Street Traffic Direction Arrows */}
            <g opacity="0.4" fill="#cbd5e1">
              {/* Eastbound arrow */}
              <path d="M 320 340 L 350 340 L 350 336 L 365 344 L 350 352 L 350 348 L 320 348 Z" />
              {/* Westbound arrow */}
              <path d="M 680 275 L 650 275 L 650 271 L 635 279 L 650 287 L 650 283 L 680 283 Z" />
            </g>

            {/* Street Name Typography On Asphalt */}
            <text
              x="500"
              y="285"
              fill="#94a3b8"
              opacity="0.3"
              fontSize="24"
              fontWeight="bold"
              letterSpacing="6"
              textAnchor="middle"
            >
              {settings.street.toUpperCase()}
            </text>

            {/* Camera FOV Cones */}
            {showCones &&
              Object.entries(CAMERA_COORDINATES).map(([name, cam]) => {
                const cx = (cam.x / 100) * 1000;
                const cy = (cam.y / 100) * 600;
                const radius = 130;
                const startAngle = ((cam.angle - 40) * Math.PI) / 180;
                const endAngle = ((cam.angle + 40) * Math.PI) / 180;
                const x1 = cx + radius * Math.cos(startAngle);
                const y1 = cy + radius * Math.sin(startAngle);
                const x2 = cx + radius * Math.cos(endAngle);
                const y2 = cy + radius * Math.sin(endAngle);

                return (
                  <g key={`cone-${name}`} className="transition-opacity">
                    <path
                      d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                      fill="url(#fovCone)"
                      stroke="#38bdf8"
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                  </g>
                );
              })}

            {/* Camera Vantage Points */}
            {Object.entries(CAMERA_COORDINATES).map(([name, cam]) => {
              const cx = (cam.x / 100) * 1000;
              const cy = (cam.y / 100) * 600;
              const count = cameraCounts[name] || 0;
              const isSelectedCam = selectedCamera === name;

              return (
                <g
                  key={`cam-${name}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedCamera((prev) => (prev === name ? "all" : name))}
                >
                  {/* Camera icon base */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelectedCam ? 16 : 13}
                    fill="#0f172a"
                    stroke="#38bdf8"
                    strokeWidth={isSelectedCam ? 3 : 2}
                  />
                  {/* Inner indicator */}
                  <circle cx={cx} cy={cy} r="5" fill="#facc15" />
                  {/* Label */}
                  <rect
                    x={cx - 38}
                    y={cy + 18}
                    width="76"
                    height="18"
                    rx="4"
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text
                    x={cx}
                    y={cy + 30}
                    fill="#e2e8f0"
                    fontSize="9.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {name} ({count})
                  </text>
                </g>
              );
            })}
          </svg>

          {/* HTML Overlay Pins for Sightings */}
          {filteredSightings.map((sighting) => {
            const isSelected = activeSighting?.id === sighting.id;
            const pinColor =
              sighting.status === "watching"
                ? "bg-red-500 ring-red-300"
                : sighting.status === "known"
                  ? "bg-emerald-500 ring-emerald-300"
                  : "bg-blue-500 ring-blue-300";

            return (
              <button
                key={sighting.id}
                type="button"
                onClick={() => setSelectedSightingId(sighting.id)}
                style={{
                  left: `${sighting.x}%`,
                  top: `${sighting.y}%`,
                  transform: `translate(-50%, -100%) scale(${isSelected ? 1.25 : 1})`,
                }}
                className={`absolute z-30 flex flex-col items-center group transition-all duration-150 focus:outline-none`}
                title={`${sighting.plate} · ${sighting.camera} · ${formatWhen(sighting.at)}`}
              >
                {/* Pin Badge with Plate */}
                <div
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold shadow-lg ring-1 transition-all ${pinColor} text-white ${
                    isSelected ? "ring-2 ring-white scale-110 shadow-xl" : "hover:scale-105"
                  }`}
                >
                  <CarFront className="size-3" />
                  <span>{sighting.plate}</span>
                </div>
                {/* Pin point */}
                <div
                  className={`size-2 rotate-45 -mt-1 shadow-sm ${
                    sighting.status === "watching"
                      ? "bg-red-500"
                      : sighting.status === "known"
                        ? "bg-emerald-500"
                        : "bg-blue-500"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Sighting Inspector Card & Quick Actions */}
      {activeSighting ? (
        <div className="rounded-xl border border-line bg-bg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <span className="rounded-md border-2 border-line bg-surface px-3 py-1 font-mono text-base font-bold text-deep shadow-xs">
                {activeSighting.plate}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeSighting.status === "watching"
                        ? "bg-alert-bg text-alert"
                        : activeSighting.status === "known"
                          ? "bg-ok-bg text-ok"
                          : "bg-surface text-muted border border-line"
                    }`}
                  >
                    {activeSighting.status === "watching"
                      ? "Watchlist"
                      : activeSighting.status === "known"
                        ? "Known Vehicle"
                        : "Through Traffic"}
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{formatWhen(activeSighting.at)} ({clock(activeSighting.at)})</span>
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Captured at: <strong className="text-ink">{activeSighting.camera}</strong> camera · {activeSighting.locationName}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {onNavigateToLookup && (
                <button
                  type="button"
                  onClick={() => onNavigateToLookup(activeSighting.plate)}
                  className="flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-medium text-ink hover:bg-line/40 transition-colors"
                >
                  <Search className="size-3.5 text-deep" />
                  <span>Look Up Details</span>
                </button>
              )}

              {activeSighting.status !== "known" && (
                <button
                  type="button"
                  onClick={() => markKnown(activeSighting.plate, "Known neighbor / resident")}
                  className="flex items-center gap-1 rounded-md border border-ok/40 bg-ok-bg px-2.5 py-1.5 font-medium text-ok hover:opacity-90 transition-opacity"
                >
                  <Check className="size-3.5" />
                  <span>Mark Known</span>
                </button>
              )}

              {activeSighting.status === "through" && (
                <button
                  type="button"
                  onClick={() => keepWatching(activeSighting.plate)}
                  className="flex items-center gap-1 rounded-md border border-alert/40 bg-alert-bg px-2.5 py-1.5 font-medium text-alert hover:opacity-90 transition-opacity"
                >
                  <Eye className="size-3.5" />
                  <span>Watch Sighting</span>
                </button>
              )}
            </div>
          </div>

          {/* Coordinate & Sighting Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-lg border border-line bg-surface p-2.5">
              <span className="text-[10px] text-muted font-medium uppercase">GPS Coordinates</span>
              <p className="font-mono font-semibold text-ink mt-0.5">
                {activeSighting.lat.toFixed(5)}° N, {Math.abs(activeSighting.lng).toFixed(5)}° W
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface p-2.5">
              <span className="text-[10px] text-muted font-medium uppercase">Camera Vantage</span>
              <p className="font-semibold text-ink mt-0.5 truncate">
                {activeSighting.camera}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface p-2.5">
              <span className="text-[10px] text-muted font-medium uppercase">Vehicle Description</span>
              <p className="font-semibold text-ink mt-0.5 truncate">
                {activeSighting.color ? `${activeSighting.color} vehicle` : "No color recorded"}
                {activeSighting.owner ? ` · ${activeSighting.owner}` : ""}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface p-2.5">
              <span className="text-[10px] text-muted font-medium uppercase">Security Note</span>
              <p className="font-semibold text-ink mt-0.5 truncate">
                {activeSighting.note || "No notes logged"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-bg p-4 text-center text-xs text-muted">
          No sightings match the current filters. Switch camera or status filter above to inspect sightings on the street map.
        </div>
      )}
    </div>
  );
}
