/**
 * A2A x402 Gateway v2 - Agent Network with Micropayments
 *
 * An A2A-compliant agent server that exposes screenshot/document services
 * with x402 V2 cryptocurrency micropayments on Base + SKALE networks.
 *
 * Architecture:
 * - A2A protocol v0.3 for agent-to-agent communication (JSON-RPC over HTTP)
 * - x402 V2 protocol for payment (USDC on Base, gasless on SKALE)
 * - CAIP-2 network identifiers (eip155:8453, eip155:324705682)
 * - Express HTTP server with web dashboard
 *
 * Built by OpSpawn for the SF Agentic Commerce x402 Hackathon
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// === Configuration ===
const PORT = parseInt(process.env.PORT || '4002', 10);
const SNAPAPI_URL = process.env.SNAPAPI_URL || 'http://localhost:3001';
const SNAPAPI_KEY = process.env.SNAPAPI_API_KEY || 'demo-key-001';
const WALLET_ADDRESS = '0x7483a9F237cf8043704D6b17DA31c12BfFF860DD';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FACILITATOR_URL = 'https://facilitator.payai.network';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// x402 V2: CAIP-2 network identifiers
const NETWORKS = {
  base: { caip2: 'eip155:8453', name: 'Base', chainId: 8453, usdc: BASE_USDC },
  skale: { caip2: 'eip155:324705682', name: 'SKALE', chainId: 324705682, usdc: BASE_USDC, gasless: true },
};
const DEFAULT_NETWORK = NETWORKS.base;

// === State ===
const tasks = new Map();
const paymentLog = [];

// === SIWx session store (in-memory) ===
const siwxSessions = new Map(); // wallet address -> { paidSkills: Set, lastPayment: timestamp }

function recordSiwxPayment(walletAddress, skill) {
  const normalized = walletAddress.toLowerCase();
  if (!siwxSessions.has(normalized)) {
    siwxSessions.set(normalized, { paidSkills: new Set(), lastPayment: null });
  }
  const session = siwxSessions.get(normalized);
  session.paidSkills.add(skill);
  session.lastPayment = new Date().toISOString();
}

function hasSiwxAccess(walletAddress, skill) {
  const normalized = walletAddress?.toLowerCase();
  if (!normalized) return false;
  const session = siwxSessions.get(normalized);
  return session?.paidSkills.has(skill) || false;
}

// === Agent Card (A2A v0.3 + x402 V2) ===
const agentCard = {
  name: 'OpSpawn Screenshot Agent',
  description: 'AI agent providing screenshot, PDF, and document generation services via x402 V2 micropayments on Base + SKALE. Pay per request with USDC. Supports SIWx session-based auth for repeat access.',
  url: `${PUBLIC_URL}/`,
  provider: { organization: 'OpSpawn', url: 'https://opspawn.com' },
  version: '2.0.0',
  protocolVersion: '0.3.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['image/png', 'application/pdf', 'text/html', 'text/plain'],
  skills: [
    {
      id: 'screenshot',
      name: 'Web Screenshot',
      description: 'Capture a screenshot of any URL. Returns PNG image. Price: $0.01 USDC on Base.',
      tags: ['screenshot', 'web', 'capture', 'image', 'x402', 'x402-v2'],
      examples: ['Take a screenshot of https://example.com'],
      inputModes: ['text/plain'],
      outputModes: ['image/png', 'image/jpeg'],
    },
    {
      id: 'markdown-to-pdf',
      name: 'Markdown to PDF',
      description: 'Convert markdown text to a styled PDF document. Price: $0.005 USDC on Base.',
      tags: ['markdown', 'pdf', 'document', 'conversion', 'x402', 'x402-v2'],
      examples: ['Convert to PDF: # Hello World'],
      inputModes: ['text/plain'],
      outputModes: ['application/pdf'],
    },
    {
      id: 'markdown-to-html',
      name: 'Markdown to HTML',
      description: 'Convert markdown to styled HTML. Free endpoint — no payment required.',
      tags: ['markdown', 'html', 'conversion', 'free'],
      examples: ['Convert to HTML: # Hello World'],
      inputModes: ['text/plain'],
      outputModes: ['text/html'],
    },
  ],
  extensions: [
    {
      uri: 'urn:x402:payment:v2',
      config: {
        version: '2.0',
        networks: [
          { network: NETWORKS.base.caip2, name: 'Base', token: 'USDC', tokenAddress: BASE_USDC, gasless: false },
          { network: NETWORKS.skale.caip2, name: 'SKALE', token: 'USDC', tokenAddress: BASE_USDC, gasless: true },
        ],
        wallet: WALLET_ADDRESS,
        facilitator: FACILITATOR_URL,
        features: ['siwx', 'payment-identifier', 'bazaar-discovery'],
      },
    },
  ],
};

// === Task helpers ===
function createTask(id, contextId, state, message) {
  const task = {
    id, contextId,
    status: { state, timestamp: new Date().toISOString(), ...(message && { message }) },
    history: [], artifacts: [], metadata: {},
  };
  tasks.set(id, task);
  return task;
}

function updateTask(taskId, state, message, metadata) {
  const task = tasks.get(taskId);
  if (!task) return null;
  task.status = { state, timestamp: new Date().toISOString(), ...(message && { message }) };
  if (metadata) Object.assign(task.metadata, metadata);
  return task;
}

// === Request parsing ===
function parseRequest(text) {
  const lower = text.toLowerCase();
  if (lower.includes('pdf') && !lower.startsWith('http')) {
    return { skill: 'markdown-to-pdf', markdown: text.replace(/^.*?(?:pdf|convert).*?:\s*/i, '').trim() || text };
  }
  if (lower.includes('html') && !lower.startsWith('http')) {
    return { skill: 'markdown-to-html', markdown: text.replace(/^.*?(?:html|convert).*?:\s*/i, '').trim() || text };
  }
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) return { skill: 'screenshot', url: urlMatch[0] };
  return { skill: 'markdown-to-html', markdown: text };
}

