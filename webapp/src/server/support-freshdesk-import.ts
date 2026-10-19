import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { supportEmailConversations as tickets, supportEmailMessages as messages, supportTicketAttachments as files } from "@/db/schema";
import { deterministicTier } from "./support-email-contract";

type Attachment = { id:number; name:string; content_type:string; size:number; attachment_url:string };
export type LegacyTicket = { id:number;subject:string;description_text?:string;description?:string;status:number;created_at:string;updated_at:string;requester?:{email?:string;name?:string};attachments?:Attachment[] };
export type LegacyMessage = { id:number;body_text?:string;body?:string;incoming:boolean;private:boolean;created_at:string;attachments?:Attachment[] };
const plain = (value:string) => value.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&");
const ticketStatus = (value:number) => ({2:"open",3:"pending",4:"resolved",5:"closed"} as Record<number,string>)[value] || "on_hold";
export async function importFreshdeskTicket(ticket:LegacyTicket, history:LegacyMessage[], download:(a:Attachment)=>Promise<Uint8Array>) {
  if(!Number.isSafeInteger(ticket.id)) throw new Error(`legacy_ticket_${ticket.id}_requester_missing`);
  const initialText=ticket.description_text || plain(ticket.description || ticket.subject);
  const all=[{ id:0,body_text:initialText,incoming:true,private:false,created_at:ticket.created_at,attachments:ticket.attachments ?? [] },...history].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id-b.id);
  // Fetch attachment data before the short database transaction. Do not forward API credentials.
  const attachments:{key:string;messageKey:string;name:string;type:string;bytes:Uint8Array}[]=[];
  for(const message of all) for(const file of message.attachments ?? []) {
    const key=`freshdesk:${ticket.id}:${message.id}:${file.id}`;
    const existing=await db.query.supportTicketAttachments.findFirst({where:eq(files.sourceKey,key),columns:{id:true}});
    if(!existing) attachments.push({key,messageKey:`freshdesk-import:${ticket.id}:${message.id}`,name:file.name,type:file.content_type,bytes:await download(file)});
  }
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`freshdesk-import:${ticket.id}`}))`);
    let c=await tx.query.supportEmailConversations.findFirst({where:eq(tickets.freshdeskId,ticket.id)});
    if(!c) {
      const id=crypto.randomUUID(); const tier=deterministicTier(`${ticket.subject}\n${initialText}`);
      [c]=await tx.insert(tickets).values({id,ticketNumber:-ticket.id,mailboxId:"local",threadId:`local:${id}`,email:ticket.requester?.email?.toLowerCase() || "",name:ticket.requester?.name || "",subject:ticket.subject,tier,source:"freshdesk",owner:"human",requiresHuman:!["resolved","closed","pending"].includes(ticketStatus(ticket.status)),ticketStatus:ticketStatus(ticket.status),freshdeskId:ticket.id,createdAt:new Date(ticket.created_at),updatedAt:new Date(ticket.updated_at),escalationReason:tier==="T3" ? "T3 requires a human response" : "Imported support ticket"}).returning();
    }
    let latest=c.latestMessageId; let lastTime=new Date(0);
    if(latest) {const current=await tx.query.supportEmailMessages.findFirst({where:eq(messages.id,latest)});if(current?.direction==="incoming")lastTime=current.receivedAt;}
    for(const message of all) {
      const key=`freshdesk-import:${ticket.id}:${message.id}`;
      let saved=await tx.query.supportEmailMessages.findFirst({where:eq(messages.dedupeKey,key)});
      if(!saved) [saved]=await tx.insert(messages).values({id:crypto.randomUUID(),conversationId:c.id,dedupeKey:key,providerMessageId:`freshdesk-${ticket.id}-${message.id}`,authorAdminId:message.incoming ? null : "legacy-freshdesk",direction:message.private ? "note" : message.incoming ? "incoming" : "outgoing",subject:ticket.subject,text:message.body_text || plain(message.body || ""),receivedAt:new Date(message.created_at),createdAt:new Date(message.created_at)}).returning();
      if(message.incoming && !message.private && saved.receivedAt>=lastTime) {latest=saved.id;lastTime=saved.receivedAt;}
      for(const file of attachments.filter(a=>a.messageKey===key)) await tx.insert(files).values({id:crypto.randomUUID(),messageId:saved.id,sourceKey:file.key,filename:file.name,contentType:file.type,size:file.bytes.length,data:Buffer.from(file.bytes).toString("base64")}).onConflictDoNothing({target:files.sourceKey});
    }
    await tx.update(tickets).set({freshdeskImportUpdatedAt:new Date(ticket.updated_at)}).where(eq(tickets.id,c.id));
    // Existing operational tickets keep their current status/owner; imports only fill missing history.
    if(latest!==c.latestMessageId) await tx.update(tickets).set({latestMessageId:latest}).where(eq(tickets.id,c.id));
    return {id:c.id,legacyId:ticket.id,messageCount:all.length,attachmentCount:attachments.length};
  });
}
