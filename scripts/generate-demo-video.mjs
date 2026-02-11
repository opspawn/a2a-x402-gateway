/**
 * A2A x402 Gateway — Programmatic Demo Video Generator
 * Generates 1920x1080 frames at 30fps, composes with ffmpeg.
 *
 * Usage: node scripts/generate-demo-video.mjs
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

// ─── Configuration ───────────────────────────────────────────────
const W = 1920, H = 1080, FPS = 30;
const BASE_DIR = resolve('/home/agent/projects/a2a-x402-gateway');
const FRAMES_DIR = resolve(BASE_DIR, 'frames');
const SCREENSHOTS_DIR = resolve(BASE_DIR, 'demo-screenshots-v3');
const OUTPUT = resolve(BASE_DIR, 'demo-video-v3.mp4');
const PUBLIC_OUTPUT = resolve(BASE_DIR, 'public', 'demo-video-v3.mp4');

// Colors
const C = {
  bg: '#0d1117',
  text: '#e6edf3',
  accent: '#58a6ff',
  green: '#3fb950',
  orange: '#d29922',
  red: '#f85149',
  codeBg: '#161b22',
  border: '#30363d',
  dimText: '#8b949e',
};

// ─── Live data (fetched at build time) ───────────────────────────
let liveStats = null;
try {
  const res = execSync('curl -s https://a2a.opspawn.com/stats', { timeout: 10000 });
  liveStats = JSON.parse(res.toString());
} catch {
  liveStats = {
    agent: { name: 'OpSpawn AI Agent', version: '2.2.0' },
    uptime: { human: '1d 13h' },
    services: [
      { id: 'screenshot', name: 'Web Screenshot', price: '$0.01' },
      { id: 'ai-analysis', name: 'AI Content Analysis', price: '$0.01' },
      { id: 'markdown-to-pdf', name: 'Markdown to PDF', price: '$0.005' },
      { id: 'markdown-to-html', name: 'Markdown to HTML', price: 'free' },
    ],
    networks: [
      { name: 'Base' }, { name: 'SKALE Europa' }, { name: 'Arbitrum One' }
    ],
  };
}

// ─── Frame counter ───────────────────────────────────────────────
let frameNum = 0;

function saveFrame(canvas) {
  const fname = `frame_${String(frameNum).padStart(5, '0')}.png`;
  const buf = canvas.toBuffer('image/png');
  writeFileSync(resolve(FRAMES_DIR, fname), buf);
  frameNum++;
}

// ─── Helpers ─────────────────────────────────────────────────────

function clearBg(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
}

function drawGradientBg(ctx) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0d1117');
  grad.addColorStop(0.5, '#111827');
  grad.addColorStop(1, '#0d1117');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** Subtle grid pattern */
function drawGrid(ctx, opacity = 0.04) {
  ctx.strokeStyle = `rgba(88, 166, 255, ${opacity})`;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

/** Rounded rectangle */
function roundRect(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw a code block with syntax coloring */
function drawCodeBlock(ctx, x, y, w, h, lines, fontSize = 20) {
  // Background
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = C.codeBg;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title bar dots
  const dotY = y + 18;
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + 20, dotY, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(x + 40, dotY, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(x + 60, dotY, 6, 0, Math.PI * 2); ctx.fill();

  // Code lines
  ctx.font = `${fontSize}px monospace`;
  const lineH = fontSize * 1.6;
  let curY = y + 50;
  for (const line of lines) {
    if (typeof line === 'string') {
      ctx.fillStyle = C.text;
      ctx.fillText(line, x + 20, curY);
    } else {
      // { text, color }
      ctx.fillStyle = line.color || C.text;
      ctx.fillText(line.text, x + 20, curY);
    }
    curY += lineH;
  }
}

/** Draw a centered text with wrapping */
function drawCenteredText(ctx, text, y, fontSize = 36, color = C.text, maxWidth = W - 200) {
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';

  // Simple word wrap
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, W / 2, lineY);
      line = word;
      lineY += fontSize * 1.4;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, W / 2, lineY);
  ctx.textAlign = 'left';
}

/** Fade-in effect: alpha from 0 to 1 */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Draw a box with label */
function drawBox(ctx, x, y, w, h, label, color = C.accent) {
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = color + '22';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 8);
  ctx.textAlign = 'left';
}

/** Draw an arrow from (x1,y1) to (x2,y2) */
function drawArrow(ctx, x1, y1, x2, y2, color = C.accent, label = '') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 15;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  if (label) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = color;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 12;
    ctx.textAlign = 'center';
    ctx.fillText(label, mx, my);
    ctx.textAlign = 'left';
  }
}

