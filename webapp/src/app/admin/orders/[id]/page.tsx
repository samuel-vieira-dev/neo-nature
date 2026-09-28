import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { getAdminUser } from "@/server/admin";
import { hasPermission } from "@/server/permissions";
import { buildTrackingUrl, humanizeStatus } from "@/lib/tracking";
import SendRefundForm from "@/components/admin/SendRefundForm";

const date = (value: Date | null) => value ? value.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : "—";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 break-words text-sm">{value || "—"}</dd></div>;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  // Check here as well as in the layout: page/layout rendering can run in parallel.
  const admin = await getAdminUser();
  if (!admin || !hasPermission(admin.role, "orders:read")) redirect("/admin");
  const { id } = await params;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) notFound();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const money = (value: string | null) => value == null ? "—" : `${order.currency} ${Number(value).toFixed(2)}`;
  const card = "rounded-2xl border border-[var(--border)] bg-white p-5";
  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href="/admin/orders" className="text-sm font-semibold text-[var(--accent)]">← Orders</Link>
    <header><h1 className="font-display text-2xl font-bold">Order #{order.buygoodsOrderId ?? order.number}</h1><p className="mt-1 text-sm text-muted">{order.source} · {order.status} · {date(order.placedAt)}</p></header>
    <section className={card}>
      <h2 className="mb-4 font-display text-lg font-bold">Customer</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Name" value={order.customerName} /><Detail label="Email" value={order.email} />
        <Detail label="Phone" value={order.customerPhoneE164 || order.customerPhone} /><Detail label="Shipping address" value={order.address} />
      </dl>
      <SendRefundForm orderId={order.id} email={order.email} />
    </section>
    <section className={card}>
      <h2 className="mb-4 font-display text-lg font-bold">Order details</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Order ID" value={order.id} /><Detail label="Order number" value={order.number} />
        <Detail label="Provider ID" value={order.buygoodsOrderId || order.konnektiveOrderId} />
        <Detail label="Total" value={money(order.total)} /><Detail label="Payment method" value={order.paymentMethod} />
        <Detail label="Sale origin" value={order.saleOrigin} /><Detail label="Affiliate" value={order.affiliate} />
        <Detail label="Traffic source" value={order.trafficSource} /><Detail label="Funnel" value={order.funnel} />
        <Detail label="Refunded at" value={date(order.refundedAt)} /><Detail label="Refund amount" value={money(order.refundAmount)} />
        <Detail label="Chargeback at" value={date(order.chargebackAt)} /><Detail label="Chargeback amount" value={money(order.chargebackAmount)} />
      </dl>
    </section>
    <section className={card}>
      <h2 className="mb-4 font-display text-lg font-bold">Items</h2>
      {items.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="pb-2">Product</th><th className="pb-2">SKU</th><th className="pb-2">Qty</th><th className="pb-2">Price</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-b border-[var(--border)] last:border-0"><td className="py-3">{item.productName}</td><td>{item.sku || "—"}</td><td>{item.qty}</td><td>{money(item.price)}</td></tr>)}</tbody></table></div> : <p className="text-sm">{order.productName || "No items recorded."}</p>}
    </section>
    <section className={card}>
      <h2 className="mb-4 font-display text-lg font-bold">Shipping</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Status" value={order.shippingStatus && humanizeStatus(order.shippingStatus)} />
        <Detail label="Fulfilled at" value={date(order.fulfilledAt)} />
        <Detail label="Tracking" value={order.shippingTrackingId && <a href={buildTrackingUrl(order.shippingTrackingId)} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">{order.shippingTrackingId}</a>} />
      </dl>
      {order.trackingSteps.length > 0 && <ol className="mt-4 space-y-2">{order.trackingSteps.map((step, i) => <li key={i} className="rounded-xl bg-[var(--surface)] p-3 text-sm"><strong>{step.done ? "✓ " : ""}{step.label}</strong><p className="text-muted">{step.detail} {step.date}</p></li>)}</ol>}
    </section>
  </div>;
}
