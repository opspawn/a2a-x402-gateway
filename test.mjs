/**
 * Test suite for A2A x402 Gateway v2
 */

const BASE = 'http://localhost:4002';
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (err) { console.log(`  FAIL: ${name} - ${err.message}`); failed++; }
}

function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }

console.log('\nA2A x402 Gateway v2 Tests\n');

await test('GET /health returns ok', async () => {
  const r = await fetch(`${BASE}/health`);
  const d = await r.json();
  assert(d.status === 'ok');
  assert(d.uptime > 0);
});

await test('GET /.well-known/agent-card.json returns valid V2 agent card', async () => {
  const r = await fetch(`${BASE}/.well-known/agent-card.json`);
  assert(r.status === 200);
  const d = await r.json();
  assert(d.name === 'OpSpawn AI Agent');
  assert(d.version === '2.2.0', `Version: ${d.version}`);
  assert(d.skills.length === 4);
  assert(d.skills[0].id === 'screenshot');
  assert(d.protocolVersion === '0.3.0');
  assert(d.provider.organization === 'OpSpawn');
  assert(d.capabilities.stateTransitionHistory === true);
  // V2: extension with payment config
  const payExt = d.extensions.find(e => e.uri === 'urn:x402:payment:v2');
  assert(payExt, 'Has V2 payment extension');
  assert(payExt.config.version === '2.0', 'Extension version 2.0');
  assert(payExt.config.networks.length >= 2, `Networks: ${payExt.config.networks.length}`);
  assert(payExt.config.features.includes('siwx'), 'Supports SIWx');
});

await test('GET /x402 returns V2 service catalog', async () => {
  const r = await fetch(`${BASE}/x402`);
  const d = await r.json();
  assert(d.version === '2.2.0', `Version: ${d.version}`);
  assert(d.protocols.a2a.version === '0.3.0');
  assert(d.protocols.x402.version === '2.0', `x402 version: ${d.protocols.x402.version}`);
  assert(d.protocols.x402.networks.length >= 2, 'Has multiple networks');
  assert(d.protocols.x402.networks[0].network === 'eip155:8453', 'Base CAIP-2 ID');
  assert(d.protocols.x402.features.siwx, 'SIWx feature documented');
  assert(d.endpoints.length === 4);
  assert(d.endpoints[0].price === '$0.01');
  assert(d.endpoints[3].price === 'free');
});

await test('GET /api/info returns V2 agent info with stats', async () => {
  const r = await fetch(`${BASE}/api/info`);
  const d = await r.json();
  assert(d.agent.name === 'OpSpawn AI Agent');
  assert(d.payments.version === '2.0', 'Payment version 2.0');
  assert(d.payments.networks.length >= 2, 'Multiple networks');
  assert(d.payments.features.includes('siwx'), 'SIWx feature');
  assert(d.stats.uptime > 0);
  assert(typeof d.stats.siwxSessions === 'number', 'SIWx session count');
  assert(d.stats.paymentsByType, 'Has payment breakdown');
});

await test('GET /api/siwx returns session list', async () => {
  const r = await fetch(`${BASE}/api/siwx`);
  const d = await r.json();
  assert(Array.isArray(d.sessions), 'Has sessions array');
  assert(typeof d.total === 'number', 'Has total count');
});

await test('GET /dashboard returns HTML page', async () => {
  const r = await fetch(`${BASE}/dashboard`);
  const t = await r.text();
  assert(t.includes('A2A x402 Gateway'));
  assert(t.includes('x402 V2'));
  assert(t.includes('SIWx'));
  assert(t.includes('SKALE'));
  assert(t.includes('Agent Skills'));
  assert(t.includes('Payment Flow'));
});

await test('A2A message/send: free markdown-to-html works', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-free',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-free', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: '# Test Heading\n\nHello world' }],
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result, 'Has result');
  assert(d.result.status.state === 'completed', `State: ${d.result.status.state}`);
  const msg = d.result.status.message;
  assert(msg.parts.length >= 2, 'Has text and data parts');
  const dataPart = msg.parts.find(p => p.kind === 'data');
  assert(dataPart, 'Has data part');
  assert(dataPart.data.html.includes('Test Heading'), 'HTML has heading');
});

