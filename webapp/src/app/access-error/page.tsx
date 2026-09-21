import Link from "next/link";
export default function AccessErrorPage() {
  return <div className="px-5 py-16"><h1 className="font-display text-2xl font-bold">We couldn&apos;t open your order</h1><p className="mt-4 text-lg text-muted">Please open the complete link in your purchase email. If you have tried several times, wait 15 minutes and try again.</p><a href="tel:+18772864137" className="mt-6 block py-4 text-lg font-bold text-[var(--accent)]">Call us: +1 877 286 4137</a><Link href="/login" className="block py-4">Sign in with your phone</Link></div>;
}
