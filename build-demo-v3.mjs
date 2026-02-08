#!/usr/bin/env node
/**
 * Demo Video v3 Builder
 * Captures fresh screenshots from live site, builds polished 2:30-3:00 video
 * with section cards, captions, crossfade transitions, and text overlays.
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

const BASE_URL = 'https://a2a.opspawn.com';

// Fetch live stats for dynamic overlays
let LIVE_STATS = { tasks: '890+', settled: '129', revenue: '$1.28+', sessions: '84' };
try {
  const statsRes = execSync('curl -s http://localhost:4002/stats', { timeout: 5000 }).toString();
  const s = JSON.parse(statsRes);
  LIVE_STATS = {
    tasks: `${s.tasks.total}+`,
    settled: `${s.payments.byType.settled}`,
    revenue: `$${s.payments.revenue.total}+`,
    sessions: `${s.sessions.siwx}`,
  };
  console.log(`Live stats: ${LIVE_STATS.tasks} tasks, ${LIVE_STATS.settled} settled, ${LIVE_STATS.revenue} USDC`);
} catch (e) {
  console.log('Using fallback stats (could not reach localhost:4002)');
}
const WORK_DIR = '/home/agent/projects/a2a-x402-gateway/demo-v3-work';
const FRAMES_DIR = `${WORK_DIR}/frames`;
const CLIPS_DIR = `${WORK_DIR}/clips`;
const CARDS_DIR = `${WORK_DIR}/cards`;
const OUTPUT = '/home/agent/projects/a2a-x402-gateway/demo-video-v2.mp4';

// Ensure dirs
[WORK_DIR, FRAMES_DIR, CLIPS_DIR, CARDS_DIR].forEach(d => mkdirSync(d, { recursive: true }));

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`);
  return execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', timeout: 120000, ...opts });
}

function runQ(cmd) {
  return execSync(cmd, { stdio: 'pipe', timeout: 120000 }).toString().trim();
}

// ==================== STEP 1: Capture frames via Playwright ====================

async function captureFrames() {
  console.log('\n=== STEP 1: Capturing frames from live site ===\n');

  const { chromium } = await import('patchright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'dark',
    deviceScaleFactor: 1
  });
  let page = await context.newPage();

  let frameNum = 0;

  async function capture(name, url, opts = {}) {
    frameNum++;
    const num = String(frameNum).padStart(3, '0');
    const file = `${FRAMES_DIR}/${num}-${name}.png`;

    if (url) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (e) {
        // Page context may be broken after failed navigation (e.g. 402 JSON response)
        try { await page.waitForTimeout(500); } catch (_) {
          console.log(`  Recovering page context after navigation error...`);
          page = await context.newPage();
        }
      }
      await page.waitForTimeout(1000).catch(() => {});
    }

    if (opts.scrollTo) {
      await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, opts.scrollTo);
      await page.waitForTimeout(500);
    }

    if (opts.scrollY) {
      await page.evaluate(y => window.scrollTo(0, y), opts.scrollY);
      await page.waitForTimeout(500);
    }

    if (opts.evaluate) {
      await page.evaluate(opts.evaluate);
      await page.waitForTimeout(300);
    }

    try {
      await page.screenshot({ path: file, fullPage: false });
      // Verify file was actually written
      const { statSync } = await import('fs');
      const fstat = statSync(file);
      if (fstat.size < 100) throw new Error('Screenshot file too small');
      console.log(`  Captured: ${num}-${name} (${(fstat.size/1024).toFixed(0)}KB)`);
    } catch (e) {
      console.log(`  WARN: Screenshot failed for ${num}-${name}: ${e.message}, creating placeholder PNG`);
      run(`ffmpeg -y -f lavfi -i color=c=0x0a0a0a:s=1920x1080:d=1:r=1 -vframes 1 "${file}" 2>/dev/null`, { quiet: true });
    }
    return { num, name, file };
  }

  // --- Section 1: Discovery ---
  console.log('\n-- Section 1: Discovery --');
  await capture('dashboard-landing', `${BASE_URL}/dashboard`);
  await capture('dashboard-skills', null, { scrollY: 600 });
  await capture('dashboard-activity', null, { scrollY: 1200 });
  await capture('agent-card-json', `${BASE_URL}/.well-known/agent-card.json`);
  await capture('x402-catalog', `${BASE_URL}/x402`);

  // --- Section 2: Interactive Demo ---
  console.log('\n-- Section 2: Interactive Demo --');
  await capture('demo-hero', `${BASE_URL}/demo`);
  await capture('demo-stats', null, { scrollY: 200 });
  await capture('demo-architecture', null, { scrollY: 500 });
  await capture('demo-scenarios', null, { scrollY: 900 });
  await capture('demo-payment-flow', null, { scrollY: 1300 });
  await capture('demo-protocol', null, { scrollY: 1700 });
  await capture('demo-sdk', null, { scrollY: 2100 });

  // --- Section 3: Live Payment ---
  console.log('\n-- Section 3: Live Payment --');
  // Show the 402 response by navigating to the screenshot endpoint
  await capture('x402-screenshot-402', `${BASE_URL}/x402/screenshot`);
  // Show the API info with payment config
  await capture('api-info', `${BASE_URL}/api/info`);
  // Show payment events
  await capture('api-payments', `${BASE_URL}/api/payments`);
  // Show SIWx sessions
  await capture('api-siwx', `${BASE_URL}/api/siwx`);

  // --- Section 4: Dashboard & Stats ---
  console.log('\n-- Section 4: Dashboard & Stats --');
  await capture('dashboard-full', `${BASE_URL}/dashboard`);
  await capture('dashboard-try-it', null, { scrollY: 800 });
  await capture('dashboard-endpoints', null, { scrollY: 1500 });
  await capture('stats-json', `${BASE_URL}/stats`);

  // --- Section 5: Code Tour ---
  console.log('\n-- Section 5: Code Tour --');
  await capture('gitlab-repo', 'https://gitlab.com/opspawnhq/a2a-x402-gateway');
  await page.waitForTimeout(2000);
  await capture('gitlab-repo-loaded', null); // re-capture after full load
  await capture('gitlab-files', null, { scrollY: 400 });

  await browser.close();
  console.log(`\nTotal frames captured: ${frameNum}`);
  return frameNum;
}

// ==================== STEP 2: Create section title cards ====================

function createTitleCards() {
  console.log('\n=== STEP 2: Creating title cards ===\n');

  const cards = [
    {
      id: '00-intro',
      duration: 5,
      lines: [
        { text: 'A2A x402 Gateway', y: 360, size: 72, color: '#00d4ff' },
        { text: 'Pay-per-request AI agent services', y: 450, size: 36, color: '#ffffff' },
        { text: `${LIVE_STATS.revenue} USDC earned autonomously | ${LIVE_STATS.tasks} tasks processed`, y: 520, size: 28, color: '#4dff88' },
        { text: 'A2A Protocol v0.3 + x402 V2 Micropayments', y: 580, size: 24, color: '#aaaaaa' },
        { text: 'OpSpawn', y: 650, size: 32, color: '#4dff88' },
      ]
    },
    {
      id: '01-discovery',
      duration: 3,
      lines: [
        { text: 'SECTION 1', y: 440, size: 24, color: '#00d4ff' },
        { text: 'Agent Discovery', y: 510, size: 64, color: '#ffffff' },
        { text: 'A2A protocol agent card with x402 V2 payment extensions', y: 580, size: 24, color: '#aaaaaa' },
      ]
    },
    {
      id: '02-demo',
      duration: 3,
      lines: [
        { text: 'SECTION 2', y: 440, size: 24, color: '#00d4ff' },
        { text: 'Interactive Demo', y: 510, size: 64, color: '#ffffff' },
        { text: 'Architecture, payment flow, and SDK integration', y: 580, size: 24, color: '#aaaaaa' },
      ]
    },
    {
      id: '03-payment',
      duration: 3,
      lines: [
        { text: 'SECTION 3', y: 440, size: 24, color: '#00d4ff' },
        { text: 'Live x402 Payments', y: 510, size: 64, color: '#ffffff' },
        { text: 'HTTP 402 negotiation, payment signatures, settled transactions', y: 580, size: 24, color: '#aaaaaa' },
      ]
    },
    {
      id: '04-dashboard',
      duration: 3,
      lines: [
        { text: 'SECTION 4', y: 440, size: 24, color: '#00d4ff' },
        { text: 'Dashboard & Stats', y: 510, size: 64, color: '#ffffff' },
        { text: `${LIVE_STATS.tasks} tasks | ${LIVE_STATS.settled} settled | ${LIVE_STATS.revenue} USDC earned`, y: 580, size: 24, color: '#4dff88' },
      ]
    },
    {
      id: '05-code',
      duration: 3,
      lines: [
        { text: 'SECTION 5', y: 440, size: 24, color: '#00d4ff' },
        { text: 'Source Code', y: 510, size: 64, color: '#ffffff' },
        { text: 'Open source on GitLab — server.mjs (1390 lines) + test suite', y: 580, size: 24, color: '#aaaaaa' },
      ]
    },
    {
      id: '99-outro',
      duration: 5,
      lines: [
        { text: 'A2A x402 Gateway', y: 320, size: 64, color: '#00d4ff' },
        { text: `${LIVE_STATS.revenue} USDC earned | ${LIVE_STATS.tasks} tasks | Multi-chain`, y: 400, size: 30, color: '#4dff88' },
        { text: 'Built by OpSpawn — an autonomous AI agent', y: 460, size: 28, color: '#ffffff' },
        { text: 'https://a2a.opspawn.com', y: 530, size: 28, color: '#00d4ff' },
        { text: 'gitlab.com/opspawnhq/a2a-x402-gateway', y: 580, size: 24, color: '#aaaaaa' },
        { text: 'SF Agentic Commerce x402 Hackathon 2026', y: 660, size: 24, color: '#ffcc00' },
      ]
    },
  ];

  for (const card of cards) {
    const drawtext = card.lines.map(l => {
      const escaped = l.text.replace(/\u2014/g, '-').replace(/\u2192/g, '->').replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\$/g, "\\$$");
      return `drawtext=text='${escaped}':fontsize=${l.size}:fontcolor=${l.color}:x=(w-text_w)/2:y=${l.y}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`;
    }).join(',');

    const cmd = `ffmpeg -y -f lavfi -i color=c=0x0a0a0a:s=1920x1080:d=${card.duration}:r=30 -vf "${drawtext}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p ${CARDS_DIR}/${card.id}.mp4 2>/dev/null`;
    run(cmd, { quiet: true });
    console.log(`  Created card: ${card.id} (${card.duration}s)`);
  }
}

// ==================== STEP 3: Create captioned clips from frames ====================

function createCaptionedClips() {
  console.log('\n=== STEP 3: Creating captioned clips ===\n');

  // Get all frame files sorted
  const frames = readdirSync(FRAMES_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();

  // Caption map: frame-name → { caption, url, duration }
  const captions = {
    'dashboard-landing': { caption: 'Live Dashboard — Real-time agent gateway', url: 'a2a.opspawn.com/dashboard', duration: 6 },
    'dashboard-skills': { caption: 'Three AI Skills — Screenshot, PDF, and HTML generation', url: 'a2a.opspawn.com/dashboard', duration: 5 },
    'dashboard-activity': { caption: 'Recent Activity Feed — Live payment events', url: 'a2a.opspawn.com/dashboard', duration: 5 },
    'agent-card-json': { caption: 'A2A Agent Card — Standard discovery protocol (v0.3)', url: '.well-known/agent-card.json', duration: 6 },
    'x402-catalog': { caption: 'x402 Service Catalog — Endpoints with pricing', url: 'a2a.opspawn.com/x402', duration: 5 },
    'demo-hero': { caption: 'Interactive Demo Page — Complete walkthrough', url: 'a2a.opspawn.com/demo', duration: 5 },
    'demo-stats': { caption: `Live Stats — ${LIVE_STATS.revenue} USDC earned across ${LIVE_STATS.tasks} tasks`, url: 'a2a.opspawn.com/demo', duration: 6 },
    'demo-architecture': { caption: 'Architecture — Agent to Gateway to Payment to Service', url: 'a2a.opspawn.com/demo', duration: 6 },
    'demo-scenarios': { caption: 'Payment Scenarios — Paid screenshot and free HTML', url: 'a2a.opspawn.com/demo', duration: 5 },
    'demo-payment-flow': { caption: 'Payment Flow — x402 negotiate, pay, and settle', url: 'a2a.opspawn.com/demo', duration: 6 },
    'demo-protocol': { caption: 'Protocol Details — JSON-RPC over A2A with x402', url: 'a2a.opspawn.com/demo', duration: 5 },
    'demo-sdk': { caption: 'SDK Integration — Code samples for client agents', url: 'a2a.opspawn.com/demo', duration: 5 },
    'x402-screenshot-402': { caption: 'HTTP 402 Payment Required — x402 V2 response', url: '/x402/screenshot', duration: 7 },
    'api-info': { caption: 'Agent Metadata — Multi-chain payment config (Base + SKALE)', url: '/api/info', duration: 7 },
    'api-payments': { caption: `Payment Event Log — ${LIVE_STATS.settled} settled, ${LIVE_STATS.revenue} USDC earned`, url: '/api/payments', duration: 7 },
    'api-siwx': { caption: 'SIWx Sessions — Wallet-based session access', url: '/api/siwx', duration: 5 },
    'dashboard-full': { caption: 'Dashboard Overview — All metrics at a glance', url: 'a2a.opspawn.com/dashboard', duration: 5 },
    'dashboard-try-it': { caption: 'Try It Live — Send A2A messages from the browser', url: 'a2a.opspawn.com/dashboard', duration: 6 },
    'dashboard-endpoints': { caption: 'API Endpoints — Full REST + JSON-RPC interface', url: 'a2a.opspawn.com/dashboard', duration: 5 },
    'stats-json': { caption: `Raw Stats API — ${LIVE_STATS.tasks} tasks, ${LIVE_STATS.revenue} revenue`, url: '/stats', duration: 6 },
    'gitlab-repo': { caption: 'Open Source — GitLab repository', url: 'gitlab.com/opspawnhq', duration: 5 },
    'gitlab-repo-loaded': { caption: 'Source Code — server.mjs + test.mjs + more', url: 'gitlab.com/opspawnhq', duration: 5 },
    'gitlab-files': { caption: 'Project Structure — Clean, well-documented codebase', url: 'gitlab.com/opspawnhq', duration: 5 },
  };

  for (const frame of frames) {
    const num = frame.substring(0, 3);
    const name = frame.replace(/^\d+-/, '').replace('.png', '');
    const info = captions[name] || { caption: name.replace(/-/g, ' '), url: 'a2a.opspawn.com', duration: 5 };
    const framePath = `${FRAMES_DIR}/${frame}`;

    // Skip if frame file doesn't actually exist or is empty
    if (!existsSync(framePath)) {
      console.log(`  SKIP: ${num}-${name} (frame file missing)`);
      continue;
    }

    // Sanitize unicode chars that break ffmpeg drawtext
    const sanitize = (s) => s.replace(/\u2014/g, '-').replace(/\u2192/g, '->').replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\$/g, "\\$$");
    const captionEsc = sanitize(info.caption);
    const urlEsc = sanitize(info.url);

    // Build filter: scale image, add caption bar at bottom, add caption text, add URL
    const vf = [
      `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a`,
      // Semi-transparent caption bar
      `drawbox=x=0:y=ih-80:w=iw:h=80:color=black@0.75:t=fill`,
      // Caption text
      `drawtext=text='${captionEsc}':fontsize=28:fontcolor=white:x=30:y=h-55:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
      // URL in bottom-right
      `drawtext=text='${urlEsc}':fontsize=20:fontcolor=#00d4ff:x=w-text_w-30:y=h-55:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf`,
    ].join(',');

    const cmd = `ffmpeg -y -loop 1 -i "${framePath}" -t ${info.duration} -vf "${vf}" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 "${CLIPS_DIR}/${num}.mp4"`;
    try {
      run(cmd, { quiet: true });
      console.log(`  Created clip: ${num} "${info.caption}" (${info.duration}s)`);
    } catch (e) {
      // Fallback: create clip without captions
      try {
        console.log(`  WARN: Caption failed for ${num}, creating plain clip`);
        const fallbackCmd = `ffmpeg -y -loop 1 -i "${framePath}" -t ${info.duration} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 "${CLIPS_DIR}/${num}.mp4"`;
        run(fallbackCmd, { quiet: true });
      } catch (e2) {
        console.log(`  SKIP: ${num} (ffmpeg failed entirely)`);
      }
    }
  }
}

// ==================== STEP 4: Concatenate everything ====================

function buildFinalVideo() {
  console.log('\n=== STEP 4: Building final video ===\n');

  // Build concat list with section structure
  const segments = [
    // Intro
    `${CARDS_DIR}/00-intro.mp4`,

    // Section 1: Discovery
    `${CARDS_DIR}/01-discovery.mp4`,
    ...getClipsForRange(1, 5),

    // Section 2: Interactive Demo
    `${CARDS_DIR}/02-demo.mp4`,
    ...getClipsForRange(6, 12),

    // Section 3: Live Payment
    `${CARDS_DIR}/03-payment.mp4`,
    ...getClipsForRange(13, 16),

    // Section 4: Dashboard & Stats
    `${CARDS_DIR}/04-dashboard.mp4`,
    ...getClipsForRange(17, 20),

    // Section 5: Code Tour
    `${CARDS_DIR}/05-code.mp4`,
    ...getClipsForRange(21, 23),

    // Outro
    `${CARDS_DIR}/99-outro.mp4`,
  ];

  // Write concat file
  const concatContent = segments.map(f => `file '${f}'`).join('\n');
  const concatFile = `${WORK_DIR}/concat.txt`;
  writeFileSync(concatFile, concatContent);
  console.log(`  Concat file: ${segments.length} segments`);

  // First pass: simple concatenation
  const rawOutput = `${WORK_DIR}/raw-concat.mp4`;
  run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart "${rawOutput}" 2>/dev/null`, { quiet: true });

  // Get duration
  const duration = runQ(`ffprobe -v quiet -print_format json -show_format "${rawOutput}" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.format.duration)"`);
  console.log(`  Raw video duration: ${Math.round(parseFloat(duration))}s (${(parseFloat(duration)/60).toFixed(1)} min)`);

  // Add a subtle progress bar at the very bottom (2px high, cyan)
  const totalDur = parseFloat(duration);
  const vf = [
    // Progress bar (2px at very bottom)
    `drawbox=x=0:y=ih-3:w=iw*(t/${totalDur}):h=3:color=#00d4ff:t=fill`,
  ].join(',');

  run(`ffmpeg -y -i "${rawOutput}" -vf "${vf}" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart "${OUTPUT}" 2>/dev/null`, { quiet: true });

  // Also copy to public/
  run(`cp "${OUTPUT}" /home/agent/projects/a2a-x402-gateway/public/demo-video-v2.mp4`, { quiet: true });

  const finalSize = runQ(`du -h "${OUTPUT}" | cut -f1`);
  console.log(`\n  Final output: ${OUTPUT}`);
  console.log(`  Duration: ${Math.round(totalDur)}s (${(totalDur/60).toFixed(1)} min)`);
  console.log(`  Size: ${finalSize}`);

  return { duration: totalDur, size: finalSize };
}

function getClipsForRange(start, end) {
  const clips = [];
  for (let i = start; i <= end; i++) {
    const num = String(i).padStart(3, '0');
    const file = `${CLIPS_DIR}/${num}.mp4`;
    if (existsSync(file)) clips.push(file);
  }
  return clips;
}

// ==================== STEP 5: Verify ====================

function verifyVideo() {
  console.log('\n=== STEP 5: Verifying output ===\n');

  // Extract verification frames at key timestamps
  const timestamps = [3, 10, 40, 80, 120, 150, 170];
  for (const t of timestamps) {
    const out = `${WORK_DIR}/verify-${t}s.png`;
    try {
      run(`ffmpeg -y -ss ${t} -i "${OUTPUT}" -vframes 1 -q:v 2 "${out}" 2>/dev/null`, { quiet: true });
      console.log(`  Verification frame at ${t}s: OK`);
    } catch (e) {
      console.log(`  Verification frame at ${t}s: SKIP (past end?)`);
    }
  }
}

// ==================== Main ====================

async function main() {
  console.log('========================================');
  console.log('  A2A x402 Gateway — Demo Video v3');
  console.log('========================================\n');

  const startTime = Date.now();

  await captureFrames();

  // Verify frames exist
  const frameFiles = readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nVerified: ${frameFiles.length} frame files in ${FRAMES_DIR}`);
  if (frameFiles.length === 0) {
    throw new Error('No frames captured! Cannot build video.');
  }

  createTitleCards();
  createCaptionedClips();
  const result = buildFinalVideo();
  verifyVideo();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n========================================`);
  console.log(`  Build complete in ${elapsed}s`);
  console.log(`  Output: ${OUTPUT}`);
  console.log(`  Duration: ${Math.round(result.duration)}s`);
  console.log(`  Size: ${result.size}`);
  console.log(`========================================\n`);

  return result;
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
