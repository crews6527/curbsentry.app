import { useMemo } from "react";
import { TrendingUp, AlertCircle } from "lucide-react";
import { type Sighting } from "@/lib/curb/logic";

type PlateSparklineProps = {
  sightings: Sighting[];
  compact?: boolean;
};

export function PlateSparkline({ sightings, compact = false }: PlateSparklineProps) {
  const { days, total7Days, maxCount, hasSpike, spikeDay } = useMemo(() => {
    const now = new Date();
    // Normalize to midnight today
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dailyData: {
      key: string;
      label: string;
      fullDate: string;
      count: number;
      isToday: boolean;
    }[] = [];

    // Last 7 days: day 6 ago to day 0 (today)
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayMidnight - i * oneDayMs;
      const dayEnd = dayStart + oneDayMs;
      const d = new Date(dayStart);
      const isToday = i === 0;

      const count = sightings.filter((s) => s.at >= dayStart && s.at < dayEnd).length;

      dailyData.push({
        key: `day-${i}`,
        label: isToday ? "Today" : dayLabels[d.getDay()],
        fullDate: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count,
        isToday,
      });
    }

    const total = dailyData.reduce((acc, d) => acc + d.count, 0);
    const max = Math.max(...dailyData.map((d) => d.count), 1);
    const spike = dailyData.find((d) => d.count >= 3 || (d.isToday && d.count >= 2));

    return {
      days: dailyData,
      total7Days: total,
      maxCount: max,
      hasSpike: !!spike,
      spikeDay: spike,
    };
  }, [sightings]);

  return (
    <div className="mt-3 rounded-md border border-line/70 bg-bg/60 p-2.5">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <div className="flex items-center gap-1.5 font-medium text-ink">
          <TrendingUp className="size-3.5 text-muted" />
          <span>7-Day Sighting Frequency</span>
          {hasSpike && (
            <span className="inline-flex items-center gap-1 rounded bg-alert-bg px-1.5 py-0.5 text-[10px] font-semibold text-alert">
              <AlertCircle className="size-2.5" />
              Spike ({spikeDay?.count} on {spikeDay?.label})
            </span>
          )}
        </div>
        <span className="text-muted text-[11px]">
          <strong className="text-ink font-semibold">{total7Days}</strong> total in 7d
        </span>
      </div>

      {/* Mini Bar Sparkline */}
      <div className="grid grid-cols-7 gap-1 items-end h-10 pt-1">
        {days.map((day) => {
          const heightPercent = day.count > 0 ? Math.max(20, Math.round((day.count / maxCount) * 100)) : 10;
          const barColor =
            day.count >= 3
              ? "bg-alert"
              : day.count >= 2
                ? "bg-amber"
                : day.count === 1
                  ? "bg-deep/70"
                  : "bg-line/60";

          return (
            <div
              key={day.key}
              className="flex flex-col items-center justify-end h-full group relative"
              title={`${day.label} (${day.fullDate}): ${day.count} sighting${day.count === 1 ? "" : "s"}`}
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-7 hidden group-hover:flex z-10 whitespace-nowrap rounded bg-deep px-1.5 py-0.5 text-[10px] font-medium text-bg shadow-sm pointer-events-none">
                {day.label}: {day.count}
              </div>

              {/* Bar */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full max-w-[18px] rounded-t-xs transition-all duration-300 ${barColor} ${
                  day.isToday ? "ring-1 ring-deep/40" : ""
                }`}
              />

              {/* Day label */}
              <span
                className={`text-[9px] mt-1 truncate ${
                  day.isToday ? "font-bold text-deep" : "text-muted"
                }`}
              >
                {day.label === "Today" ? "Tod" : day.label[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
