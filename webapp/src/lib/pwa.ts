"use client";

import { useEffect, useState } from "react";

export type Platform = "ios" | "android" | "desktop";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const isIPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Registers the service worker eagerly (not gated on push opt-in) so the
 * app becomes installable for everyone, not just people who accept push. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Captures the browser's native install prompt (Chrome/Android/desktop only). */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return { canPrompt: !!deferred, promptInstall };
}

/** Resolved after mount to avoid a hydration mismatch (SSR always renders false). */
export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    setStandalone(isStandalone());
  }, []);
  return standalone;
}