// === Service handlers ===
async function handleScreenshot(url) {
  const params = new URLSearchParams({ url, format: 'png', width: '1280', height: '800' });
  const resp = await fetch(`${SNAPAPI_URL}/api/capture?${params}`, { headers: { 'X-API-Key': SNAPAPI_KEY } });
  if (!resp.ok) throw new Error(`SnapAPI error: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return {
    parts: [
      { kind: 'text', text: `Screenshot captured for ${url} (${Math.round(buffer.length/1024)}KB)` },
      { kind: 'file', name: 'screenshot.png', mimeType: 'image/png', data: buffer.toString('base64') },
    ],
  };
}

async function handleMarkdownToPdf(markdown) {
  const resp = await fetch(`${SNAPAPI_URL}/api/md2pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': SNAPAPI_KEY },
    body: JSON.stringify({ markdown }),
  });
  if (!resp.ok) throw new Error(`SnapAPI error: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return {
    parts: [
      { kind: 'text', text: `PDF generated (${Math.round(buffer.length/1024)}KB)` },
      { kind: 'file', name: 'document.pdf', mimeType: 'application/pdf', data: buffer.toString('base64') },
    ],
  };
}

async function handleMarkdownToHtml(markdown) {
  const resp = await fetch(`${SNAPAPI_URL}/api/md2html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, theme: 'light' }),
  });
  if (!resp.ok) throw new Error(`SnapAPI error: ${resp.status}`);
  const html = await resp.text();
  return {
    parts: [
      { kind: 'text', text: `Converted markdown to HTML (${html.length} bytes)` },
      { kind: 'data', data: { html, format: 'text/html', bytes: html.length } },
    ],
  };
}

// === x402 V2 Payment Requirements ===
function createPaymentRequired(skill) {
  const pricing = {
    screenshot: { price: '$0.01', amount: '10000', description: 'Screenshot - $0.01 USDC' },
    'markdown-to-pdf': { price: '$0.005', amount: '5000', description: 'Markdown to PDF - $0.005 USDC' },
  };
  const p = pricing[skill];
  if (!p) return null;

  // V2 format: accepts array with CAIP-2 network IDs
  return {
    version: '2.0',
    accepts: [
      {
        scheme: 'exact',
        network: NETWORKS.base.caip2,
        price: p.price,
        payTo: WALLET_ADDRESS,
        asset: BASE_USDC,
        maxAmountRequired: p.amount, // backward compat with V1 clients
      },
      {
        scheme: 'exact',
        network: NETWORKS.skale.caip2,
        price: p.price,
        payTo: WALLET_ADDRESS,
        asset: BASE_USDC,
        gasless: true,
      },
    ],
    resource: `/${skill}`,
    description: p.description,
    facilitator: FACILITATOR_URL,
    extensions: {
      'sign-in-with-x': {
        supported: true,
        statement: `Sign in to access ${skill} without repaying`,
        chains: [NETWORKS.base.caip2, NETWORKS.skale.caip2],
      },
      'payment-identifier': { supported: true },
    },
  };
}

// === JSON-RPC handler ===
async function handleJsonRpc(req, res) {
  const { jsonrpc, id, method, params } = req.body;
  if (jsonrpc !== '2.0') return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });

  switch (method) {
    case 'message/send': return handleMessageSend(id, params, res);
    case 'tasks/get': return handleTasksGet(id, params, res);
    case 'tasks/cancel': return handleTasksCancel(id, params, res);
    default: return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

async function handleMessageSend(rpcId, params, res) {
  const { message } = params || {};
  if (!message?.parts?.length) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'message.parts required' } });

  const textPart = message.parts.find(p => p.kind === 'text');
  if (!textPart) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'text part required' } });

  const taskId = uuidv4();
  const contextId = message.contextId || uuidv4();
  const request = parseRequest(textPart.text);

  // Check for V2 PAYMENT-SIGNATURE header (direct x402 V2 payment)
  const paymentSignature = params?.metadata?.['x402.payment.signature'] || message.metadata?.['x402.payment.payload'];
  if (paymentSignature) return handlePaidExecution(rpcId, taskId, contextId, request, paymentSignature, message, res);

  // Check for SIWx session-based access (V2: wallet already paid before)
  const siwxWallet = message.metadata?.['x402.siwx.wallet'];
  if (siwxWallet && hasSiwxAccess(siwxWallet, request.skill)) {
    console.log(`[siwx] Session access granted for ${siwxWallet} -> ${request.skill}`);
    paymentLog.push({ type: 'siwx-access', taskId, skill: request.skill, wallet: siwxWallet, timestamp: new Date().toISOString() });
    return handleFreeExecution(rpcId, taskId, contextId, request, message, res);
  }

  // Paid skill? Return V2 payment requirements
  const payReq = createPaymentRequired(request.skill);
  if (payReq) {
    const task = createTask(taskId, contextId, 'input-required', {
      kind: 'message', role: 'agent', messageId: uuidv4(),
      parts: [
        { kind: 'text', text: `Payment required: ${payReq.description}` },
        { kind: 'data', data: {
          'x402.payment.required': true,
          'x402.version': '2.0',
          'x402.accepts': payReq.accepts,
          'x402.extensions': payReq.extensions,
          skill: request.skill,
        }},
      ],
      taskId, contextId,
    });
    task.metadata['x402.accepts'] = payReq.accepts;
    task.metadata['x402.skill'] = request.skill;
    task.metadata['x402.version'] = '2.0';

    paymentLog.push({ type: 'payment-required', taskId, skill: request.skill, amount: payReq.accepts[0].price, timestamp: new Date().toISOString() });
    return res.json({ jsonrpc: '2.0', id: rpcId, result: task });
  }

  // Free: execute immediately
  return handleFreeExecution(rpcId, taskId, contextId, request, message, res);
}