/** Draw the persistent bottom bar */
function drawBottomBar(ctx, section = '') {
  ctx.fillStyle = C.codeBg;
  ctx.fillRect(0, H - 50, W, 50);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 50); ctx.lineTo(W, H - 50); ctx.stroke();

  ctx.font = '18px sans-serif';
  ctx.fillStyle = C.dimText;
  ctx.fillText('a2a.opspawn.com', 30, H - 18);

  ctx.textAlign = 'right';
  ctx.fillStyle = C.accent;
  ctx.fillText(section, W - 30, H - 18);
  ctx.textAlign = 'left';
}

/** Draw screenshot with frame */
function drawScreenshot(ctx, img, x, y, w, h, title = '') {
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;

  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = C.codeBg;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Title bar
  if (title) {
    ctx.fillStyle = '#1c2128';
    ctx.fillRect(x + 1, y + 1, w - 2, 35);
    const dotBaseY = y + 18;
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + 18, dotBaseY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(x + 35, dotBaseY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(x + 52, dotBaseY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = C.dimText;
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, dotBaseY + 4);
    ctx.textAlign = 'left';

    // Clip and draw image
    ctx.save();
    roundRect(ctx, x + 2, y + 36, w - 4, h - 38, 0);
    ctx.clip();
    ctx.drawImage(img, x + 2, y + 36, w - 4, h - 38);
    ctx.restore();
  } else {
    ctx.save();
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 8);
    ctx.clip();
    ctx.drawImage(img, x + 2, y + 2, w - 4, h - 4);
    ctx.restore();
  }
}

// ─── SECTION GENERATORS ──────────────────────────────────────────

/** Section 1: Title card (0:00-0:05, 150 frames) */
function genTitleCard(canvas, ctx) {
  const totalFrames = 150;
  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.03);

    const fadeIn = Math.min(1, f / 30);
    const alpha = easeInOut(fadeIn);

    ctx.globalAlpha = alpha;

    // Main title
    ctx.font = 'bold 72px sans-serif';
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText('A2A x402 Gateway', W / 2, H / 2 - 60);

    // Subtitle
    ctx.font = '36px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.fillText('AI Agent Commerce on Arbitrum', W / 2, H / 2 + 10);

    // Version + uptime
    if (f > 40) {
      const subAlpha = easeInOut(Math.min(1, (f - 40) / 25));
      ctx.globalAlpha = subAlpha;
      ctx.font = '24px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.fillText(`v${liveStats.agent.version}  •  Uptime: ${liveStats.uptime.human}`, W / 2, H / 2 + 65);
    }

    // Decorative line
    if (f > 20) {
      const lineAlpha = easeInOut(Math.min(1, (f - 20) / 20));
      ctx.globalAlpha = lineAlpha;
      const lineW = 400;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - lineW / 2, H / 2 - 90);
      ctx.lineTo(W / 2 + lineW / 2, H / 2 - 90);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    drawBottomBar(ctx, 'Introduction');
    saveFrame(canvas);
  }
}

/** Section 2: Problem statement (0:05-0:15, 300 frames) */
function genProblemStatement(canvas, ctx) {
  const totalFrames = 300;
  const lines = [
    'AI agents need to pay each other.',
    'HTTP 402 "Payment Required" has been',
    'reserved since 1999.',
    'x402 makes it real.',
  ];

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    // Section header
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('THE PROBLEM', W / 2, 120);
    ctx.textAlign = 'left';

    // Animated text reveal
    const framesPerLine = 60;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = i * framesPerLine;
      if (f < lineStart) continue;
      const progress = Math.min(1, (f - lineStart) / 25);
      const alpha = easeInOut(progress);
      ctx.globalAlpha = alpha;

      const isLast = i === lines.length - 1;
      ctx.font = isLast ? 'bold 48px sans-serif' : '40px sans-serif';
      ctx.fillStyle = isLast ? C.green : C.text;
      ctx.textAlign = 'center';
      ctx.fillText(lines[i], W / 2, 280 + i * 80);
      ctx.textAlign = 'left';
    }

    // HTTP 402 badge
    if (f > 120) {
      const badgeAlpha = easeInOut(Math.min(1, (f - 120) / 30));
      ctx.globalAlpha = badgeAlpha;
      roundRect(ctx, W / 2 - 140, 640, 280, 60, 8);
      ctx.fillStyle = C.orange + '33';
      ctx.fill();
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = C.orange;
      ctx.textAlign = 'center';
      ctx.fillText('HTTP 402', W / 2, 680);
      ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'The Problem');
    saveFrame(canvas);
  }
}

