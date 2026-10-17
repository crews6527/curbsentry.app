import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  Calendar,
  Flame,
  AlertTriangle,
  Eye,
  Info,
  ChevronRight,
  TrendingUp,
  Filter,
} from "lucide-react";
import {
  type PlateRecord,
  type DailyHeatmapData,
  getDailyHeatmap,
  formatWhen,
} from "@/lib/curb/logic";

type CalendarHeatmapProps = {
  plates: PlateRecord[];
  repeatThreshold?: number;
  onNavigateToLookup?: (plate: string) => void;
};

// Activity level color palette
const LEVEL_COLORS: Record<number, string> = {
  0: "var(--color-surface, #f4f4f5)",
  1: "#60a5fa", // Light Blue
  2: "#3b82f6", // Blue
  3: "#f59e0b", // Amber / Elevated
  4: "#ef4444", // Crimson / High Frequency
};

const LEVEL_LABELS: Record<number, string> = {
  0: "No Activity",
  1: "Low (1-2 sightings)",
  2: "Moderate (3-4 sightings)",
  3: "Elevated (5-7 sightings)",
  4: "High Frequency Alert (8+ sightings)",
};

export function CalendarHeatmap({
  plates,
  repeatThreshold = 3,
  onNavigateToLookup,
}: CalendarHeatmapProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Generate 28 days of daily activity data (4 complete 7-day weeks)
  const heatmapData = useMemo(() => getDailyHeatmap(plates, 28), [plates]);

  // Aggregate metrics
  const totalSightings = useMemo(
    () => heatmapData.reduce((acc, d) => acc + d.count, 0),
    [heatmapData],
  );

  const peakDay = useMemo(() => {
    let peak = heatmapData[0];
    for (const d of heatmapData) {
      if (d.count > (peak?.count || 0)) {
        peak = d;
      }
    }
    return peak;
  }, [heatmapData]);

  const highFrequencyDays = useMemo(
    () => heatmapData.filter((d) => d.count >= repeatThreshold),
    [heatmapData, repeatThreshold],
  );

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return heatmapData.find((d) => d.dateStr === selectedDate) || null;
  }, [heatmapData, selectedDate]);

  // Max value for Recharts Y-axis
  const maxDailyCount = useMemo(
    () => Math.max(...heatmapData.map((d) => d.count), repeatThreshold + 2),
    [heatmapData, repeatThreshold],
  );

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-alert-bg text-alert">
            <Flame className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">
                Daily Activity Calendar Heatmap
              </h3>
              <span className="rounded-full bg-deep/10 px-2 py-0.5 text-[10px] font-semibold text-deep">
                Last 28 Days
              </span>
            </div>
            <p className="text-xs text-muted">
              Visualize daily sighting frequency using Recharts to identify high-traffic days and recurring plate activity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-alert flex items-center gap-1">
            <AlertTriangle className="size-3.5" />
            <span>High threshold: ≥{repeatThreshold} reads</span>
          </span>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium">
            <span>Peak Activity Day</span>
            <Flame className="size-3.5 text-alert" />
          </div>
          <div className="mt-1">
            <p className="text-base font-bold text-ink">
              {peakDay && peakDay.count > 0 ? `${peakDay.count} reads` : "0 reads"}
            </p>
            <p className="text-[11px] text-muted truncate">
              {peakDay && peakDay.count > 0
                ? `${peakDay.dateLabel} (${peakDay.dayOfWeek})`
                : "No activity yet"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium">
            <span>High Alert Days</span>
            <AlertTriangle className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-1">
            <p className="text-base font-bold text-amber-600">
              {highFrequencyDays.length} {highFrequencyDays.length === 1 ? "day" : "days"}
            </p>
            <p className="text-[11px] text-muted">
              Exceeded ≥{repeatThreshold} sightings
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium">
            <span>Total Sightings</span>
            <TrendingUp className="size-3.5 text-deep" />
          </div>
          <div className="mt-1">
            <p className="text-base font-bold text-deep font-mono">
              {totalSightings}
            </p>
            <p className="text-[11px] text-muted">Across 28-day window</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium">
            <span>Active Days</span>
            <Calendar className="size-3.5 text-blue-500" />
          </div>
          <div className="mt-1">
            <p className="text-base font-bold text-ink">
              {heatmapData.filter((d) => d.count > 0).length} / 28
            </p>
            <p className="text-[11px] text-muted">
              {Math.round(
                (heatmapData.filter((d) => d.count > 0).length / 28) * 100,
              )}
              % of days recorded
            </p>
          </div>
        </div>
      </div>

      {/* Recharts Bar Heatmap */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-semibold text-ink">
            Daily Sighting Volume & Frequency Intensity
          </span>
          <span className="text-[11px]">Click a day to inspect plates</span>
        </div>

        <div className="h-44 w-full rounded-lg border border-line bg-bg p-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={heatmapData}
              margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
              onClick={(state) => {
                const activeIndex = state?.activeIndex;
                const index = typeof activeIndex === "number" ||
                  (typeof activeIndex === "string" && /^\d+$/.test(activeIndex))
                  ? Number(activeIndex) : -1;
                const clicked = Number.isInteger(index) && index >= 0
                  ? heatmapData[index] : undefined;
                if (clicked) {
                  setSelectedDate((prev) =>
                    prev === clicked.dateStr ? null : clicked.dateStr,
                  );
                }
              }}
            >
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10, fill: "var(--color-muted, #71717a)" }}
                tickLine={false}
                interval={3}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxDailyCount]}
                tick={{ fontSize: 10, fill: "var(--color-muted, #71717a)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as DailyHeatmapData;
                  return (
                    <div className="rounded-lg border border-line bg-surface p-2.5 shadow-md text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-1">
                        <span className="font-bold text-ink">
                          {item.dateLabel} ({item.dayOfWeek})
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor:
                              item.level === 4
                                ? "#fee2e2"
                                : item.level >= 2
                                  ? "#fef3c7"
                                  : "#e0f2fe",
                            color:
                              item.level === 4
                                ? "#b91c1c"
                                : item.level >= 2
                                  ? "#b45309"
                                  : "#0369a1",
                          }}
                        >
                          {LEVEL_LABELS[item.level]}
                        </span>
                      </div>
                      <p className="font-semibold text-deep">
                        {item.count} total {item.count === 1 ? "sighting" : "sightings"}
                      </p>
                      {item.plates.length > 0 && (
                        <p className="text-[11px] text-muted">
                          Plates: {item.plates.slice(0, 4).join(", ")}
                          {item.plates.length > 4 ? ` +${item.plates.length - 4} more` : ""}
                        </p>
                      )}
                      {item.cameras.length > 0 && (
                        <p className="text-[11px] text-muted">
                          Cameras: {item.cameras.join(", ")}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              {/* Alert threshold reference line */}
              <ReferenceLine
                y={repeatThreshold}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{
                  value: `Alert Threshold (≥${repeatThreshold})`,
                  position: "top",
                  fill: "#ef4444",
                  fontSize: 10,
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} cursor="pointer">
                {heatmapData.map((entry) => {
                  const isSelected = selectedDate === entry.dateStr;
                  const baseColor =
                    entry.level === 4
                      ? "#ef4444" // Crimson (High alert)
                      : entry.level === 3
                        ? "#f59e0b" // Amber (Elevated)
                        : entry.level === 2
                          ? "#3b82f6" // Medium Blue
                          : entry.level === 1
                            ? "#93c5fd" // Light Blue
                            : "var(--color-line, #e4e4e7)";
                  return (
                    <Cell
                      key={`cell-${entry.dateStr}`}
                      fill={baseColor}
                      stroke={isSelected ? "#16213e" : "transparent"}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calendar Grid Matrix & Frequency Legend */}
      <div className="rounded-lg border border-line bg-bg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <Calendar className="size-3.5 text-deep" />
            <span>28-Day Heatmap Matrix</span>
          </span>

          {/* Color Scale Legend */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <span>Less</span>
            <span
              className="size-3 rounded-xs border border-line"
              style={{ backgroundColor: "var(--color-surface, #f4f4f5)" }}
              title="0 sightings"
            />
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "#93c5fd" }}
              title="1-2 sightings"
            />
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "#3b82f6" }}
              title="3-4 sightings"
            />
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "#f59e0b" }}
              title="5-7 sightings"
            />
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "#ef4444" }}
              title="8+ sightings (High frequency)"
            />
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Blocks */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-[10px] font-semibold text-muted py-0.5"
            >
              {day}
            </div>
          ))}

          {heatmapData.map((d) => {
            const isSelected = selectedDate === d.dateStr;
            const bg =
              d.level === 4
                ? "bg-red-500 text-white"
                : d.level === 3
                  ? "bg-amber-500 text-white"
                  : d.level === 2
                    ? "bg-blue-600 text-white"
                    : d.level === 1
                      ? "bg-blue-200 text-blue-900"
                      : "bg-surface text-muted border border-line/70";

            return (
              <button
                key={d.dateStr}
                type="button"
                onClick={() =>
                  setSelectedDate((prev) => (prev === d.dateStr ? null : d.dateStr))
                }
                title={`${d.dateLabel} (${d.dayOfWeek}): ${d.count} sightings`}
                className={`flex flex-col items-center justify-center rounded-md p-1.5 transition-all text-center relative ${bg} ${
                  isSelected ? "ring-2 ring-deep ring-offset-1 scale-105" : "hover:opacity-85"
                }`}
              >
                <span className="text-[10px] font-medium leading-none opacity-80">
                  {d.dateLabel.split(" ")[1]}
                </span>
                <span className="text-xs font-bold leading-tight mt-0.5 font-mono">
                  {d.count}
                </span>
                {d.count >= repeatThreshold && (
                  <span
                    className="absolute -top-1 -right-1 size-2 rounded-full bg-red-600 ring-1 ring-white"
                    title="High frequency alert threshold reached"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Sighting Breakdown Drawer */}
      {selectedDayData && (
        <div className="rounded-lg border border-deep/30 bg-deep/5 p-3 text-xs space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-deep text-sm">
                {selectedDayData.dateLabel} ({selectedDayData.dayOfWeek}) Detail
              </span>
              <span className="rounded bg-deep text-bg px-2 py-0.5 font-mono font-semibold text-[11px]">
                {selectedDayData.count} {selectedDayData.count === 1 ? "sighting" : "sightings"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-[11px] text-muted hover:text-ink underline"
            >
              Clear filter
            </button>
          </div>

          {selectedDayData.count === 0 ? (
            <p className="text-muted">No vehicles were logged on this date.</p>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-muted font-medium">Plates seen:</span>
                {selectedDayData.plates.map((plate) => (
                  <button
                    key={plate}
                    type="button"
                    onClick={() => onNavigateToLookup && onNavigateToLookup(plate)}
                    className="inline-flex items-center gap-1 rounded bg-surface border border-line px-2 py-0.5 font-mono font-semibold text-deep hover:bg-line/40 transition-colors"
                  >
                    <span>{plate}</span>
                    <ChevronRight className="size-3" />
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                <span>
                  <strong>Cameras active:</strong> {selectedDayData.cameras.join(", ") || "None"}
                </span>
                <span>·</span>
                <span>
                  <strong>Status:</strong> {LEVEL_LABELS[selectedDayData.level]}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
