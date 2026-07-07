"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FlaskConical, FastForward, RotateCcw, Users, CalendarClock, Play, PackageCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useDemoTime, useDemoReset, useLogout } from "@/lib/hooks";

/**
 * Demo Controls — the client-validation cockpit. Time travel + persona switch
 * + full reset let every time-dependent flow (day-30, billing T-3, churn,
 * refill) be demonstrated in seconds instead of days.
 */
export default function DemoControls() {
  const { toast } = useApp();
  const router = useRouter();
  const { data: me } = useMe();
  const demoTime = useDemoTime();
  const demoReset = useDemoReset();
  const logout = useLogout();

  if (!me?.demo.mode) return null;

  const offset = me.demo.dayOffset;

  const shift = (delta: number) =>
    demoTime.mutate(
      { delta },
      { onSuccess: (r) => toast(`Time traveled: app is now ${r.dayOffset > 0 ? `+${r.dayOffset}` : r.dayOffset} days ${r.dayOffset >= 0 ? "ahead" : "behind"} ⏩`) }
    );

  const runJobs = async () => {
    const res = await fetch("/api/jobs/tick", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast(`Jobs ran: ${data.actions?.length ?? 0} action(s) ✅`);
    } else {
      toast("Jobs endpoint arrives in Etapa 3 🚧");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-400/25 bg-amber-400/8 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15">
          <FlaskConical className="h-5 w-5 text-amber-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-200">Demo controls</p>
          <p className="text-[11px] leading-snug text-amber-200/60">
            {offset === 0 ? "App clock: today (real time)" : `App clock: ${offset > 0 ? "+" : ""}${offset} days`}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => shift(1)}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <FastForward className="h-4 w-4" /> +1 day
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => shift(7)}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <FastForward className="h-4 w-4" /> +7 days
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => demoTime.mutate({ reset: true }, { onSuccess: () => toast("Back to real time ⏪") })}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <CalendarClock className="h-4 w-4" /> Today
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={runJobs}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <Play className="h-4 w-4" /> Run jobs
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={async () => {
            const res = await fetch("/api/demo/deliver", { method: "POST" });
            if (res.ok) toast("Order marked delivered — check the post-delivery offer 📦");
            else toast("No undelivered order to deliver");
          }}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <PackageCheck className="h-4 w-4" /> Deliver
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => logout.mutate()}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <Users className="h-4 w-4" /> Persona
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() =>
            demoReset.mutate(undefined, {
              onSuccess: () => {
                toast("All demo data reset 🔄");
                router.push("/");
              },
            })
          }
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-400/15 py-2.5 text-[11px] font-bold text-amber-200"
        >
          <RotateCcw className="h-4 w-4" /> {demoReset.isPending ? "…" : "Reset"}
        </motion.button>
      </div>
    </div>
  );
}
