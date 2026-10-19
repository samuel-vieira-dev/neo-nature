import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminActionLogs, adminUsers, supportEmailTone } from "@/db/schema";
import type { AdminContext } from "./admin";
import { supportEmailConfig } from "./support-email-contract";

export const toneInputSchema = z.object({ instructions: z.string().max(4000).trim(), avoidInstructions: z.string().max(4000).trim().optional(), minDelayMinutes: z.number().int().min(1).max(1440).optional(), maxDelayMinutes: z.number().int().min(1).max(1440).optional(), version: z.number().int().min(0) }).strict().refine(s => s.minDelayMinutes === undefined || s.maxDelayMinutes === undefined || s.maxDelayMinutes >= s.minDelayMinutes, { message: "invalid_delay_range" });
export async function readSupportEmailTone() {
  const [row] = await db.select({ instructions: supportEmailTone.instructions, avoidInstructions: supportEmailTone.avoidInstructions, minDelayMinutes: supportEmailTone.minDelayMinutes, maxDelayMinutes: supportEmailTone.maxDelayMinutes, version: supportEmailTone.version, updatedAt: supportEmailTone.updatedAt, updatedBy: adminUsers.name }).from(supportEmailTone).leftJoin(adminUsers, eq(supportEmailTone.updatedBy, adminUsers.id)).where(eq(supportEmailTone.id, "default"));
  const config = supportEmailConfig();
  return { instructions: row?.instructions ?? "", avoidInstructions: row?.avoidInstructions ?? "", minDelayMinutes: row?.minDelayMinutes ?? config.minDelay, maxDelayMinutes: row?.maxDelayMinutes ?? config.maxDelay, version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}
export function voicePreferences(tone: { instructions: string; avoidInstructions: string }) {
  return `${tone.instructions}${tone.avoidInstructions ? `\n\nAVOID (writing style only):\n${tone.avoidInstructions}` : ""}`;
}
export async function saveSupportEmailTone(input: z.infer<typeof toneInputSchema>, admin: AdminContext) {
  const parsed = toneInputSchema.parse(input);
  return db.transaction(async tx => {
    const [current] = await tx.select().from(supportEmailTone).where(eq(supportEmailTone.id, "default"));
    const config = supportEmailConfig();
    const values = { instructions: parsed.instructions, avoidInstructions: parsed.avoidInstructions ?? current?.avoidInstructions ?? "", minDelayMinutes: parsed.minDelayMinutes ?? current?.minDelayMinutes ?? config.minDelay, maxDelayMinutes: parsed.maxDelayMinutes ?? current?.maxDelayMinutes ?? config.maxDelay, version: parsed.version + 1, updatedBy: admin.id, updatedAt: new Date() };
    if (values.maxDelayMinutes < values.minDelayMinutes) throw Response.json({ error: "invalid_delay_range" }, { status: 400 });
    const rows = parsed.version === 0
      ? await tx.insert(supportEmailTone).values({ id: "default", ...values }).onConflictDoNothing().returning()
      : await tx.update(supportEmailTone).set(values).where(and(eq(supportEmailTone.id, "default"), eq(supportEmailTone.version, parsed.version))).returning();
    if (!rows.length) throw Response.json({ error: "tone_changed_reload_before_saving" }, { status: 409 });
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: "support-email.tone-updated", metadata: { adminEmail: admin.email, ...values } });
    return { ...values, updatedBy: admin.name };
  });
}
