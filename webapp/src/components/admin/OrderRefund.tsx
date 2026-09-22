"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCan } from "@/components/AdminProvider";
import { adminApi } from "@/lib/adminApi";

type RecordRow = { mode: string; id: string; amount: string; currency: string; kind: string; status: string; reason: string; message: string; createdAt: string; adminUserId: string };
type Summary = { mode: string; available: string; simulatedTotal: string; currency: string; blockedReason: string | null; history: RecordRow[] };
type Submission = { requestId: string; kind: "full" | "partial"; amount: string; reason: string };
const errors: Record<string, string> = {
  refund_processing_disabled: "Refund processing is currently unavailable.",
  reconciliation_required: "An earlier attempt has an unknown result. Reconcile it before starting another refund.",
  refund_balance_unknown: "The previous refund amount is unknown. Verify the balance in Konnektive first.",
  no_refundable_balance: "No refundable balance remains in Konnektive.",
  chargeback_order: "Refunds are blocked for orders with a chargeback.",
  canceled_order: "Refunds are blocked for canceled orders.",
  missing_konnektive_order_id: "This order is missing its Konnektive identifier.",
  konnektive_orders_only: "Only Konnektive orders are eligible.",
  balance_changed: "The available balance changed. Refresh and review the amount.",
  invalid_refund_amount: "Enter an amount greater than zero and no greater than the available balance.",
  partial_must_be_less_than_balance: "A partial refund must be less than the remaining balance.",
  idempotency_conflict: "This request was already used with different details. Reload the history.",
  konnektive_credentials_missing: "Konnektive API credentials are missing on the server.",
  upstream_order_unavailable: "Konnektive could not find this order.",
  upstream_order_mismatch: "The Konnektive order ID did not match.",
  currency_mismatch: "The currency differs from Konnektive. Contact an administrator.",
  upstream_query_failed: "Could not check the balance in Konnektive. Try refreshing.",
  upstream_order_pending: "This order is still pending in Konnektive and cannot be refunded yet.",
  upstream_order_not_refundable: "This order is not eligible for a refund in Konnektive.",
};
const errorText = (code: string) => errors[code] ?? "Unable to complete the request. Refresh the history and retry the same request if needed.";
const button = "rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50";
const field = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white p-2 text-sm";

export default function OrderRefund({ orderId, orderNumber, platformKey }: { orderId: string; orderNumber: string; platformKey: string }) {
  const canRefund = useCan("orders:refund");
  const [open, setOpen] = useState(false);
  if (!canRefund || platformKey !== "konnektive") return null;
  return <div className="mt-3 border-t border-[var(--border)] pt-3">
    <button type="button" className={button} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide refund tools" : "Refund tools"}</button>
    {open && <RefundEditor orderId={orderId} orderNumber={orderNumber} />}
  </div>;
}

function RefundEditor({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const qc = useQueryClient();
  const key = ["order-refunds", orderId];
  const url = `/api/admin/orders/${encodeURIComponent(orderId)}/refunds`;
  const query = useQuery({ queryKey: key, queryFn: () => adminApi<Summary>(url), staleTime: 0 });
  const [kind, setKind] = useState<"full" | "partial">("partial");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: Submission) => adminApi<RecordRow>(url, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { setSubmission(null); setAttempted(false); setAmount(""); setReason(""); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
    retry: false,
  });
  if (query.isPending) return <p className="mt-3 text-sm">Loading refund history…</p>;
  if (query.isError) return <div role="alert" className="mt-3 text-sm">{errorText(query.error.message)} <button className={button} onClick={() => query.refetch()}>Retry</button></div>;
  const data = query.data;
  return <section className="mt-3 space-y-3 rounded-xl bg-[var(--surface)] p-3" aria-label={`Refund order ${orderNumber}`}>
    <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{data.mode === "live" ? "After processing, confirm the refund and remaining balance in the Konnektive panel." : data.mode === "mock" ? "MOCK MODE — no money will be returned." : "Refund processing is disabled."}</p>
    <p className="text-sm">{data.mode === "live" ? "Konnektive refundable balance" : "Simulation balance"}: <strong>{data.currency} {data.available}</strong>{data.mode === "mock" ? ` · Simulated refunds: ${data.currency} ${data.simulatedTotal}` : null}</p>
    {data.mode === "mock" && <p className="text-xs text-muted">Balance is based on the local order and simulated history; it has not been verified with Konnektive.</p>}
    {data.blockedReason && <p role="alert" className="text-sm text-rose-700">{errorText(data.blockedReason)}</p>}
    {mutation.data && <p role="status" className="text-sm font-semibold">{mutation.data.message} {mutation.data.status === "succeeded" && data.mode === "live" ? "Confirm this refund in the Konnektive panel." : null}</p>}
    {mutation.isError && <p role="alert" className="text-sm text-rose-700">{errorText(mutation.error.message)}</p>}
    {submission ? <div className="space-y-3 rounded-lg border border-amber-300 p-3">
      <p className="text-sm">Confirm {data.mode === "mock" ? "simulated " : ""}{submission.kind} refund of <strong>{data.currency} {submission.amount}</strong> for <strong>#{orderNumber}</strong>?</p>
      <p className="break-words text-sm">Reason: {submission.reason}</p>
      {attempted && <p className="text-xs">The same request ID prevents another API call. If the result is uncertain, check Konnektive before starting a new refund.</p>}
      <div className="flex gap-2"><button className={button} disabled={mutation.isPending} onClick={() => { setAttempted(true); mutation.mutate(submission); }}>{mutation.isPending ? "Processing…" : attempted ? "Check same request" : "Process refund"}</button>
      <button className={button} disabled={mutation.isPending} onClick={() => { setSubmission(null); setAttempted(false); mutation.reset(); query.refetch(); }}>{attempted ? "Back to history" : "Cancel"}</button></div>
    </div> : !data.blockedReason && <form className="space-y-3" onSubmit={e => {
      e.preventDefault(); mutation.reset(); setAttempted(false);
      setSubmission({ requestId: crypto.randomUUID(), kind, amount: kind === "full" ? data.available : amount, reason: reason.trim() });
    }}>
      <label className="block text-sm">Refund type<select className={field} value={kind} onChange={e => setKind(e.target.value as "full" | "partial")}><option value="partial">Partial amount</option><option value="full">Full remaining balance</option></select></label>
      {kind === "partial" && <label className="block text-sm">Amount ({data.currency})<input className={field} type="number" min="0.01" max={(Number(data.available) - 0.01).toFixed(2)} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>}
      <label className="block text-sm">Reason<textarea className={field} minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className={button} disabled={query.isFetching || reason.trim().length < 3}>Review refund</button>
    </form>}
    <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Refund history</h3><button type="button" className={button} onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</button></div>
      {!data.history.length && <p className="text-xs text-muted">No refunds processed here yet.</p>}
      {data.history.map(row => <div key={row.id} className="rounded-lg border border-[var(--border)] p-2 text-xs"><p className="font-semibold">{row.mode === "mock" ? "MOCK" : "Konnektive"} · {row.status} · {row.currency} {row.amount} · {row.kind}</p><p>{new Date(row.createdAt).toLocaleString()} · Operator {row.adminUserId}</p><p className="break-words">{row.reason}</p><p>{row.message}</p><p className="break-all text-muted">Request: {row.id}</p></div>)}
    </div>
  </section>;
}
