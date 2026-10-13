import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { BarChart2, TrendingUp, Calendar, Info } from "lucide-react";
import {
  type Sighting,
  type DayDistribution,
  get7DayDistribution,
} from "@/lib/curb/logic";

type PlateTrendChartProps = {
  plate: string;
  sightings: Sighting[];
};

export function PlateTrendChart({ plate, sightings }: PlateTrendChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const data = useMemo(() => get7DayDistribution(sightings), [sightings]);

  const totalLast7Days = useMemo(
    () => data.reduce((sum, d) => sum + d.count, 0),
    [data],
  );

  const peakDay = useMemo(() => {
    let max = data[0];
    for (const d of data) {
      if (d.count > max.count) max = d;
    }
    return max;
  }, [data]);

  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 3), [data]);

  return (
    <div className="rounded-lg border border-line bg-bg p-4 space-y-3">
      {/* Header and Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-deep" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
            7-Day Sighting Distribution for {plate}
          </h4>
        </div>

        {/* Toggle between Bar Chart and Trend Line */}
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-1 text-xs">
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className={
              "flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors " +
              (chartType === "bar"
                ? "bg-deep text-bg"
                : "text-muted hover:text-ink")
            }
          >
            <BarChart2 className="size-3.5" />
            <span>Bar Chart</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType("line")}
            className={
              "flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors " +
              (chartType === "line"
                ? "bg-deep text-bg"
                : "text-muted hover:text-ink")
            }
          >
            <TrendingUp className="size-3.5" />
            <span>Trend Line</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Pills */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md border border-line bg-surface p-2">
          <span className="text-[10px] text-muted uppercase font-semibold">
            Last 7 Days
          </span>
          <p className="font-mono text-base font-bold text-deep">
            {totalLast7Days} {totalLast7Days === 1 ? "pass" : "passes"}
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface p-2">
          <span className="text-[10px] text-muted uppercase font-semibold">
            Daily Average
          </span>
          <p className="font-mono text-base font-bold text-ink">
            {(totalLast7Days / 7).toFixed(1)} / day
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface p-2">
          <span className="text-[10px] text-muted uppercase font-semibold">
            Peak Activity
          </span>
          <p className="font-mono text-base font-bold text-amber-ink">
            {peakDay.count > 0 ? `${peakDay.count} (${peakDay.day})` : "0"}
          </p>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-48 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d3c7" opacity={0.5} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#5c6574" }}
                axisLine={{ stroke: "#d9d3c7" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxCount]}
                tick={{ fontSize: 11, fill: "#5c6574" }}
                axisLine={{ stroke: "#d9d3c7" }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload as DayDistribution;
                    return (
                      <div className="rounded-md border border-line bg-surface p-2.5 shadow-md text-xs">
                        <p className="font-bold text-deep">{row.fullDate}</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-ink">
                          {row.count} sighting{row.count === 1 ? "" : "s"}
                        </p>
                        {row.count > 0 && (
                          <p className="mt-1 text-[11px] text-muted">
                            {row.cameras}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                fill="#0f3460"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${plate}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f2a900" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f2a900" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d3c7" opacity={0.5} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#5c6574" }}
                axisLine={{ stroke: "#d9d3c7" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxCount]}
                tick={{ fontSize: 11, fill: "#5c6574" }}
                axisLine={{ stroke: "#d9d3c7" }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload as DayDistribution;
                    return (
                      <div className="rounded-md border border-line bg-surface p-2.5 shadow-md text-xs">
                        <p className="font-bold text-deep">{row.fullDate}</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-ink">
                          {row.count} sighting{row.count === 1 ? "" : "s"}
                        </p>
                        {row.count > 0 && (
                          <p className="mt-1 text-[11px] text-muted">
                            {row.cameras}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#0f3460"
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#gradient-${plate})`}
                dot={{ r: 4, fill: "#0f3460" }}
                activeDot={{ r: 6, fill: "#f2a900", stroke: "#0f3460", strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {totalLast7Days === 0 && (
        <p className="text-center text-xs text-muted">
          No sightings recorded for this vehicle within the last 7 calendar days.
        </p>
      )}
    </div>
  );
}
