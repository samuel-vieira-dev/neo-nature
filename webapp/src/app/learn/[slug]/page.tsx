"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BookOpen, Play, Headphones, Check, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { FadeUp, PageHeader, CTA } from "@/components/ui";
import { contentBySlug, contentTracks } from "@/lib/data";

const kindIcon = { article: BookOpen, video: Play, audio: Headphones };

export default function ContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { completedContent, completeContent, toast } = useApp();
  const c = contentBySlug(slug);

  if (!c) {
    return (
      <div>
        <PageHeader title="Content not found" backHref="/learn" />
      </div>
    );
  }

  const Icon = kindIcon[c.kind];
  const track = contentTracks.find((t) => t.id === c.track);
  const done = completedContent.includes(c.slug);

  const markDone = () => {
    if (!done) {
      completeContent(c.slug);
      toast("Nice! +5 points ✨");
    }
    router.push("/learn");
  };

  return (
    <div>
      <PageHeader title={track ? `${track.emoji} ${track.name}` : "Learn"} backHref="/learn" />

      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            <Icon className="h-4 w-4" /> {c.kind} · {c.minutes} min
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight">{c.title}</h1>

          {/* fake media player for video/audio */}
          {c.kind !== "article" && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => toast("Demo: media playback will be wired up in Phase 2 ▶️")}
              className="mt-4 flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900/60 to-emerald-950/80"
            >
              <span className="grad glow flex h-14 w-14 items-center justify-center rounded-full">
                <Play className="ml-0.5 h-6 w-6 text-emerald-950" fill="currentColor" />
              </span>
            </motion.button>
          )}
        </div>
      </FadeUp>

      <FadeUp delay={0.08} className="mt-4 px-5">
        <div className="glass space-y-4 rounded-3xl p-6">
          {c.body.map((para, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.08 }}
              className="text-sm leading-relaxed text-white/80"
            >
              {para}
            </motion.p>
          ))}
        </div>
      </FadeUp>

      <FadeUp delay={0.16} className="mt-5 px-5">
        {done ? (
          <div className="glass flex items-center justify-center gap-2 rounded-2xl py-4 font-display font-bold text-emerald-300">
            <Check className="h-5 w-5" /> Completed
          </div>
        ) : (
          <CTA onClick={markDone}>
            <Sparkles className="h-5 w-5" /> Mark as done · +5 points
          </CTA>
        )}
      </FadeUp>
    </div>
  );
}
