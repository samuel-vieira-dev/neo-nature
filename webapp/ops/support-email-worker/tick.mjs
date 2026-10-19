import { pathToFileURL } from 'node:url';

// Railway cron has a five-minute minimum. Each run covers minutes 0–4.
// A tick times out before the next minute; calls never overlap in this process.
export async function runTicks({ count = 5, intervalMs = 60_000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, fetcher = fetch, log = console.log, logError = console.error } = {}) {
  const base = process.env.SUPPORT_EMAIL_APP_URL;
  const key = process.env.SUPPORT_EMAIL_JOB_KEY;
  if (!base || !key) throw new Error('Support email worker configuration is missing.');
  const url = new URL('/api/jobs/support-email', base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS is required');
  const started = now(); let failed = false;
  for (let tick = 0; tick < count; tick++) {
    if (tick > 0) await wait(Math.max(0, started + tick * intervalMs - now()));
    try {
      const response = await fetcher(url, { method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55_000), redirect: 'error' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || !Number.isInteger(result.processed) || result.processed < 0) throw new Error(`Worker endpoint failed (${response.status})`);
      log(JSON.stringify({ mode: result.mode, processed: result.processed }));
    } catch (error) {
      failed = true; logError(error instanceof Error ? error.message : 'Support email worker failed');
    }
  }
  return !failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTicks({ count: process.argv.includes('--once') ? 1 : 5 }).then(ok => { if (!ok) process.exitCode = 1; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
