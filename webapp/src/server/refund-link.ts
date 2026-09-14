import { SignJWT, jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(`neo-nature-refund-link:${process.env.SESSION_SECRET ?? "dev-secret-change-me"}`);

export async function createRefundLinkToken(orderId: string): Promise<string> {
  return new SignJWT({ oid: orderId, scope: "refund_link" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(secret());
}

export async function verifyRefundLinkToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.scope === "refund_link" && typeof payload.oid === "string" ? payload.oid : null;
  } catch {
    return null;
  }
}

export async function createRefundEmailUrl(orderId: string, origin = process.env.PUBLIC_APP_URL || "https://app.beneonature.com") {
  const token = await createRefundLinkToken(orderId);
  return `${origin.replace(/\/$/, "")}/refund/access?token=${encodeURIComponent(token)}`;
}
