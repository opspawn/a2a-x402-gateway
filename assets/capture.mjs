import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function capture() {
  const browser = await chromium.launch({ headless: true });

  // Capture logo (400x400)
  const logoPage = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await logoPage.goto('file://' + join(__dirname, 'logo.html'));
  await logoPage.waitForTimeout(500);
  await logoPage.screenshot({
    path: join(__dirname, 'logo-400.png'),
    clip: { x: 0, y: 0, width: 400, height: 400 }
  });
  console.log('Logo saved: logo-400.png (400x400)');
  await logoPage.close();

  // Capture banner (1200x630)
  const bannerPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await bannerPage.goto('file://' + join(__dirname, 'banner.html'));
  await bannerPage.waitForTimeout(500);
  await bannerPage.screenshot({
    path: join(__dirname, 'banner-1200x630.png'),
    clip: { x: 0, y: 0, width: 1200, height: 630 }
  });
  console.log('Banner saved: banner-1200x630.png (1200x630)');
  await bannerPage.close();

  await browser.close();
  console.log('Done!');
}

capture().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
