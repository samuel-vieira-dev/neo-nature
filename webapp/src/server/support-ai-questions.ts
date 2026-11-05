import { db } from "@/db";
import { supportAiQuestions } from "@/db/schema";
import { impersonatorId } from "./session";

/**
 * Best effort: a failed write never breaks the customer's answer. Staff viewing the app as a
 * customer are skipped so their test questions do not reach the reports.
 */
export async function recordAiQuestion(userId: string, entry: { question: string; source: "ai" | "search"; orderQuestion: boolean; related: string[] }) {
  try {
    if (await impersonatorId()) return;
    await db.insert(supportAiQuestions).values({ userId, question: entry.question.slice(0, 300), source: entry.source, orderQuestion: entry.orderQuestion, related: entry.related.slice(0, 5) });
  } catch (e) {
    console.error("[faq-ask] could not record question", e instanceof Error ? e.message : "unknown");
  }
}
