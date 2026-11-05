import { withUser } from "@/server/session";
import { webappKnowledge } from "@/server/support-knowledge";
export const GET = withUser(async () => Response.json({ articles: await webappKnowledge() }));
