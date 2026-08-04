"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useInstallPrompt, useIsStandalone } from "@/lib/pwa";
import InstallGuide from "@/components/InstallGuide";

const DISMISS_KEY = "nn_install_dismissed";

const EXCLUDED_PREFIXES = ["/admin", "/login"];

export default function InstallBanner() {
  const pathname = usePathname();
  const standalone = useIsStandalone();
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
  const visible = !excluded && !standalone && !dismissed;

  const onInstallClick = async () => {
    if (canPrompt) {
      await promptInstall();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-4 pt-4"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3">
              <Image src="/icon-192.png" alt="Neo Nature" width={36} height={36} className="shrink-0 rounded-xl" />
              <p className="flex-1 text-sm font-semibold text-[var(--text)]">Install the app for one-tap access</p>
              <button
                onClick={onInstallClick}
                className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-bold text-white active:bg-[var(--accent-strong)]"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowGuide(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mx-auto w-full max-w-md rounded-t-3xl bg-[var(--surface)] p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)]" />
              <h2 className="font-display text-xl font-bold text-[var(--text)]">Install Neo Nature</h2>
              <div className="mt-4">
                <InstallGuide />
              </div>
              <button onClick={() => setShowGuide(false)} className="mt-4 w-full text-center text-sm text-muted">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