await test('A2A message/send: screenshot returns V2 payment-required', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-paid',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-paid', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result, 'Has result');
  assert(d.result.status.state === 'input-required', `State: ${d.result.status.state}`);
  const msg = d.result.status.message;
  assert(msg.parts[0].text.includes('Payment required'), 'Payment required message');
  const dataPart = msg.parts.find(p => p.kind === 'data');
  assert(dataPart.data['x402.payment.required'] === true, 'x402 flag');
  assert(dataPart.data['x402.version'] === '2.0', `x402 version: ${dataPart.data['x402.version']}`);
  // V2: accepts array with CAIP-2 network IDs
  const accepts = dataPart.data['x402.accepts'];
  assert(Array.isArray(accepts), 'Accepts is array');
  assert(accepts.length >= 2, `Networks: ${accepts.length}`);
  assert(accepts[0].network === 'eip155:8453', `Base CAIP-2: ${accepts[0].network}`);
  assert(accepts[0].price === '$0.01', `Price: ${accepts[0].price}`);
  // SIWx extension
  const exts = dataPart.data['x402.extensions'];
  assert(exts?.['sign-in-with-x']?.supported === true, 'SIWx supported');
});

await test('A2A message/send: PDF returns V2 payment-required', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-pdf',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-pdf', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Convert to PDF: # My Document' }],
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result.status.state === 'input-required', `State: ${d.result.status.state}`);
  const dataPart = d.result.status.message.parts.find(p => p.kind === 'data');
  assert(dataPart.data['x402.accepts'][0].price === '$0.005', `Price: ${dataPart.data['x402.accepts'][0].price}`);
});

await test('A2A message/send: paid screenshot with payment payload', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-paid-exec',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-paid-exec', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
          metadata: {
            'x402.payment.payload': { scheme: 'exact', network: 'eip155:8453', signature: '0xfake', from: '0xTestWallet123' },
            'x402.payer': '0xTestWallet123',
          },
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result, 'Has result');
  const state = d.result.status.state;
  assert(state === 'completed' || state === 'failed', `State: ${state}`);
  if (state === 'completed') {
    assert(d.result.metadata['x402.version'] === '2.0', 'V2 metadata');
    assert(d.result.metadata['x402.siwx.active'] === true, 'SIWx session created');
    const filePart = d.result.status.message.parts.find(p => p.kind === 'file');
    assert(filePart, 'Has file part (screenshot)');
    assert(filePart.mimeType === 'image/png', 'PNG mime type');
    console.log(`    (Screenshot: ${Math.round(filePart.data.length * 3/4 / 1024)}KB)`);
  } else {
    console.log(`    (Expected: SnapAPI may not be running: ${d.result.status.message.parts[0].text})`);
  }
});

await test('SIWx: session recorded after payment', async () => {
  const r = await fetch(`${BASE}/api/siwx`);
  const d = await r.json();
  // After the paid screenshot test, the wallet should be in sessions
  const session = d.sessions.find(s => s.wallet === '0xtestwallet123');
  assert(session, `SIWx session found for test wallet (sessions: ${d.total})`);
  assert(session.skills.includes('screenshot'), 'Screenshot skill recorded');
});

await test('SIWx: session access bypasses payment', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-siwx',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-siwx', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
          metadata: { 'x402.siwx.wallet': '0xTestWallet123' },
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result, 'Has result');
  // Should execute directly (completed or failed) without payment-required
  const state = d.result.status.state;
  assert(state === 'completed' || state === 'failed', `SIWx access state: ${state} (should not be input-required)`);
  assert(state !== 'input-required', 'SIWx should bypass payment');
});

await test('SIWx: unknown wallet still requires payment', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-siwx-unknown',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-siwx-unknown', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
          metadata: { 'x402.siwx.wallet': '0xUnknownWallet' },
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  assert(d.result.status.state === 'input-required', `Unknown wallet should require payment: ${d.result.status.state}`);
});

await test('A2A tasks/get returns task', async () => {
  const r1 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'create',
      method: 'message/send',
      params: { message: { messageId: 'msg-get', role: 'user', kind: 'message', parts: [{ kind: 'text', text: '# Test' }] }, configuration: { blocking: true } },
    }),
  });
  const d1 = await r1.json();
  const taskId = d1.result.id;

  const r2 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'get', method: 'tasks/get', params: { id: taskId } }),
  });
  const d2 = await r2.json();
  assert(d2.result.id === taskId, 'Task ID matches');
  assert(d2.result.status.state === 'completed', 'Task completed');
});

