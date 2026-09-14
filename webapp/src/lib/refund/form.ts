import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import initialForm from "./default-form.json";

const blockSchema = z.object({
  id: z.string().min(1), type: z.enum(["copy", "text", "email", "tel", "date", "textarea", "choice", "checkbox", "file"]),
  label: z.string().min(1).max(8000), required: z.boolean().optional(),
  minLength: z.number().int().min(0).max(4000).optional(), noFuture: z.boolean().optional(),
  accept: z.enum(["image", "video"]).optional(), maxMB: z.number().min(1).max(20).optional(),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(1000) })).max(30).optional(),
});
export const formSchema = z.object({
  title: z.string().min(1).max(200),
  pages: z.array(z.object({ id: z.string(), thankYou: z.boolean(), blocks: z.array(blockSchema).max(30),
    rules: z.array(z.object({ operator: z.enum(["AND", "OR"]),
      conditions: z.array(z.object({ field: z.string(), value: z.string() })).min(1),
      target: z.string().nullable(), stop: z.boolean(),
    })).max(20),
  })).min(1).max(50),
}).superRefine((form, ctx) => {
  const pages = new Set(form.pages.map(p => p.id));
  const blocks = form.pages.flatMap(p => p.blocks);
  if (pages.size !== form.pages.length || new Set(blocks.map(b => b.id)).size !== blocks.length)
    ctx.addIssue({ code: "custom", message: "Duplicate IDs" });
  for (const page of form.pages) {
    for (const block of page.blocks) {
      if (["choice", "checkbox"].includes(block.type) && (!block.options?.length || new Set(block.options.map(o => o.id)).size !== block.options.length))
        ctx.addIssue({ code: "custom", message: "Invalid options" });
    }
    for (const rule of page.rules) {
      if (rule.target && (!pages.has(rule.target) || form.pages.findIndex(p => p.id === rule.target) <= form.pages.indexOf(page))) {
        // The original Tally sends declined terms back to its earlier guidance page.
        if (!(page.id === "a24f90d4-096c-489f-83c9-783886cc1c87" && rule.target === "a3061a0b-d8da-4ce7-86a0-973fd0db9b38"))
          ctx.addIssue({ code: "custom", message: "Invalid or cyclic destination" });
      }
      for (const c of rule.conditions) if (!blocks.find(b => b.id === c.field)?.options?.some(o => o.id === c.value))
        ctx.addIssue({ code: "custom", message: "Invalid condition" });
    }
  }
});
export type RefundForm = z.infer<typeof formSchema>;
export type RefundBlock = z.infer<typeof blockSchema>;
export type Answers = Record<string, string>;
export const defaultRefundForm = formSchema.parse(initialForm);
export const EMAIL_FIELD = "064443f2-715f-445b-8267-2bd0da65b1ab";
export const NAME_FIELD = "229022c9-ba5b-4890-b807-15f6831420ef";
export const PHONE_FIELD = "b1a9887d-4a90-41da-80e0-5a912d17649f";
export const ORDER_FIELD = "38e6f077-f106-40a1-821e-2dbc2cdc9422";
export const REFUND_END = "43d546d5-3a56-434b-b95a-d8a7dda2f5e7";
export function nextPage(form: RefundForm, pageId: string, answers: Answers) {
  const index = form.pages.findIndex(p => p.id === pageId);
  const page = form.pages[index];
  if (!page || page.thankYou) return null;
  for (const rule of page.rules) {
    const matches = rule.conditions.map(c => answers[c.field] === c.value);
    if (rule.operator === "AND" ? matches.every(Boolean) : matches.some(Boolean)) {
      if (rule.stop) return null;
      if (rule.target) return rule.target;
    }
  }
  return form.pages[index + 1]?.id ?? null;
}
export function refundProgressOutcome(form: RefundForm, pageId: string, answers: Answers): "draft" | "blocked" {
  const page = form.pages.find(p => p.id === pageId);
  if (!page || page.thankYou) return "draft";
  return page.rules.some(rule => {
    const matches = rule.conditions.map(c => answers[c.field] === c.value);
    return rule.stop && (rule.operator === "AND" ? matches.every(Boolean) : matches.some(Boolean));
  }) ? "blocked" : "draft";
}
export function fieldError(block: RefundBlock, value = "") {
  if (block.type === "copy") return null;
  if (!value.trim()) return block.required ? "Please complete this field." : null;
  if (value.length > (block.type === "textarea" ? 4000 : 1000)) return "Your answer is too long.";
  if (block.minLength && value.trim().length < block.minLength) return `Please enter at least ${block.minLength} characters.`;
  if (block.type === "email" && !z.email().safeParse(value).success) return "Please enter a valid email.";
  if (block.type === "tel" && !isValidPhoneNumber(value)) return "Please enter a valid phone number including the country code (e.g. +1).";
  if (block.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value || (block.noFuture && value > new Date().toISOString().slice(0,10)))) return "Please enter a valid purchase date, not in the future.";
  if ((block.type === "choice" || block.type === "checkbox") && !block.options?.some(o => o.id === value)) return "Please select an option.";
  if (block.type === "file" && !z.uuid().safeParse(value).success) return "Please upload a file.";
  return null;
}
/** Walk the actual branch on the server; never trust client-supplied hidden answers or completion. */
export function validateSubmission(form: RefundForm, answers: Answers) {
  const clean: Answers = {};
  const visited = new Set<string>();
  let id: string | null = form.pages[0].id;
  while (id) {
    if (visited.has(id)) return { ok: false as const, error: "invalid_flow" };
    visited.add(id);
    const page = form.pages.find(p => p.id === id);
    if (!page) return { ok: false as const, error: "invalid_flow" };
    if (page.thankYou) return { ok: true as const, answers: clean, outcome: id === REFUND_END ? "refund" : "retained", endPage: id };
    for (const b of page.blocks.filter(b => b.type !== "copy")) {
      const error = fieldError(b, answers[b.id]);
      if (error) return { ok: false as const, error, field: b.id };
      if (answers[b.id]) clean[b.id] = answers[b.id].trim();
    }
    id = nextPage(form, page.id, clean);
  }
  return { ok: false as const, error: "This path does not submit a refund request. Please contact support for help." };
}
export type RefundResponse = { version: number; form: RefundForm; answers: Answers; outcome: string; endPage: string };
export function responseDescription(response: RefundResponse) {
  return response.form.pages.flatMap(p => p.blocks).filter(b => response.answers[b.id]).map(b => {
    const value = response.answers[b.id];
    return `${b.label}\n${b.type === "file" ? "Attachment available in the admin refund request." : b.options?.find(o => o.id === value)?.label ?? value}`;
  }).join("\n\n");
}
