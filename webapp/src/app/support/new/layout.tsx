import PurchaseEmailGate from "@/components/PurchaseEmailGate";
export default function NewTicketLayout({ children }: { children: React.ReactNode }) {
  return <PurchaseEmailGate>{children}</PurchaseEmailGate>;
}
