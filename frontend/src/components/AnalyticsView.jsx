import { useMemo } from "react";
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

const COLORS = {
  pending: "#F59E0B",
  inProgress: "#3B82F6",
  completed: "#10B981",
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#10B981",
  notCompleted: "#E2E8F0",
  labels: "#64748B",
  title: "#334155",
  grid: "#E2E8F0",
};

const completionCenterPlugin = {
  id: "completionCenter",
  afterDraw(chart) {
    const { ctx, chartArea, data } = chart;
    const [completed = 0, notCompleted = 0] = data.datasets[0]?.data ?? [];
    const total = completed + notCompleted;
    const percentage = total ? Math.round((completed / total) * 100) : 0;
    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    ctx.fillStyle = "#1E293B";
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${percentage}%`, centerX, centerY - 8);
    ctx.fillStyle = COLORS.labels;
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    ctx.fillText("completed", centerX, centerY + 15);
    ctx.restore();
  },
};

const barValuePlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const dataset = chart.data.datasets[0];
    const bars = chart.getDatasetMeta(0)?.data ?? [];

    ctx.save();
    ctx.fillStyle = COLORS.title;
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    bars.forEach((bar, index) => {
      const value = dataset.data[index] ?? 0;
      const position = bar.tooltipPosition();
      ctx.fillText(String(value), position.x, Math.max(position.y - 8, chartArea.top + 14));
    });

    ctx.restore();
  },
};

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildCreatedTimeline(tasks) {
  const dates = tasks
    .map((task) => new Date(task.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (!dates.length) return { labels: [], counts: [] };

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
    return { labels, counts };
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
  };
}

function lineGradient(context) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  if (!chartArea) return "rgb(59 130 246 / 0.12)";

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgb(59 130 246 / 0.28)");
  gradient.addColorStop(1, "rgb(59 130 246 / 0)");
  return gradient;
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 350 },
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 9,
        boxHeight: 9,
        color: COLORS.labels,
        font: { family: "Inter, system-ui, sans-serif", size: 12 },
        padding: 16,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: "#1E293B",
      bodyColor: "#F8FAFC",
      borderColor: "#334155",
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      padding: 10,
      titleColor: "#FFFFFF",
    },
  },
};

const barOptions = {
  ...baseOptions,
  layout: { padding: { top: 18 } },
  plugins: {
    ...baseOptions.plugins,
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: COLORS.labels, font: { family: "Inter, system-ui, sans-serif", size: 12 } },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.labels, font: { family: "Inter, system-ui, sans-serif", size: 12 }, precision: 0, stepSize: 1 },
    },
  },
};

const lineOptions = {
  ...baseOptions,
  plugins: {
    ...baseOptions.plugins,
    legend: { display: false },
  },
  scales: {
    x: {
      border: { display: false },
      grid: { display: false },
      ticks: { color: COLORS.labels, font: { family: "Inter, system-ui, sans-serif", size: 11 }, maxRotation: 0, maxTicksLimit: 8 },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.labels, font: { family: "Inter, system-ui, sans-serif", size: 12 }, precision: 0, stepSize: 1 },
    },
  },
};

export function AnalyticsView({ tasks, isLoading }) {
  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in-progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    high: tasks.filter((task) => task.priority === "high").length,
    medium: tasks.filter((task) => task.priority === "medium").length,
    low: tasks.filter((task) => task.priority === "low").length,
  }), [tasks]);

  const completionData = useMemo(() => ({
    labels: ["Completed", "Not completed"],
    datasets: [{
      data: [counts.completed, counts.total - counts.completed],
      backgroundColor: [COLORS.completed, COLORS.notCompleted],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  }), [counts]);

  const statusData = useMemo(() => ({
    labels: ["Pending", "In Progress", "Completed"],
    datasets: [{
      data: [counts.pending, counts.inProgress, counts.completed],
      backgroundColor: [COLORS.pending, COLORS.inProgress, COLORS.completed],
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 46,
    }],
  }), [counts]);

  const priorityData = useMemo(() => ({
    labels: ["High", "Medium", "Low"],
    datasets: [{
      data: [counts.high, counts.medium, counts.low],
      backgroundColor: [COLORS.high, COLORS.medium, COLORS.low],
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 46,
    }],
  }), [counts]);

  const timelineData = useMemo(() => {
    const timeline = buildCreatedTimeline(tasks);
    return {
      labels: timeline.labels,
      datasets: [{
        label: "Tasks created",
        data: timeline.counts,
        backgroundColor: lineGradient,
        borderColor: COLORS.inProgress,
        borderWidth: 2.5,
        fill: true,
        pointBackgroundColor: COLORS.inProgress,
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 2,
        pointHoverRadius: 5,
        pointRadius: timeline.labels.length > 18 ? 0 : 3,
        tension: 0.38,
      }],
    };
  }, [tasks]);

  if (isLoading) {
    return <div className="analytics-loading" role="status">Loading charts...</div>;
  }

  return (
    <section className="analytics-view" aria-label="Task analytics charts">
      <article className="analytics-chart-card">
        <h2>Completion Rate</h2>
        <div className="analytics-chart-canvas analytics-donut-canvas">
          <Doughnut data={completionData} options={{ ...baseOptions, cutout: "72%" }} plugins={[completionCenterPlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card">
        <h2>Tasks by Status</h2>
        <div className="analytics-chart-canvas">
          <Bar data={statusData} options={barOptions} plugins={[barValuePlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card">
        <h2>Tasks by Priority</h2>
        <div className="analytics-chart-canvas">
          <Bar data={priorityData} options={barOptions} plugins={[barValuePlugin]} />
        </div>
      </article>

      <article className="analytics-chart-card">
        <h2>Tasks Created Over Time</h2>
        <div className="analytics-chart-canvas">
          <Line data={timelineData} options={lineOptions} />
        </div>
      </article>
    </section>
  );
}