await test('A2A tasks/get for unknown task returns error', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'notfound', method: 'tasks/get', params: { id: 'nonexistent' } }),
  });
  const d = await r.json();
  assert(d.error, 'Has error');
  assert(d.error.code === -32001, 'Task not found error code');
});

await test('A2A tasks/cancel works', async () => {
  // Create a paid task (input-required state)
  const r1 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'cancel-create',
      method: 'message/send',
      params: { message: { messageId: 'msg-cancel', role: 'user', kind: 'message', parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }] } },
    }),
  });
  const d1 = await r1.json();
  const taskId = d1.result.id;

  const r2 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'cancel', method: 'tasks/cancel', params: { id: taskId } }),
  });
  const d2 = await r2.json();
  assert(d2.result.status.state === 'canceled', 'Task canceled');
});

await test('Invalid JSON-RPC returns error', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'bad', method: 'message/send', params: {} }),
  });
  const d = await r.json();
  assert(d.error, 'Has error');
  assert(d.error.code === -32600, 'Invalid request error');
});

await test('Unknown method returns error', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'unknown', method: 'nonexistent/method', params: {} }),
  });
  const d = await r.json();
  assert(d.error.code === -32601, 'Method not found');
});

await test('GET /api/payments reflects activity', async () => {
  const r = await fetch(`${BASE}/api/payments`);
  const d = await r.json();
  assert(d.total > 0, `Total payments: ${d.total}`);
  assert(d.payments.some(p => p.type === 'payment-required'), 'Has payment-required entry');
});

await test('SKALE Europa: correct chain ID in agent card', async () => {
  const r = await fetch(`${BASE}/.well-known/agent-card.json`);
  const d = await r.json();
  const payExt = d.extensions.find(e => e.uri === 'urn:x402:payment:v2');
  const skaleNet = payExt.config.networks.find(n => n.name === 'SKALE Europa');
  assert(skaleNet, 'SKALE Europa network present');
  assert(skaleNet.network === 'eip155:2046399126', `SKALE Europa CAIP-2: ${skaleNet.network}`);
  assert(skaleNet.gasless === true, 'SKALE is gasless');
  assert(skaleNet.tokenAddress === '0x5F795bb52dAC3085f578f4877D450e2929D2F13d', `SKALE USDC: ${skaleNet.tokenAddress}`);
});

await test('SKALE Europa: correct USDC in payment requirements', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-skale-pay',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-skale', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
        },
      },
    }),
  });
  const d = await r.json();
  const accepts = d.result.status.message.parts.find(p => p.kind === 'data')?.data['x402.accepts'];
  const skaleAccept = accepts.find(a => a.network === 'eip155:2046399126');
  assert(skaleAccept, 'SKALE Europa in payment accepts');
  assert(skaleAccept.asset === '0x5F795bb52dAC3085f578f4877D450e2929D2F13d', `SKALE USDC asset: ${skaleAccept.asset}`);
  assert(skaleAccept.gasless === true, 'Marked gasless');
  // Base should use different USDC address
  const baseAccept = accepts.find(a => a.network === 'eip155:8453');
  assert(baseAccept.asset !== skaleAccept.asset, 'Base and SKALE use different USDC addresses');
});

await test('SKALE Europa: x402 catalog shows correct chain details', async () => {
  const r = await fetch(`${BASE}/x402`);
  const d = await r.json();
  const skaleNet = d.protocols.x402.networks.find(n => n.name === 'SKALE Europa');
  assert(skaleNet, 'SKALE Europa in catalog');
  assert(skaleNet.chainId === 2046399126, `Chain ID: ${skaleNet.chainId}`);
  assert(skaleNet.gasless === true, 'Gasless flag');
  assert(skaleNet.network === 'eip155:2046399126', 'CAIP-2 format');
});

// === REST x402 HTTP endpoint tests ===

await test('REST: GET /x402/screenshot returns 402', async () => {
  const r = await fetch(`${BASE}/x402/screenshot`);
  assert(r.status === 402, `Status: ${r.status}`);
  const d = await r.json();
  assert(d.version === '2.0', 'V2 payment requirements');
  assert(Array.isArray(d.accepts), 'Has accepts array');
  assert(d.accepts[0].price === '$0.01', `Price: ${d.accepts[0].price}`);
});

