import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, bottles } from "@/db/schema";
import { createSession } from "@/server/session";
import { productById } from "@/lib/data";

// Fixed test account: signing in with this email logs straight in as "Samuel".
const DEMO_EMAIL = "demo@neonatura.com";
const DEMO_ID = "demo-samuel";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = (body?.email ?? "").toLowerCase().trim();
  if (email !== DEMO_EMAIL) return Response.json({ error: "not_demo" }, { status: 403 });

  let user = await db.query.users.findFirst({ where: eq(users.id, DEMO_ID) });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        id: DEMO_ID,
        email: DEMO_EMAIL,
        name: "Samuel",
        fullName: "Samuel",
        niche: "mens_health",
        onboardedAt: new Date(),
      })
      .returning();

    // give the test account an active bottle so the Home dose/streak flow works
    const product = productById("heroup");
    if (product) {
      await db.insert(bottles).values({
        userId: DEMO_ID,
        productId: product.id,
        capsules: product.capsules,
        dosePerDay: product.dosePerDay,
        openedAt: new Date(),
      });
    }
  }

  await createSession(user.id);
  return Response.json({ ok: true });
}
