// E2E companion to scripts/verify-reader-back-scroll.mjs — drives a real
// browser through fieldy's exact report: highlight v3, scroll to v12, open
// v12's page, press Back → must be looking at the same view.
//
//   BASE_URL=http://localhost:5173 node tests/reader-back-scroll.e2e.mjs
//   (needs `npm i -D playwright`; CHROMIUM_PATH=... to use an existing Chromium)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];

async function view(page) {
  return page.evaluate(() => {
    const m = document.querySelector('.rd-scroll');
    const t = m.getBoundingClientRect().top;
    for (const el of m.querySelectorAll('[id^="rv-"]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > t + 1) return { v: +el.id.slice(3), off: Math.round(r.top - t), top: Math.round(m.scrollTop) };
    }
    return { top: m.scrollTop };
  });
}
async function scrollToVerse(page, v, off = 30) {
  await page.evaluate(([v, off]) => {
    const m = document.querySelector('.rd-scroll');
    const el = document.getElementById('rv-' + v);
    m.scrollTo({ top: m.scrollTop + el.getBoundingClientRect().top - m.getBoundingClientRect().top - off, behavior: 'instant' });
  }, [v, off]);
  await page.mouse.wheel(0, 1); await page.mouse.wheel(0, -1);   // a real user scroll event
  await page.waitForTimeout(400);
}
async function scenario(name, viewport, openVerse, highlight) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/bible?book=matthew&chapter=16&script=english`);
  await page.waitForSelector('#rv-28');
  await page.waitForTimeout(500);
  if (highlight) await page.click(`#rv-${highlight} .rd-vnum`).catch(() => page.evaluate(h => document.querySelector(`#rv-${h} .rd-vnum`)?.click(), highlight));
  await scrollToVerse(page, 12);
  const before = await view(page);
  await page.evaluate(v => document.querySelector(`a.rd-vnum-goto[href$="/16/${v}"]`).click(), openVerse);
  await page.waitForURL(new RegExp(`/16/${openVerse}$`));
  await page.waitForTimeout(800);
  await page.goBack();
  await page.waitForSelector('#rv-28');
  await page.waitForTimeout(2500);
  const after = await view(page);
  const ok = after.v === before.v && Math.abs(after.off - before.off) <= 4;
  results.push({ name, ok, before, after });
  await ctx.close();
}

await scenario('desktop: highlight v3, open v12, Back', { width: 1200, height: 900 }, 12, 3);
await scenario('desktop: open a far verse (v20), Back', { width: 1200, height: 900 }, 20, 3);
await scenario('phone: highlight v3, open v12, Back', { width: 390, height: 844 }, 12, 3);

// Fresh arrival still starts at the top (Next chapter link, not Back).
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/bible?book=matthew&chapter=16&script=english`);
  await page.waitForSelector('#rv-28'); await scrollToVerse(page, 12);
  await page.goto(`${BASE}/bible?book=matthew&chapter=17&script=english`);
  await page.waitForSelector('#rv-28'); await page.waitForTimeout(1500);
  const v = await view(page);
  results.push({ name: 'fresh load of another chapter starts at the top', ok: v.top === 0, after: v });
  await ctx.close();
}

// In-reader chapter change (ArrowRight → Next, a PUSH inside the same Reader),
// then Back: chapter 16 must come back at the view you left.
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/bible?book=matthew&chapter=16&script=english`);
  await page.waitForSelector('#rv-28'); await page.waitForTimeout(500);
  await scrollToVerse(page, 12);
  const before = await view(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForURL(/chapter=17/); await page.waitForTimeout(1200);
  const at17 = await view(page);
  await page.goBack();
  await page.waitForURL(/chapter=16/); await page.waitForTimeout(2500);
  const after = await view(page);
  results.push({ name: 'Next chapter starts at top, Back returns to the view', ok: at17.top === 0 && after.v === before.v && Math.abs(after.off - before.off) <= 4, before, after });
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${JSON.stringify({ before: r.before, after: r.after })}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
