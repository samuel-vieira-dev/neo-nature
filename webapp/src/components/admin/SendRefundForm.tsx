"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Mail, X } from "lucide-react";
import { useCan } from "@/components/AdminProvider";

type Notice = { message: string; success: boolean };

export default function SendRefundForm({ orderId, email }: { orderId: string; email: string }) {
  const canSend = useCan("orders:send-refund-form");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund-form`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      const recipient = typeof body.email === "string" ? body.email : email;
      if (response.ok && body.ok === true) {
        setNotice({ success: true, message: `Form de refund enviado para ${recipient}.` });
      } else {
        const reason = body.error === "integration_not_configured" ? "Integração não concluida"
          : body.error === "invalid_email" ? "E-mail do cliente inválido"
          : response.status === 403 || response.status === 401 ? "Acesso não autorizado. Entre novamente"
          : response.status === 404 ? "Pedido não encontrado"
          : "Não foi possível confirmar o envio. Tente novamente";
        setNotice({ success: false, message: `Erro ao enviar form para ${recipient || "cliente sem e-mail"}. ${reason}` });
      }
    } catch {
      setNotice({ success: false, message: `Erro ao enviar form para ${email}. Verifique sua conexão e tente novamente` });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!canSend) return null;
  return <div className="mt-4 border-t border-[var(--border)] pt-4">
    <p className="mb-2 text-sm text-muted">Enviar o link personalizado do formulário de refund para <strong className="break-all">{email || "cliente sem e-mail"}</strong>.</p>
    <button type="button" disabled={busy || !email.trim()} onClick={send} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
      {busy ? "Enviando…" : "Enviar form de refund"}
    </button>
    {notice && <div role={notice.success ? "status" : "alert"} className={`fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-2xl border p-4 shadow-lg sm:w-[440px] ${notice.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {notice.success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
      <p className="min-w-0 flex-1 break-words text-sm font-medium">{notice.message}</p>
      <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="shrink-0 rounded p-1 hover:bg-black/5"><X className="h-4 w-4" /></button>
    </div>}
  </div>;
}
