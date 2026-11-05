import { withUser } from "@/server/session";
import { publishedEbooks } from "@/server/content-ebooks";
export const GET = withUser(async user => Response.json({ ebooks: await publishedEbooks(user.id) }));
