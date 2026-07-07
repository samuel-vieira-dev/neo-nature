"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Play, Headphones, Lock, Check, Flame } from "lucide-react";
import { useMe, useContentProgress } from "@/lib/hooks";
import { FadeUp } from "@/components/ui";
import { contentTracks, contentItems } from "@/lib/data";

const kindIcon = { article: BookOpen, video: Play, audio: Headphones };

export default function LearnPage() {
  const { data: me } = useMe();
  const { data: progress } = useContentProgress();
  const completedContent = progress?.completed ?? [];
  const streak = me?.streak ?? 0;
  const hydrated = !!me;
  const [track, setTrack] = useState("first30");

  const items = contentItems.filter((c) => c.track === track);
  const trackProgress = (id: string) => {
    const all = contentItems.filter((c) => c.track === id);
    const done = all.filter((c) => completedContent.includes(c.slug)).length;
    return { done, total: all.length };
  };

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold">Learn</h1>
        <p className="mt-1 text-sm text-muted">Small daily reads that multiply your results.</p>
      </FadeUp>

      {/* track chips */}
      <FadeUp delay={0.06} className="mt-5">
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-5 pb-1">
          {contentTracks.map((t) => {
            const active = track === t.id;
            const prog = trackProgress(t.id);
            return (
              <button
                key={t.id}
                onClick={() => setTrack(t.id)}
                className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  active ? "grad text-emerald-950" : "glass text-muted"
                }`}
              >
                {t.emoji} {t.name}
                <span className={`ml-2 text-[10px] ${active ? "text-emerald-900" : "text-white/30"}`}>
                  {prog.done}/{prog.total}
                </span>
              </button>
            );
          })}
        </div>
      </FadeUp>

      {/* items */}
      <div className="mt-5 space-y-3 px-5">
        {items.map((c, i) => {
          const Icon = kindIcon[c.kind];
          const done = completedContent.includes(c.slug);
          const locked = hydrated && c.locked !== undefined && streak < c.locked;
          const inner = (
            <motion.div
              key={c.slug}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              whileTap={locked ? undefined : { scale: 0.98 }}
              className={`glass flex items-center gap-4 rounded-2xl p-4 ${locked ? "opacity-60" : ""}`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  done ? "grad" : locked ? "bg-white/6" : "bg-emerald-400/15"
                }`}
              >
                {done ? (
                  <Check className="h-5 w-5 text-emerald-950" strokeWidth={3} />
                ) : locked ? (
                  <Lock className="h-4 w-4 text-white/40" />
                ) : (
                  <Icon className="h-5 w-5 text-emerald-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold leading-snug">{c.title}</p>
                {locked ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-orange-300">
                    <Flame className="h-3 w-3" fill="currentColor" /> Unlocks at a {c.locked}-day streak
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] capitalize text-muted">
                    {c.kind} · {c.minutes} min {done && "· Completed"}
                  </p>
                )}
              </div>
            </motion.div>
          );

          return locked ? (
            <div key={c.slug}>{inner}</div>
          ) : (
            <Link key={c.slug} href={`/learn/${c.slug}`} className="block">
              {inner}
            </Link>
          );
        })}
      </div>

      <FadeUp delay={0.3} className="mt-6 px-5">
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <Flame className="h-5 w-5 shrink-0 text-orange-400" fill="currentColor" />
          <p className="text-xs leading-relaxed text-muted">
            Some lessons unlock as your streak grows — your consistency literally earns you knowledge.
          </p>
        </div>
      </FadeUp>
    </div>
  );
}
