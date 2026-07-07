"use client";

import { useId } from "react";
import { motion } from "framer-motion";

/**
 * Hand-rolled SVG trend chart — matches the glass/gradient design system
 * without pulling a chart library.
 */
export default function TrendChart({
  points,
  unit = "",
  color = "#10b981",
  height = 120,
  goodDirection = "down",
}: {
  points: { label: string; value: number }[];
  unit?: string;
  color?: string;
  height?: number;
  goodDirection?: "down" | "up";
}) {
  const uid = useId().replace(/[:]/g, "");
  const W = 300;
  const H = height;
  const PAD = 18;

  if (points.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-muted">
        Log at least two entries to see your trend
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points.length - 1).toFixed(1)} ${H - 4} L ${x(0).toFixed(1)} ${H - 4} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const improving = goodDirection === "down" ? delta < 0 : delta > 0;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="font-display text-2xl font-bold">
          {last}
          <span className="ml-1 text-xs font-semibold text-muted">{unit}</span>
        </span>
        <span className={`text-xs font-bold ${improving ? "text-emerald-300" : "text-white/40"}`}>
          {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}${unit}`}
          {improving && " 🎉"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#area-${uid})`} />
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === points.length - 1 ? 4.5 : 3}
            fill={i === points.length - 1 ? color : "#0d1512"}
            stroke={color}
            strokeWidth={2}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.08 }}
          />
        ))}
        {/* first / last labels */}
        <text x={x(0)} y={H - 6} textAnchor="start" fontSize="9" fill="rgba(255,255,255,0.35)">
          {points[0].label}
        </text>
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.35)">
          {points[points.length - 1].label}
        </text>
      </svg>
    </div>
  );
}
