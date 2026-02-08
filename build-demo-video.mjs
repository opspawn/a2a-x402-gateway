#!/usr/bin/env node
// Build the x402 demo video from captured frames using ffmpeg
// Strategy: Create individual video clips from images using lavfi overlay, then concatenate
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = '/home/agent/projects/a2a-x402-gateway';
const FRAMES = join(BASE, 'demo-v2-frames');
const WORK = join(BASE, 'demo-v2-work');
const OUTPUT = join(BASE, 'demo-video-v2.mp4');
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf';

mkdirSync(join(WORK, 'clips'), { recursive: true });
mkdirSync(join(WORK, 'cards'), { recursive: true });

function run(cmd) {
  try {
    execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    console.error(`CMD FAILED: ${cmd.substring(0, 300)}`);
    // Extract just the error lines
    const errLines = stderr.split('\n').filter(l => l.includes('Error') || l.includes('error') || l.includes('fail'));
    console.error(errLines.join('\n'));
    throw e;
  }
}

// ============================================================
// STEP 1: Create section title cards using lavfi color source
// ============================================================
console.log('=== Step 1: Creating title cards ===');

function esc(s) {
  // Escape for ffmpeg drawtext: colons, single quotes, backslashes
  return s.replace(/\\/g, '\\\\\\\\').replace(/:/g, '\\\\:').replace(/'/g, "'\\''");
}

function createTitleCard(outfile, title, subtitle, badge, duration) {
  const vf = [
    `drawtext=fontfile=${FONT}\\:text='${esc(badge)}'\\:fontcolor=0x00d4ff\\:fontsize=28\\:x=(w-text_w)/2\\:y=h/2-120`,
    `drawtext=fontfile=${FONT}\\:text='${esc(title)}'\\:fontcolor=0xffffff\\:fontsize=72\\:x=(w-text_w)/2\\:y=h/2-40`,
    `drawtext=fontfile=${FONT_REG}\\:text='${esc(subtitle)}'\\:fontcolor=0x888888\\:fontsize=32\\:x=(w-text_w)/2\\:y=h/2+60`
  ].join(',');

  run(`ffmpeg -y -f lavfi -i "color=c=0x0a0a0a:s=1920x1080:d=${duration}:r=30" -vf "${vf}" -c:v libx264 -pix_fmt yuv420p "${outfile}"`);
  console.log(`  ${outfile.split('/').pop()}`);
}

createTitleCard(join(WORK, 'cards/00-intro.mp4'),
  'A2A x402 Gateway', 'Pay-per-request AI agent services via A2A + x402 V2', 'OpSpawn', 4);

createTitleCard(join(WORK, 'cards/01-discovery.mp4'),
  'Agent Discovery', 'A2A protocol agent card with x402 payment extensions', 'SECTION 1', 3);

createTitleCard(join(WORK, 'cards/02-demo.mp4'),
  'Interactive Demo', 'Architecture, payment flows, and SDK integration', 'SECTION 2', 3);

createTitleCard(join(WORK, 'cards/03-payment.mp4'),
  'Live x402 Payments', 'Real micropayments on Base + SKALE Europa', 'SECTION 3', 3);

createTitleCard(join(WORK, 'cards/04-dashboard.mp4'),
  'Dashboard and Stats', '392+ tasks | 0.55 USDC earned | 3 SIWx sessions', 'SECTION 4', 3);

createTitleCard(join(WORK, 'cards/05-code.mp4'),
  'Source Code', 'Open source on GitLab - server.mjs + full test suite', 'SECTION 5', 3);

// Outro
{
  const vf = [
    `drawtext=fontfile=${FONT}\\:text='${esc('A2A x402 Gateway')}'\\:fontcolor=0x00d4ff\\:fontsize=56\\:x=(w-text_w)/2\\:y=h/2-100`,
    `drawtext=fontfile=${FONT_REG}\\:text='${esc('Built by OpSpawn - an autonomous AI agent')}'\\:fontcolor=0xffffff\\:fontsize=32\\:x=(w-text_w)/2\\:y=h/2-20`,
    `drawtext=fontfile=${FONT_MONO}\\:text='${esc('https://a2a.opspawn.com')}'\\:fontcolor=0x4dff88\\:fontsize=28\\:x=(w-text_w)/2\\:y=h/2+40`,
    `drawtext=fontfile=${FONT_REG}\\:text='${esc('gitlab.com/opspawnhq/a2a-x402-gateway')}'\\:fontcolor=0x888888\\:fontsize=24\\:x=(w-text_w)/2\\:y=h/2+90`,
    `drawtext=fontfile=${FONT_REG}\\:text='${esc('SF Agentic Commerce x402 Hackathon 2026')}'\\:fontcolor=0xffcc00\\:fontsize=22\\:x=(w-text_w)/2\\:y=h/2+150`
  ].join(',');
  run(`ffmpeg -y -f lavfi -i "color=c=0x0a0a0a:s=1920x1080:d=4:r=30" -vf "${vf}" -c:v libx264 -pix_fmt yuv420p "${join(WORK, 'cards/99-outro.mp4')}"`);
  console.log('  99-outro.mp4');
}

// ============================================================
// STEP 2: Convert frames to video clips with caption overlays
// ============================================================
console.log('\n=== Step 2: Creating captioned clips from frames ===');

function createClip(frameFile, outName, caption, url, duration) {
  const inPath = join(FRAMES, frameFile);
  const outPath = join(WORK, 'clips', outName);

  // Step A: Convert image to raw video (no filters)
  const rawPath = outPath.replace('.mp4', '-raw.mp4');
  run(`ffmpeg -y -framerate 1/${duration} -i "${inPath}" -c:v libx264 -pix_fmt yuv420p -r 30 -t ${duration} "${rawPath}"`);

  // Step B: Add caption overlay using the video file as input
  let vf = `drawbox=x=0:y=1000:w=1920:h=80:color=black@0.75:t=fill`;
  vf += `,drawtext=fontfile=${FONT_REG}\\:text='${esc(caption)}'\\:fontcolor=white\\:fontsize=26\\:x=30\\:y=1025`;

  if (url) {
    vf += `,drawtext=fontfile=${FONT_MONO}\\:text='${esc(url)}'\\:fontcolor=0x00d4ff\\:fontsize=20\\:x=w-text_w-30\\:y=1028`;
  }

  run(`ffmpeg -y -i "${rawPath}" -vf "${vf}" -c:v libx264 -pix_fmt yuv420p "${outPath}"`);

  // Clean up raw file
  try { execSync(`rm "${rawPath}"`, { stdio: 'pipe' }); } catch {}

  console.log(`  ${outName}`);
}

const frames = [
  // Section 1: Discovery (~27s)
  ['001-01-dashboard-landing.png', '001.mp4', 'Dashboard - Live agent gateway with real payment stats', 'a2a.opspawn.com', 6],
  ['002-01-dashboard-scrolled.png', '002.mp4', 'Agent skills, endpoints, and payment configuration', '', 5],
  ['003-01-agent-card-json.png', '003.mp4', 'A2A Agent Card - Standard discovery endpoint', '.well-known/agent-card.json', 6],
  ['004-01-agent-card-skills.png', '004.mp4', 'Skills with x402 V2 payment extensions', '', 5],
  ['005-01-agent-card-x402.png', '005.mp4', 'Multi-chain payment config - Base + SKALE Europa (gasless)', '', 5],

  // Section 2: Interactive Demo (~44s)
  ['006-02-demo-hero.png', '006.mp4', 'Demo page - Live stats and embedded video', 'a2a.opspawn.com/demo', 7],
  ['007-02-demo-stats.png', '007.mp4', 'Real metrics - 0.55 USDC earned, 392 tasks, 339 payments', '', 6],
  ['008-02-demo-architecture.png', '008.mp4', 'Architecture - Agent to Gateway to x402 Payment to Result', '', 7],
  ['009-02-demo-scenarios.png', '009.mp4', 'Step-by-step payment scenarios with animated walkthroughs', '', 6],
  ['010-02-demo-payment-flow.png', '010.mp4', 'x402 payment negotiation and SIWx session reuse', '', 6],
  ['011-02-demo-protocol.png', '011.mp4', 'Protocol details - JSON-RPC messages and x402 headers', '', 6],
  ['012-02-demo-sdk.png', '012.mp4', 'SDK code samples - JavaScript and Python integration', '', 6],

  // Section 3: Live Payment (~44s)
  ['013-03-x402-catalog.png', '013.mp4', 'x402 Service Catalog - machine-readable pricing', 'a2a.opspawn.com/x402', 7],
  ['014-03-payment-required-402.png', '014.mp4', 'HTTP 402 Payment Required - x402 V2 payment response', '/x402/screenshot', 8],
  ['015-03-api-info.png', '015.mp4', 'API Info - Agent metadata and payment configuration', '/api/info', 7],
  ['016-03-api-info-payments.png', '016.mp4', 'Payment networks - Base USDC + SKALE Europa (gasless)', '', 7],
  ['017-03-payment-events.png', '017.mp4', 'Payment event log - real settled transactions', '/api/payments', 8],
  ['018-03-payment-events-more.png', '018.mp4', '55 settled payments across Base and SKALE networks', '', 7],

  // Section 4: Dashboard & Stats (~30s)
  ['019-04-dashboard-live.png', '019.mp4', 'Live Dashboard - Auto-refreshing every 3 seconds', 'a2a.opspawn.com/dashboard', 6],
  ['020-04-dashboard-skills.png', '020.mp4', 'Three skills - Screenshot, PDF, and free HTML conversion', '', 6],
  ['021-04-dashboard-activity.png', '021.mp4', 'Recent activity feed with payment types and timestamps', '', 6],
  ['022-04-stats-json.png', '022.mp4', 'Raw stats endpoint - agent economy dashboard data', 'a2a.opspawn.com/stats', 6],
  ['023-04-stats-json-more.png', '023.mp4', 'Conversion rate and SIWx session analytics', '', 6],

  // Section 5: Code Tour (~30s)
  ['024-05-gitlab-repo.png', '024.mp4', 'Open source on GitLab - 10 commits, full project', 'gitlab.com/opspawnhq', 5],
  ['025-05-server-code.png', '025.mp4', 'server.mjs - 1390 lines of A2A + x402 implementation', '', 5],
  ['026-05-server-code-scroll1.png', '026.mp4', 'Express routes, JSON-RPC handler, payment verification', '', 5],
  ['027-05-test-code.png', '027.mp4', 'test.mjs - 29 comprehensive tests covering all flows', '', 5],
  ['028-05-test-code-scroll.png', '028.mp4', 'Payment flow tests, SIWx sessions, error handling', '', 5],
  ['029-05-readme.png', '029.mp4', 'README with live demo links and documentation', '', 5],
];

for (const [frameFile, outName, caption, url, duration] of frames) {
  createClip(frameFile, outName, caption, url, duration);
}

// ============================================================
// STEP 3: Concatenate all segments
// ============================================================
console.log('\n=== Step 3: Concatenating all segments ===');

const concatLines = [
  "file 'cards/00-intro.mp4'",
  "file 'cards/01-discovery.mp4'",
  ...['001','002','003','004','005'].map(n => `file 'clips/${n}.mp4'`),
  "file 'cards/02-demo.mp4'",
  ...['006','007','008','009','010','011','012'].map(n => `file 'clips/${n}.mp4'`),
  "file 'cards/03-payment.mp4'",
  ...['013','014','015','016','017','018'].map(n => `file 'clips/${n}.mp4'`),
  "file 'cards/04-dashboard.mp4'",
  ...['019','020','021','022','023'].map(n => `file 'clips/${n}.mp4'`),
  "file 'cards/05-code.mp4'",
  ...['024','025','026','027','028','029'].map(n => `file 'clips/${n}.mp4'`),
  "file 'cards/99-outro.mp4'",
];

writeFileSync(join(WORK, 'concat.txt'), concatLines.join('\n') + '\n');

// Verify all files exist
let missing = 0;
for (const line of concatLines) {
  const file = join(WORK, line.match(/'(.+)'/)[1]);
  if (!existsSync(file)) {
    console.error(`  MISSING: ${file}`);
    missing++;
  }
}
if (missing > 0) {
  console.error(`${missing} files missing! Aborting.`);
  process.exit(1);
}

console.log(`  All ${concatLines.length} segments found`);

run(`ffmpeg -y -f concat -safe 0 -i "${join(WORK, 'concat.txt')}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "${OUTPUT}"`);

// Get final stats
const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT}"`).toString().trim();
const size = execSync(`du -h "${OUTPUT}" | cut -f1`).toString().trim();

console.log('\n=== Video build complete ===');
console.log(`Output: ${OUTPUT}`);
console.log(`Duration: ${parseFloat(probe).toFixed(1)}s (${(parseFloat(probe)/60).toFixed(1)} min)`);
console.log(`Size: ${size}`);

// Copy to public dir
execSync(`cp "${OUTPUT}" "${join(BASE, 'public/demo-video-v2.mp4')}"`);
console.log('Copied to public/demo-video-v2.mp4');
