import { useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const THEME_KEY = "taskflow-analytics-theme";
const FONT = "Inter, system-ui, sans-serif";

const PALETTES = {
  dark: {
    pending: "#FBBF24",
    inProgress: "#60A5FA",
    completed: "#34D399",
    high: "#F87171",
    medium: "#FBBF24",
    low: "#4ADE80",
    track: "rgba(148, 163, 184, 0.22)",
    label: "#94A3B8",
    value: "#F8FAFC",
    grid: "rgba(148, 163, 184, 0.16)",
    tooltipBg: "#0B1024",
    tooltipBorder: "rgba(148, 163, 184, 0.28)",
    pointBorder: "#0B1024",
    line: "#818CF8",
  },
  light: {
    pending: "#D97706",
    inProgress: "#2563EB",
    completed: "#059669",
    high: "#DC2626",
    medium: "#D97706",
    low: "#059669",
    track: "#E2E8F0",
    label: "#64748B",
    value: "#0F172A",
    grid: "#E2E8F0",
    tooltipBg: "#0F172A",
    tooltipBorder: "#334155",
    pointBorder: "#FFFFFF",
    line: "#4F46E5",
  },
};

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDay(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCreatedTimeline(tasks) {
  const dates = tasks.map((task) => parseDay(task.createdAt)).filter(Boolean);
  if (!dates.length) return { labels: [], counts: [], groupedBy: "day" };

  const datesByDay = dates.reduce((counts, date) => {
    const key = dateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
  const sortedDays = [...datesByDay.keys()].sort();
  const firstDay = new Date(`${sortedDays[0]}T00:00:00`);
  const lastDay = new Date(`${sortedDays.at(-1)}T00:00:00`);
  const dayCount = Math.round((lastDay - firstDay) / 86_400_000);

  if (dayCount <= 60) {
    const labels = [];
    const counts = [];
    for (let offset = 0; offset <= dayCount; offset += 1) {
      const date = new Date(firstDay.getTime() + offset * 86_400_000);
      labels.push(date.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      counts.push(datesByDay.get(dateKey(date)) ?? 0);
    }
    return { labels, counts, groupedBy: "day" };
  }

  const weeks = dates.reduce((counts, date) => {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = dateKey(weekStart);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
  const sortedWeeks = [...weeks.keys()].sort();

  return {
    labels: sortedWeeks.map((key) => new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
    counts: sortedWeeks.map((key) => weeks.get(key)),
    groupedBy: "week",
  };
}

function areaGradient(color) {
  return (context) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return "transparent";
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    return gradient;
  };
}

function axisTicks(color) {
  return {
    color,
    font: { family: FONT, size: 12 },
    padding: 8,
    precision: 0,
    maxTicksLimit: 6,
    callback(value) {
      return Number.isInteger(value) ? value : "";
    },
  };
}

function buildOptions(palette, reduceMotion) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    clip: false,
    animation: reduceMotion ? false : {
      duration: 900,
      easing: "easeOutQuart",
      delay(context) {
        return context.type === "data" ? context.dataIndex * 70 : 0;
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          color: palette.label,
          font: { family: FONT, size: 12 },
          padding: 16,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: palette.tooltipBg,
        bodyColor: "#F8FAFC",
        borderColor: palette.tooltipBorder,
        borderWidth: 1,
        cornerRadius: 10,
        displayColors: true,
        padding: 12,
        titleColor: "#FFFFFF",
        titleFont: { family: FONT, size: 13, weight: "600" },
        bodyFont: { family: FONT, size: 12 },
        callbacks: {
          label(context) {
            const parsed = context.parsed;
            const value = typeof parsed === "number" ? parsed : parsed?.y ?? context.raw ?? 0;
            const name = context.dataset.label || context.label;
            return ` ${name}: ${value}`;
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: palette.label,
          font: { family: FONT, size: 12 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          padding: 10,
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grace: "8%",
        grid: { color: palette.grid, drawTicks: false },
        ticks: axisTicks(palette.label),
        title: {
          display: true,
          text: "Tasks",
          color: palette.label,
          font: { family: FONT, size: 11, weight: "600" },
          padding: { bottom: 8 },
        },
      },
    },
  };
}

function headroom(values) {
  const peak = Math.max(0, ...values);
  return peak + Math.max(1, Math.ceil(peak * 0.28));
}

function CenterLabel({ color, muted }) {
  return {
    id: "completionCenter",
    afterDraw(chart) {
      const arc = chart.getDatasetMeta(0)?.data?.[0];
      const dataset = chart.data.datasets[0] ?? {};
      const total = dataset.completionTotal ?? 0;
      const completed = dataset.completedCount ?? 0;
      const percentage = total ? Math.round((completed / total) * 100) : 0;
      if (!arc) return;

      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.font = `700 28px ${FONT}`;
      ctx.fillText(`${percentage}%`, arc.x, arc.y - 10);
      ctx.fillStyle = muted;
      ctx.font = `500 12px ${FONT}`;
      ctx.fillText("completed", arc.x, arc.y + 16);
      ctx.restore();
    },
  };
}

function LineValueLabels({ color }) {
  return {
    id: "lineValueLabels",
    afterDatasetsDraw(chart) {
      const points = chart.getDatasetMeta(0)?.data ?? [];
      const data = chart.data.datasets[0]?.data ?? [];
      if (!points.length || points.length > 12) return;

      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      points.forEach((point, index) => {
        const { x, y } = point.getProps(["x", "y"], true);
        ctx.fillText(String(data[index] ?? 0), x, y - 10);
      });
      ctx.restore();
    },
  };
}

function BarValueLabels({ color }) {
  return {
    id: "barValueLabels",
    afterDatasetsDraw(chart) {
      const dataset = chart.data.datasets[0];
      const bars = chart.getDatasetMeta(0)?.data ?? [];
      const { ctx } = chart;

      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      bars.forEach((bar, index) => {
        const { x, y, base } = bar.getProps(["x", "y", "base"], true);
        const top = Math.min(y, base);
        ctx.fillText(String(dataset.data[index] ?? 0), x, top - 8);
      });

      ctx.restore();
    },
  };
}

export function AnalyticsView({ tasks, isLoading }) {
  const [theme, setTheme] = useState(readTheme);
  const palette = PALETTES[theme];
  const reduceMotion = useMemo(() => prefersReducedMotion(), []);

  const counts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      total: tasks.length,
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: tasks.filter((task) => task.status === "in-progress").length,
      completed: tasks.filter((task) => task.status === "completed").length,
      high: tasks.filter((task) => task.priority === "high").length,
      medium: tasks.filter((task) => task.priority === "medium").length,
      low: tasks.filter((task) => task.priority === "low").length,
      overdue: tasks.filter((task) => {
        if (task.status === "completed") return false;
        const due = parseDay(task.dueDate);
        return due ? due < today : false;
      }).length,
      averageProgress: tasks.length
        ? Math.round(tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / tasks.length)
        : 0,
    };
  }, [tasks]);

  const options = useMemo(() => buildOptions(palette, reduceMotion), [palette, reduceMotion]);
  const centerPlugin = useMemo(() => CenterLabel({ color: palette.value, muted: palette.label }), [palette]);
  const barPlugin = useMemo(() => BarValueLabels({ color: palette.value }), [palette]);
  const linePlugin = useMemo(() => LineValueLabels({ color: palette.value }), [palette]);

  const completionRate = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  const openCount = Math.max(counts.total - counts.completed, 0);

  const completionData = useMemo(() => ({
    labels: counts.total ? ["Completed", "Still open"] : ["No tasks"],
    datasets: [{
      completionTotal: counts.total,
      completedCount: counts.completed,
      data: counts.total ? [counts.completed, openCount] : [0, 1],
      backgroundColor: counts.total ? [palette.completed, palette.track] : [palette.track, palette.track],
      borderColor: "transparent",
      borderRadius: 10,
      borderWidth: 0,
      hoverOffset: 8,
      spacing: counts.total ? 3 : 0,
    }],
  }), [counts.completed, counts.total, openCount, palette]);

  const statusData = useMemo(() => ({
    labels: ["Pending", "In progress", "Completed"],
    datasets: [{
      data: [counts.pending, counts.inProgress, counts.completed],
      backgroundColor: [palette.pending, palette.inProgress, palette.completed],
      borderRadius: 10,
      borderSkipped: false,
      maxBarThickness: 52,
    }],
  }), [counts.completed, counts.inProgress, counts.pending, palette]);

  const priorityData = useMemo(() => ({
    labels: ["High", "Medium", "Low"],
    datasets: [{
      data: [counts.high, counts.medium, counts.low],
      backgroundColor: [palette.high, palette.medium, palette.low],
      borderRadius: 10,
      borderSkipped: false,
      maxBarThickness: 52,
    }],
  }), [counts.high, counts.low, counts.medium, palette]);

  const timeline = useMemo(() => buildCreatedTimeline(tasks), [tasks]);
  const timelineData = useMemo(() => ({
    labels: timeline.labels,
    datasets: [{
      label: "Tasks created",
      data: timeline.counts,
      backgroundColor: areaGradient(theme === "light" ? "rgba(79, 70, 229, 0.22)" : "rgba(129, 140, 248, 0.35)"),
      borderColor: palette.line,
      borderWidth: 2.5,
      fill: true,
      pointBackgroundColor: palette.line,
      pointBorderColor: palette.pointBorder,
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      pointRadius: timeline.labels.length > 18 ? 0 : 4,
      tension: 0.38,
    }],
  }), [palette, theme, timeline]);

  function chooseTheme(nextTheme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // The charts still update for this visit when storage is unavailable.
    }
  }

  function barChartOptions(values) {
    return {
      ...options,
      layout: { padding: { top: 28, right: 12, left: 4, bottom: 0 } },
      plugins: { ...options.plugins, legend: { display: false } },
      scales: {
        ...options.scales,
        y: { ...options.scales.y, suggestedMax: headroom(values) },
      },
    };
  }

  const statusOptions = barChartOptions([counts.pending, counts.inProgress, counts.completed]);
  const priorityOptions = barChartOptions([counts.high, counts.medium, counts.low]);
  const doughnutOptions = {
    ...options,
    cutout: "72%",
    layout: { padding: 12 },
    scales: {},
    plugins: {
      ...options.plugins,
      tooltip: { ...options.plugins.tooltip, enabled: counts.total > 0 },
    },
  };

  const lineOptions = {
    ...options,
    interaction: { intersect: false, mode: "index" },
    layout: { padding: { top: 28, right: 16, left: 4, bottom: 0 } },
    plugins: { ...options.plugins, legend: { display: false } },
    scales: {
      ...options.scales,
      x: { ...options.scales.x, offset: true },
      y: { ...options.scales.y, suggestedMax: headroom(timeline.counts) },
    },
  };

  const insights = [
    { label: "Tasks", value: counts.total, hint: "Everything in this workspace" },
    { label: "Completion", value: `${completionRate}%`, hint: `${counts.completed} finished` },
    { label: "Average progress", value: `${counts.averageProgress}%`, hint: "Across every task" },
    { label: "Overdue", value: counts.overdue, hint: "Open tasks past their due date" },
  ];

  if (isLoading) {
    return <div className="analytics-loading" role="status">Loading charts...</div>;
  }

  return (
    <section className="analytics-view" data-theme={theme} aria-label="Task analytics charts" data-gravity>
      <div className="analytics-toolbar" data-reveal>
        <p>Same task counts in either palette. Dark and light only change the chart colors.</p>
        <div className="analytics-theme" role="group" aria-label="Chart appearance">
          <button type="button" aria-pressed={theme === "dark"} onClick={() => chooseTheme("dark")}>Dark</button>
          <button type="button" aria-pressed={theme === "light"} onClick={() => chooseTheme("light")}>Light</button>
        </div>
      </div>

      <ul className="analytics-insights">
        {insights.map((insight) => (
          <li className="analytics-insight" key={insight.label} data-reveal>
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
            <small>{insight.hint}</small>
          </li>
        ))}
      </ul>

      <article className="analytics-chart-card" data-reveal>
        <h2>Completion rate</h2>
        <p>Finished tasks against everything still open.</p>
        <div className="analytics-chart-canvas analytics-donut-canvas">
          <Doughnut key={`completion-${theme}`} data={completionData} options={doughnutOptions} plugins={[centerPlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card" data-reveal>
        <h2>Tasks by status</h2>
        <p>How work is split between pending, in progress, and completed.</p>
        <div className="analytics-chart-canvas">
          <Bar key={`status-${theme}`} data={statusData} options={statusOptions} plugins={[barPlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card" data-reveal>
        <h2>Tasks by priority</h2>
        <p>High, medium, and low counts, with each total sitting above its bar.</p>
        <div className="analytics-chart-canvas">
          <Bar key={`priority-${theme}`} data={priorityData} options={priorityOptions} plugins={[barPlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card" data-reveal>
        <h2>Tasks created over time</h2>
        <p>{timeline.groupedBy === "week" ? "Weekly totals for the dates tasks were created." : "Daily totals for the dates tasks were created."}</p>
        {timeline.labels.length ? (
          <div className="analytics-chart-canvas">
            <Line key={`timeline-${theme}`} data={timelineData} options={lineOptions} plugins={[linePlugin]} />
          </div>
        ) : (
          <p className="analytics-empty">Created dates will draw this line as tasks are added.</p>
        )}
      </article>
    </section>
  );
}
