"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Mention } from "@/lib/data";
import { COMPANY_COLORS } from "@/lib/data";

const SENT_COLORS = {
  positive: "#16a34a",
  neutral: "#6b7280",
  negative: "#dc2626",
} as const;

export function VolumeChart({ mentions }: { mentions: Mention[] }) {
  // Bucket by ISO date.
  const buckets = new Map<string, number>();
  for (const m of mentions) {
    const day = m.published_at.slice(0, 10);
    buckets.set(day, (buckets.get(day) || 0) + 1);
  }
  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SentimentChart({ mentions }: { mentions: Mention[] }) {
  // Stacked by week.
  const weekKey = (iso: string) => {
    const d = new Date(iso);
    const yearStart = new Date(d.getUTCFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getUTCDay() + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };

  const buckets = new Map<string, { week: string; positive: number; neutral: number; negative: number }>();
  for (const m of mentions) {
    const k = weekKey(m.published_at);
    if (!buckets.has(k)) buckets.set(k, { week: k, positive: 0, neutral: 0, negative: 0 });
    buckets.get(k)![m.sentiment] += 1;
  }
  const data = Array.from(buckets.values()).sort((a, b) => a.week.localeCompare(b.week));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="positive" stackId="a" fill={SENT_COLORS.positive} />
          <Bar dataKey="neutral" stackId="a" fill={SENT_COLORS.neutral} />
          <Bar dataKey="negative" stackId="a" fill={SENT_COLORS.negative} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopOutletsChart({ mentions }: { mentions: Mention[] }) {
  const counts = new Map<string, number>();
  for (const m of mentions) {
    counts.set(m.source_name, (counts.get(m.source_name) || 0) + 1);
  }
  const data = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#0ea5e9">
            {data.map((_, i) => (
              <Cell key={i} fill="#0ea5e9" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Share of Voice ---

type SoVRow = { week: string } & Record<string, number | string>;

export function ShareOfVoiceArea({
  data, companies,
}: {
  data: SoVRow[];
  companies: string[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {companies.map((c) => (
            <Area
              key={c}
              type="monotone"
              dataKey={c}
              stackId="1"
              stroke={COMPANY_COLORS[c] || "#94a3b8"}
              fill={COMPANY_COLORS[c] || "#94a3b8"}
              fillOpacity={0.65}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShareOfVoicePie({
  data,
}: {
  data: { company: string; count: number }[];
}) {
  const filtered = data.filter((d) => d.count > 0);
  const total = filtered.reduce((s, d) => s + d.count, 0);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="count"
            nameKey="company"
            innerRadius="50%"
            outerRadius="85%"
            paddingAngle={2}
            label={({ company, count }) =>
              total ? `${company} ${Math.round((count / total) * 100)}%` : company
            }
            labelLine={false}
          >
            {filtered.map((d) => (
              <Cell key={d.company} fill={COMPANY_COLORS[d.company] || "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