await test('REST: POST /x402/screenshot without Payment-Signature returns 402', async () => {
  const r = await fetch(`${BASE}/x402/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  });
  assert(r.status === 402, `Status: ${r.status}`);
});

await test('REST: POST /x402/screenshot with Payment-Signature returns image', async () => {
  const r = await fetch(`${BASE}/x402/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Payment-Signature': '0xdemo_payment_sig' },
    body: JSON.stringify({ url: 'https://example.com', payer: '0xRestTestWallet' }),
  });
  const state = r.status;
  assert(state === 200 || state === 500, `Status: ${state}`);
  if (state === 200) {
    const ct = r.headers.get('content-type');
    assert(ct.includes('image/png'), `Content-Type: ${ct}`);
    const payResp = r.headers.get('x-payment-response');
    assert(payResp, 'Has X-Payment-Response header');
    const parsed = JSON.parse(payResp);
    assert(parsed.settled === true, 'Payment settled');
    assert(parsed.txHash, 'Has txHash');
    console.log(`    (REST screenshot returned successfully)`);
  }
});

await test('REST: POST /x402/screenshot without url returns 400', async () => {
  const r = await fetch(`${BASE}/x402/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Payment-Signature': '0xdemo' },
    body: JSON.stringify({}),
  });
  assert(r.status === 400, `Status: ${r.status}`);
});

await test('REST: GET /x402/pdf returns 402', async () => {
  const r = await fetch(`${BASE}/x402/pdf`);
  assert(r.status === 402, `Status: ${r.status}`);
  const d = await r.json();
  assert(d.accepts[0].price === '$0.005', `Price: ${d.accepts[0].price}`);
});

await test('REST: POST /x402/html returns HTML (free)', async () => {
  const r = await fetch(`${BASE}/x402/html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: '# REST Test\n\nHello from REST x402 endpoint' }),
  });
  assert(r.status === 200, `Status: ${r.status}`);
  const html = await r.text();
  assert(html.includes('REST Test'), 'HTML contains heading');
});

await test('REST: x402 catalog includes REST endpoints', async () => {
  const r = await fetch(`${BASE}/x402`);
  const d = await r.json();
  assert(d.rest, 'Has REST section');
  assert(d.rest.endpoints.length >= 5, `REST endpoints: ${d.rest.endpoints.length}`);
  assert(d.rest.endpoints.some(e => e.path === '/x402/screenshot'), 'Has screenshot REST');
  assert(d.rest.endpoints.some(e => e.path === '/x402/html'), 'Has HTML REST');
});

// === Gemini / Google AI Studio tests ===

await test('Gemini: GET /gemini returns service info', async () => {
  const r = await fetch(`${BASE}/gemini`);
  const d = await r.json();
  assert(d.service === 'Gemini AI Analysis', `Service: ${d.service}`);
  assert(d.model === 'gemini-2.0-flash', `Model: ${d.model}`);
  assert(d.provider === 'Google AI Studio', `Provider: ${d.provider}`);
  assert(d.endpoints.free.path === '/gemini', 'Free endpoint');
  assert(d.endpoints.paid.path === '/x402/ai-analysis', 'Paid endpoint');
  assert(d.endpoints.paid.price === '$0.01 USDC', 'Paid price');
});

await test('Gemini: GET /x402/ai-analysis returns 402', async () => {
  const r = await fetch(`${BASE}/x402/ai-analysis`);
  assert(r.status === 402, `Status: ${r.status}`);
  const d = await r.json();
  assert(d.version === '2.0', 'V2 payment requirements');
  assert(d.accepts[0].price === '$0.01', `Price: ${d.accepts[0].price}`);
  assert(d.description.includes('Gemini'), 'Mentions Gemini');
});

await test('Gemini: POST /gemini with content returns analysis', async () => {
  const r = await fetch(`${BASE}/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Test content for analysis' }),
  });
  const d = await r.json();
  assert(d.model === 'gemini-2.0-flash', `Model: ${d.model}`);
  assert(d.provider === 'Google AI Studio (Gemini)', `Provider: ${d.provider}`);
  assert(d.analysis, 'Has analysis text');
});

await test('Gemini: POST /gemini rejects >500 chars', async () => {
  const r = await fetch(`${BASE}/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(501) }),
  });
  assert(r.status === 400, `Status: ${r.status}`);
  const d = await r.json();
  assert(d.error.includes('500 chars'), `Error: ${d.error}`);
});