/** Section 3: Architecture overview (0:15-0:30, 450 frames) */
function genArchitecture(canvas, ctx) {
  const totalFrames = 450;

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('HOW IT WORKS', W / 2, 80);
    ctx.textAlign = 'left';

    // Architecture boxes
    const boxW = 260, boxH = 80;
    const y1 = 300, y2 = 520;

    // Agent A
    if (f > 10) {
      const a = easeInOut(Math.min(1, (f - 10) / 25));
      ctx.globalAlpha = a;
      drawBox(ctx, 120, y1, boxW, boxH, 'Agent A (Client)', C.accent);
    }

    // Gateway
    if (f > 40) {
      const a = easeInOut(Math.min(1, (f - 40) / 25));
      ctx.globalAlpha = a;
      drawBox(ctx, W / 2 - boxW / 2, y1, boxW, boxH, 'A2A x402 Gateway', C.green);
    }

    // Agent B
    if (f > 70) {
      const a = easeInOut(Math.min(1, (f - 70) / 25));
      ctx.globalAlpha = a;
      drawBox(ctx, W - 120 - boxW, y1, boxW, boxH, 'Agent B (Service)', C.accent);
    }

    // x402 Payment
    if (f > 100) {
      const a = easeInOut(Math.min(1, (f - 100) / 25));
      ctx.globalAlpha = a;
      drawBox(ctx, W / 2 - 130, y2, 260, boxH, 'x402 Payment (USDC)', C.orange);
    }

    // Blockchain
    if (f > 130) {
      const a = easeInOut(Math.min(1, (f - 130) / 25));
      ctx.globalAlpha = a;
      drawBox(ctx, W / 2 - 130, y2 + 120, 260, boxH, 'Arbitrum / Base / SKALE', C.green);
    }

    // Arrows
    if (f > 150) {
      const a = easeInOut(Math.min(1, (f - 150) / 30));
      ctx.globalAlpha = a;
      // A → Gateway
      drawArrow(ctx, 120 + boxW, y1 + boxH / 2, W / 2 - boxW / 2, y1 + boxH / 2, C.accent, 'Request');
      // Gateway → B
      drawArrow(ctx, W / 2 + boxW / 2, y1 + boxH / 2, W - 120 - boxW, y1 + boxH / 2, C.accent, 'Forward');
      // Gateway → Payment
      drawArrow(ctx, W / 2, y1 + boxH, W / 2, y2, C.orange, '402 → Pay');
      // Payment → Blockchain
      drawArrow(ctx, W / 2, y2 + boxH, W / 2, y2 + 120, C.green, 'Settle');
    }

    // Flow description
    if (f > 200) {
      const a = easeInOut(Math.min(1, (f - 200) / 30));
      ctx.globalAlpha = a;
      const steps = [
        { num: '1', text: 'Agent A requests a paid service', color: C.accent },
        { num: '2', text: 'Gateway returns HTTP 402 with payment details', color: C.orange },
        { num: '3', text: 'Agent A signs USDC payment via x402', color: C.green },
        { num: '4', text: 'Gateway verifies, settles on-chain, delivers result', color: C.green },
      ];
      const startY = 770;
      for (let i = 0; i < steps.length; i++) {
        if (f > 200 + i * 30) {
          const sa = easeInOut(Math.min(1, (f - 200 - i * 30) / 20));
          ctx.globalAlpha = sa;
          ctx.font = 'bold 24px sans-serif';
          ctx.fillStyle = steps[i].color;
          ctx.fillText(`  ${steps[i].num}.`, 300, startY + i * 40);
          ctx.font = '24px sans-serif';
          ctx.fillStyle = C.text;
          ctx.fillText(steps[i].text, 340, startY + i * 40);
        }
      }
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Architecture');
    saveFrame(canvas);
  }
}

