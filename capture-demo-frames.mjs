#!/usr/bin/env node
// Capture all frames for the x402 demo video using Playwright
import { chromium } from '/home/agent/node_modules/patchright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const FRAMES_DIR = '/home/agent/projects/a2a-x402-gateway/demo-v2-frames';
const BASE_URL = 'https://a2a.opspawn.com';
const VIEWPORT = { width: 1920, height: 1080 };

mkdirSync(FRAMES_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'dark'
  });

  const page = await context.newPage();
  let frameNum = 1;

  function pad(n) { return String(n).padStart(3, '0'); }

  async function capture(name, delay = 1000) {
    if (delay > 0) await page.waitForTimeout(delay);
    const path = `${FRAMES_DIR}/${pad(frameNum)}-${name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`  [${pad(frameNum)}] ${name}`);
    frameNum++;
    return path;
  }

  async function captureFullPage(name, delay = 1000) {
    if (delay > 0) await page.waitForTimeout(delay);
    const path = `${FRAMES_DIR}/${pad(frameNum)}-${name}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`  [${pad(frameNum)}] ${name} (full page)`);
    frameNum++;
    return path;
  }

  try {
    // ===== SECTION 1: DISCOVERY (30s) =====
    console.log('\n=== Section 1: Discovery ===');

    // 1a: Dashboard/Landing page
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
    await capture('01-dashboard-landing');

    // 1b: Scroll down on dashboard to show more
    await page.evaluate(() => window.scrollTo(0, 400));
    await capture('01-dashboard-scrolled');

    // 1c: Agent Card JSON
    await page.goto(`${BASE_URL}/.well-known/agent-card.json`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('01-agent-card-json');

    // 1d: Scroll agent card to show skills and payment config
    await page.evaluate(() => window.scrollTo(0, 600));
    await capture('01-agent-card-skills');

    // 1e: Scroll further to show x402 payment extensions
    await page.evaluate(() => window.scrollTo(0, 1200));
    await capture('01-agent-card-x402');

    // ===== SECTION 2: INTERACTIVE DEMO (45s) =====
    console.log('\n=== Section 2: Interactive Demo ===');

    // 2a: Demo page hero
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 15000 });
    await capture('02-demo-hero');

    // 2b: Scroll to stats bar
    await page.evaluate(() => window.scrollTo(0, 500));
    await capture('02-demo-stats');

    // 2c: Scroll to architecture diagram
    await page.evaluate(() => window.scrollTo(0, 1000));
    await capture('02-demo-architecture');

    // 2d: Scroll to scenario walkthroughs
    await page.evaluate(() => window.scrollTo(0, 1600));
    await capture('02-demo-scenarios');

    // 2e: Scroll further to show payment flow
    await page.evaluate(() => window.scrollTo(0, 2200));
    await capture('02-demo-payment-flow');

    // 2f: Scroll to protocol viewer / code samples
    await page.evaluate(() => window.scrollTo(0, 2800));
    await capture('02-demo-protocol');

    // 2g: Scroll to SDK code samples
    await page.evaluate(() => window.scrollTo(0, 3400));
    await capture('02-demo-sdk');

    // ===== SECTION 3: LIVE PAYMENT (45s) =====
    console.log('\n=== Section 3: Live Payment ===');

    // 3a: x402 service catalog
    await page.goto(`${BASE_URL}/x402`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('03-x402-catalog');

    // 3b: Trigger a 402 payment required
    await page.goto(`${BASE_URL}/x402/screenshot`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('03-payment-required-402');

    // 3c: API info endpoint showing payment config
    await page.goto(`${BASE_URL}/api/info`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('03-api-info');

    // 3d: Scroll to show full payment config
    await page.evaluate(() => window.scrollTo(0, 400));
    await capture('03-api-info-payments');

    // 3e: Payment events endpoint
    await page.goto(`${BASE_URL}/api/payments`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('03-payment-events');

    // 3f: Scroll to show more payment events
    await page.evaluate(() => window.scrollTo(0, 600));
    await capture('03-payment-events-more');

    // ===== SECTION 4: DASHBOARD & STATS (30s) =====
    console.log('\n=== Section 4: Dashboard & Stats ===');

    // 4a: Dashboard full view
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
    await capture('04-dashboard-live');

    // 4b: Dashboard scrolled to skills
    await page.evaluate(() => window.scrollTo(0, 500));
    await capture('04-dashboard-skills');

    // 4c: Dashboard scrolled to activity
    await page.evaluate(() => window.scrollTo(0, 900));
    await capture('04-dashboard-activity');

    // 4d: Raw stats JSON
    await page.goto(`${BASE_URL}/stats`, { waitUntil: 'networkidle', timeout: 10000 });
    await capture('04-stats-json');

    // 4e: Scroll stats
    await page.evaluate(() => window.scrollTo(0, 500));
    await capture('04-stats-json-more');

    // ===== SECTION 5: CODE TOUR (30s) =====
    console.log('\n=== Section 5: Code Tour ===');

    // 5a: GitLab repo page
    await page.goto('https://gitlab.com/opspawnhq/a2a-x402-gateway', { waitUntil: 'networkidle', timeout: 20000 });
    await capture('05-gitlab-repo', 3000);

    // 5b: Navigate to server.mjs
    await page.goto('https://gitlab.com/opspawnhq/a2a-x402-gateway/-/blob/main/server.mjs', { waitUntil: 'networkidle', timeout: 20000 });
    await capture('05-server-code', 3000);

    // 5c: Scroll through server code
    await page.evaluate(() => window.scrollTo(0, 800));
    await capture('05-server-code-scroll1');

    // 5d: Navigate to test.mjs
    await page.goto('https://gitlab.com/opspawnhq/a2a-x402-gateway/-/blob/main/test.mjs', { waitUntil: 'networkidle', timeout: 20000 });
    await capture('05-test-code', 3000);

    // 5e: Scroll through test code
    await page.evaluate(() => window.scrollTo(0, 600));
    await capture('05-test-code-scroll');

    // 5f: README
    await page.goto('https://gitlab.com/opspawnhq/a2a-x402-gateway/-/blob/main/README.md', { waitUntil: 'networkidle', timeout: 20000 });
    await capture('05-readme', 3000);

    console.log(`\nCapture complete: ${frameNum - 1} frames saved to ${FRAMES_DIR}`);

  } catch (err) {
    console.error('Error during capture:', err.message);
    // Continue with whatever frames we got
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
