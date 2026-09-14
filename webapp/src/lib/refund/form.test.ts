import { describe, it, expect } from "vitest";
import { defaultRefundForm as form, fieldError, formSchema, nextPage, refundProgressOutcome, validateSubmission, type Answers, ORDER_FIELD, REFUND_END } from "./form";
const received = "16ff6e58-b11c-4371-9fc8-799284facf10";
const used = "a6d1ca4d-c089-4119-bc75-a59e2eaf807f";
const terms = "c7ec8a28-a60a-4415-9a0f-7cc6fabf1648";
const choice = "5b18b567-90b9-4139-b009-180cae120d0b";
function answerSet(): Answers {
  const answers: Answers = {};
  for(const b of form.pages.flatMap(p=>p.blocks)) {
    if(b.type === "copy") continue;
    answers[b.id] = b.options?.[0]?.id ?? (b.type === "email" ? "customer@example.com" : b.type === "tel" ? "+14155552671" : b.type === "date" ? "2026-08-01" : b.type === "file" ? "8bc1c54e-7597-4084-8b67-50ab0232261e" : "A detailed answer about the product.");
  }
  answers[used] = "55e507a6-f4fe-4746-b8cb-da4f72a3dc17";
  answers[choice] = "992e1fe1-690c-4a4b-9f04-ef8f13961033";
  answers[ORDER_FIELD] = "95RZ48EC";
  return answers;
}
describe("native refund form",()=>{
  it("imports every question, all attachments and the Tally navigation",()=>{
    expect(formSchema.safeParse(form).success).toBe(true);
    expect(form.pages.flatMap(p=>p.blocks).filter(b=>b.type === "file")).toHaveLength(5);
    const result = validateSubmission(form,answerSet());
    expect(result).toMatchObject({ok:true,outcome:"refund",endPage:REFUND_END});
  });
  it("accepts real alphanumeric order numbers",()=>{
    expect(fieldError(form.pages.flatMap(p=>p.blocks).find(b=>b.id === ORDER_FIELD)!,"95RZ48EC")).toBeNull();
  });
  it("rejects incomplete requests even if hidden later answers are supplied",()=>{
    const answers = answerSet(); delete answers[ORDER_FIELD];
    expect(validateSubmission(form,answers)).toMatchObject({ok:false,field:ORDER_FIELD});
  });
  it("requires all four photos and the video for the full refund branch",()=>{
    for(const b of form.pages.flatMap(p=>p.blocks).filter(b=>b.type === "file")) {
      const answers = answerSet();delete answers[b.id];
      expect(validateSubmission(form,answers)).toMatchObject({ok:false,field:b.id});
    }
  });
  it("ends undelivered, declined terms, and short-use branches without submitting",()=>{
    for(const [field,value] of [[received,"0e7f81b7-fa2b-480f-8f27-ab54154b9817"],[terms,"ca0b317b-65f6-4419-8e95-24da4fd96dc8"],[used,"400bbcd7-9751-426b-ab73-0f7b2b4e307b"],[used,"adc64ae1-7b53-4575-aec3-79ce9feac044"],[used,"4a7aa9df-76a8-4c32-af10-ca8c522c6d77"]]) {
      expect(validateSubmission(form,{...answerSet(),[field]:value}).ok).toBe(false);
    }
  });
  it("marks a stopped branch as blocked while ordinary incomplete progress remains draft",()=>{
    const page = form.pages.find(p=>p.blocks.some(b=>b.id === received))!;
    const blockedAnswers = {...answerSet(),[received]:"0e7f81b7-fa2b-480f-8f27-ab54154b9817"};
    expect(refundProgressOutcome(form,nextPage(form,page.id,blockedAnswers)!,blockedAnswers)).toBe("blocked");
    expect(refundProgressOutcome(form,page.id,{...answerSet(),[received]:"16ff6e58-b11c-4371-9fc8-799284facf10"})).toBe("draft");
  });
  it("records retention without requiring or retaining the skipped refund answers",()=>{
    const result = validateSubmission(form,{...answerSet(),[choice]:"4f5310e7-1c49-4c40-a939-d8527654c6ce", forged:"malicious"});
    expect(result).toMatchObject({ok:true,outcome:"retained"});
    if(result.ok) {
      expect(result.answers.forged).toBeUndefined();
      const video = form.pages.flatMap(p=>p.blocks).find(b=>b.accept === "video")!;
      expect(result.answers[video.id]).toBeUndefined();
    }
  });
  it("validates email, phone, dates, option IDs and minimum text lengths",()=>{
    for(const type of ["email","tel","date","choice","textarea"]){
      const field = form.pages.flatMap(p=>p.blocks).find(b=>b.type === type)!;
      expect(fieldError(field,"x")).toBeTruthy();
    }
    const date = form.pages.flatMap(p=>p.blocks).find(b=>b.type === "date")!;
    expect(fieldError(date,"2026-02-30")).toBeTruthy();
    expect(fieldError(date,"2999-01-01")).toBeTruthy();
  });
  it("takes the updated branch when an earlier answer changes",()=>{
    const page = form.pages.find(p=>p.blocks.some(b=>b.id === received))!;
    expect(nextPage(form,page.id,answerSet())).toBe("22c7cb77-af09-4781-ab97-e01377c53f8c");
    expect(nextPage(form,page.id,{...answerSet(),[received]:"0e7f81b7-fa2b-480f-8f27-ab54154b9817"})).toBe("a3061a0b-d8da-4ce7-86a0-973fd0db9b38");
  });
  it("rejects invalid admin navigation and ambiguous IDs",()=>{
    const invalid = structuredClone(form);invalid.pages[0].rules.push({operator:"AND",conditions:[{field:received,value:"missing"}],target:"missing",stop:false});
    expect(formSchema.safeParse(invalid).success).toBe(false);
    invalid.pages[1].id = invalid.pages[0].id;
    expect(formSchema.safeParse(invalid).success).toBe(false);
  });
});