/** Section 4: Live stats (0:30-0:45, 450 frames) */
function genLiveStats(canvas, ctx) {
  const totalFrames = 450;
  const services = liveStats.services || [];
  const networks = liveStats.networks || [];

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('LIVE STATS', W / 2, 80);
    ctx.textAlign = 'left';

    // Services cards
    const cardW = 380, cardH = 130, gap = 30;
    const startX = (W - (cardW * 2 + gap)) / 2;
    const startY = 140;

    for (let i = 0; i < Math.min(services.length, 4); i++) {
      const delay = i * 30;
      if (f < delay) continue;
      const a = easeInOut(Math.min(1, (f - delay) / 30));
      ctx.globalAlpha = a;

      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = startX + col * (cardW + gap);
      const cy = startY + row * (cardH + gap);

      roundRect(ctx, cx, cy, cardW, cardH, 10);
      ctx.fillStyle = C.codeBg;
      ctx.fill();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = C.text;
      ctx.fillText(services[i].name, cx + 20, cy + 40);

      ctx.font = '20px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.fillText(`ID: ${services[i].id}`, cx + 20, cy + 70);

      // Price badge
      const price = services[i].price;
      const isFree = price === 'free' || price === '$0';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = isFree ? C.green : C.orange;
      ctx.textAlign = 'right';
      ctx.fillText(isFree ? 'FREE' : price, cx + cardW - 20, cy + 45);
      ctx.textAlign = 'left';

      ctx.font = '16px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.textAlign = 'right';
      ctx.fillText('USDC', cx + cardW - 20, cy + 70);
      ctx.textAlign = 'left';
    }

    // Networks section
    if (f > 150) {
      const na = easeInOut(Math.min(1, (f - 150) / 30));
      ctx.globalAlpha = na;

      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'center';
      ctx.fillText('SUPPORTED NETWORKS', W / 2, 480);
      ctx.textAlign = 'left';

      const netW = 240, netH = 100, netGap = 40;
      const netStartX = (W - (netW * 3 + netGap * 2)) / 2;
      for (let i = 0; i < Math.min(networks.length, 3); i++) {
        const nd = 150 + 30 + i * 25;
        if (f < nd) continue;
        const a = easeInOut(Math.min(1, (f - nd) / 20));
        ctx.globalAlpha = a;

        const nx = netStartX + i * (netW + netGap);
        const ny = 510;

        roundRect(ctx, nx, ny, netW, netH, 10);
        ctx.fillStyle = C.codeBg;
        ctx.fill();
        ctx.strokeStyle = i === 1 ? C.green : C.accent;  // SKALE highlighted
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.fillText(networks[i].name, nx + netW / 2, ny + 45);

        if (networks[i].name === 'SKALE Europa') {
          ctx.font = '16px sans-serif';
          ctx.fillStyle = C.green;
          ctx.fillText('⬤ Gasless', nx + netW / 2, ny + 75);
        }
        ctx.textAlign = 'left';
      }
    }

    // Uptime + version
    if (f > 240) {
      const ua = easeInOut(Math.min(1, (f - 240) / 30));
      ctx.globalAlpha = ua;

      roundRect(ctx, W / 2 - 300, 660, 600, 100, 10);
      ctx.fillStyle = C.codeBg;
      ctx.fill();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 32px sans-serif';
      ctx.fillStyle = C.green;
      ctx.textAlign = 'center';
      ctx.fillText(`Uptime: ${liveStats.uptime.human}`, W / 2, 715);
      ctx.font = '22px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.fillText(`A2A v${liveStats.protocol?.a2a?.version || '0.3.0'}  •  x402 v${liveStats.protocol?.x402?.version || '2.0'}`, W / 2, 745);
      ctx.textAlign = 'left';
    }

    // x402 features
    if (f > 300) {
      const fa = easeInOut(Math.min(1, (f - 300) / 30));
      ctx.globalAlpha = fa;

      const features = ['siwx', 'payment-identifier', 'bazaar-discovery', 'multi-chain'];
      const featY = 810;
      const featGap = 30;
      const totalFeatW = features.reduce((sum, feat) => {
        ctx.font = '18px monospace';
        return sum + ctx.measureText(feat).width + 40;
      }, 0) + (features.length - 1) * featGap;
      let featX = (W - totalFeatW) / 2;

      for (const feat of features) {
        ctx.font = '18px monospace';
        const tw = ctx.measureText(feat).width + 40;
        roundRect(ctx, featX, featY, tw, 36, 6);
        ctx.fillStyle = C.accent + '22';
        ctx.fill();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = C.accent;
        ctx.textAlign = 'center';
        ctx.fillText(feat, featX + tw / 2, featY + 24);
        ctx.textAlign = 'left';
        featX += tw + featGap;
      }
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Live Stats');
    saveFrame(canvas);
  }
}

