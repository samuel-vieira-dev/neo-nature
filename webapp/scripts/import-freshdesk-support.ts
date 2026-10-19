/** Read-only on Freshdesk; idempotent local import. Does not send emails. */
import { sql } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { tickets as appTickets, supportEmailConversations as conversationsTable } from "../src/db/schema";
import { bridgeAppTicket } from "../src/server/support-ticket-bridge";
import { importFreshdeskTicket, type LegacyTicket, type LegacyMessage } from "../src/server/support-freshdesk-import";

async function main() {
  const domain=process.env.FRESHDESK_DOMAIN;const key=process.env.FRESHDESK_API_KEY;
  if(!domain || !/^[a-z0-9-]+$/i.test(domain) || !key) throw new Error("freshdesk_credentials_not_configured");
  const base=`https://${domain}.freshdesk.com`;
  const auth=`Basic ${Buffer.from(`${key}:X`).toString("base64")}`;
  const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  async function get(path:string):Promise<unknown> {
    for(let attempt=0;attempt<6;attempt++) {
      const response=await fetch(base+path,{headers:{Authorization:auth},signal:AbortSignal.timeout(30000),redirect:"error"});
      if(response.status===429) { console.log("Freshdesk rate limit; waiting before retry.");await pause(Math.min(60000,Math.max(1000,Number(response.headers.get("retry-after") || "30")*1000)));continue; }
      if(!response.ok) throw new Error(`freshdesk_import_http_${response.status}`);
      return response.json();
    }
    throw new Error("freshdesk_import_rate_limit_retry_exhausted");
  }
  const local=await db.select().from(appTickets).where(sql`not exists (select 1 from support_email_conversations c where c.legacy_ticket_id=${appTickets.id})`);
  for(const t of local) await bridgeAppTicket(t,undefined,true);
  console.log(`Bridged ${local.length} app tickets.`);
  let imported=0,conversations=0,attachments=0;
  const since=process.env.SUPPORT_IMPORT_SINCE || "2000-01-01T00:00:00Z";
  for(let page=1;page<=300;page++) {
    const rows=await get(`/api/v2/tickets?include=requester,description&per_page=100&order_by=created_at&order_type=asc&updated_since=${encodeURIComponent(since)}&page=${page}`) as LegacyTicket[];
    if(!Array.isArray(rows)) throw new Error("legacy_ticket_list_invalid");
    console.log(`Freshdesk page ${page}: ${rows.length} tickets`);
    const checkpoints=await db.select({freshdeskId:conversationsTable.freshdeskId,updatedAt:conversationsTable.freshdeskImportUpdatedAt}).from(conversationsTable).where(sql`${conversationsTable.freshdeskImportUpdatedAt} is not null`);
    const completed=new Map(checkpoints.map(c=>[c.freshdeskId,c.updatedAt]));
    async function importTicket(t:LegacyTicket) {
      if((completed.get(t.id)?.getTime() ?? 0)>=new Date(t.updated_at).getTime()) {imported++;return;}
      let history:LegacyMessage[]=[];
      for(let p=1;p<=1000;p++) {
        const batch=await get(`/api/v2/tickets/${t.id}/conversations?per_page=100&page=${p}`) as LegacyMessage[];
        if(!Array.isArray(batch)) throw new Error("legacy_conversation_list_invalid");
        history=history.concat(batch);if(batch.length===0) break;
        if(p===1000) throw new Error(`legacy_ticket_${t.id}_conversation_limit`);
      }
      const importOne=()=>importFreshdeskTicket(t,history,async file=>{
        const url=new URL(file.attachment_url);
        const allowed=url.protocol==="https:" && ["freshdesk.com","freshworks.com","amazonaws.com"].some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`));
        if(!allowed || url.username || url.password || file.size>20*1024*1024) throw new Error(`legacy_attachment_${file.id}_unsupported`);
        const response=await fetch(url,{headers:url.origin===base ? {Authorization:auth} : {},signal:AbortSignal.timeout(30000),redirect:"error"});
        if(!response.ok) throw new Error(`legacy_attachment_${file.id}_http_${response.status}`);
        const chunks:Uint8Array[]=[];let size=0;
        const reader=response.body!.getReader();
        for(;;) {const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.length;if(size>20*1024*1024){await reader.cancel();throw new Error("legacy_attachment_too_large");}chunks.push(chunk);}
        return Buffer.concat(chunks);
      });
      let result:Awaited<ReturnType<typeof importOne>>|undefined;
      for(let attempt=0;attempt<3;attempt++) {try {result=await importOne();break;} catch(error) {if(attempt===2)throw error;console.log("Retrying an idempotent ticket import after a connection error.");await pause(2000);}}
      if(!result)throw new Error("ticket_import_not_confirmed");
      imported++;conversations+=result.messageCount;attachments+=result.attachmentCount;
      if(imported%10===0) console.log(JSON.stringify({imported,conversations,attachments}));
    }
    let next=0; const failures:string[]=[];
    await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
      while(next<rows.length) {const t=rows[next++];try {await importTicket(t);}catch(error){failures.push(`${t.id}: ${error instanceof Error ? error.message : "import_failed"}`);}}
    }));
    if(failures.length) throw new Error(`Incomplete ticket imports: ${failures.join("; ")}`);
    if(rows.length===0) {console.log(JSON.stringify({complete:true,imported,conversations,attachments}));return;}
  }
  throw new Error("freshdesk_page_limit_reached_do_not_cut_over");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>rawSql.end());
