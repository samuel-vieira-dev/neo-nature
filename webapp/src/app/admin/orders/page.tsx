import OrdersPanel from "@/components/admin/OrdersPanel";

export default function OrdersPage() {
  return <div>
    <h1 className="font-display text-2xl font-bold">Orders</h1>
    <p className="mb-5 mt-1 text-sm text-muted">Find an order, review its details and send the refund form to the customer.</p>
    <OrdersPanel initial={{}} />
  </div>;
}