await test('Gemini: agent card has urn:google:gemini extension', async () => {
  const r = await fetch(`${BASE}/.well-known/agent-card.json`);
  const d = await r.json();
  const geminiExt = d.extensions.find(e => e.uri === 'urn:google:gemini');
  assert(geminiExt, 'Has Gemini extension');
  assert(geminiExt.config.model === 'gemini-2.0-flash', `Model: ${geminiExt.config.model}`);
  assert(geminiExt.config.provider === 'Google AI Studio', 'Provider');
  const aiSkill = d.skills.find(s => s.id === 'ai-analysis');
  assert(aiSkill, 'Has ai-analysis skill');
  assert(aiSkill.tags.includes('gemini'), 'Tagged with gemini');
});

await test('Gemini: A2A message/send with "analyze" triggers ai-analysis', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-gemini-a2a',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-gemini', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Analyze: The future of AI agent commerce' }],
        },
      },
    }),
  });
  const d = await r.json();
  assert(d.result, 'Has result');
  assert(d.result.status.state === 'input-required', `State: ${d.result.status.state}`);
  const dataPart = d.result.status.message.parts.find(p => p.kind === 'data');
  assert(dataPart.data['x402.payment.required'] === true, 'Payment required');
  assert(dataPart.data['x402.accepts'][0].price === '$0.01', 'AI analysis price');
});

await test('Gemini: bazaar includes ai-analysis with poweredBy', async () => {
  const r = await fetch(`${BASE}/x402/bazaar`);
  const d = await r.json();
  const aiService = d.services.find(s => s.id === 'ai-analysis');
  assert(aiService, 'Has ai-analysis service');
  assert(aiService.poweredBy.includes('Gemini'), `Powered by: ${aiService.poweredBy}`);
  assert(aiService.price.amount === '0.01', `Price: ${aiService.price.amount}`);
});

// === Google A2A x402 Extension Compatibility Tests ===
// These tests verify compatibility with https://github.com/google-agentic-commerce/a2a-x402

await test('Google x402 Ext: agent card declares extension URI', async () => {
  const r = await fetch(`${BASE}/.well-known/agent-card.json`);
  const d = await r.json();
  const googleExt = d.extensions.find(e => e.uri.includes('google-agentic-commerce/a2a-x402'));
  assert(googleExt, 'Has Google A2A x402 Extension declared');
  assert(googleExt.description.includes('x402'), 'Has x402 description');
});

await test('Google x402 Ext: payment-required includes x402.payment.status metadata', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-google-ext-payreq',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-google-ext', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
        },
      },
    }),
  });
  const d = await r.json();
  assert(d.result.status.state === 'input-required', 'State is input-required');
  const msg = d.result.status.message;
  // Google spec: message.metadata must have x402.payment.status
  assert(msg.metadata, 'Message has metadata field');
  assert(msg.metadata['x402.payment.status'] === 'payment-required', `Payment status: ${msg.metadata['x402.payment.status']}`);
  // Google spec: x402.payment.required must be x402PaymentRequiredResponse with x402Version + accepts
  const payReq = msg.metadata['x402.payment.required'];
  assert(payReq, 'Has x402.payment.required in metadata');
  assert(payReq.x402Version === 1, `x402Version: ${payReq.x402Version}`);
  assert(Array.isArray(payReq.accepts), 'accepts is array');
  assert(payReq.accepts.length >= 1, 'Has at least one payment option');
  assert(payReq.accepts[0].scheme === 'exact', `Scheme: ${payReq.accepts[0].scheme}`);
  assert(payReq.accepts[0].network, 'Has network field');
  assert(payReq.accepts[0].payTo, 'Has payTo field');
  assert(payReq.accepts[0].asset, 'Has asset field');
});