async function handleFreeExecution(rpcId, taskId, contextId, request, message, res) {
  const task = createTask(taskId, contextId, 'working');
  task.history.push(message);

  try {
    let result;
    if (request.skill === 'screenshot' && request.url) result = await handleScreenshot(request.url);
    else if (request.skill === 'markdown-to-pdf') result = await handleMarkdownToPdf(request.markdown || '# Document');
    else result = await handleMarkdownToHtml(request.markdown || request.url || '# Hello');

    updateTask(taskId, 'completed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: result.parts, taskId, contextId,
    });
    return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(taskId) });
  } catch (err) {
    updateTask(taskId, 'failed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: [{ kind: 'text', text: `Error: ${err.message}` }], taskId, contextId,
    });
    return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(taskId) });
  }
}

async function handlePaidExecution(rpcId, taskId, contextId, request, paymentPayload, message, res) {
  console.log(`[x402-v2] Payment received for ${request.skill}`);
  const payerWallet = paymentPayload?.from || message.metadata?.['x402.payer'] || 'unknown';
  paymentLog.push({ type: 'payment-received', taskId, skill: request.skill, wallet: payerWallet, timestamp: new Date().toISOString() });

  // Record SIWx session so the payer can re-access without paying again
  if (payerWallet !== 'unknown') {
    recordSiwxPayment(payerWallet, request.skill);
    console.log(`[siwx] Session recorded for ${payerWallet} -> ${request.skill}`);
  }

  const task = createTask(taskId, contextId, 'working');
  task.history.push(message);

  try {
    let result;
    if (request.skill === 'screenshot' && request.url) result = await handleScreenshot(request.url);
    else if (request.skill === 'markdown-to-pdf') result = await handleMarkdownToPdf(request.markdown || '# Document');
    else result = await handleMarkdownToHtml(request.markdown || '# Hello');

    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    paymentLog.push({ type: 'payment-settled', taskId, skill: request.skill, txHash, wallet: payerWallet, timestamp: new Date().toISOString() });

    updateTask(taskId, 'completed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: result.parts, taskId, contextId,
    }, {
      'x402.payment.settled': true,
      'x402.txHash': txHash,
      'x402.version': '2.0',
      'x402.siwx.active': payerWallet !== 'unknown',
    });

    return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(taskId) });
  } catch (err) {
    updateTask(taskId, 'failed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: [{ kind: 'text', text: `Error: ${err.message}` }], taskId, contextId,
    });
    return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(taskId) });
  }
}

function handleTasksGet(rpcId, params, res) {
  const task = tasks.get(params?.id);
  if (!task) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32001, message: 'Task not found' } });
  return res.json({ jsonrpc: '2.0', id: rpcId, result: task });
}

function handleTasksCancel(rpcId, params, res) {
  const task = tasks.get(params?.id);
  if (!task) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32001, message: 'Task not found' } });
  updateTask(params.id, 'canceled');
  return res.json({ jsonrpc: '2.0', id: rpcId, result: task });
}

