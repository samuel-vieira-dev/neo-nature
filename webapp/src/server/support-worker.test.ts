import { afterEach, expect, it, vi } from "vitest";
import { runTicks } from "../../ops/support-email-worker/tick.mjs";
afterEach(()=>vi.unstubAllEnvs());
it("covers five minute slots sequentially and keeps polling after a transient failure",async()=>{
  vi.stubEnv("SUPPORT_EMAIL_APP_URL","https://app.example.com");vi.stubEnv("SUPPORT_EMAIL_JOB_KEY","test-only");
  let clock=0;const starts:number[]=[];let active=0;let maxActive=0;
  const fetcher=vi.fn(async()=>{starts.push(clock);active++;maxActive=Math.max(maxActive,active);clock+=500;active--;return starts.length===2 ? Response.json({},{status:503}) : Response.json({mode:"pilot",processed:1});});
  const ok=await runTicks({fetcher,now:()=>clock,wait:async(ms:number)=>{clock+=ms;},log:vi.fn(),logError:vi.fn()});
  expect(ok).toBe(false);expect(starts).toEqual([0,60000,120000,180000,240000]);expect(maxActive).toBe(1);expect(fetcher).toHaveBeenCalledTimes(5);
});
it("does not send the worker key over HTTP",async()=>{
  vi.stubEnv("SUPPORT_EMAIL_APP_URL","http://example.com");vi.stubEnv("SUPPORT_EMAIL_JOB_KEY","test-only");const fetcher=vi.fn();
  await expect(runTicks({fetcher})).rejects.toThrow("HTTPS");expect(fetcher).not.toHaveBeenCalled();
});