await test('Google x402 Ext: payment-completed includes x402.payment.receipts', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-google-ext-paid',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-google-ext-paid', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
          metadata: {
            'x402.payment.status': 'payment-submitted',
            'x402.payment.payload': { scheme: 'exact', network: 'eip155:8453', signature: '0xgoogletest', from: '0xGoogleTestWallet' },
          },
        },
      },
    }),
  });
  const d = await r.json();
  const state = d.result.status.state;
  assert(state === 'completed' || state === 'failed', `State: ${state}`);
  if (state === 'completed') {
    // Google spec: metadata must have x402.payment.status = payment-completed
    const msg = d.result.status.message;
    assert(msg.metadata['x402.payment.status'] === 'payment-completed', `Status: ${msg.metadata['x402.payment.status']}`);
    // Google spec: x402.payment.receipts must be array of SettleResponse
    const receipts = msg.metadata['x402.payment.receipts'];
    assert(Array.isArray(receipts), 'Receipts is array');
    assert(receipts.length >= 1, 'Has at least one receipt');
    assert(receipts[0].success === true, 'Receipt success');
    assert(receipts[0].transaction, 'Receipt has transaction hash');
    assert(receipts[0].network, 'Receipt has network');
    // Task metadata should also have receipts
    assert(d.result.metadata['x402.payment.receipts'], 'Task metadata has receipts');
    assert(d.result.metadata['x402.payment.status'] === 'payment-completed', 'Task metadata has payment-completed status');
  }
});

await test('Google x402 Ext: correlated payment via taskId', async () => {
  // Step 1: Create a paid task (input-required)
  const r1 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-google-ext-corr1',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-google-ext-corr', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: '# Test PDF\n\nConvert to PDF: This is a test' }],
        },
      },
    }),
  });
  const d1 = await r1.json();
  const taskId = d1.result.id;
  assert(d1.result.status.state === 'input-required', `Step 1 state: ${d1.result.status.state}`);

  // Step 2: Submit payment linked to original taskId
  const r2 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-google-ext-corr2',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-google-ext-corr2', role: 'user', kind: 'message',
          taskId: taskId, // <-- Google spec: correlate payment to original task
          parts: [{ kind: 'text', text: 'Here is the payment authorization.' }],
          metadata: {
            'x402.payment.status': 'payment-submitted',
            'x402.payment.payload': { scheme: 'exact', network: 'eip155:8453', signature: '0xcorrelatedpayment', from: '0xCorrelatedWallet' },
          },
        },
      },
    }),
  });
  const d2 = await r2.json();
  const state2 = d2.result.status.state;
  assert(state2 === 'completed' || state2 === 'failed', `Step 2 state: ${state2}`);
  // Task ID should be the same as the original
  assert(d2.result.id === taskId, `Task ID preserved: ${d2.result.id} === ${taskId}`);
});

await test('Google x402 Ext: /a2a-x402-compat endpoint', async () => {
  const r = await fetch(`${BASE}/a2a-x402-compat`);
  const d = await r.json();
  assert(d.compatible === true, 'Compatible flag');
  assert(d.extensionUri.includes('google-agentic-commerce'), 'Extension URI');
  assert(d.specVersion === 'v0.2', `Spec version: ${d.specVersion}`);
  assert(d.features.standaloneFlow === true, 'Standalone flow supported');
  assert(d.features.paymentStatuses.includes('payment-required'), 'Has payment-required status');
  assert(d.features.paymentStatuses.includes('payment-completed'), 'Has payment-completed status');
  assert(d.features.metadataKeys['x402.payment.status'], 'Documents status key');
  assert(d.features.metadataKeys['x402.payment.required'], 'Documents required key');
  assert(d.features.metadataKeys['x402.payment.receipts'], 'Documents receipts key');
  assert(d.networks.length >= 2, `Networks: ${d.networks.length}`);
});

await test('Google x402 Ext: X-A2A-Extensions header echo', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-A2A-Extensions': 'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-ext-header',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-ext-header', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: '# Hello world' }],
        },
      },
    }),
  });
  const extHeader = r.headers.get('x-a2a-extensions');
  assert(extHeader, 'Has X-A2A-Extensions response header');
  assert(extHeader.includes('google-agentic-commerce'), `Header: ${extHeader}`);
});