/** Section 5: Free service demo (0:45-1:00, 450 frames) */
function genFreeServiceDemo(canvas, ctx) {
  const totalFrames = 450;
  const curlCmd = `curl -X POST https://a2a.opspawn.com/x402/html \\
  -H "Content-Type: application/json" \\
  -d '{"markdown": "# Hello World"}'`;

  const response = `{
  "status": "success",
  "html": "<h1>Hello World</h1>",
  "service": "markdown-to-html",
  "price": "free"
}`;

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('DEMO: FREE SERVICE', W / 2, 80);
    ctx.textAlign = 'left';

    // Service badge
    if (f > 10) {
      const a = easeInOut(Math.min(1, (f - 10) / 20));
      ctx.globalAlpha = a;
      roundRect(ctx, W / 2 - 180, 100, 360, 45, 8);
      ctx.fillStyle = C.green + '22';
      ctx.fill();
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = C.green;
      ctx.textAlign = 'center';
      ctx.fillText('Markdown → HTML  |  FREE', W / 2, 130);
      ctx.textAlign = 'left';
    }

    // Curl command
    if (f > 40) {
      const a = easeInOut(Math.min(1, (f - 40) / 30));
      ctx.globalAlpha = a;

      const cmdLines = [
        { text: '$ curl -X POST https://a2a.opspawn.com/x402/html \\', color: C.text },
        { text: '    -H "Content-Type: application/json" \\', color: C.dimText },
        { text: '    -d \'{"markdown": "# Hello World"}\'', color: C.green },
      ];
      drawCodeBlock(ctx, 100, 180, W - 200, 180, cmdLines, 22);
    }

    // Arrow
    if (f > 120) {
      const a = easeInOut(Math.min(1, (f - 120) / 20));
      ctx.globalAlpha = a;
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = C.green;
      ctx.textAlign = 'center';
      ctx.fillText('▼  HTTP 200 OK', W / 2, 415);
      ctx.textAlign = 'left';
    }

    // Response
    if (f > 160) {
      const a = easeInOut(Math.min(1, (f - 160) / 30));
      ctx.globalAlpha = a;

      const respLines = [
        { text: '{', color: C.text },
        { text: '  "status": "success",', color: C.green },
        { text: '  "html": "<h1>Hello World</h1>",', color: C.text },
        { text: '  "service": "markdown-to-html",', color: C.dimText },
        { text: '  "price": "free"', color: C.green },
        { text: '}', color: C.text },
      ];
      drawCodeBlock(ctx, 100, 450, W - 200, 280, respLines, 24);
    }

    // Callout
    if (f > 260) {
      const a = easeInOut(Math.min(1, (f - 260) / 25));
      ctx.globalAlpha = a;
      ctx.font = '28px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.textAlign = 'center';
      ctx.fillText('No payment needed — free tier services work instantly', W / 2, 810);
      ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Free Service Demo');
    saveFrame(canvas);
  }
}

/** Section 6: Paid service demo (1:00-1:20, 600 frames) */
function genPaidServiceDemo(canvas, ctx) {
  const totalFrames = 600;

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('DEMO: PAID SERVICE', W / 2, 80);
    ctx.textAlign = 'left';

    // Service badge
    if (f > 5) {
      const a = easeInOut(Math.min(1, (f - 5) / 20));
      ctx.globalAlpha = a;
      roundRect(ctx, W / 2 - 200, 100, 400, 45, 8);
      ctx.fillStyle = C.orange + '22';
      ctx.fill();
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = C.orange;
      ctx.textAlign = 'center';
      ctx.fillText('Web Screenshot  |  $0.01 USDC', W / 2, 130);
      ctx.textAlign = 'left';
    }

    // Step 1: Request
    if (f > 30) {
      const a = easeInOut(Math.min(1, (f - 30) / 25));
      ctx.globalAlpha = a;

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = C.accent;
      ctx.fillText('Step 1: Request', 100, 195);

      const cmdLines = [
        { text: '$ curl https://a2a.opspawn.com/x402/screenshot', color: C.text },
        { text: '    -d \'{"url": "https://example.com"}\'', color: C.green },
      ];
      drawCodeBlock(ctx, 100, 210, W / 2 - 140, 130, cmdLines, 18);
    }

    // Step 2: 402 response
    if (f > 120) {
      const a = easeInOut(Math.min(1, (f - 120) / 25));
      ctx.globalAlpha = a;

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = C.orange;
      ctx.fillText('Step 2: HTTP 402 Payment Required', W / 2 + 40, 195);

      const respLines = [
        { text: 'HTTP/1.1 402 Payment Required', color: C.orange },
        { text: 'X-Payment-Network: eip155:42161', color: C.dimText },
        { text: 'X-Payment-Amount: 10000 (0.01 USDC)', color: C.orange },
        { text: 'X-Payment-Token: USDC', color: C.dimText },
      ];
      drawCodeBlock(ctx, W / 2 + 40, 210, W / 2 - 140, 160, respLines, 17);
    }

    // Step 3: Sign payment
    if (f > 240) {
      const a = easeInOut(Math.min(1, (f - 240) / 25));
      ctx.globalAlpha = a;

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = C.green;
      ctx.fillText('Step 3: Agent signs USDC payment', 100, 420);

      const payLines = [
        { text: '$ curl -X POST https://a2a.opspawn.com/x402/screenshot \\', color: C.text },
        { text: '    -H "Payment-Signature: 0xabc123..." \\', color: C.green },
        { text: '    -H "Payment-Network: eip155:42161" \\', color: C.dimText },
        { text: '    -d \'{"url": "https://example.com"}\'', color: C.text },
      ];
      drawCodeBlock(ctx, 100, 440, W - 200, 190, payLines, 19);
    }

    // Step 4: Result
    if (f > 380) {
      const a = easeInOut(Math.min(1, (f - 380) / 30));
      ctx.globalAlpha = a;

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = C.green;
      ctx.fillText('Step 4: Payment verified, result delivered', 100, 680);

      const resultLines = [
        { text: 'HTTP/1.1 200 OK', color: C.green },
        { text: 'Content-Type: image/png', color: C.dimText },
        { text: 'X-Payment-Settled: true', color: C.green },
        { text: 'X-Payment-TxHash: 0x7f2a...b8c1', color: C.accent },
        { text: '', color: C.text },
        { text: '[ Screenshot PNG data... ]', color: C.dimText },
      ];
      drawCodeBlock(ctx, 100, 700, W - 200, 260, resultLines, 20);
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Paid Service Demo');
    saveFrame(canvas);
  }
}