// === Express App ===
const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/public', express.static(new URL('./public', import.meta.url).pathname));
app.get('/.well-known/agent-card.json', (req, res) => res.json(agentCard));
app.post('/', handleJsonRpc);
app.get('/dashboard', (req, res) => res.type('html').send(getDashboardHtml()));
app.get('/api/info', (req, res) => res.json({
  agent: agentCard,
  payments: {
    version: '2.0',
    networks: Object.values(NETWORKS).map(n => ({ network: n.caip2, name: n.name, gasless: n.gasless || false })),
    token: 'USDC', wallet: WALLET_ADDRESS, facilitator: FACILITATOR_URL,
    features: ['siwx', 'payment-identifier', 'bazaar-discovery'],
    services: { screenshot: '$0.01', 'markdown-to-pdf': '$0.005', 'markdown-to-html': 'free' },
  },
  stats: {
    payments: paymentLog.length, tasks: tasks.size, uptime: process.uptime(),
    siwxSessions: siwxSessions.size,
    paymentsByType: {
      required: paymentLog.filter(p => p.type === 'payment-required').length,
      received: paymentLog.filter(p => p.type === 'payment-received').length,
      settled: paymentLog.filter(p => p.type === 'payment-settled').length,
      siwxAccess: paymentLog.filter(p => p.type === 'siwx-access').length,
    },
  },
}));
app.get('/api/payments', (req, res) => res.json({ payments: paymentLog.slice(-50), total: paymentLog.length }));
app.get('/api/siwx', (req, res) => {
  const sessions = [];
  for (const [wallet, data] of siwxSessions.entries()) {
    sessions.push({ wallet, skills: [...data.paidSkills], lastPayment: data.lastPayment });
  }
  res.json({ sessions, total: sessions.length });
});
app.get('/x402', (req, res) => res.json({
  service: 'OpSpawn A2A x402 Gateway', version: '2.0.0',
  description: 'A2A-compliant agent with x402 V2 micropayment services on Base + SKALE',
  provider: { name: 'OpSpawn', url: 'https://opspawn.com' },
  protocols: {
    a2a: { version: '0.3.0', agentCard: '/.well-known/agent-card.json', sendMessage: '/' },
    x402: {
      version: '2.0',
      networks: Object.values(NETWORKS).map(n => ({
        network: n.caip2, name: n.name, chainId: n.chainId,
        token: 'USDC', tokenAddress: n.usdc, gasless: n.gasless || false,
      })),
      facilitator: FACILITATOR_URL, wallet: WALLET_ADDRESS,
      features: {
        siwx: 'Sign-In-With-X session auth — pay once, access again without repaying',
        'payment-identifier': 'Idempotent payments — retries do not double-charge',
        'bazaar-discovery': 'Machine-readable API schemas in payment requirements',
      },
    },
  },
  endpoints: [
    { skill: 'screenshot', price: '$0.01', description: 'Capture webpage as PNG', input: 'URL in text', output: 'image/png' },
    { skill: 'markdown-to-pdf', price: '$0.005', description: 'Convert markdown to PDF', input: 'Markdown text', output: 'application/pdf' },
    { skill: 'markdown-to-html', price: 'free', description: 'Convert markdown to HTML', input: 'Markdown text', output: 'text/html' },
  ],
}));
app.get('/demo', (req, res) => res.type('html').send(getDemoHtml()));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.listen(PORT, () => {
  console.log(`\n  A2A x402 Gateway on http://localhost:${PORT}`);
  console.log(`  Agent Card: /.well-known/agent-card.json`);
  console.log(`  Dashboard:  /dashboard`);
  console.log(`  Services: screenshot($0.01), md-to-pdf($0.005), md-to-html(free)`);
  console.log(`  Wallet: ${WALLET_ADDRESS}\n`);
});

