"use client";

import { useRouter } from "next/navigation";
import { FlaskConical, FastForward, RotateCcw, Users, CalendarClock, Play, PackageCheck, Megaphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useDemoTime, useDemoReset, useDemoNextBanner, useLogout } from "@/lib/hooks";

/**
 * Demo Controls — the client-validation cockpit. Time travel + persona switch
 * + full reset let every time-dependent flow (churn, refill) be demonstrated
 * in seconds instead of days.
 */
export default function DemoControls() {
  const { toast } = useApp();
  const router = useRouter();
  const { data: me } = useMe();
  const demoTime = useDemoTime();
  const demoReset = useDemoReset();
  const nextBanner = useDemoNextBanner();
  const logout = useLogout();

  if (!me?.demo.mode) return null;

  const offset = me.demo.dayOffset;

  const shift = (delta: number) =>
    demoTime.mutate(
      { delta },
      { onSuccess: (r) => toast(`Time traveled: app is now ${r.dayOffset > 0 ? `+${r.dayOffset}` : r.dayOffset} days ${r.dayOffset >= 0 ? "ahead" : "behind"}`) }
    );

  const runJobs = async () => {
    const res = await fetch("/api/jobs/tick", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast(`Jobs ran: ${data.actions?.length ?? 0} action(s) ✅`);
    } else {
      toast("Jobs endpoint not available");
    }
  };

  const btn = "flex flex-col items-center gap-1 rounded-xl bg-amber-100 py-2.5 text-xs font-bold text-amber-800";

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
          <FlaskConical className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-amber-800">Demo controls</p>
          <p className="text-sm leading-snug text-amber-700">
            {offset === 0 ? "App clock: today (real time)" : `App clock: ${offset > 0 ? "+" : ""}${offset} days`}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => shift(1)} className={btn}>
          <FastForward className="h-4 w-4" /> +1 day
        </button>
        <button onClick={() => shift(7)} className={btn}>
          <FastForward className="h-4 w-4" /> +7 days
        </button>
        <button onClick={() => demoTime.mutate({ reset: true }, { onSuccess: () => toast("Back to real time") })} className={btn}>
          <CalendarClock className="h-4 w-4" /> Today
        </button>
        <button onClick={runJobs} className={btn}>
          <Play className="h-4 w-4" /> Run jobs
        </button>
        <button
          onClick={async () => {
            const res = await fetch("/api/demo/deliver", { method: "POST" });
            if (res.ok) toast("Order marked delivered 📦");
            else toast("No undelivered order to deliver");
          }}
          className={btn}
        >
          <PackageCheck className="h-4 w-4" /> Deliver
        </button>
        <button
          onClick={() => nextBanner.mutate(undefined, { onSuccess: () => toast("Banner updated") })}
          className={btn}
        >
          <Megaphone className="h-4 w-4" /> Next banner
        </button>
        <button onClick={() => logout.mutate()} className={btn}>
          <Users className="h-4 w-4" /> Persona
        </button>
        <button
          onClick={() =>
            demoReset.mutate(undefined, {
              onSuccess: () => {
                toast("All demo data reset 🔄");
                router.push("/");
              },
            })
          }
          className={btn}
        >
          <RotateCcw className="h-4 w-4" /> {demoReset.isPending ? "…" : "Reset"}
        </button>
      </div>
    </div>
  );
}
