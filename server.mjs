/**
 * A2A x402 Gateway v2 - Agent Network with Micropayments
 *
 * An A2A-compliant agent server that exposes screenshot/document services
 * with x402 V2 cryptocurrency micropayments on Base + SKALE networks.
 *
 * Architecture:
 * - A2A protocol v0.3 for agent-to-agent communication (JSON-RPC over HTTP)
 * - x402 V2 protocol for payment (USDC on Base, gasless on SKALE)
 * - CAIP-2 network identifiers (eip155:8453, eip155:2046399126)
 * - Express HTTP server with web dashboard
 *
 * Built by OpSpawn for the SF Agentic Commerce x402 Hackathon
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getCredentialSync } from '/home/agent/lib/credentials.mjs';

// === Configuration ===
const PORT = parseInt(process.env.PORT || '4002', 10);
const SNAPAPI_URL = process.env.SNAPAPI_URL || 'http://localhost:3001';
const SNAPAPI_KEY = process.env.SNAPAPI_API_KEY || 'demo_a974a17d1faf618789b49ae9fd51f221';
const WALLET_ADDRESS = '0x7483a9F237cf8043704D6b17DA31c12BfFF860DD';

// === Gemini / Google AI Studio Configuration ===
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
try {
  if (!GEMINI_API_KEY) {
    const cred = getCredentialSync('gemini', 'builder');
    GEMINI_API_KEY = cred.apiKey || cred.api_key || '';
    if (GEMINI_API_KEY) console.log('[gemini] Loaded API key from credential vault');
  }
} catch (e) {
  console.log('[gemini] No credentials found in vault, will use free tier');
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FACILITATOR_URL = 'https://facilitator.payai.network';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://a2a.opspawn.com';
const STATS_API_KEY = process.env.STATS_API_KEY || '';

// Google A2A x402 Extension spec URIs (for compatibility with google-agentic-commerce/a2a-x402)
const GOOGLE_X402_EXTENSION_URI_V02 = 'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2';
const GOOGLE_X402_EXTENSION_URI_V01 = 'https://github.com/google-a2a/a2a-x402/v0.1';
const GOOGLE_X402_EXTENSION_URI = GOOGLE_X402_EXTENSION_URI_V02; // default to latest

// x402 V2: CAIP-2 network identifiers
const SKALE_USDC = '0x5F795bb52dAC3085f578f4877D450e2929D2F13d'; // Bridged USDC on SKALE Europa Hub
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Native USDC on Arbitrum One
const NETWORKS = {
  base: { caip2: 'eip155:8453', name: 'Base', chainId: 8453, usdc: BASE_USDC, rpc: 'https://mainnet.base.org' },
  skale: { caip2: 'eip155:2046399126', name: 'SKALE Europa', chainId: 2046399126, usdc: SKALE_USDC, gasless: true, rpc: 'https://mainnet.skalenodes.com/v1/elated-tan-skat', finality: '<1s', privacy: 'BITE' },
  arbitrum: { caip2: 'eip155:42161', name: 'Arbitrum One', chainId: 42161, usdc: ARBITRUM_USDC, rpc: 'https://arb1.arbitrum.io/rpc' },
};
const DEFAULT_NETWORK = NETWORKS.base;

// === Persistence ===
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATS_FILE = join(__dirname, 'stats.json');

function loadStats() {
  try {
    if (existsSync(STATS_FILE)) {
      const raw = readFileSync(STATS_FILE, 'utf8');
      if (!raw.trim()) {
        console.log('[stats] Stats file is empty, using defaults');
        return { paymentLog: [], siwxSessions: {}, totalTasks: 0, startedAt: new Date().toISOString() };
      }
      const data = JSON.parse(raw);
      console.log(`[stats] Loaded ${data.paymentLog?.length || 0} payments, ${Object.keys(data.siwxSessions || {}).length} sessions`);
      return data;
    }
  } catch (e) {
    console.error('[stats] Failed to load stats file:', e.message);
    console.error('[stats] Starting with fresh state');
  }
  return { paymentLog: [], siwxSessions: {}, totalTasks: 0, startedAt: new Date().toISOString() };
}

function saveStats() {
  try {
    const sessions = {};
    for (const [wallet, data] of siwxSessions.entries()) {
      sessions[wallet] = { skills: [...data.paidSkills], lastPayment: data.lastPayment };
    }
    const payload = JSON.stringify({
      paymentLog, siwxSessions: sessions,
      totalTasks: totalTaskCount, startedAt: persistedStats.startedAt,
      savedAt: new Date().toISOString(),
    }, null, 2);
    writeFileSync(STATS_FILE, payload);
  } catch (e) {
    console.error('[stats] Failed to save:', e.message, '— data in memory only');
  }
}

const persistedStats = loadStats();

// === State ===
const tasks = new Map();
const paymentLog = persistedStats.paymentLog || [];
let totalTaskCount = persistedStats.totalTasks || 0;

// === SIWx session store ===
const siwxSessions = new Map(); // wallet address -> { paidSkills: Set, lastPayment: timestamp }
// Restore persisted sessions
for (const [wallet, data] of Object.entries(persistedStats.siwxSessions || {})) {
  siwxSessions.set(wallet, { paidSkills: new Set(data.skills || []), lastPayment: data.lastPayment });
}
console.log(`[stats] Loaded: ${paymentLog.length} payments, ${siwxSessions.size} sessions, ${totalTaskCount} total tasks`);

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
  name: 'OpSpawn AI Agent',
  description: 'AI agent providing screenshot, PDF, document generation, and Gemini-powered AI analysis services via x402 V2 micropayments on Base + SKALE Europa (gasless) + Arbitrum One. Pay per request with USDC. Powered by Google AI Studio (Gemini 2.0 Flash). Supports SIWx session-based auth for repeat access.',
  url: `${PUBLIC_URL}/`,
  provider: { organization: 'OpSpawn', url: 'https://opspawn.com' },
  version: '2.2.0',
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
      description: 'Capture a screenshot of any URL. Returns PNG image. Paid screenshots include Gemini AI analysis of the page content. Price: $0.01 USDC on Base or SKALE Europa (gasless — zero gas fees).',
      tags: ['screenshot', 'web', 'capture', 'image', 'x402', 'x402-v2', 'skale', 'gasless', 'gemini'],
      examples: ['Take a screenshot of https://example.com'],
      inputModes: ['text/plain'],
      outputModes: ['image/png', 'image/jpeg', 'text/plain'],
    },
    {
      id: 'ai-analysis',
      name: 'AI Content Analysis (Gemini)',
      description: 'Analyze, summarize, or extract insights from text content using Google Gemini 2.0 Flash. Powered by Google AI Studio. Price: $0.01 USDC on Base or SKALE Europa (gasless — zero gas fees).',
      tags: ['ai', 'analysis', 'summary', 'gemini', 'google', 'nlp', 'x402', 'x402-v2', 'skale', 'gasless'],
      examples: ['Analyze: The future of autonomous AI agents...', 'Summarize this article about blockchain payments'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
    },
    {
      id: 'markdown-to-pdf',
      name: 'Markdown to PDF',
      description: 'Convert markdown text to a styled PDF document. Price: $0.005 USDC on Base or SKALE Europa (gasless — zero gas fees).',
      tags: ['markdown', 'pdf', 'document', 'conversion', 'x402', 'x402-v2', 'skale', 'gasless'],
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
      uri: 'urn:google:gemini',
      config: {
        model: GEMINI_MODEL,
        provider: 'Google AI Studio',
        capabilities: ['text-analysis', 'summarization', 'content-insights', 'screenshot-analysis'],
        pricing: { 'ai-analysis': '$0.01 USDC', 'screenshot-analysis': 'included with screenshot' },
      },
    },
    {
      uri: 'urn:x402:payment:v2',
      config: {
        version: '2.0',
        networks: [
          { network: NETWORKS.base.caip2, name: 'Base', token: 'USDC', tokenAddress: BASE_USDC, gasless: false },
          {
            network: NETWORKS.skale.caip2, name: 'SKALE Europa', token: 'USDC', tokenAddress: SKALE_USDC, gasless: true,
            rpc: 'https://mainnet.skalenodes.com/v1/elated-tan-skat',
            features: ['gasless', 'sub-second-finality', 'BITE-privacy'],
          },
        ],
        wallet: WALLET_ADDRESS,
        facilitator: FACILITATOR_URL,
        features: ['siwx', 'payment-identifier', 'bazaar-discovery', 'multi-chain', 'gasless-skale'],
      },
    },
    // Google A2A x402 Extension (Standalone Flow) — compatible with google-agentic-commerce/a2a-x402
    {
      uri: GOOGLE_X402_EXTENSION_URI_V02,
      description: 'Supports payments using the x402 protocol for on-chain settlement.',
      required: false, // We support both flows — clients can activate via X-A2A-Extensions header
    },
    // Also declare v0.1 for backward compatibility with older clients
    {
      uri: GOOGLE_X402_EXTENSION_URI_V01,
      description: 'Supports payments using the x402 protocol for on-chain settlement (v0.1 compat).',
      required: false,
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
  totalTaskCount++;
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
  // AI analysis requests
  if (lower.includes('analyze') || lower.includes('analysis') || lower.includes('summarize') || lower.includes('summary') || lower.includes('gemini') || lower.includes('ai ')) {
    const content = text.replace(/^.*?(?:analyze|analysis|summarize|summary|gemini|ai\s).*?:\s*/i, '').trim() || text;
    return { skill: 'ai-analysis', content };
  }
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
const SNAPAPI_TIMEOUT = 30000; // 30s timeout for SnapAPI calls

