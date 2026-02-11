import { chromium } from 'patchright';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = '/home/agent/projects/a2a-x402-gateway/demo-screenshots-v3';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // 1. Dashboard
  console.log('Capturing dashboard...');
  await page.goto('https://a2a.opspawn.com/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/dashboard.png`, fullPage: false });

  // 2. Demo page
  console.log('Capturing demo page...');
  await page.goto('https://a2a.opspawn.com/demo', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/demo.png`, fullPage: false });

  // 3. Agent card JSON
  console.log('Capturing agent card...');
  await page.goto('https://a2a.opspawn.com/.well-known/agent-card.json', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/agent-card.png`, fullPage: false });

  // 4. Bazaar
  console.log('Capturing bazaar...');
  await page.goto('https://a2a.opspawn.com/x402/bazaar', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/bazaar.png`, fullPage: false });

  // 5. Stats
  console.log('Capturing stats...');
  await page.goto('https://a2a.opspawn.com/stats', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/stats.png`, fullPage: false });

  await browser.close();
  console.log('All screenshots captured!');
}

main().catch(e => { console.error(e); process.exit(1); });