await test('Google x402 Ext: v0.1 header echo for backward compat', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-A2A-Extensions': 'https://github.com/google-a2a/a2a-x402/v0.1',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-ext-header-v01',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-ext-header-v01', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: '# Hello world' }],
        },
      },
    }),
  });
  const extHeader = r.headers.get('x-a2a-extensions');
  assert(extHeader, 'Has X-A2A-Extensions response header');
  assert(extHeader.includes('google-a2a'), `Header echoes v0.1: ${extHeader}`);
});

await test('Google x402 Ext: agent card declares both v0.1 and v0.2 URIs', async () => {
  const r = await fetch(`${BASE}/.well-known/agent-card.json`);
  const d = await r.json();
  const v02 = d.extensions.find(e => e.uri.includes('google-agentic-commerce/a2a-x402/blob/main/spec/v0.2'));
  const v01 = d.extensions.find(e => e.uri.includes('google-a2a/a2a-x402/v0.1'));
  assert(v02, 'Has v0.2 extension URI');
  assert(v01, 'Has v0.1 extension URI (backward compat)');
});

await test('Google x402 Ext: payment-rejected cancels task', async () => {
  // Step 1: Create a paid task (input-required)
  const r1 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-reject-1',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-reject', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
        },
      },
    }),
  });
  const d1 = await r1.json();
  const taskId = d1.result.id;
  assert(d1.result.status.state === 'input-required', 'Step 1: input-required');

  // Step 2: Reject the payment
  const r2 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-reject-2',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-reject-2', role: 'user', kind: 'message',
          taskId: taskId,
          parts: [{ kind: 'text', text: 'I reject the payment requirements.' }],
          metadata: {
            'x402.payment.status': 'payment-rejected',
          },
        },
      },
    }),
  });
  const d2 = await r2.json();
  assert(d2.result.status.state === 'canceled', `Rejected task state: ${d2.result.status.state}`);
  assert(d2.result.status.message.metadata['x402.payment.status'] === 'payment-rejected', 'Status is payment-rejected');
});

await test('Google x402 Ext: PaymentRequirements has maxAmountRequired and maxTimeoutSeconds', async () => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'test-fields',
      method: 'message/send',
      params: {
        message: {
          messageId: 'msg-fields', role: 'user', kind: 'message',
          parts: [{ kind: 'text', text: 'Take a screenshot of https://example.com' }],
        },
      },
    }),
  });
  const d = await r.json();
  const payReq = d.result.status.message.metadata['x402.payment.required'];
  const baseAccept = payReq.accepts.find(a => a.network === 'eip155:8453');
  const skaleAccept = payReq.accepts.find(a => a.network === 'eip155:2046399126');
  assert(baseAccept.maxAmountRequired, `Base maxAmountRequired: ${baseAccept.maxAmountRequired}`);
  assert(baseAccept.maxTimeoutSeconds === 600, `Base maxTimeoutSeconds: ${baseAccept.maxTimeoutSeconds}`);
  assert(skaleAccept.maxAmountRequired, `SKALE maxAmountRequired: ${skaleAccept.maxAmountRequired}`);
  assert(skaleAccept.maxTimeoutSeconds === 600, `SKALE maxTimeoutSeconds: ${skaleAccept.maxTimeoutSeconds}`);
});

await test('Google x402 Ext: /a2a-x402-test endpoint passes all checks', async () => {
  const r = await fetch(`${BASE}/a2a-x402-test`);
  const d = await r.json();
  assert(d.results, 'Has results array');
  const allPassed = d.results.every(r => r.pass);
  assert(allPassed, `All checks passed: ${d.specCompliance} — ${d.results.filter(r => !r.pass).map(r => r.test).join(', ')}`);
  assert(d.specVersion === 'v0.2', `Spec version: ${d.specVersion}`);
});

await test('Google x402 Ext: /a2a-x402-compat shows v0.1 and v0.2', async () => {
  const r = await fetch(`${BASE}/a2a-x402-compat`);
  const d = await r.json();
  assert(d.compatible === true, 'Compatible');
  assert(d.specVersions.includes('v0.1'), 'Supports v0.1');
  assert(d.specVersions.includes('v0.2'), 'Supports v0.2');
  assert(d.features.paymentStatuses.includes('payment-rejected'), 'Has payment-rejected status');
  assert(d.features.paymentStatuses.includes('payment-verified'), 'Has payment-verified status');
  assert(d.stateTransitions, 'Has state transitions');
  assert(d.dataStructures, 'Has data structures documentation');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