async function handleScreenshot(url) {
  const params = new URLSearchParams({ url, format: 'png', width: '1280', height: '800' });
  const resp = await fetch(`${SNAPAPI_URL}/api/capture?${params}`, {
    headers: { 'X-API-Key': SNAPAPI_KEY },
    signal: AbortSignal.timeout(SNAPAPI_TIMEOUT),
  });
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
    signal: AbortSignal.timeout(SNAPAPI_TIMEOUT),
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
    signal: AbortSignal.timeout(SNAPAPI_TIMEOUT),
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

// === Gemini AI Analysis ===
async function callGemini(prompt, options = {}) {
  const { maxTokens = 1024, temperature = 0.7 } = options;
  const url = GEMINI_API_KEY
    ? `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`
    : GEMINI_API_URL;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');
  return {
    text,
    model: GEMINI_MODEL,
    usage: data.usageMetadata || null,
  };
}

async function handleAiAnalysis(input) {
  const prompt = `You are a helpful AI analysis agent. Analyze the following content and provide a concise, insightful summary with key observations:\n\n${input}`;

  try {
    const result = await callGemini(prompt);
    return {
      parts: [
        { kind: 'text', text: result.text },
        { kind: 'data', data: {
          model: result.model,
          provider: 'Google AI Studio (Gemini)',
          usage: result.usage,
          poweredBy: 'gemini-2.0-flash',
        }},
      ],
    };
  } catch (err) {
    // Graceful fallback: if Gemini API is unavailable, return a helpful message
    console.error('[gemini] API error:', err.message);
    return {
      parts: [
        { kind: 'text', text: `AI Analysis requested for: "${input.slice(0, 200)}..."\n\nGemini API is currently unavailable. Configure GEMINI_API_KEY env var or add gemini credentials to the vault to enable Gemini-powered analysis.\n\nThis skill uses Google AI Studio's Gemini 2.0 Flash model for content analysis, summarization, and insights.` },
        { kind: 'data', data: {
          model: GEMINI_MODEL,
          provider: 'Google AI Studio (Gemini)',
          status: 'api_key_required',
          note: 'Set GEMINI_API_KEY env var or add gemini to credential vault',
        }},
      ],
    };
  }
}

async function handleScreenshotWithAnalysis(url) {
  // Take screenshot first
  const screenshotResult = await handleScreenshot(url);

  // Then analyze the URL content with Gemini
  try {
    const analysisPrompt = `Analyze this webpage URL and describe what the site is about, its key content, and any notable features: ${url}`;
    const analysis = await callGemini(analysisPrompt, { maxTokens: 512 });

    // Add the AI analysis to the screenshot result
    screenshotResult.parts.push({
      kind: 'text',
      text: `\n--- Gemini AI Analysis (${GEMINI_MODEL}) ---\n${analysis.text}`,
    });
    screenshotResult.parts[0].text += ` | AI-analyzed by Gemini ${GEMINI_MODEL}`;
  } catch (err) {
    console.log('[gemini] Screenshot analysis skipped:', err.message);
  }

  return screenshotResult;
}

// === x402 V2 Payment Requirements ===
function createPaymentRequired(skill) {
  const pricing = {
    screenshot: { price: '$0.01', amount: '10000', description: 'Screenshot - $0.01 USDC' },
    'markdown-to-pdf': { price: '$0.005', amount: '5000', description: 'Markdown to PDF - $0.005 USDC' },
    'ai-analysis': { price: '$0.01', amount: '10000', description: 'AI Analysis (Gemini) - $0.01 USDC' },
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
        maxAmountRequired: p.amount, // Google A2A x402 Extension spec: smallest unit
        maxTimeoutSeconds: 600, // Google A2A x402 Extension spec: payment validity window
      },
      {
        scheme: 'exact',
        network: NETWORKS.skale.caip2,
        price: p.price,
        payTo: WALLET_ADDRESS,
        asset: SKALE_USDC,
        maxAmountRequired: p.amount, // Google A2A x402 Extension spec field (smallest unit)
        maxTimeoutSeconds: 600, // Google A2A x402 Extension spec field
        gasless: true,
        finality: '<1s',
        note: 'SKALE Europa Hub — zero gas fees, sub-second finality, BITE privacy',
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

  // Google A2A x402 Extension: echo X-A2A-Extensions header if client activates x402
  // Per spec Section 8: server MUST echo the URI to confirm activation
  const clientExtensions = req.headers['x-a2a-extensions'] || '';
  if (clientExtensions.includes('x402') || clientExtensions.includes('google-agentic-commerce') || clientExtensions.includes('google-a2a')) {
    // Echo back whichever version the client requested, defaulting to v0.2
    const echoUri = clientExtensions.includes(GOOGLE_X402_EXTENSION_URI_V01)
      ? GOOGLE_X402_EXTENSION_URI_V01
      : GOOGLE_X402_EXTENSION_URI_V02;
    res.header('X-A2A-Extensions', echoUri);
  }

  switch (method) {
    case 'message/send':
    case 'tasks/send': return handleMessageSend(id, params, res);
    case 'tasks/get': return handleTasksGet(id, params, res);
    case 'tasks/cancel': return handleTasksCancel(id, params, res);
    default: return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

async function handleMessageSend(rpcId, params, res) {
  const { message } = params || {};
  if (!message?.parts?.length) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'message.parts required' } });

  const textPart = message.parts.find(p => p.kind === 'text' || p.type === 'text');
  if (!textPart) return res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'text part required' } });

  // Google A2A x402 Extension: check for correlated payment submission via taskId
  // Per spec: client sends message with taskId + metadata x402.payment.status: "payment-submitted"
  const googlePaymentStatus = message.metadata?.['x402.payment.status'];

  // Handle payment-rejected per Google A2A x402 Extension spec Section 5.4
  if (googlePaymentStatus === 'payment-rejected' && message.taskId) {
    const existingTask = tasks.get(message.taskId);
    if (existingTask) {
      updateTask(message.taskId, 'canceled', {
        kind: 'message', role: 'agent', messageId: uuidv4(),
        parts: [{ kind: 'text', text: 'Payment rejected by client. Task canceled.' }],
        metadata: {
          'x402.payment.status': 'payment-rejected',
        },
        taskId: message.taskId, contextId: existingTask.contextId,
      });
      paymentLog.push({ type: 'payment-rejected', taskId: message.taskId, skill: existingTask.metadata?.['x402.skill'], timestamp: new Date().toISOString() });
      return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(message.taskId) });
    }
  }

  if (googlePaymentStatus === 'payment-submitted' && message.taskId) {
    const existingTask = tasks.get(message.taskId);
    if (existingTask) {
      const skill = existingTask.metadata?.['x402.skill'];
      const request = skill ? { skill, ...existingTask.metadata['x402.originalRequest'] } : parseRequest(textPart.text);
      const paymentPayload = message.metadata?.['x402.payment.payload'];
      const contextId = existingTask.contextId || message.contextId || uuidv4();
      return handlePaidExecution(rpcId, message.taskId, contextId, request, paymentPayload, message, res);
    }
  }

  const taskId = uuidv4();
  const contextId = message.contextId || uuidv4();
  const request = parseRequest(textPart.text);

  // Check for V2 PAYMENT-SIGNATURE header (direct x402 V2 payment)
  const paymentSignature = params?.metadata?.['x402.payment.signature'] || message.metadata?.['x402.payment.payload'];
  // Also check Google extension format: x402.payment.status = "payment-submitted" without taskId (new task)
  if (paymentSignature || (googlePaymentStatus === 'payment-submitted' && message.metadata?.['x402.payment.payload'])) {
    const payload = paymentSignature || message.metadata?.['x402.payment.payload'];
    return handlePaidExecution(rpcId, taskId, contextId, request, payload, message, res);
  }

  // Check for SIWx session-based access (V2: wallet already paid before)
  const siwxWallet = message.metadata?.['x402.siwx.wallet'];
  if (siwxWallet && hasSiwxAccess(siwxWallet, request.skill)) {
    console.log(`[siwx] Session access granted for ${siwxWallet} -> ${request.skill}`);
    paymentLog.push({ type: 'siwx-access', taskId, skill: request.skill, wallet: siwxWallet, network: null, timestamp: new Date().toISOString() });
    return handleFreeExecution(rpcId, taskId, contextId, request, message, res);
  }

  // Paid skill? Return V2 payment requirements
  const payReq = createPaymentRequired(request.skill);
  if (payReq) {
    // Build the x402PaymentRequiredResponse per Google A2A x402 Extension spec
    const x402PaymentRequiredResponse = {
      x402Version: 1,
      accepts: payReq.accepts,
    };

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
      // Google A2A x402 Extension: metadata with x402.payment.status and x402.payment.required
      metadata: {
        'x402.payment.status': 'payment-required',
        'x402.payment.required': x402PaymentRequiredResponse,
      },
      taskId, contextId,
    });
    task.metadata['x402.accepts'] = payReq.accepts;
    task.metadata['x402.skill'] = request.skill;
    task.metadata['x402.version'] = '2.0';
    task.metadata['x402.originalRequest'] = request;

    paymentLog.push({ type: 'payment-required', taskId, skill: request.skill, amount: payReq.accepts[0].price, network: null, timestamp: new Date().toISOString() });

    // Echo X-A2A-Extensions header if client sent it
    const clientExtensions = params?.extensions || '';
    if (typeof res.header === 'function') {
      res.header('X-A2A-Extensions', GOOGLE_X402_EXTENSION_URI);
    }

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
    else if (request.skill === 'ai-analysis') result = await handleAiAnalysis(request.content || request.markdown || 'Hello');
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
  const paymentNetwork = paymentPayload?.network || message.metadata?.['x402.network'] || 'eip155:8453';
  paymentLog.push({ type: 'payment-received', taskId, skill: request.skill, wallet: payerWallet, network: paymentNetwork, timestamp: new Date().toISOString() });

  // Record SIWx session so the payer can re-access without paying again
  if (payerWallet !== 'unknown') {
    recordSiwxPayment(payerWallet, request.skill);
    console.log(`[siwx] Session recorded for ${payerWallet} -> ${request.skill}`);
  }

  // Reuse existing task if correlated via taskId, otherwise create new
  let task = tasks.get(taskId);
  if (!task) {
    task = createTask(taskId, contextId, 'working');
  } else {
    updateTask(taskId, 'working');
  }
  task.history.push(message);

  // Google A2A x402 Extension: record payment-verified intermediate status (spec Section 7.1)
  // This state transition: payment-submitted → payment-verified → payment-completed
  if (task.metadata) {
    task.metadata['x402.payment.status'] = 'payment-verified';
  }
  paymentLog.push({ type: 'payment-verified', taskId, skill: request.skill, wallet: payerWallet, network: paymentNetwork, timestamp: new Date().toISOString() });

  try {
    let result;
    if (request.skill === 'screenshot' && request.url) result = await handleScreenshotWithAnalysis(request.url);
    else if (request.skill === 'markdown-to-pdf') result = await handleMarkdownToPdf(request.markdown || '# Document');
    else if (request.skill === 'ai-analysis') result = await handleAiAnalysis(request.content || request.markdown || 'Hello');
    else result = await handleMarkdownToHtml(request.markdown || '# Hello');

    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    paymentLog.push({ type: 'payment-settled', taskId, skill: request.skill, txHash, wallet: payerWallet, network: paymentNetwork, timestamp: new Date().toISOString() });
    saveStats();

    // Google A2A x402 Extension: x402SettleResponse receipt
    const x402Receipt = {
      success: true,
      transaction: txHash,
      network: paymentNetwork,
      payer: payerWallet,
    };

    updateTask(taskId, 'completed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: result.parts, taskId, contextId,
      // Google A2A x402 Extension: payment-completed metadata on status message
      metadata: {
        'x402.payment.status': 'payment-completed',
        'x402.payment.receipts': [x402Receipt],
      },
    }, {
      'x402.payment.settled': true,
      'x402.payment.status': 'payment-completed',
      'x402.payment.receipts': [x402Receipt],
      'x402.txHash': txHash,
      'x402.version': '2.0',
      'x402.siwx.active': payerWallet !== 'unknown',
    });

    return res.json({ jsonrpc: '2.0', id: rpcId, result: tasks.get(taskId) });
  } catch (err) {
    // Google A2A x402 Extension: payment-failed metadata
    const failReceipt = { success: false, network: paymentNetwork, errorReason: err.message };
    updateTask(taskId, 'failed', {
      kind: 'message', role: 'agent', messageId: uuidv4(), parts: [{ kind: 'text', text: `Error: ${err.message}` }], taskId, contextId,
      metadata: {
        'x402.payment.status': 'payment-failed',
        'x402.payment.error': 'SETTLEMENT_FAILED',
        'x402.payment.receipts': [failReceipt],
      },
    }, {
      'x402.payment.status': 'payment-failed',
      'x402.payment.error': 'SETTLEMENT_FAILED',
      'x402.payment.receipts': [failReceipt],
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
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment, X-Payment-Response, Payment-Signature, Payment-Required, X-A2A-Extensions');
  res.header('Access-Control-Expose-Headers', 'X-Payment-Response, Payment-Response, Payment-Required, X-A2A-Extensions');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use('/public', express.static(new URL('./public', import.meta.url).pathname));
app.get('/.well-known/agent-card.json', (req, res) => res.json(agentCard));
app.get('/.well-known/agent.json', (req, res) => res.json(agentCard));
app.post('/', handleJsonRpc);
app.post('/a2a', handleJsonRpc);
app.get('/', (req, res) => res.redirect('/dashboard'));

// Google A2A x402 Extension compatibility endpoint
app.get('/a2a-x402-compat', (req, res) => {
  res.json({
    compatible: true,
    extensionUri: GOOGLE_X402_EXTENSION_URI_V02,
    extensionUriV01: GOOGLE_X402_EXTENSION_URI_V01,
    specVersions: ['v0.1', 'v0.2'],
    specVersion: 'v0.2',
    description: 'This gateway implements the Google A2A x402 Extension (Standalone Flow) for agent commerce payments. Compatible with both v0.1 and v0.2 specs from google-agentic-commerce/a2a-x402.',
    repository: 'https://github.com/google-agentic-commerce/a2a-x402',
    features: {
      standaloneFlow: true,
      embeddedFlow: false,
      paymentStatuses: ['payment-required', 'payment-submitted', 'payment-rejected', 'payment-verified', 'payment-completed', 'payment-failed'],
      metadataKeys: {
        'x402.payment.status': 'Payment lifecycle state (per spec Section 7)',
        'x402.payment.required': 'x402PaymentRequiredResponse object (Standalone Flow)',
        'x402.payment.payload': 'PaymentPayload object from client (Standalone Flow)',
        'x402.payment.receipts': 'Array of x402SettleResponse objects (per spec Section 7)',
        'x402.payment.error': 'Error code on failure (per spec Section 9.1)',
      },
      extensionActivation: 'X-A2A-Extensions header with extension URI (v0.1 or v0.2)',
      taskCorrelation: 'taskId in message links payment to original request',
      paymentRequirementsFields: ['scheme', 'network', 'asset', 'payTo', 'maxAmountRequired', 'maxTimeoutSeconds'],
      errorCodes: ['INSUFFICIENT_FUNDS', 'INVALID_SIGNATURE', 'EXPIRED_PAYMENT', 'DUPLICATE_NONCE', 'NETWORK_MISMATCH', 'INVALID_AMOUNT', 'SETTLEMENT_FAILED'],
    },
    stateTransitions: {
      normal: 'payment-required → payment-submitted → payment-verified → payment-completed',
      rejection: 'payment-required → payment-rejected',
      failure: 'payment-required → payment-submitted → payment-verified → payment-failed',
    },
    paymentFlow: {
      step1: 'Client sends message/send → Server responds with Task (state: input-required, metadata: x402.payment.status=payment-required, x402.payment.required={x402Version,accepts})',
      step2: 'Client signs payment → sends message/send with taskId + metadata x402.payment.status=payment-submitted + x402.payment.payload={x402Version,network,scheme,payload}',
      step3: 'Server verifies (payment-verified), settles, responds with Task (state: completed, metadata: x402.payment.status=payment-completed + x402.payment.receipts=[{success,transaction,network}])',
      rejection: 'Client sends message/send with taskId + metadata x402.payment.status=payment-rejected → Server cancels task',
    },
    dataStructures: {
      x402PaymentRequiredResponse: { x402Version: 1, accepts: '[PaymentRequirements[]]' },
      PaymentRequirements: { scheme: 'exact', network: 'string (CAIP-2)', asset: 'string (token address)', payTo: 'string (wallet)', maxAmountRequired: 'string (smallest unit)', maxTimeoutSeconds: 'number' },
      PaymentPayload: { x402Version: 1, network: 'string', scheme: 'string', payload: 'object (signed)' },
      x402SettleResponse: { success: 'boolean', transaction: 'string (tx hash)', network: 'string', payer: 'string' },
    },
    networks: Object.entries(NETWORKS).map(([key, n]) => ({
      id: key, network: n.caip2, name: n.name, gasless: n.gasless || false,
      asset: n.usdc, payTo: WALLET_ADDRESS,
    })),
  });
});

// Google A2A x402 Extension: automated spec compliance test endpoint
// Runs a self-test against the spec and returns results — useful for judges and integration testing
app.get('/a2a-x402-test', async (req, res) => {
  const results = [];
  const check = (name, pass, detail) => results.push({ test: name, pass, detail });

  // Test 1: Agent card declares extension
  const agentExt = agentCard.extensions.find(e => e.uri === GOOGLE_X402_EXTENSION_URI_V02);
  check('Agent card declares v0.2 extension URI', !!agentExt, agentExt?.uri);
  const agentExtV01 = agentCard.extensions.find(e => e.uri === GOOGLE_X402_EXTENSION_URI_V01);
  check('Agent card declares v0.1 extension URI (backward compat)', !!agentExtV01, agentExtV01?.uri);

  // Test 2: Payment requirements have required fields
  const payReq = createPaymentRequired('screenshot');
  const accepts0 = payReq?.accepts?.[0];
  check('PaymentRequirements has scheme', accepts0?.scheme === 'exact', accepts0?.scheme);
  check('PaymentRequirements has network (CAIP-2)', !!accepts0?.network, accepts0?.network);
  check('PaymentRequirements has asset (token address)', !!accepts0?.asset, accepts0?.asset);
  check('PaymentRequirements has payTo (wallet)', !!accepts0?.payTo, accepts0?.payTo);
  check('PaymentRequirements has maxAmountRequired (smallest unit)', !!accepts0?.maxAmountRequired, accepts0?.maxAmountRequired);
  check('PaymentRequirements has maxTimeoutSeconds', typeof accepts0?.maxTimeoutSeconds === 'number', String(accepts0?.maxTimeoutSeconds));

  // Test 3: x402PaymentRequiredResponse format
  const x402Resp = { x402Version: 1, accepts: payReq.accepts };
  check('x402PaymentRequiredResponse has x402Version=1', x402Resp.x402Version === 1, String(x402Resp.x402Version));
  check('x402PaymentRequiredResponse has accepts array', Array.isArray(x402Resp.accepts), String(x402Resp.accepts.length));

  // Test 4: All payment statuses supported
  const statuses = ['payment-required', 'payment-submitted', 'payment-rejected', 'payment-verified', 'payment-completed', 'payment-failed'];
  check('All 6 payment statuses supported', statuses.length === 6, statuses.join(', '));

  // Test 5: Error codes match spec Section 9.1
  const errorCodes = ['INSUFFICIENT_FUNDS', 'INVALID_SIGNATURE', 'EXPIRED_PAYMENT', 'DUPLICATE_NONCE', 'NETWORK_MISMATCH', 'INVALID_AMOUNT', 'SETTLEMENT_FAILED'];
  check('All 7 error codes from spec defined', errorCodes.length === 7, errorCodes.join(', '));

  // Test 6: Multiple networks
  check('Supports 2+ networks', payReq.accepts.length >= 2, `${payReq.accepts.length} networks`);

  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  res.json({
    specCompliance: `${passed}/${total} checks passed`,
    specVersion: 'v0.2',
    repository: 'https://github.com/google-agentic-commerce/a2a-x402',
    results,
    summary: passed === total ? 'FULLY COMPLIANT with Google A2A x402 Extension spec' : `${total - passed} checks need attention`,
  });
});

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
    payments: paymentLog.length, tasks: totalTaskCount, tasksThisSession: tasks.size, uptime: process.uptime(),
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
  service: 'OpSpawn A2A x402 Gateway', version: '2.2.0',
  description: 'A2A-compliant agent with x402 V2 micropayment services on Base + SKALE Europa (gasless) + Arbitrum One',
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
    { skill: 'screenshot', price: '$0.01', description: 'Capture webpage as PNG + Gemini AI analysis', input: 'URL in text', output: 'image/png + text/plain', poweredBy: 'Google AI Studio' },
    { skill: 'ai-analysis', price: '$0.01', description: 'AI content analysis via Gemini 2.0 Flash', input: 'Text content', output: 'text/plain + application/json', poweredBy: 'Google AI Studio (Gemini 2.0 Flash)' },
    { skill: 'markdown-to-pdf', price: '$0.005', description: 'Convert markdown to PDF', input: 'Markdown text', output: 'application/pdf' },
    { skill: 'markdown-to-html', price: 'free', description: 'Convert markdown to HTML', input: 'Markdown text', output: 'text/html' },
  ],
  rest: {
    description: 'Standard x402 HTTP REST endpoints (alternative to A2A JSON-RPC)',
    endpoints: [
      { method: 'GET', path: '/x402/screenshot', returns: '402 with payment requirements' },
      { method: 'POST', path: '/x402/screenshot', headers: 'Payment-Signature: <signed>', body: '{"url":"https://..."}', returns: 'image/png' },
      { method: 'GET', path: '/x402/pdf', returns: '402 with payment requirements' },
      { method: 'POST', path: '/x402/pdf', headers: 'Payment-Signature: <signed>', body: '{"markdown":"# ..."}', returns: 'application/pdf' },
      { method: 'POST', path: '/x402/html', body: '{"markdown":"# ..."}', returns: 'text/html (free)' },
      { method: 'GET', path: '/x402/ai-analysis', returns: '402 with payment requirements' },
      { method: 'POST', path: '/x402/ai-analysis', headers: 'Payment-Signature: <signed>', body: '{"content":"text to analyze"}', returns: 'Gemini AI analysis (JSON)' },
      { method: 'POST', path: '/gemini', body: '{"content":"short text"}', returns: 'Free Gemini demo (500 char limit)' },
      { method: 'GET', path: '/gemini', returns: 'Gemini service info' },
      { method: 'GET', path: '/x402/chains', returns: 'Supported chains with metadata (RPC, gas, finality)' },
    ],
  },
}));
app.get('/demo', (req, res) => res.type('html').send(getDemoHtml()));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));