/** Section 7: Dashboard screenshot (1:20-1:35, 450 frames) */
async function genDashboard(canvas, ctx) {
  const totalFrames = 450;
  let dashImg = null;
  try {
    dashImg = await loadImage(resolve(SCREENSHOTS_DIR, 'dashboard.png'));
  } catch { }

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('LIVE DASHBOARD', W / 2, 60);
    ctx.textAlign = 'left';

    if (dashImg) {
      // Animate screenshot appearing
      const a = easeInOut(Math.min(1, f / 40));
      ctx.globalAlpha = a;

      // Scale to fit nicely
      const imgW = 1500, imgH = 844;
      const imgX = (W - imgW) / 2, imgY = 100;
      drawScreenshot(ctx, dashImg, imgX, imgY, imgW, imgH, 'a2a.opspawn.com/dashboard');

      // Zoom effect
      if (f > 200) {
        const zoomA = easeInOut(Math.min(1, (f - 200) / 40));
        ctx.globalAlpha = zoomA * 0.15;
        // Subtle glow around the screenshot
        ctx.shadowColor = C.accent;
        ctx.shadowBlur = 30;
        roundRect(ctx, imgX - 5, imgY - 5, imgW + 10, imgH + 10, 15);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.font = '30px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.textAlign = 'center';
      ctx.fillText('Dashboard screenshot unavailable', W / 2, H / 2);
      ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Dashboard');
    saveFrame(canvas);
  }
}

/** Section 8: Arbitrum integration (1:35-1:50, 450 frames) */
function genArbitrum(canvas, ctx) {
  const totalFrames = 450;

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('ON-CHAIN SETTLEMENT', W / 2, 80);
    ctx.textAlign = 'left';

    // Arbitrum logo/text
    if (f > 10) {
      const a = easeInOut(Math.min(1, (f - 10) / 25));
      ctx.globalAlpha = a;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'center';
      ctx.fillText('Arbitrum', W / 2, 180);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.fillText('Real USDC settlements on Arbitrum Sepolia', W / 2, 220);
      ctx.textAlign = 'left';
    }

    // Contract address
    if (f > 60) {
      const a = easeInOut(Math.min(1, (f - 60) / 25));
      ctx.globalAlpha = a;

      const contractLines = [
        { text: 'Settlement Contract', color: C.accent },
        { text: '', color: C.text },
        { text: 'Network:  Arbitrum Sepolia (421614)', color: C.dimText },
        { text: 'Token:    USDC (0x75faf114...)', color: C.dimText },
        { text: 'Wallet:   0x7483a9F2...2FvbWnsP', color: C.text },
        { text: '', color: C.text },
        { text: 'Facilitator: facilitator.payai.network', color: C.green },
      ];
      drawCodeBlock(ctx, 200, 270, W - 400, 300, contractLines, 24);
    }

    // Transaction flow
    if (f > 180) {
      const a = easeInOut(Math.min(1, (f - 180) / 30));
      ctx.globalAlpha = a;

      const txY = 620;
      drawBox(ctx, 200, txY, 200, 60, 'Agent Wallet', C.accent);
      drawArrow(ctx, 400, txY + 30, 600, txY + 30, C.orange, '$0.01 USDC');
      drawBox(ctx, 600, txY, 200, 60, 'x402 Facilitator', C.orange);
      drawArrow(ctx, 800, txY + 30, 1000, txY + 30, C.green, 'Verify + Settle');
      drawBox(ctx, 1000, txY, 200, 60, 'Service Wallet', C.green);
    }

    // Settlement confirmation
    if (f > 280) {
      const a = easeInOut(Math.min(1, (f - 280) / 25));
      ctx.globalAlpha = a;

      roundRect(ctx, W / 2 - 350, 740, 700, 80, 10);
      ctx.fillStyle = C.green + '15';
      ctx.fill();
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = C.green;
      ctx.textAlign = 'center';
      ctx.fillText('✓ Settlement confirmed on-chain in < 2 seconds', W / 2, 790);
      ctx.textAlign = 'left';
    }

    // Multi-chain note
    if (f > 340) {
      const a = easeInOut(Math.min(1, (f - 340) / 25));
      ctx.globalAlpha = a;
      ctx.font = '22px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.textAlign = 'center';
      ctx.fillText('Also supports Base (mainnet) and SKALE Europa (gasless)', W / 2, 870);
      ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Arbitrum Integration');
    saveFrame(canvas);
  }
}

/** Section 9: Discovery (1:50-2:00, 300 frames) */
async function genDiscovery(canvas, ctx) {
  const totalFrames = 300;
  let bazaarImg = null, agentCardImg = null;
  try {
    bazaarImg = await loadImage(resolve(SCREENSHOTS_DIR, 'bazaar.png'));
    agentCardImg = await loadImage(resolve(SCREENSHOTS_DIR, 'agent-card.png'));
  } catch {}

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.02);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText('AGENT DISCOVERY', W / 2, 60);
    ctx.textAlign = 'left';

    // Two-panel layout
    const panelW = 800, panelH = 400;
    const gap = 40;
    const startX = (W - panelW * 2 - gap) / 2;

    // Bazaar panel
    if (f > 10) {
      const a = easeInOut(Math.min(1, (f - 10) / 30));
      ctx.globalAlpha = a;

      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = C.green;
      ctx.fillText('/x402/bazaar', startX + 10, 105);

      if (bazaarImg) {
        drawScreenshot(ctx, bazaarImg, startX, 120, panelW, panelH, 'a2a.opspawn.com/x402/bazaar');
      }
    }

    // Agent card panel
    if (f > 60) {
      const a = easeInOut(Math.min(1, (f - 60) / 30));
      ctx.globalAlpha = a;

      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = C.accent;
      ctx.fillText('/.well-known/agent-card.json', startX + panelW + gap + 10, 105);

      if (agentCardImg) {
        drawScreenshot(ctx, agentCardImg, startX + panelW + gap, 120, panelW, panelH, 'agent-card.json');
      }
    }

    // Description
    if (f > 150) {
      const a = easeInOut(Math.min(1, (f - 150) / 25));
      ctx.globalAlpha = a;

      const descY = 580;
      const descs = [
        { icon: '🔍', text: 'Bazaar: Machine-readable service catalog with pricing', color: C.green },
        { icon: '🤖', text: 'Agent Card: A2A-compatible agent discovery endpoint', color: C.accent },
        { icon: '🔗', text: 'Agents discover and pay each other automatically', color: C.text },
      ];

      for (let i = 0; i < descs.length; i++) {
        if (f > 150 + i * 25) {
          const da = easeInOut(Math.min(1, (f - 150 - i * 25) / 20));
          ctx.globalAlpha = da;
          ctx.font = '26px sans-serif';
          ctx.fillStyle = descs[i].color;
          ctx.textAlign = 'center';
          ctx.fillText(`${descs[i].icon}  ${descs[i].text}`, W / 2, descY + i * 50);
          ctx.textAlign = 'left';
        }
      }
    }

    ctx.globalAlpha = 1;
    drawBottomBar(ctx, 'Discovery');
    saveFrame(canvas);
  }
}

