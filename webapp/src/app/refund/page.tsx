import RefundForm from "@/components/RefundForm";
import RefundEmailAccess from "@/components/RefundEmailAccess";
import { requireRefundAccess } from "@/server/session";

export default async function RefundPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const { order_id: orderId } = await searchParams;
  const authorized = await requireRefundAccess(true).then(() => true).catch(() => false);
  if (!authorized && orderId) return <RefundEmailAccess orderId={orderId.slice(0, 100)} />;
  if (!authorized) return <div className="px-5 pt-16 text-center"><h1 className="font-display text-2xl font-bold">Refund link incomplete</h1><p className="mt-3 text-muted">Please open the complete link from your order email or contact support at +1 877 286 4137.</p></div>;
  return <div className="px-5 pt-10"><header className="mb-6"><p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Neo Nature</p><h1 className="mt-2 font-display text-2xl font-bold">Refund request</h1><p className="mt-1 text-muted">Complete the form for our team to review.</p></header><RefundForm orderNumber={null} standalone /></div>;
}
