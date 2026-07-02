"use client";

import { useId } from "react";

// Stylized supplement bottle — each product keeps its own accent color,
// echoing how every Neo Nature product has its own visual identity.
export default function Bottle({
  accent,
  label,
  sub = "DIETARY SUPPLEMENT",
  className = "",
}: {
  accent: string;
  label: string;
  sub?: string;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const gradId = `label-${uid}`;
  const shineId = `shine-${uid}`;
  const [line1, line2] = label.split(" ");

  return (
    <svg viewBox="0 0 120 190" className={className} aria-label={label}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* cap */}
      <rect x="34" y="6" width="52" height="26" rx="7" fill="#161b19" stroke="rgba(255,255,255,0.08)" />
      <rect x="42" y="32" width="36" height="10" fill="#111614" />

      {/* body */}
      <rect x="20" y="40" width="80" height="144" rx="18" fill="#121815" stroke="rgba(255,255,255,0.09)" />

      {/* label band */}
      <rect x="20" y="74" width="80" height="70" fill={`url(#${gradId})`} />
      <text x="60" y="102" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800" letterSpacing="0.5" fontFamily="var(--font-outfit), sans-serif">
        {line1}
      </text>
      {line2 && (
        <text x="60" y="118" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800" letterSpacing="0.5" fontFamily="var(--font-outfit), sans-serif">
          {line2}
        </text>
      )}
      <text x="60" y="136" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="4.6" fontWeight="600" letterSpacing="1.2">
        {sub}
      </text>

      {/* leaf mark below the label */}
      <path d="M60 156 c6 -8 14 -8 16 -14 c-8 -2 -16 2 -16 14 z" fill={accent} opacity="0.9" />
      <path d="M60 156 c-6 -8 -14 -8 -16 -14 c8 -2 16 2 16 14 z" fill={accent} opacity="0.55" />

      {/* glass shine */}
      <rect x="20" y="40" width="80" height="144" rx="18" fill={`url(#${shineId})`} />
    </svg>
  );
}