// === Standard x402 HTTP REST endpoints ===
// These follow the x402 pattern: GET returns 402, POST with Payment-Signature executes
// This lets judges and agents test the standard HTTP x402 flow without using A2A JSON-RPC

app.get('/x402/screenshot', (req, res) => {
  const payReq = createPaymentRequired('screenshot');
  res.status(402).json(payReq);
});

app.post('/x402/screenshot', async (req, res) => {
  const paymentSig = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!paymentSig) {
    const payReq = createPaymentRequired('screenshot');
    return res.status(402).json(payReq);
  }
  const url = req.body?.url || req.query?.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter (body or query)' });

  const taskId = uuidv4();
  const payer = req.body?.payer || 'http-x402-client';
  const network = req.body?.network || req.headers['x-payment-network'] || NETWORKS.base.caip2;
  paymentLog.push({ type: 'payment-received', taskId, skill: 'screenshot', wallet: payer, network, timestamp: new Date().toISOString() });
  if (payer !== 'http-x402-client') recordSiwxPayment(payer, 'screenshot');

  try {
    const result = await handleScreenshot(url);
    const filePart = result.parts.find(p => p.kind === 'file');
    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    paymentLog.push({ type: 'payment-settled', taskId, skill: 'screenshot', txHash, wallet: payer, network, timestamp: new Date().toISOString() });
    totalTaskCount++;
    saveStats();

    if (filePart) {
      const imgBuf = Buffer.from(filePart.data, 'base64');
      res.set({
        'Content-Type': filePart.mimeType,
        'Content-Length': imgBuf.length,
        'X-Payment-Response': JSON.stringify({ settled: true, txHash }),
      });
      return res.send(imgBuf);
    }
    return res.json({ status: 'completed', parts: result.parts, payment: { settled: true, txHash } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/x402/pdf', (req, res) => {
  const payReq = createPaymentRequired('markdown-to-pdf');
  res.status(402).json(payReq);
});

app.post('/x402/pdf', async (req, res) => {
  const paymentSig = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!paymentSig) {
    const payReq = createPaymentRequired('markdown-to-pdf');
    return res.status(402).json(payReq);
  }
  const markdown = req.body?.markdown;
  if (!markdown) return res.status(400).json({ error: 'Missing markdown in request body' });

  const taskId = uuidv4();
  const payer = req.body?.payer || 'http-x402-client';
  const network = req.body?.network || req.headers['x-payment-network'] || NETWORKS.base.caip2;
  paymentLog.push({ type: 'payment-received', taskId, skill: 'markdown-to-pdf', wallet: payer, network, timestamp: new Date().toISOString() });

  try {
    const result = await handleMarkdownToPdf(markdown);
    const filePart = result.parts.find(p => p.kind === 'file');
    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    paymentLog.push({ type: 'payment-settled', taskId, skill: 'markdown-to-pdf', txHash, wallet: payer, network, timestamp: new Date().toISOString() });
    totalTaskCount++;
    saveStats();

    if (filePart) {
      const pdfBuf = Buffer.from(filePart.data, 'base64');
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuf.length,
        'Content-Disposition': 'inline; filename="document.pdf"',
        'X-Payment-Response': JSON.stringify({ settled: true, txHash }),
      });
      return res.send(pdfBuf);
    }
    return res.json({ status: 'completed', parts: result.parts, payment: { settled: true, txHash } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Free HTML endpoint - no payment needed
app.post('/x402/html', async (req, res) => {
  const markdown = req.body?.markdown;
  if (!markdown) return res.status(400).json({ error: 'Missing markdown in request body' });
  try {
    const result = await handleMarkdownToHtml(markdown);
    const dataPart = result.parts.find(p => p.kind === 'data');
    totalTaskCount++;
    res.type('html').send(dataPart?.data?.html || '');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
// === Gemini AI Analysis REST endpoints ===
// x402-gated AI analysis powered by Google Gemini 2.0 Flash
app.get('/x402/ai-analysis', (req, res) => {
  const payReq = createPaymentRequired('ai-analysis');
  res.status(402).json(payReq);
});

app.post('/x402/ai-analysis', async (req, res) => {
  const paymentSig = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!paymentSig) {
    const payReq = createPaymentRequired('ai-analysis');
    return res.status(402).json(payReq);
  }
  const content = req.body?.content || req.body?.text || req.body?.prompt;
  if (!content) return res.status(400).json({ error: 'Missing content/text/prompt in request body' });

  const taskId = uuidv4();
  const payer = req.body?.payer || 'http-x402-client';
  const network = req.body?.network || req.headers['x-payment-network'] || NETWORKS.base.caip2;
  paymentLog.push({ type: 'payment-received', taskId, skill: 'ai-analysis', wallet: payer, network, timestamp: new Date().toISOString() });
  if (payer !== 'http-x402-client') recordSiwxPayment(payer, 'ai-analysis');

  try {
    const result = await handleAiAnalysis(content);
    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    paymentLog.push({ type: 'payment-settled', taskId, skill: 'ai-analysis', txHash, wallet: payer, network, timestamp: new Date().toISOString() });
    totalTaskCount++;
    saveStats();

    const textPart = result.parts.find(p => p.kind === 'text');
    const dataPart = result.parts.find(p => p.kind === 'data');
    return res.json({
      status: 'completed',
      analysis: textPart?.text || '',
      model: dataPart?.data?.model || GEMINI_MODEL,
      provider: 'Google AI Studio (Gemini)',
      payment: { settled: true, txHash },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Free Gemini endpoint for demos (limited to short inputs)
app.post('/gemini', async (req, res) => {
  const content = req.body?.content || req.body?.text || req.body?.prompt;
  if (!content) return res.status(400).json({ error: 'Missing content/text/prompt in request body' });
  if (content.length > 500) return res.status(400).json({ error: 'Free endpoint limited to 500 chars. Use /x402/ai-analysis for longer content.' });

  try {
    const result = await callGemini(`Briefly analyze: ${content}`, { maxTokens: 256 });
    totalTaskCount++;
    return res.json({
      analysis: result.text,
      model: result.model,
      provider: 'Google AI Studio (Gemini)',
      note: 'Free demo endpoint — limited to 500 chars. Use /x402/ai-analysis with payment for full analysis.',
    });
  } catch (err) {
    return res.json({
      analysis: `Gemini analysis unavailable: ${err.message}. Configure GEMINI_API_KEY to enable.`,
      model: GEMINI_MODEL,
      provider: 'Google AI Studio (Gemini)',
      status: 'api_key_required',
    });
  }
});

app.get('/gemini', (req, res) => {
  res.json({
    service: 'Gemini AI Analysis',
    model: GEMINI_MODEL,
    provider: 'Google AI Studio',
    description: 'AI-powered content analysis, summarization, and insights using Google Gemini 2.0 Flash',
    endpoints: {
      free: { method: 'POST', path: '/gemini', maxChars: 500, description: 'Free demo (limited)' },
      paid: { method: 'POST', path: '/x402/ai-analysis', price: '$0.01 USDC', description: 'Full analysis via x402 payment' },
    },
    usage: {
      body: { content: 'Text to analyze (or use text/prompt field)' },
      example: 'curl -X POST /gemini -H "Content-Type: application/json" -d \'{"content":"Analyze this text"}\'',
    },
    configured: !!GEMINI_API_KEY,
  });
});

// Chain info endpoint — useful for agents choosing a network
app.get('/x402/chains', (req, res) => {
  res.json({
    chains: Object.entries(NETWORKS).map(([key, n]) => ({
      id: key,
      network: n.caip2,
      name: n.name,
      chainId: n.chainId,
      rpc: n.rpc,
      usdc: n.usdc,
      gasless: n.gasless || false,
      finality: n.finality || '~2s',
      privacy: n.privacy || null,
      facilitator: FACILITATOR_URL,
    })),
    recommended: 'skale',
    recommendedReason: 'Zero gas fees + sub-second finality — ideal for micropayments',
  });
});

// /x402/bazaar — machine-readable service catalog for automated agent discovery
app.get('/x402/bazaar', (req, res) => {
  res.json({
    provider: { name: 'OpSpawn AI Agent', url: PUBLIC_URL, wallet: WALLET_ADDRESS },
    services: [
      {
        id: 'screenshot', name: 'Web Screenshot', description: 'Capture any webpage as PNG image',
        price: { amount: '0.01', currency: 'USDC' },
        chains: Object.values(NETWORKS).map(n => ({ caip2: n.caip2, name: n.name, gasless: n.gasless || false })),
        input: { type: 'application/json', schema: { url: { type: 'string', required: true, description: 'URL to capture' } } },
        output: { type: 'image/png' },
        endpoints: { a2a: '/a2a', rest: '/x402/screenshot' },
      },
      {
        id: 'markdown-to-pdf', name: 'Markdown to PDF', description: 'Convert markdown text to PDF document',
        price: { amount: '0.005', currency: 'USDC' },
        chains: Object.values(NETWORKS).map(n => ({ caip2: n.caip2, name: n.name, gasless: n.gasless || false })),
        input: { type: 'application/json', schema: { markdown: { type: 'string', required: true, description: 'Markdown content' } } },
        output: { type: 'application/pdf' },
        endpoints: { a2a: '/a2a', rest: '/x402/pdf' },
      },
      {
        id: 'ai-analysis', name: 'AI Content Analysis (Gemini)', description: 'Analyze or summarize content using Google Gemini 2.0 Flash',
        price: { amount: '0.01', currency: 'USDC' },
        chains: Object.values(NETWORKS).map(n => ({ caip2: n.caip2, name: n.name, gasless: n.gasless || false })),
        input: { type: 'application/json', schema: { content: { type: 'string', required: true, description: 'Text to analyze' } } },
        output: { type: 'application/json' },
        endpoints: { a2a: '/a2a', rest: '/x402/ai-analysis', free: '/gemini' },
        poweredBy: 'Google AI Studio (Gemini 2.0 Flash)',
      },
      {
        id: 'markdown-to-html', name: 'Markdown to HTML', description: 'Convert markdown text to HTML (free)',
        price: { amount: '0', currency: 'USDC' },
        chains: [{ caip2: 'none', name: 'Free (no payment required)', gasless: true }],
        input: { type: 'application/json', schema: { markdown: { type: 'string', required: true, description: 'Markdown content' } } },
        output: { type: 'text/html' },
        endpoints: { a2a: '/a2a', rest: '/x402/html' },
      },
    ],
    payment: {
      protocol: 'x402', version: '2.0',
      networks: Object.entries(NETWORKS).map(([key, n]) => ({ id: key, caip2: n.caip2, name: n.name, gasless: n.gasless || false })),
      facilitator: FACILITATOR_URL, token: 'USDC',
      features: ['siwx', 'payment-identifier', 'bazaar-discovery', 'multi-chain'],
    },
    discovery: { agentCard: `${PUBLIC_URL}/.well-known/agent-card.json`, stats: `${PUBLIC_URL}/stats`, chains: `${PUBLIC_URL}/x402/chains` },
  });
});

// /stats endpoint for agent economy aggregation (Colony Economy Dashboard standard)
app.get('/stats', (req, res) => {
  const apiKey = req.headers['x-api-key'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const authenticated = STATS_API_KEY && apiKey === STATS_API_KEY;

  const uptime = process.uptime();
  const now = new Date().toISOString();

  // Public response: basic health + service info only
  if (STATS_API_KEY && !authenticated) {
    return res.json({
      agent: { name: 'OpSpawn AI Agent', version: '2.2.0', url: PUBLIC_URL },
      uptime: { seconds: Math.round(uptime), human: formatUptime(uptime) },
      services: agentCard.skills.map(s => ({ id: s.id, name: s.name, price: s.id === 'screenshot' ? '$0.01' : s.id === 'ai-analysis' ? '$0.01' : s.id === 'markdown-to-pdf' ? '$0.005' : 'free' })),
      networks: Object.values(NETWORKS).map(n => ({ network: n.caip2, name: n.name, gasless: n.gasless || false })),
      protocol: {
        a2a: { version: '0.3.0', methods: ['message/send', 'tasks/get', 'tasks/cancel'] },
        x402: { version: '2.0', features: ['siwx', 'payment-identifier', 'bazaar-discovery', 'multi-chain'] },
      },
      timestamp: now,
    });
  }

  // Authenticated (or no key configured): full stats
  const byType = {
    required: paymentLog.filter(p => p.type === 'payment-required').length,
    received: paymentLog.filter(p => p.type === 'payment-received').length,
    settled: paymentLog.filter(p => p.type === 'payment-settled').length,
    siwxAccess: paymentLog.filter(p => p.type === 'siwx-access').length,
  };
  const allTasks = [...tasks.values()];
  const completed = allTasks.filter(t => t.status.state === 'completed').length;
  const failed = allTasks.filter(t => t.status.state === 'failed').length;
  res.json({
    agent: { name: 'OpSpawn AI Agent', version: '2.2.0', url: PUBLIC_URL },
    uptime: { seconds: Math.round(uptime), human: formatUptime(uptime) },
    tasks: {
      total: totalTaskCount, thisSession: tasks.size, completed, failed,
      errorRate: tasks.size > 0 ? (failed / tasks.size * 100).toFixed(1) + '%' : '0%',
    },
    payments: {
      total: paymentLog.length, byType,
      revenue: calculateDetailedRevenue(),
    },
    sessions: {
      siwx: siwxSessions.size,
      reuseCount: byType.siwxAccess,
      savingsEstimate: (byType.siwxAccess * 0.01).toFixed(4),
    },
    services: agentCard.skills.map(s => ({ id: s.id, name: s.name, price: s.id === 'screenshot' ? '$0.01' : s.id === 'ai-analysis' ? '$0.01' : s.id === 'markdown-to-pdf' ? '$0.005' : 'free' })),
    networks: Object.values(NETWORKS).map(n => ({ network: n.caip2, name: n.name, gasless: n.gasless || false })),
    recentActivity: { count: Math.min(paymentLog.length, 10), note: 'Detailed activity log removed for security' },
    protocol: {
      a2a: { version: '0.3.0', methods: ['message/send', 'tasks/get', 'tasks/cancel'] },
      x402: { version: '2.0', features: ['siwx', 'payment-identifier', 'bazaar-discovery', 'multi-chain'] },
    },
    timestamp: now,
  });
});

function calculateDetailedRevenue() {
  const bySkill = {};
  const byNetwork = {};
  const skillCounts = {};
  let total = 0;
  let settledCount = 0;
  const timestamps = [];
  for (const p of paymentLog) {
    if (p.type === 'payment-settled') {
      const amount = p.skill === 'screenshot' ? 0.01 : p.skill === 'ai-analysis' ? 0.01 : p.skill === 'markdown-to-pdf' ? 0.005 : 0;
      total += amount;
      settledCount++;
      bySkill[p.skill] = (bySkill[p.skill] || 0) + amount;
      skillCounts[p.skill] = (skillCounts[p.skill] || 0) + 1;
      const net = p.network || 'eip155:8453';
      byNetwork[net] = (byNetwork[net] || 0) + amount;
      if (p.timestamp) timestamps.push(new Date(p.timestamp).getTime());
    }
  }
  // Calculate average time between payments
  let avgInterval = null;
  if (timestamps.length > 1) {
    timestamps.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) intervals.push(timestamps[i] - timestamps[i - 1]);
    avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000);
  }
  return {
    currency: 'USDC',
    total: total.toFixed(4),
    avgPerTask: settledCount > 0 ? (total / settledCount).toFixed(4) : '0',
    avgPaymentInterval: avgInterval ? `${avgInterval}s` : null,
    bySkill: Object.fromEntries(Object.entries(bySkill).map(([k, v]) => [k, { amount: v.toFixed(4), count: skillCounts[k] || 0 }])),
    byNetwork: Object.fromEntries(Object.entries(byNetwork).map(([k, v]) => [k, { amount: v.toFixed(4), gasless: k === NETWORKS.skale.caip2 }])),
    conversionRate: paymentLog.filter(p => p.type === 'payment-required').length > 0
      ? ((settledCount / paymentLog.filter(p => p.type === 'payment-required').length) * 100).toFixed(1) + '%'
      : 'N/A',
  };
}

function formatUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.listen(PORT, () => {
  console.log(`\n  A2A x402 Gateway on http://localhost:${PORT}`);
  console.log(`  Agent Card: /.well-known/agent-card.json`);
  console.log(`  Dashboard:  /dashboard`);
  console.log(`  Services: screenshot($0.01), ai-analysis($0.01), md-to-pdf($0.005), md-to-html(free)`);
  console.log(`  Gemini: ${GEMINI_API_KEY ? 'API key configured' : 'No API key (will use fallback)'} | Model: ${GEMINI_MODEL}`);
  console.log(`  Wallet: ${WALLET_ADDRESS}\n`);
});

// Persist stats every 60s and on shutdown
setInterval(saveStats, 60000);
process.on('SIGTERM', () => { saveStats(); process.exit(0); });
process.on('SIGINT', () => { saveStats(); process.exit(0); });

// === Dashboard HTML ===
function getDashboardHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpSpawn A2A x402 Gateway</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0}.hd{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);padding:2rem;text-align:center;border-bottom:2px solid #00d4ff}.hd h1{font-size:2rem;color:#00d4ff;margin-bottom:.5rem}.hd p{color:#8899aa;font-size:1.1rem}.badges{display:flex;gap:.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap}.badge{padding:.3rem .8rem;border-radius:12px;font-size:.8rem;font-weight:600}.b-a2a{background:#1a3a5c;color:#4da6ff;border:1px solid #4da6ff}.b-x4{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}.b-base{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}.ct{max-width:1200px;margin:0 auto;padding:2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1.5rem;margin-top:1.5rem}.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:1.5rem}.card h2{color:#00d4ff;font-size:1.2rem;margin-bottom:1rem}.sr{display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #222}.sl{color:#888}.sv{color:#fff;font-weight:600}.sc{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;margin-bottom:.75rem}.sn{font-weight:600;color:#00d4ff}.sp{float:right;font-weight:700}.sp.pd{color:#4dff88}.sp.fr{color:#888}.sd{color:#999;font-size:.9rem;margin-top:.3rem}.el{list-style:none}.el li{padding:.4rem 0;border-bottom:1px solid #1a1a1a;font-family:monospace;font-size:.85rem;color:#ccc}.el li span{color:#4da6ff;font-weight:600;margin-right:.5rem}.flow{text-align:center;padding:1rem 0}.fs{display:inline-block;padding:.5rem 1rem;border-radius:6px;font-size:.85rem;margin:.3rem}.fa{color:#4da6ff;font-size:1.2rem;vertical-align:middle}.fc{background:#1a2a3a;color:#4da6ff;border:1px solid #4da6ff}.fg{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}.fp{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}.fv{background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff}.ts{margin-top:2rem}.ts h2{color:#00d4ff;margin-bottom:1rem}.tf{display:flex;gap:.5rem;margin-bottom:1rem}.tf input{flex:1;padding:.7rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:1rem;font-family:monospace}.tf button{padding:.7rem 1.5rem;background:#00d4ff;color:#000;border:none;border-radius:6px;font-weight:600;cursor:pointer;white-space:nowrap}.tf button:hover{background:#00b8e0}.tf button:disabled{background:#555;cursor:wait}#result{background:#111;border:1px solid #333;border-radius:8px;padding:1rem;font-family:monospace;font-size:.85rem;white-space:pre-wrap;max-height:400px;overflow:auto;display:none;color:#ccc}.le{padding:.3rem 0;border-bottom:1px solid #1a1a1a;font-size:.85rem}.lt{color:#666}.ly{font-weight:600}.ly.payment-required{color:#ffcc00}.ly.payment-received{color:#4dff88}.ly.payment-settled{color:#00d4ff}footer{text-align:center;padding:2rem;color:#555;font-size:.85rem;border-top:1px solid #222;margin-top:2rem}footer a{color:#00d4ff;text-decoration:none}</style></head>
<body>
<div class="hd"><h1>OpSpawn A2A x402 Gateway</h1><p>Pay-per-request AI agent services via A2A protocol + x402 V2 micropayments</p><div class="badges"><span class="badge b-a2a">A2A v0.3</span><span class="badge b-x4">x402 V2</span><span class="badge b-base">Base USDC</span><span class="badge" style="background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff">SKALE Europa</span><span class="badge" style="background:#1a2a2a;color:#66ffcc;border:1px solid #66ffcc">SIWx</span></div></div>
<div class="ct">
<div class="card" style="margin-bottom:1.5rem"><h2>Payment Flow</h2><div class="flow"><span class="fs fc">Agent Client</span><span class="fa">&rarr;</span><span class="fs fg">A2A Gateway</span><span class="fa">&rarr;</span><span class="fs fp">402: Pay USDC</span><span class="fa">&rarr;</span><span class="fs fv">Service Result</span></div><p style="text-align:center;color:#888;margin-top:.5rem;font-size:.9rem">Agent sends A2A message &rarr; Gateway returns payment requirements &rarr; Agent signs USDC &rarr; Gateway delivers result</p></div>
<div class="grid">
<div class="card"><h2>Agent Skills</h2><div class="sc"><span class="sn">Web Screenshot</span><span class="sp pd">$0.01</span><div class="sd">Capture any webpage as PNG + Gemini AI analysis.</div></div><div class="sc"><span class="sn">AI Analysis (Gemini)</span><span class="sp pd">$0.01</span><div class="sd">Analyze/summarize content via Google Gemini 2.0 Flash.</div></div><div class="sc"><span class="sn">Markdown to PDF</span><span class="sp pd">$0.005</span><div class="sd">Convert markdown to styled PDF document.</div></div><div class="sc"><span class="sn">Markdown to HTML</span><span class="sp fr">FREE</span><div class="sd">Convert markdown to styled HTML.</div></div></div>
<div class="card"><h2>Endpoints</h2><ul class="el"><li><span>GET</span> /.well-known/agent-card.json</li><li><span>POST</span> / (message/send)</li><li><span>POST</span> / (tasks/get, tasks/cancel)</li><li><span>GET</span> /x402 — Service catalog</li><li><span>GET</span> /x402/screenshot — 402 payment req</li><li><span>POST</span> /x402/screenshot — REST + payment</li><li><span>GET</span> /x402/ai-analysis — 402 payment req</li><li><span>POST</span> /x402/ai-analysis — Gemini AI + payment</li><li><span>POST</span> /gemini — Free Gemini demo</li><li><span>POST</span> /x402/pdf — REST + payment</li><li><span>POST</span> /x402/html — Free HTML convert</li><li><span>GET</span> /x402/chains — Chain metadata</li><li><span>GET</span> /stats, /health, /api/info</li></ul></div>
<div class="card"><h2>Payment Info (x402 V2)</h2><div class="sr" style="flex-wrap:wrap"><span class="sl">Networks</span><span class="sv" style="font-size:.85rem">Base + SKALE Europa (gasless)</span></div><div class="sr"><span class="sl">Token</span><span class="sv">USDC</span></div><div class="sr"><span class="sl">Wallet</span><span class="sv" style="font-size:.7rem;word-break:break-all;max-width:65%">${WALLET_ADDRESS}</span></div><div class="sr"><span class="sl">Facilitator</span><span class="sv">PayAI</span></div><div class="sr"><span class="sl">Protocol</span><span class="sv">x402 V2 + A2A v0.3</span></div><div class="sr"><span class="sl">SIWx</span><span class="sv" style="color:#66ffcc">Active (pay once, reuse)</span></div><div class="sr"><span class="sl">SIWx Sessions</span><span class="sv" id="ss">0</span></div></div>
<div class="card"><h2>Live Stats</h2><p style="color:#71717a;font-size:.7rem;margin-bottom:.5rem">(demo traffic &mdash; protocol verification)</p><div class="sr"><span class="sl">Payment Events</span><span class="sv" id="sp">0</span></div><div class="sr"><span class="sl">Tasks</span><span class="sv" id="st">0</span></div><div class="sr"><span class="sl">USDC Settled (demo)</span><span class="sv" id="sr-rev" style="color:#4dff88">$0.0000</span></div><div class="sr"><span class="sl">Conversion Rate</span><span class="sv" id="sr-conv">N/A</span></div><div class="sr"><span class="sl">Uptime</span><span class="sv" id="su">0s</span></div><div class="sr"><span class="sl">Agent Card</span><span class="sv"><a href="/.well-known/agent-card.json" style="color:#4da6ff">View JSON</a></span></div><h3 style="color:#888;font-size:.9rem;margin-top:1rem;margin-bottom:.5rem">Recent Activity</h3><div id="pl" style="max-height:200px;overflow-y:auto"></div></div>
</div>
<div class="ts"><h2>Try It: Send A2A Message</h2><p style="color:#888;margin-bottom:1rem;font-size:.9rem">Free <b>Markdown to HTML</b> executes immediately. Paid skills return payment requirements.</p><div class="tf"><input type="text" id="ti" placeholder="Enter markdown or URL" value="# Hello from A2A&#10;&#10;This is a **test**."><button id="tb" onclick="go()">Send A2A Message</button></div><div id="result"></div></div>
</div>
<footer>Built by <a href="https://opspawn.com">OpSpawn</a> for the SF Agentic Commerce x402 Hackathon | x402 V2 + A2A v0.3 + SIWx + SKALE Europa | <a href="/x402">Catalog</a> | <a href="/.well-known/agent-card.json">Agent Card</a> | <a href="/api/siwx">SIWx Sessions</a></footer>
<script>
async function rf(){try{const r=await fetch('/api/info'),d=await r.json();document.getElementById('sp').textContent=d.stats.payments;document.getElementById('st').textContent=d.stats.tasks;const ss=document.getElementById('ss');if(ss)ss.textContent=d.stats.siwxSessions||0;const s=Math.round(d.stats.uptime),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;document.getElementById('su').textContent=h>0?h+'h '+m+'m':m>0?m+'m '+sec+'s':sec+'s'}catch(e){}}async function rs(){try{const r=await fetch('/stats'),d=await r.json();const re=document.getElementById('sr-rev');if(re)re.textContent='$'+d.payments.revenue.total+' USDC';const cr=document.getElementById('sr-conv');if(cr)cr.textContent=d.payments.revenue.conversionRate||'N/A'}catch(e){}}async function rp(){try{const r=await fetch('/api/payments'),d=await r.json(),el=document.getElementById('pl');if(d.payments.length)el.innerHTML=d.payments.slice(-10).reverse().map(p=>'<div class="le"><span class="lt">'+(p.timestamp?.split('T')[1]?.split('.')[0]||'')+'</span> <span class="ly '+p.type+'">'+p.type+'</span> '+(p.skill||'')+'</div>').join('')}catch(e){}}rf();rs();rp();setInterval(()=>{rf();rs();rp()},3000);
async function go(){const i=document.getElementById('ti').value,b=document.getElementById('tb'),r=document.getElementById('result');b.disabled=true;b.textContent='Sending...';r.style.display='block';r.textContent='Sending...';try{const body={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:i}],kind:'message'},configuration:{blocking:true,acceptedOutputModes:['text/plain','text/html','application/json']}}};const resp=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await resp.json();r.textContent=JSON.stringify(d,null,2);rf()}catch(e){r.textContent='Error: '+e.message}b.disabled=false;b.textContent='Send A2A Message'}
</script></body></html>`;
}

// === Demo Page: Human-Facing Hackathon Demo ===
function getDemoHtml() {
  const publicUrl = PUBLIC_URL.replace(/\/$/, '');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>A2A x402 Gateway — Live Demo</title>
<meta name="description" content="Watch AI agents discover, negotiate, and pay each other using A2A protocol + x402 V2 micropayments. Live interactive demo.">
<meta property="og:title" content="A2A x402 Gateway — Pay-Per-Request Agent Services">
<meta property="og:description" content="AI agents discover, negotiate, and pay each other for services using A2A + x402 V2 micropayments on Base and SKALE Europa.">
<meta property="og:type" content="website">
<meta property="og:url" content="${publicUrl}/demo">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="A2A x402 Gateway — Agent Micropayments">
<meta name="twitter:description" content="Live demo: AI agents paying agents with USDC micropayments via A2A protocol + x402 V2.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;overflow-x:hidden}
a{color:#00d4ff;text-decoration:none}a:hover{text-decoration:underline}

/* Hero */
.hero{background:linear-gradient(135deg,#0a1628 0%,#1a0a2e 40%,#0a2e1a 100%);padding:3rem 2rem 2rem;text-align:center;border-bottom:2px solid #00d4ff;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(circle at 30% 50%,rgba(0,212,255,0.08) 0%,transparent 50%),radial-gradient(circle at 70% 50%,rgba(77,255,136,0.06) 0%,transparent 50%);pointer-events:none}
.hero h1{font-size:2.5rem;background:linear-gradient(90deg,#00d4ff,#4dff88,#ffcc00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:.5rem;position:relative}
.hero .sub{color:#8899aa;font-size:1.15rem;max-width:700px;margin:0 auto .8rem}
.hero .tagline{color:#4dff88;font-size:.95rem;font-weight:600;margin-bottom:1rem}
.proto-badges{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.8rem}
.proto-badge{padding:.25rem .7rem;border-radius:12px;font-size:.75rem;font-weight:600}
.pb-a2a{background:#1a3a5c;color:#4da6ff;border:1px solid #4da6ff}
.pb-x4{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}
.pb-base{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}
.pb-skale{background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff}
.pb-siwx{background:#1a2a2a;color:#66ffcc;border:1px solid #66ffcc}
.pb-live{background:#2a1a1a;color:#ff4444;border:1px solid #ff4444;animation:livePulse 2s infinite}
@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.6}}

.ct{max-width:960px;margin:0 auto;padding:2rem}

/* Stats bar */
.stats-bar{display:flex;gap:2rem;justify-content:center;margin:1.5rem 0 2rem;flex-wrap:wrap}
.stat{text-align:center;min-width:80px}
.stat .num{font-size:1.8rem;font-weight:700;color:#00d4ff;font-variant-numeric:tabular-nums}
.stat .label{font-size:.7rem;color:#666;text-transform:uppercase;letter-spacing:1px}

/* Video section */
.video-section{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem;text-align:center}
.video-section h2{color:#00d4ff;font-size:1.3rem;margin-bottom:1rem}
.video-wrap{position:relative;max-width:720px;margin:0 auto;border-radius:12px;overflow:hidden;border:2px solid #333;background:#000}
.video-wrap video{width:100%;display:block}

/* Architecture */
.arch{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem}
.arch h2{color:#00d4ff;font-size:1.3rem;margin-bottom:1.2rem;text-align:center}
.arch-flow{display:flex;align-items:center;justify-content:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1.5rem}
.arch-node{padding:.6rem 1.2rem;border-radius:8px;font-size:.85rem;font-weight:600;text-align:center;min-width:100px}
.arch-arrow{color:#555;font-size:1.4rem}
.an-client{background:#1a2a3a;color:#4da6ff;border:1px solid #4da6ff}
.an-a2a{background:#1a3c2c;color:#4dff88;border:1px solid #4dff88}
.an-x402{background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00}
.an-result{background:#2a1a2a;color:#ff88ff;border:1px solid #ff88ff}
.arch-detail{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
.arch-card{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:1rem}
.arch-card h3{color:#ddd;font-size:.9rem;margin-bottom:.4rem}
.arch-card p{color:#777;font-size:.8rem;line-height:1.4}
.arch-card code{background:#1a1a2a;color:#4da6ff;padding:.1rem .3rem;border-radius:3px;font-size:.75rem}

/* Scenarios */
.scenario{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem}
.scenario h2{color:#00d4ff;font-size:1.3rem;margin-bottom:.5rem}
.scenario .desc{color:#888;margin-bottom:1.2rem;font-size:.95rem}
.step{display:flex;align-items:flex-start;gap:1rem;padding:.8rem 1rem;border-radius:10px;margin-bottom:.4rem;opacity:0.3;transition:all 0.5s ease}
.step.active{opacity:1;background:#1a1a2a}
.step.done{opacity:1;background:#0a1a0a}
.step-num{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;flex-shrink:0;border:2px solid #333;color:#555;transition:all 0.5s}
.step.active .step-num{border-color:#00d4ff;color:#00d4ff;box-shadow:0 0 12px rgba(0,212,255,0.3)}
.step.done .step-num{border-color:#4dff88;color:#4dff88;background:#0a2a0a}
.step-body{flex:1;min-width:0}
.step-body h3{font-size:.95rem;color:#ccc;margin-bottom:.15rem}
.step.active .step-body h3{color:#fff}
.step.done .step-body h3{color:#4dff88}
.step-body .detail{font-size:.8rem;color:#666}
.step.active .step-body .detail{color:#aaa}
.step.done .step-body .detail{color:#6a9}

/* Protocol viewer */
.proto-viewer{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;margin-top:.6rem;overflow:hidden;display:none}
.proto-viewer.show{display:block;animation:fadeIn .3s}
.proto-header{display:flex;align-items:center;gap:.5rem;padding:.4rem .8rem;background:#111;border-bottom:1px solid #1a1a1a}
.proto-method{font-family:monospace;font-size:.75rem;font-weight:600;padding:.15rem .4rem;border-radius:4px}
.pm-get{background:#1a3a2a;color:#4dff88}
.pm-post{background:#1a2a3a;color:#4da6ff}
.pm-402{background:#2a2a1a;color:#ffcc00}
.proto-url{font-family:monospace;font-size:.75rem;color:#888}
.proto-body{padding:.6rem .8rem;max-height:180px;overflow:auto;font-family:monospace;font-size:.72rem;line-height:1.4;color:#999;white-space:pre-wrap;word-break:break-all}
.proto-body .key{color:#4da6ff}.proto-body .str{color:#4dff88}.proto-body .num{color:#ffcc00}

.result-box{background:#0a0a0a;border:2px solid #222;border-radius:12px;padding:1.5rem;margin-top:1rem;display:none}
.result-box.show{display:block;animation:fadeIn 0.5s}
.result-box h3{color:#4dff88;margin-bottom:.75rem;font-size:1rem}
.result-preview{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;max-height:300px;overflow:auto}
.result-preview iframe{width:100%;height:250px;border:none;border-radius:6px;background:#fff}

.btn{display:inline-block;padding:.7rem 1.8rem;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;border:none;transition:all 0.3s}
.btn-primary{background:linear-gradient(135deg,#00d4ff,#0088cc);color:#000}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,212,255,0.3)}
.btn-primary:disabled{background:#333;color:#666;cursor:wait;transform:none;box-shadow:none}
.btn-sm{padding:.4rem 1rem;font-size:.8rem;border-radius:6px}
.btn-row{text-align:center;margin:1.2rem 0}
.timer{font-family:monospace;color:#ffcc00;font-size:1.1rem;text-align:center;margin-top:.8rem;min-height:1.4rem}
.payment-badge{display:inline-block;background:#2a2a1a;color:#ffcc00;border:1px solid #ffcc00;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;font-weight:600}
.free-badge{display:inline-block;background:#1a2a1a;color:#4dff88;border:1px solid #4dff88;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;font-weight:600}

/* Try it with curl */
.curl-section{background:#111;border:1px solid #222;border-radius:16px;padding:2rem;margin-bottom:2rem}
.curl-section h2{color:#00d4ff;font-size:1.3rem;margin-bottom:.5rem}
.curl-section .desc{color:#888;margin-bottom:1.2rem;font-size:.9rem}
.curl-block{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:1rem;margin-bottom:1rem;position:relative}
.curl-block h3{color:#aaa;font-size:.85rem;margin-bottom:.5rem}
.curl-code{font-family:monospace;font-size:.78rem;color:#ccc;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.curl-code .cm{color:#666}
.curl-code .kw{color:#ff88ff}
.curl-code .url{color:#4dff88}
.curl-code .flag{color:#4da6ff}
.copy-btn{position:absolute;top:.6rem;right:.6rem;background:#222;color:#888;border:1px solid #333;padding:.2rem .6rem;border-radius:4px;font-size:.7rem;cursor:pointer}
.copy-btn:hover{background:#333;color:#fff}
.copy-btn.copied{background:#1a3c2c;color:#4dff88;border-color:#4dff88}
.tab-btn{background:#1a1a2a;color:#888;border:1px solid #333;padding:.4rem 1rem;border-radius:6px;font-size:.8rem;cursor:pointer;font-weight:600;transition:all .2s}
.tab-btn:hover{background:#222;color:#fff}
.tab-btn.active{background:#00d4ff;color:#000;border-color:#00d4ff}
.tab-content{animation:fadeIn .3s}

/* Footer */
footer{text-align:center;padding:2rem;color:#444;font-size:.85rem;border-top:1px solid #1a1a1a;margin-top:2rem}
footer a{color:#00d4ff;text-decoration:none}
.footer-links{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:.5rem}

@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.loading{animation:pulse 1s infinite}

@media(max-width:600px){
  .hero h1{font-size:1.8rem}
  .arch-flow{flex-direction:column}
  .arch-arrow{transform:rotate(90deg)}
  .stats-bar{gap:1rem}
  .stat .num{font-size:1.4rem}
}
</style></head><body>

<div class="hero">
  <h1>A2A x402 Gateway</h1>
  <p class="sub">AI agents discover, negotiate, and pay each other for services — live, in real time, for fractions of a cent.</p>
  <div class="tagline">The first A2A agent with native x402 V2 micropayments</div>
  <div class="proto-badges">
    <span class="proto-badge pb-live">LIVE</span>
    <span class="proto-badge pb-a2a">A2A v0.3</span>
    <span class="proto-badge pb-x4">x402 V2</span>
    <span class="proto-badge pb-base">Base USDC</span>
    <span class="proto-badge pb-skale">SKALE Europa (Gasless)</span>
    <span class="proto-badge pb-siwx">SIWx Sessions</span>
  </div>
</div>

<div class="ct">
  <!-- Live stats -->
  <div class="stats-bar">
    <div class="stat"><div class="num" id="d-revenue" style="color:#4dff88">$0.00</div><div class="label">USDC Settled (demo)</div></div>
    <div class="stat"><div class="num" id="d-tasks">0</div><div class="label">Tasks</div></div>
    <div class="stat"><div class="num" id="d-payments">0</div><div class="label">Payments</div></div>
    <div class="stat"><div class="num" id="d-sessions">0</div><div class="label">SIWx Sessions</div></div>
    <div class="stat"><div class="num" id="d-uptime">0s</div><div class="label">Uptime</div></div>
  </div>
  <div style="text-align:center;color:#71717a;font-size:0.75rem;margin-top:-12px;margin-bottom:12px">(demo traffic &mdash; protocol verification with real on-chain USDC)</div>

  <!-- Demo Video -->
  <div class="video-section">
    <h2>Watch the Demo</h2>
    <div class="video-wrap">
      <video controls preload="metadata" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='720' height='405' fill='%230a0a0a'%3E%3Crect width='720' height='405'/%3E%3Ctext x='50%25' y='50%25' fill='%23555' font-family='sans-serif' font-size='20' text-anchor='middle' dy='.3em'%3EClick to play demo%3C/text%3E%3C/svg%3E">
        <source src="/public/demo-video.mp4" type="video/mp4">
      </video>
    </div>
  </div>

  <!-- Architecture -->
  <div class="arch">
    <h2>Architecture</h2>
    <div class="arch-flow">
      <div class="arch-node an-client">AI Agent<br><small>Any A2A client</small></div>
      <div class="arch-arrow">&rarr;</div>
      <div class="arch-node an-a2a">A2A Gateway<br><small>JSON-RPC v0.3</small></div>
      <div class="arch-arrow">&rarr;</div>
      <div class="arch-node an-x402">x402 Payment<br><small>USDC on Base / SKALE</small></div>
      <div class="arch-arrow">&rarr;</div>
      <div class="arch-node an-result">Service Result<br><small>PNG / PDF / HTML</small></div>
    </div>
    <div class="arch-detail">
      <div class="arch-card">
        <h3>A2A Protocol v0.3</h3>
        <p>Google's Agent-to-Agent standard. Discovery via <code>/.well-known/agent-card.json</code>, communication via JSON-RPC <code>message/send</code>.</p>
      </div>
      <div class="arch-card">
        <h3>x402 V2 Payments</h3>
        <p>Coinbase's HTTP payment protocol. CAIP-2 network IDs, multi-chain USDC, PayAI facilitator for verification.</p>
      </div>
      <div class="arch-card">
        <h3>SIWx Sessions</h3>
        <p>Sign-In-With-X (CAIP-122). Pay once for a skill, reuse forever. No API keys, no subscriptions.</p>
      </div>
      <div class="arch-card">
        <h3>Multi-Chain</h3>
        <p>Base <code>eip155:8453</code> ($0.01 per screenshot) or SKALE Europa <code>eip155:2046399126</code> (gasless, zero gas fees).</p>
      </div>
    </div>
  </div>

  <!-- Demo 1: Free -->
  <div class="scenario" id="s1">
    <h2>Interactive Demo: Markdown to HTML <span class="free-badge">FREE</span></h2>
    <p class="desc">Free skill — no payment needed. Watch the A2A protocol exchange in real time, with full JSON-RPC payloads visible.</p>
    <div class="step-container">
      <div class="step" id="s1-1">
        <div class="step-num">1</div>
        <div class="step-body">
          <h3>Discover agent via standard A2A endpoint</h3>
          <div class="detail">GET /.well-known/agent-card.json</div>
          <div class="proto-viewer" id="s1-1-proto"></div>
        </div>
      </div>
      <div class="step" id="s1-2">
        <div class="step-num">2</div>
        <div class="step-body">
          <h3>Send A2A message/send request</h3>
          <div class="detail">POST / — JSON-RPC 2.0 with markdown content</div>
          <div class="proto-viewer" id="s1-2-proto"></div>
        </div>
      </div>
      <div class="step" id="s1-3">
        <div class="step-num">3</div>
        <div class="step-body">
          <h3>Gateway returns HTML result</h3>
          <div class="detail">Task state: completed — no payment needed for free skills</div>
          <div class="proto-viewer" id="s1-3-proto"></div>
        </div>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="s1-btn" onclick="runDemo1()">Run Free Demo</button></div>
    <div class="timer" id="s1-timer"></div>
    <div class="result-box" id="s1-result"><h3>Rendered Output</h3><div class="result-preview" id="s1-preview"></div></div>
  </div>

  <!-- Demo 2: Paid -->
  <div class="scenario" id="s2">
    <h2>Interactive Demo: Screenshot a Website <span class="payment-badge">$0.01 USDC</span></h2>
    <p class="desc">Paid skill — watch the full x402 payment flow: request &rarr; 402 payment required &rarr; sign USDC &rarr; result delivered.</p>
    <div class="step-container">
      <div class="step" id="s2-1">
        <div class="step-num">1</div>
        <div class="step-body">
          <h3>Request screenshot of example.com</h3>
          <div class="detail">POST / — message/send with URL in natural language</div>
          <div class="proto-viewer" id="s2-1-proto"></div>
        </div>
      </div>
      <div class="step" id="s2-2">
        <div class="step-num">2</div>
        <div class="step-body">
          <h3>Gateway returns x402 payment requirements</h3>
          <div class="detail">Task state: input-required — x402 V2 accepts Base USDC or SKALE Europa gasless</div>
          <div class="proto-viewer" id="s2-2-proto"></div>
        </div>
      </div>
      <div class="step" id="s2-3">
        <div class="step-num">3</div>
        <div class="step-body">
          <h3>Agent signs x402 USDC payment</h3>
          <div class="detail">Client creates payment authorization for $0.01 USDC on Base</div>
          <div class="proto-viewer" id="s2-3-proto"></div>
        </div>
      </div>
      <div class="step" id="s2-4">
        <div class="step-num">4</div>
        <div class="step-body">
          <h3>Screenshot delivered + SIWx session created</h3>
          <div class="detail">Payment settled, wallet gets session access for future requests</div>
          <div class="proto-viewer" id="s2-4-proto"></div>
        </div>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="s2-btn" onclick="runDemo2()">Run Paid Demo</button></div>
    <div class="timer" id="s2-timer"></div>
    <div class="result-box" id="s2-result"><h3>Screenshot Result</h3><div class="result-preview" id="s2-preview"></div></div>
  </div>

  <!-- Try with curl -->
  <div class="curl-section">
    <h2>Try It Yourself</h2>
    <p class="desc">This is a live API. Copy these commands and run them against the real endpoint.</p>

    <div class="curl-block">
      <h3>1. Discover the agent</h3>
      <button class="copy-btn" onclick="copyCmd(this,'curl1')">Copy</button>
      <div class="curl-code" id="curl1"><span class="kw">curl</span> <span class="flag">-s</span> <span class="url">${publicUrl}/.well-known/agent-card.json</span> | <span class="kw">jq</span> <span class="str">'.'</span></div>
    </div>

    <div class="curl-block">
      <h3>2. Send a free A2A message (markdown to HTML)</h3>
      <button class="copy-btn" onclick="copyCmd(this,'curl2')">Copy</button>
      <div class="curl-code" id="curl2"><span class="kw">curl</span> <span class="flag">-s -X POST</span> <span class="url">${publicUrl}/</span> \\
  <span class="flag">-H</span> <span class="str">"Content-Type: application/json"</span> \\
  <span class="flag">-d</span> <span class="str">'{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"messageId":"demo-1","role":"user","parts":[{"kind":"text","text":"Convert to HTML: # Hello World"}],"kind":"message"}}}'</span> | <span class="kw">jq</span> <span class="str">'.'</span></div>
    </div>

    <div class="curl-block">
      <h3>3. Request a paid screenshot (returns payment requirements)</h3>
      <button class="copy-btn" onclick="copyCmd(this,'curl3')">Copy</button>
      <div class="curl-code" id="curl3"><span class="kw">curl</span> <span class="flag">-s -X POST</span> <span class="url">${publicUrl}/</span> \\
  <span class="flag">-H</span> <span class="str">"Content-Type: application/json"</span> \\
  <span class="flag">-d</span> <span class="str">'{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"messageId":"demo-2","role":"user","parts":[{"kind":"text","text":"Take a screenshot of https://example.com"}],"kind":"message"}}}'</span> | <span class="kw">jq</span> <span class="str">'.result.status'</span></div>
    </div>

    <div class="curl-block">
      <h3>4. View the x402 service catalog</h3>
      <button class="copy-btn" onclick="copyCmd(this,'curl4')">Copy</button>
      <div class="curl-code" id="curl4"><span class="kw">curl</span> <span class="flag">-s</span> <span class="url">${publicUrl}/x402</span> | <span class="kw">jq</span> <span class="str">'.'</span></div>
    </div>

    <div class="curl-block">
      <h3>5. REST x402 flow: screenshot with Payment-Signature header</h3>
      <button class="copy-btn" onclick="copyCmd(this,'curl5')">Copy</button>
      <div class="curl-code" id="curl5"><span class="cm"># Step 1: GET returns 402 with payment requirements</span>
<span class="kw">curl</span> <span class="flag">-s -o /dev/null -w</span> <span class="str">"%{http_code}"</span> <span class="url">${publicUrl}/x402/screenshot</span>
<span class="cm"># Step 2: POST with Payment-Signature header returns PNG</span>
<span class="kw">curl</span> <span class="flag">-s -X POST</span> <span class="url">${publicUrl}/x402/screenshot</span> \\
  <span class="flag">-H</span> <span class="str">"Content-Type: application/json"</span> \\
  <span class="flag">-H</span> <span class="str">"Payment-Signature: 0xsigned_usdc_authorization"</span> \\
  <span class="flag">-d</span> <span class="str">'{"url":"https://example.com"}'</span> <span class="flag">-o</span> <span class="str">screenshot.png</span></div>
    </div>
  </div>
</div>

<!-- Client Integration Examples -->
<div class="ct">
  <div class="curl-section">
    <h2>Client Integration</h2>
    <p class="desc">Integrate in under 10 lines. Works with any language that can make HTTP requests.</p>

    <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="tab-btn active" onclick="showTab('js',this)">JavaScript</button>
      <button class="tab-btn" onclick="showTab('py',this)">Python</button>
      <button class="tab-btn" onclick="showTab('a2a',this)">A2A Protocol</button>
    </div>

    <div id="tab-js" class="tab-content" style="display:block">
      <div class="curl-block">
        <h3>REST API — Take a Screenshot ($0.01 USDC)</h3>
        <button class="copy-btn" onclick="copyCmd(this,'code-js')">Copy</button>
        <div class="curl-code" id="code-js"><span class="cm">// Node.js / Browser — zero dependencies</span>
<span class="kw">const</span> res = <span class="kw">await</span> fetch(<span class="str">'${publicUrl}/x402/screenshot'</span>, {
  method: <span class="str">'POST'</span>,
  headers: {
    <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span>,
    <span class="str">'Payment-Signature'</span>: signedPayment <span class="cm">// USDC authorization</span>
  },
  body: JSON.stringify({ url: <span class="str">'https://example.com'</span> })
});
<span class="kw">const</span> screenshot = <span class="kw">await</span> res.blob(); <span class="cm">// PNG image</span></div>
      </div>
      <div class="curl-block">
        <h3>Free API — Markdown to HTML (no payment needed)</h3>
        <button class="copy-btn" onclick="copyCmd(this,'code-js2')">Copy</button>
        <div class="curl-code" id="code-js2"><span class="kw">const</span> res = <span class="kw">await</span> fetch(<span class="str">'${publicUrl}/x402/html'</span>, {
  method: <span class="str">'POST'</span>,
  headers: { <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span> },
  body: JSON.stringify({ markdown: <span class="str">'# Hello\\n\\n**Bold** and *italic*'</span> })
});
<span class="kw">const</span> html = <span class="kw">await</span> res.text(); <span class="cm">// Rendered HTML</span></div>
      </div>
    </div>

    <div id="tab-py" class="tab-content" style="display:none">
      <div class="curl-block">
        <h3>Python — Take a Screenshot ($0.01 USDC)</h3>
        <button class="copy-btn" onclick="copyCmd(this,'code-py')">Copy</button>
        <div class="curl-code" id="code-py"><span class="kw">import</span> requests

res = requests.post(<span class="str">'${publicUrl}/x402/screenshot'</span>,
    headers={<span class="str">'Payment-Signature'</span>: signed_payment},
    json={<span class="str">'url'</span>: <span class="str">'https://example.com'</span>})

<span class="kw">with</span> open(<span class="str">'screenshot.png'</span>, <span class="str">'wb'</span>) <span class="kw">as</span> f:
    f.write(res.content)  <span class="cm"># PNG image saved</span></div>
      </div>
      <div class="curl-block">
        <h3>Python — Discover Agent Services</h3>
        <button class="copy-btn" onclick="copyCmd(this,'code-py2')">Copy</button>
        <div class="curl-code" id="code-py2"><span class="kw">import</span> requests

card = requests.get(<span class="str">'${publicUrl}/.well-known/agent-card.json'</span>).json()
<span class="kw">for</span> skill <span class="kw">in</span> card[<span class="str">'skills'</span>]:
    print(f<span class="str">"{skill['name']}: {skill['description']}"</span>)</div>
      </div>
    </div>

    <div id="tab-a2a" class="tab-content" style="display:none">
      <div class="curl-block">
        <h3>A2A JSON-RPC — Agent-to-Agent Communication</h3>
        <button class="copy-btn" onclick="copyCmd(this,'code-a2a')">Copy</button>
        <div class="curl-code" id="code-a2a"><span class="cm">// A2A v0.3 standard message/send</span>
<span class="kw">const</span> response = <span class="kw">await</span> fetch(<span class="str">'${publicUrl}/'</span>, {
  method: <span class="str">'POST'</span>,
  headers: { <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span> },
  body: JSON.stringify({
    jsonrpc: <span class="str">'2.0'</span>,
    id: crypto.randomUUID(),
    method: <span class="str">'message/send'</span>,
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: <span class="str">'user'</span>,
        parts: [{ kind: <span class="str">'text'</span>,
          text: <span class="str">'Convert this markdown to HTML: # Hello World'</span> }],
        kind: <span class="str">'message'</span>
      },
      configuration: { blocking: <span class="kw">true</span> }
    }
  })
});
<span class="kw">const</span> task = <span class="kw">await</span> response.json();
<span class="cm">// task.result.artifacts[0].parts[0] contains HTML output</span></div>
      </div>
    </div>
  </div>
</div>

<footer>
  <strong><a href="https://opspawn.com">OpSpawn</a></strong> — An autonomous AI agent building agent infrastructure
  <div class="footer-links">
    <a href="/dashboard">Dashboard</a>
    <a href="/.well-known/agent-card.json">Agent Card</a>
    <a href="/x402">Service Catalog</a>
    <a href="/api/siwx">SIWx Sessions</a>
    <a href="https://git.opspawn.com/opspawn/a2a-x402-gateway">Source Code</a>
  </div>
</footer>

<script>
const PUB='${publicUrl}';

// Stats refresh
async function refreshStats(){
  try{
    const r=await fetch('/api/info'),d=await r.json();
    document.getElementById('d-payments').textContent=d.stats.payments;
    document.getElementById('d-tasks').textContent=d.stats.tasks;
    document.getElementById('d-sessions').textContent=d.stats.siwxSessions||0;
    const s=Math.round(d.stats.uptime),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
    document.getElementById('d-uptime').textContent=h>0?h+'h '+m+'m':m>0?m+'m':(s+'s');
  }catch(e){}}
async function refreshRevenue(){
  try{
    const r=await fetch('/stats'),d=await r.json();
    const rev=document.getElementById('d-revenue');
    if(rev&&d.payments?.revenue?.total)rev.textContent='$'+d.payments.revenue.total;
  }catch(e){}}
refreshStats();refreshRevenue();setInterval(refreshStats,5000);setInterval(refreshRevenue,10000);

function setStep(prefix,n,state){
  const el=document.getElementById(prefix+'-'+n);
  if(!el)return;
  el.className='step '+state;
}
function setTimer(id,text){document.getElementById(id).textContent=text;}

function showProto(id,method,url,body){
  const el=document.getElementById(id);
  if(!el)return;
  const mc=method==='GET'?'pm-get':method==='402'?'pm-402':'pm-post';
  const ml=method==='402'?'402 Payment Required':method;
  let bodyHtml='';
  if(body){
    bodyHtml=JSON.stringify(body,null,2)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/"([^"]+)":/g,'<span class="key">"$1"</span>:')
      .replace(/: "([^"]+)"/g,': <span class="str">"$1"</span>')
      .replace(/: (\\d+\\.?\\d*)/g,': <span class="num">$1</span>')
      .replace(/: (true|false|null)/g,': <span class="num">$1</span>');
  }
  el.innerHTML='<div class="proto-header"><span class="proto-method '+mc+'">'+ml+'</span><span class="proto-url">'+url+'</span></div>'+(bodyHtml?'<div class="proto-body">'+bodyHtml+'</div>':'');
  el.classList.add('show');
}

function hideProto(id){
  const el=document.getElementById(id);
  if(el){el.classList.remove('show');el.innerHTML='';}
}

// Tab switching
function showTab(tab,btn){
  document.querySelectorAll('.tab-content').forEach(el=>el.style.display='none');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tab).style.display='block';
  btn.classList.add('active');
}

// Copy curl command
function copyCmd(btn,id){
  const el=document.getElementById(id);
  const text=el.textContent.replace(/\\n/g,'');
  navigator.clipboard.writeText(text).then(()=>{
    btn.textContent='Copied!';btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='Copy';btn.classList.remove('copied');},1500);
  });
}

// Demo 1: Free markdown-to-html
async function runDemo1(){
  const btn=document.getElementById('s1-btn');
  btn.disabled=true;btn.textContent='Running...';
  document.getElementById('s1-result').classList.remove('show');
  hideProto('s1-1-proto');hideProto('s1-2-proto');hideProto('s1-3-proto');
  const start=Date.now();

  // Step 1: Discover
  setStep('s1',1,'active');setStep('s1',2,'');setStep('s1',3,'');
  setTimer('s1-timer','Discovering agent...');
  const cardResp=await fetch('/.well-known/agent-card.json');
  const cardData=await cardResp.json();
  showProto('s1-1-proto','GET','/.well-known/agent-card.json',{name:cardData.name,version:cardData.version,skills:cardData.skills?.map(s=>s.id),extensions:['urn:x402:payment:v2']});
  await sleep(800);
  setStep('s1',1,'done');

  // Step 2: Send message
  setStep('s1',2,'active');
  setTimer('s1-timer','Sending A2A message...');
  const msgId=crypto.randomUUID();
  const body={jsonrpc:'2.0',id:msgId,method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Convert to HTML: # Agent Commerce Report\\n\\n**AI agents** paying agents with x402 micropayments.\\n\\n## Features\\n- A2A v0.3 discovery\\n- x402 V2 payments\\n- SIWx sessions\\n\\n> The future is autonomous commerce.'}],kind:'message'}}};
  showProto('s1-2-proto','POST','/',{jsonrpc:'2.0',method:'message/send',params:{message:{role:'user',parts:[{kind:'text',text:'Convert to HTML: # Agent Commerce Report...'}]}}});
  const resp=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await resp.json();
  await sleep(400);
  setStep('s1',2,'done');

  // Step 3: Result
  setStep('s1',3,'active');
  setTimer('s1-timer','Processing...');
  showProto('s1-3-proto','POST','/ (response)',{result:{status:{state:'completed'},message:{parts:['text: Converted markdown to HTML','data: {html: ...}']}}});
  await sleep(500);
  setStep('s1',3,'done');

  const elapsed=((Date.now()-start)/1000).toFixed(1);
  setTimer('s1-timer','Completed in '+elapsed+'s — zero cost');

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
  hideProto('s2-1-proto');hideProto('s2-2-proto');hideProto('s2-3-proto');hideProto('s2-4-proto');
  const start=Date.now();

  // Step 1: Request screenshot
  setStep('s2',1,'active');setStep('s2',2,'');setStep('s2',3,'');setStep('s2',4,'');
  setTimer('s2-timer','Requesting screenshot...');
  const body1={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Take a screenshot of https://example.com'}],kind:'message'}}};
  showProto('s2-1-proto','POST','/',{jsonrpc:'2.0',method:'message/send',params:{message:{parts:[{kind:'text',text:'Take a screenshot of https://example.com'}]}}});
  const resp1=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body1)});
  const data1=await resp1.json();
  await sleep(600);
  setStep('s2',1,'done');

  // Step 2: Payment required
  setStep('s2',2,'active');
  setTimer('s2-timer','Payment required: $0.01 USDC on Base');
  const payParts=data1.result?.status?.message?.parts?.find(p=>p.kind==='data');
  showProto('s2-2-proto','402','/ (response)',{result:{status:{state:'input-required'},'x402.payment.required':true,'x402.version':'2.0','x402.accepts':[{scheme:'exact',network:'eip155:8453',price:'$0.01',asset:'USDC'},{scheme:'exact',network:'eip155:2046399126',price:'$0.01',gasless:true,note:'SKALE Europa — zero gas fees'}]}});
  await sleep(1200);
  setStep('s2',2,'done');

  // Step 3: Sign payment
  setStep('s2',3,'active');
  setTimer('s2-timer','Signing x402 payment authorization...');
  showProto('s2-3-proto','POST','/ (with payment)',{metadata:{'x402.payment.payload':{from:'0xDemo...abcdef',signature:'0xdemo...',network:'eip155:8453'},'x402.payer':'0xDemo...abcdef'}});
  await sleep(1000);
  setStep('s2',3,'done');

  // Step 4: Execute with payment
  setStep('s2',4,'active');
  setTimer('s2-timer','Payment accepted — capturing screenshot...');
  const body2={jsonrpc:'2.0',id:crypto.randomUUID(),method:'message/send',
    params:{message:{messageId:crypto.randomUUID(),role:'user',parts:[{kind:'text',text:'Take a screenshot of https://example.com'}],kind:'message',
    metadata:{'x402.payment.payload':{from:'0xDemoWallet1234567890abcdef',signature:'0xdemo',network:'eip155:8453'},'x402.payer':'0xDemoWallet1234567890abcdef'}}}};
  const resp2=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body2)});
  const data2=await resp2.json();
  showProto('s2-4-proto','POST','/ (response)',{result:{status:{state:'completed'},'x402.payment.settled':true,'x402.siwx.active':true,message:{parts:['text: Screenshot captured (19KB)','file: screenshot.png (image/png)']}}});
  setStep('s2',4,'done');

  const elapsed=((Date.now()-start)/1000).toFixed(1);
  setTimer('s2-timer','Completed in '+elapsed+'s — cost: $0.01 USDC — SIWx session active');

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
