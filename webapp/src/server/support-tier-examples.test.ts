import { expect, it } from "vitest";
import examples from "@/lib/support-tier-examples.json";
import { deterministicTier, requiredHumanHandoff } from "./support-email-contract";
import { validateEmailDecision, emailAgentInstructions, type SupportEmailContext } from "./support-email-ai";
it.each(examples)("classifies $tier: $subject", sample => {
  expect(deterministicTier(`${sample.subject}\n${sample.body}`)).toBe(sample.tier);
  if(sample.tier==="T3") expect(requiredHumanHandoff(sample.body+sample.subject)).toBeTruthy();
});
const context:SupportEmailContext={subject:"Where is order A12345?",incoming:"Please send tracking",history:[],hasAttachments:false,orders:[{number:"A12345",product:"Product",status:"shipped",trackingCode:"ABC123456789",trackingUrl:"https://tracking.example/ABC123456789"}],refundUrl:null,selectedOrderNumber:"A12345"};
const draft={tier:"T1",language:"en",intent:"tracking",needsHuman:false,reason:"",reply:"Your order is on its way."};
it("includes both the verified code and link in a tracking answer",()=>{
  const result=validateEmailDecision(draft,context);
  expect(result.reply).toContain("ABC123456789");expect(result.reply).toContain(context.orders[0].trackingUrl);
});
it("never silently chooses the only order when a different order was requested",()=>{
  const result=validateEmailDecision({...draft,reply:`Track here: ${context.orders[0].trackingUrl}`},{...context,selectedOrderNumber:null});
  expect(result).toMatchObject({needsHuman:true,reply:""});
});
it("flags a model-generated T3 even if the model requests automatic delivery",()=>{
  expect(validateEmailDecision({...draft,tier:"T3"},context)).toMatchObject({needsHuman:true,reply:""});
});
it("keeps staff-only address changes and supplement interactions out of automated execution",()=>{
  expect(requiredHumanHandoff("Please update my shipping address")).toBeTruthy();
  expect(requiredHumanHandoff("Are there contraindications between these supplements?")).toBeTruthy();
});

it("does not include the old FAQ when published knowledge is supplied",()=>{
  const prompt=emailAgentInstructions("",[{id:"refund",title:"Refund",content:"Only use the verified request form."}]);
  expect(prompt).not.toContain("process it within 48 hours");expect(prompt).toContain("Only use the verified request form.");
});
it("blocks invented deadlines and false refund execution",()=>{
  expect(validateEmailDecision({...draft,intent:"faq",reply:"Your delivery will arrive in 3-5 business days."},{...context,knowledge:[]})).toMatchObject({needsHuman:true,reply:""});
  expect(validateEmailDecision({...draft,intent:"refund",reply:"We have processed your refund."},context)).toMatchObject({needsHuman:true,reply:""});
});