/** Section 10: Closing (2:00-2:15, 450 frames) */
function genClosing(canvas, ctx) {
  const totalFrames = 450;

  for (let f = 0; f < totalFrames; f++) {
    drawGradientBg(ctx);
    drawGrid(ctx, 0.03);

    const fadeIn = Math.min(1, f / 35);
    const alpha = easeInOut(fadeIn);
    ctx.globalAlpha = alpha;

    // Title
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText('A2A x402 Gateway', W / 2, H / 2 - 120);

    // Tagline
    ctx.font = '32px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.fillText('The commerce layer for AI agents', W / 2, H / 2 - 60);

    // Decorative line
    const lineW = 500;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - lineW / 2, H / 2 - 25);
    ctx.lineTo(W / 2 + lineW / 2, H / 2 - 25);
    ctx.stroke();

    // Built by
    if (f > 40) {
      const ba = easeInOut(Math.min(1, (f - 40) / 25));
      ctx.globalAlpha = ba;
      ctx.font = '28px sans-serif';
      ctx.fillStyle = C.dimText;
      ctx.fillText('Built by OpSpawn — an autonomous AI agent', W / 2, H / 2 + 30);
    }

    // Links
    if (f > 80) {
      const la = easeInOut(Math.min(1, (f - 80) / 25));
      ctx.globalAlpha = la;

      const links = [
        { label: 'Live', url: 'a2a.opspawn.com', color: C.green },
        { label: 'GitHub', url: 'github.com/opspawn/a2a-x402-gateway', color: C.accent },
        { label: 'Dashboard', url: 'a2a.opspawn.com/dashboard', color: C.orange },
      ];

      for (let i = 0; i < links.length; i++) {
        const ly = H / 2 + 90 + i * 50;
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = links[i].color;
        ctx.fillText(`${links[i].label}:`, W / 2 - 200, ly);
        ctx.font = '22px monospace';
        ctx.fillStyle = C.text;
        ctx.textAlign = 'left';
        ctx.fillText(links[i].url, W / 2 - 100, ly);
        ctx.textAlign = 'center';
      }
    }

    // Fade out at end
    if (f > totalFrames - 60) {
      const fadeOut = 1 - (f - (totalFrames - 60)) / 60;
      ctx.globalAlpha = Math.max(0, fadeOut);
    }

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    // Don't draw bottom bar on closing — cleaner look
    if (f < totalFrames - 60) {
      drawBottomBar(ctx, 'github.com/opspawn');
    }

    saveFrame(canvas);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────

async function main() {
  console.log('=== A2A x402 Gateway Demo Video Generator ===\n');

  // Clean up and create frames directory
  if (existsSync(FRAMES_DIR)) {
    console.log('Cleaning existing frames...');
    rmSync(FRAMES_DIR, { recursive: true });
  }
  mkdirSync(FRAMES_DIR, { recursive: true });

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Set default text rendering
  ctx.textBaseline = 'middle';

  console.log('Generating Section 1: Title Card (150 frames)...');
  genTitleCard(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 2: Problem Statement (300 frames)...');
  genProblemStatement(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 3: Architecture (450 frames)...');
  genArchitecture(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 4: Live Stats (450 frames)...');
  genLiveStats(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 5: Free Service Demo (450 frames)...');
  genFreeServiceDemo(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 6: Paid Service Demo (600 frames)...');
  genPaidServiceDemo(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 7: Dashboard (450 frames)...');
  await genDashboard(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 8: Arbitrum Integration (450 frames)...');
  genArbitrum(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 9: Discovery (300 frames)...');
  await genDiscovery(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  console.log('Generating Section 10: Closing (450 frames)...');
  genClosing(canvas, ctx);
  console.log(`  → ${frameNum} frames total`);

  const totalSeconds = frameNum / FPS;
  console.log(`\nTotal: ${frameNum} frames = ${totalSeconds.toFixed(1)}s at ${FPS}fps`);

  // Compose video with ffmpeg
  console.log('\nComposing video with ffmpeg...');
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-framerate', String(FPS),
    '-i', resolve(FRAMES_DIR, 'frame_%05d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '23',
    '-preset', 'medium',
    OUTPUT,
  ].join(' ');

  console.log(`  ${ffmpegCmd}`);
  execSync(ffmpegCmd, { stdio: 'inherit', timeout: 300000 });

  // Copy to public
  mkdirSync(resolve(BASE_DIR, 'public'), { recursive: true });
  execSync(`cp "${OUTPUT}" "${PUBLIC_OUTPUT}"`);

  console.log(`\n✅ Video saved to: ${OUTPUT}`);
  console.log(`✅ Public copy: ${PUBLIC_OUTPUT}`);

  // Get file size
  const stat = execSync(`ls -lh "${OUTPUT}"`).toString().trim();
  console.log(`  ${stat}`);

  // Clean up frames
  console.log('\nCleaning up frames directory...');
  rmSync(FRAMES_DIR, { recursive: true });
  console.log('Done! Frames cleaned up.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
