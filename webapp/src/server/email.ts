// ---------------------------------------------------------------------------
// Transactional email via Resend (REST API — no SDK dependency).
// Credential-gated: with RESEND_API_KEY + EMAIL_FROM set, real emails go out.
// Without them, callers fall back to showing the code (bridge for testing).
// ---------------------------------------------------------------------------

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** Sends the login code. Returns true on success, false on any failure. */
export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#065f46;margin:0 0 8px">Your Neo Nature login code</h2>
      <p style="color:#52615a;margin:0 0 16px">Enter this code to sign in. It expires in 10 minutes.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#17251d;background:#f6f8f7;border-radius:14px;padding:18px;text-align:center">${code}</div>
      <p style="color:#93a89f;font-size:12px;margin:16px 0 0">If you didn't request this, you can ignore this email.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `${code} is your Neo Nature login code`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send threw:", e);
    return false;
  }
}