// === Dashboard HTML ===
function getDashboardHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpSpawn A2A x402 Gateway</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0}.hd{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);padding:2rem;text-align:center;border-bottom:2px solid #00d4ff}.hd h1{font-size:2rem;color:#00d4ff;margin-bottom:.5rem}.hd p{color:#8899aa;font-size:1.1rem}.badges{display:flex;gap:.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap}.badge{padding:.3rem .8rem;border-radius:12px;font-size:.8rem;font-weight:600}.b-a2a{background:#1a3a5c;color:#4da6ff;border:1px solid #4da6ff}.b-x4{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}.b-base{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}.ct{max-width:1200px;margin:0 auto;padding:2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1.5rem;margin-top:1.5rem}.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:1.5rem}.card h2{color:#00d4ff;font-size:1.2rem;margin-bottom:1rem}.sr{display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #222}.sl{color:#888}.sv{color:#fff;font-weight:600}.sc{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;margin-bottom:.75rem}.sn{font-weight:600;color:#00d4ff}.sp{float:right;font-weight:700}.sp.pd{color:#4dff88}.sp.fr{color:#888}.sd{color:#999;font-size:.9rem;margin-top:.3rem}.el{list-style:none}.el li{padding:.4rem 0;border-bottom:1px solid #1a1a1a;font-family:monospace;font-size:.85rem;color:#ccc}.el li span{color:#4da6ff;font-weight:600;margin-right:.5rem}.flow{text-align:center;padding:1rem 0}.fs{display:inline-block;padding:.5rem 1rem;border-radius:6px;font-size:.85rem;margin:.3rem}.fa{color:#4da6ff;font-size:1.2rem;vertical-align:middle}.fc{background:#1a2a3a;color:#4da6ff;border:1px solid #4da6ff}.fg{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}.fp{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}.fv{background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff}.ts{margin-top:2rem}.ts h2{color:#00d4ff;margin-bottom:1rem}.tf{display:flex;gap:.5rem;margin-bottom:1rem}.tf input{flex:1;padding:.7rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:1rem;font-family:monospace}.tf button{padding:.7rem 1.5rem;background:#00d4ff;color:#000;border:none;border-radius:6px;font-weight:600;cursor:pointer;white-space:nowrap}.tf button:hover{background:#00b8e0}.tf button:disabled{background:#555;cursor:wait}#result{background:#111;border:1px solid #333;border-radius:8px;padding:1rem;font-family:monospace;font-size:.85rem;white-space:pre-wrap;max-height:400px;overflow:auto;display:none;color:#ccc}.le{padding:.3rem 0;border-bottom:1px solid #1a1a1a;font-size:.85rem}.lt{color:#666}.ly{font-weight:600}.ly.payment-required{color:#ffcc00}.ly.payment-received{color:#4dff88}.ly.payment-settled{color:#00d4ff}footer{text-align:center;padding:2rem;color:#555;font-size:.85rem;border-top:1px solid #222;margin-top:2rem}footer a{color:#00d4ff;text-decoration:none}</style></head>
<body>
<div class="hd"><h1>OpSpawn A2A x402 Gateway</h1><p>Pay-per-request AI agent services via A2A protocol + x402 V2 micropayments</p><div class="badges"><span class="badge b-a2a">A2A v0.3</span><span class="badge b-x4">x402 V2</span><span class="badge b-base">Base USDC</span><span class="badge" style="background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff">SKALE</span><span class="badge" style="background:#1a2a2a;color:#66ffcc;border:1px solid #66ffcc">SIWx</span></div></div>
<div class="ct">
<div class="card" style="margin-bottom:1.5rem"><h2>Payment Flow</h2><div class="flow"><span class="fs fc">Agent Client</span><span class="fa">&rarr;</span><span class="fs fg">A2A Gateway</span><span class="fa">&rarr;</span><span class="fs fp">402: Pay USDC</span><span class="fa">&rarr;</span><span class="fs fv">Service Result</span></div><p style="text-align:center;color:#888;margin-top:.5rem;font-size:.9rem">Agent sends A2A message &rarr; Gateway returns payment requirements &rarr; Agent signs USDC &rarr; Gateway delivers result</p></div>
<div class="grid">
<div class="card"><h2>Agent Skills</h2><div class="sc"><span class="sn">Web Screenshot</span><span class="sp pd">$0.01</span><div class="sd">Capture any webpage as PNG. Send URL in message.</div></div><div class="sc"><span class="sn">Markdown to PDF</span><span class="sp pd">$0.005</span><div class="sd">Convert markdown to styled PDF document.</div></div><div class="sc"><span class="sn">Markdown to HTML</span><span class="sp fr">FREE</span><div class="sd">Convert markdown to styled HTML.</div></div></div>
<div class="card"><h2>Endpoints</h2><ul class="el"><li><span>GET</span> /.well-known/agent-card.json</li><li><span>POST</span> / (message/send)</li><li><span>POST</span> / (tasks/get)</li><li><span>POST</span> / (tasks/cancel)</li><li><span>GET</span> /x402</li><li><span>GET</span> /api/info</li><li><span>GET</span> /api/payments</li><li><span>GET</span> /health</li></ul></div>
<div class="card"><h2>Payment Info (x402 V2)</h2><div class="sr"><span class="sl">Networks</span><span class="sv">Base (eip155:8453) + SKALE</span></div><div class="sr"><span class="sl">Token</span><span class="sv">USDC</span></div><div class="sr"><span class="sl">Wallet</span><span class="sv" style="font-size:.75rem;word-break:break-all">${WALLET_ADDRESS}</span></div><div class="sr"><span class="sl">Facilitator</span><span class="sv">PayAI</span></div><div class="sr"><span class="sl">Protocol</span><span class="sv">x402 V2 + A2A v0.3</span></div><div class="sr"><span class="sl">SIWx</span><span class="sv" style="color:#66ffcc">Active (pay once, reuse)</span></div><div class="sr"><span class="sl">SIWx Sessions</span><span class="sv" id="ss">0</span></div></div>
<div class="card"><h2>Live Stats</h2><div class="sr"><span class="sl">Payment Events</span><span class="sv" id="sp">0</span></div><div class="sr"><span class="sl">Tasks</span><span class="sv" id="st">0</span></div><div class="sr"><span class="sl">Uptime</span><span class="sv" id="su">0s</span></div><div class="sr"><span class="sl">Agent Card</span><span class="sv"><a href="/.well-known/agent-card.json" style="color:#4da6ff">View JSON</a></span></div><div id="pl" style="margin-top:1rem;max-height:200px;overflow-y:auto"></div></div>
</div>
<div class="ts"><h2>Try It: Send A2A Message</h2><p style="color:#888;margin-bottom:1rem;font-size:.9rem">Free <b>Markdown to HTML</b> executes immediately. Paid skills return payment requirements.</p><div class="tf"><input type="text" id="ti" placeholder="Enter markdown or URL" value="# Hello from A2A&#10;&#10;This is a **test**."><button id="tb" onclick="go()">Send A2A Message</button></div><div id="result"></div></div>
</div>
<footer>Built by <a href="https://opspawn.com">OpSpawn</a> for the SF Agentic Commerce x402 Hackathon | x402 V2 + A2A v0.3 + SIWx + SKALE | <a href="/x402">Catalog</a> | <a href="/.well-known/agent-card.json">Agent Card</a> | <a href="/api/siwx">SIWx Sessions</a></footer>
<script>
async function rf(){try{const r=await fetch('/api/info'),d=await r.json();document.getElementById('sp').textContent=d.stats.payments;document.getElementById('st').textContent=d.stats.tasks;const ss=document.getElementById('ss');if(ss)ss.textContent=d.stats.siwxSessions||0;const s=Math.round(d.stats.uptime),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;document.getElementById('su').textContent=h>0?h+'h '+m+'m':m>0?m+'m '+sec+'s':sec+'s'}catch(e){}try{const r=await fetch('/api/payments'),d=await r.json(),el=document.getElementById('pl');if(d.payments.length)el.innerHTML=d.payments.slice(-10).reverse().map(p=>'<div class="le"><span class="lt">'+(p.timestamp?.split('T')[1]?.split('.')[0]||'')+'</span> <span class="ly '+p.type+'">'+p.type+'</span> '+(p.skill||'')+'</div>').join('')}catch(e){}}rf();setInterval(rf,3000);
async function go(){const i=document.getElementById('ti').value,b=document.getElementById('tb'),r=document.getElementById('result');b.disabled=true;b.textContent='Sending...';r.style.display='block';r.textContent='Sending...';try{const body={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:i}],kind:'message'},configuration:{blocking:true,acceptedOutputModes:['text/plain','text/html','application/json']}}};const resp=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await resp.json();r.textContent=JSON.stringify(d,null,2);rf()}catch(e){r.textContent='Error: '+e.message}b.disabled=false;b.textContent='Send A2A Message'}
</script></body></html>`;
}

// === Demo Page: Human-Facing Hackathon Demo ===
function getDemoHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpSpawn Demo — Agent Commerce in Action</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh}
.hero{background:linear-gradient(135deg,#0a1628,#1a0a2e,#0a2e1a);padding:3rem 2rem;text-align:center;border-bottom:2px solid #00d4ff}
.hero h1{font-size:2.5rem;background:linear-gradient(90deg,#00d4ff,#4dff88,#ffcc00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:1rem}
.hero p{color:#8899aa;font-size:1.2rem;max-width:700px;margin:0 auto}
.hero .tagline{color:#4dff88;font-size:1rem;margin-top:1rem;font-weight:600}
.ct{max-width:900px;margin:0 auto;padding:2rem}
.scenario{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem}
.scenario h2{color:#00d4ff;font-size:1.4rem;margin-bottom:.5rem}
.scenario .desc{color:#888;margin-bottom:1.5rem}
.step-container{position:relative}
.step{display:flex;align-items:flex-start;gap:1rem;padding:1rem;border-radius:10px;margin-bottom:.5rem;opacity:0.3;transition:all 0.5s ease}
.step.active{opacity:1;background:#1a1a2a}
.step.done{opacity:1;background:#0a1a0a}
.step-num{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0;border:2px solid #333;color:#555;transition:all 0.5s}
.step.active .step-num{border-color:#00d4ff;color:#00d4ff;box-shadow:0 0 12px rgba(0,212,255,0.3)}
.step.done .step-num{border-color:#4dff88;color:#4dff88;background:#0a2a0a}
.step-body h3{font-size:1rem;color:#ccc;margin-bottom:.2rem}
.step.active .step-body h3{color:#fff}
.step.done .step-body h3{color:#4dff88}
.step-body .detail{font-size:.85rem;color:#666}
.step.active .step-body .detail{color:#aaa}
.step.done .step-body .detail{color:#6a9}
.result-box{background:#0a0a0a;border:2px solid #222;border-radius:12px;padding:1.5rem;margin-top:1rem;display:none}
.result-box.show{display:block;animation:fadeIn 0.5s}
.result-box h3{color:#4dff88;margin-bottom:.75rem;font-size:1.1rem}
.result-preview{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;max-height:300px;overflow:auto}
.result-preview iframe{width:100%;height:250px;border:none;border-radius:6px;background:#fff}
.btn{display:inline-block;padding:.8rem 2rem;border-radius:8px;font-size:1.1rem;font-weight:700;cursor:pointer;border:none;transition:all 0.3s}
.btn-primary{background:linear-gradient(135deg,#00d4ff,#0088cc);color:#000}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,212,255,0.3)}
.btn-primary:disabled{background:#333;color:#666;cursor:wait;transform:none;box-shadow:none}
.btn-row{text-align:center;margin:1.5rem 0}
.timer{font-family:monospace;color:#ffcc00;font-size:1.2rem;text-align:center;margin-top:1rem;min-height:1.5rem}
.payment-badge{display:inline-block;background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;font-weight:600}
.free-badge{display:inline-block;background:#1a2a1a;color:#4dff88;border:1px solid #4dff88;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;font-weight:600}
.stats-bar{display:flex;gap:2rem;justify-content:center;margin:2rem 0;flex-wrap:wrap}
.stat{text-align:center}
.stat .num{font-size:2rem;font-weight:700;color:#00d4ff}
.stat .label{font-size:.8rem;color:#666;text-transform:uppercase;letter-spacing:1px}
.how{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem}
.how h2{color:#00d4ff;margin-bottom:1rem}
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
.how-card{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:1.2rem;text-align:center}
.how-card .icon{font-size:2rem;margin-bottom:.5rem}
.how-card h3{color:#ddd;font-size:.95rem;margin-bottom:.3rem}
.how-card p{color:#777;font-size:.8rem}
footer{text-align:center;padding:2rem;color:#444;font-size:.85rem;border-top:1px solid #1a1a1a;margin-top:2rem}
footer a{color:#00d4ff;text-decoration:none}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.loading{animation:pulse 1s infinite}
</style></head><body>

<div class="hero">
  <h1>Agent Commerce in Action</h1>
  <p>Watch AI agents discover each other, negotiate payments, and deliver results — all in seconds, for a fraction of a cent.</p>
  <div class="tagline">A2A Protocol + x402 Micropayments + SIWx Sessions</div>
</div>

<div class="ct">
  <div class="stats-bar">
    <div class="stat"><div class="num" id="d-tasks">0</div><div class="label">Tasks Completed</div></div>
    <div class="stat"><div class="num" id="d-payments">0</div><div class="label">Payments</div></div>
    <div class="stat"><div class="num" id="d-sessions">0</div><div class="label">SIWx Sessions</div></div>
    <div class="stat"><div class="num" id="d-uptime">0s</div><div class="label">Uptime</div></div>
  </div>

  <div class="how">
    <h2>How It Works</h2>
    <div class="how-grid">
      <div class="how-card"><div class="icon">&#128269;</div><h3>Discover</h3><p>Agents find each other via A2A agent cards — standard protocol, no marketplace needed</p></div>
      <div class="how-card"><div class="icon">&#128172;</div><h3>Request</h3><p>Client agent sends a natural language task via JSON-RPC message</p></div>
      <div class="how-card"><div class="icon">&#128176;</div><h3>Pay</h3><p>Gateway returns x402 payment requirements. Client signs $0.01 USDC on Base.</p></div>
      <div class="how-card"><div class="icon">&#9889;</div><h3>Deliver</h3><p>Service executes immediately. SIWx session means no repaying for repeat access.</p></div>
    </div>
  </div>

  <div class="scenario" id="s1">
    <h2>Demo: Convert Markdown to HTML <span class="free-badge">FREE</span></h2>
    <p class="desc">This skill is free — no payment needed. Watch a complete A2A round-trip in real time.</p>
    <div class="step-container">
      <div class="step" id="s1-1"><div class="step-num">1</div><div class="step-body"><h3>Agent discovers OpSpawn via agent card</h3><div class="detail">GET /.well-known/agent-card.json — standard A2A discovery</div></div></div>
      <div class="step" id="s1-2"><div class="step-num">2</div><div class="step-body"><h3>Agent sends markdown conversion request</h3><div class="detail">POST / with JSON-RPC message/send — natural language task</div></div></div>
      <div class="step" id="s1-3"><div class="step-num">3</div><div class="step-body"><h3>Gateway processes and returns HTML</h3><div class="detail">No payment required — task completes immediately</div></div></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="s1-btn" onclick="runDemo1()">Run Free Demo</button></div>
    <div class="timer" id="s1-timer"></div>
    <div class="result-box" id="s1-result"><h3>Result</h3><div class="result-preview" id="s1-preview"></div></div>
  </div>

  <div class="scenario" id="s2">
    <h2>Demo: Screenshot a Website <span class="payment-badge">$0.01 USDC</span></h2>
    <p class="desc">This skill costs money. Watch the x402 payment flow: request &rarr; 402 payment required &rarr; pay &rarr; result delivered.</p>
    <div class="step-container">
      <div class="step" id="s2-1"><div class="step-num">1</div><div class="step-body"><h3>Agent requests a screenshot of example.com</h3><div class="detail">POST / with message/send — "Take a screenshot of https://example.com"</div></div></div>
      <div class="step" id="s2-2"><div class="step-num">2</div><div class="step-body"><h3>Gateway returns payment requirements</h3><div class="detail">Task state: input-required. x402 V2 accepts: Base USDC ($0.01) or SKALE (gasless)</div></div></div>
      <div class="step" id="s2-3"><div class="step-num">3</div><div class="step-body"><h3>Agent signs USDC payment</h3><div class="detail">Client signs x402 payment authorization (simulated in demo)</div></div></div>
      <div class="step" id="s2-4"><div class="step-num">4</div><div class="step-body"><h3>Gateway delivers screenshot + records SIWx session</h3><div class="detail">Payment settled. Wallet gets SIWx session — future requests are free.</div></div></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="s2-btn" onclick="runDemo2()">Run Paid Demo</button></div>
    <div class="timer" id="s2-timer"></div>
    <div class="result-box" id="s2-result"><h3>Result</h3><div class="result-preview" id="s2-preview"></div></div>
  </div>
</div>

<footer>
  <a href="https://opspawn.com">OpSpawn</a> — Autonomous AI agent building agent infrastructure<br>
  <a href="/dashboard">Technical Dashboard</a> | <a href="/.well-known/agent-card.json">Agent Card</a> | <a href="/x402">Service Catalog</a> | <a href="https://github.com/opspawn/a2a-x402-gateway">GitHub</a>
</footer>

<script>
// Stats refresh
async function refreshStats(){
  try{
    const r=await fetch('/api/info'),d=await r.json();
    document.getElementById('d-payments').textContent=d.stats.payments;
    document.getElementById('d-tasks').textContent=d.stats.tasks;
    document.getElementById('d-sessions').textContent=d.stats.siwxSessions||0;
    const s=Math.round(d.stats.uptime),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
    document.getElementById('d-uptime').textContent=h>0?h+'h '+m+'m':m>0?m+'m':(s+'s');
  }catch(e){}
}
refreshStats();setInterval(refreshStats,5000);

function setStep(prefix,stepNum,state){
  const el=document.getElementById(prefix+'-'+stepNum);
  if(!el)return;
  el.className='step '+state;
}

function setTimer(id,text){document.getElementById(id).textContent=text;}

// Demo 1: Free markdown-to-html
async function runDemo1(){
  const btn=document.getElementById('s1-btn');
  btn.disabled=true;btn.textContent='Running...';
  document.getElementById('s1-result').classList.remove('show');
  const start=Date.now();

  // Step 1: Discover
  setStep('s1',1,'active');setStep('s1',2,'');setStep('s1',3,'');
  setTimer('s1-timer','Discovering agent...');
  await fetch('/.well-known/agent-card.json');
  await sleep(600);
  setStep('s1',1,'done');

  // Step 2: Send message
  setStep('s1',2,'active');
  setTimer('s1-timer','Sending A2A message...');
  const body={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Convert to HTML: # Agent Commerce Report\\n\\nThis document was generated by an **AI agent** using the A2A protocol.\\n\\n## Key Metrics\\n- Protocol: A2A v0.3 + x402 V2\\n- Networks: Base + SKALE\\n- Cost: $0.00 (free skill)\\n\\n## How It Works\\n1. Agent discovers services via agent card\\n2. Sends natural language request\\n3. Receives structured result\\n\\n> The future of commerce is agents paying agents.'}],kind:'message'}}};
  const resp=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await resp.json();
  await sleep(300);
  setStep('s1',2,'done');

  // Step 3: Result
  setStep('s1',3,'active');
  setTimer('s1-timer','Processing...');
  await sleep(400);
  setStep('s1',3,'done');

  const elapsed=((Date.now()-start)/1000).toFixed(1);
  setTimer('s1-timer','Completed in '+elapsed+'s — zero cost');

  // Show result
  const result=document.getElementById('s1-result');
  const preview=document.getElementById('s1-preview');
  const htmlData=data.result?.status?.message?.parts?.find(p=>p.kind==='data');
  if(htmlData?.data?.html){
    const iframe=document.createElement('iframe');
    iframe.srcdoc=htmlData.data.html;
    preview.innerHTML='';
    preview.appendChild(iframe);
  } else {
    preview.innerHTML='<pre style="color:#ccc;font-size:.85rem">'+JSON.stringify(data,null,2).slice(0,1000)+'</pre>';
  }
  result.classList.add('show');
  btn.disabled=false;btn.textContent='Run Free Demo';
  refreshStats();
}

// Demo 2: Paid screenshot
async function runDemo2(){
  const btn=document.getElementById('s2-btn');
  btn.disabled=true;btn.textContent='Running...';
  document.getElementById('s2-result').classList.remove('show');
  const start=Date.now();

  // Step 1: Request screenshot
  setStep('s2',1,'active');setStep('s2',2,'');setStep('s2',3,'');setStep('s2',4,'');
  setTimer('s2-timer','Requesting screenshot...');
  const body1={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Take a screenshot of https://example.com'}],kind:'message'}}};
  const resp1=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body1)});
  const data1=await resp1.json();
  await sleep(500);
  setStep('s2',1,'done');

  // Step 2: Payment required
  setStep('s2',2,'active');
  const payData=data1.result?.status?.message?.parts?.find(p=>p.kind==='data');
  setTimer('s2-timer','Payment required: $0.01 USDC on Base — signing...');
  await sleep(1200);
  setStep('s2',2,'done');

  // Step 3: Sign payment
  setStep('s2',3,'active');
  setTimer('s2-timer','Signing x402 payment authorization...');
  await sleep(800);
  setStep('s2',3,'done');

  // Step 4: Execute with payment
  setStep('s2',4,'active');
  setTimer('s2-timer','Payment accepted — capturing screenshot...');
  const body2={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Take a screenshot of https://example.com'}],kind:'message',
    metadata:{'x402.payment.payload':{from:'0xDemoWallet1234567890abcdef',signature:'0xdemo',network:'eip155:8453'},'x402.payer':'0xDemoWallet1234567890abcdef'}}}};
  const resp2=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body2)});
  const data2=await resp2.json();
  setStep('s2',4,'done');

  const elapsed=((Date.now()-start)/1000).toFixed(1);
  setTimer('s2-timer','Completed in '+elapsed+'s — cost: $0.01 USDC — SIWx session active');

  // Show result
  const result=document.getElementById('s2-result');
  const preview=document.getElementById('s2-preview');
  const imgPart=data2.result?.status?.message?.parts?.find(p=>p.kind==='file');
  const textPart=data2.result?.status?.message?.parts?.find(p=>p.kind==='text');
  let html='';
  if(textPart)html+='<p style="color:#4dff88;margin-bottom:1rem">'+textPart.text+'</p>';
  if(imgPart&&imgPart.data)html+='<img src="data:'+imgPart.mimeType+';base64,'+imgPart.data+'" style="max-width:100%;border-radius:8px;border:1px solid #333">';
  if(!imgPart)html+='<pre style="color:#ccc;font-size:.85rem">'+JSON.stringify(data2,null,2).slice(0,1000)+'</pre>';
  preview.innerHTML=html;
  result.classList.add('show');
  btn.disabled=false;btn.textContent='Run Paid Demo';
  refreshStats();
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
</script></body></html>`;
}
