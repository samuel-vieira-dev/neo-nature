import { withUser } from "@/server/session";
import { publishedKnowledge } from "@/server/support-knowledge";
export const GET = withUser(async () => Response.json({ articles: await publishedKnowledge("webapp") }));
