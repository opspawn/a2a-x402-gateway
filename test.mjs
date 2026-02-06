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
  assert(d.name === 'OpSpawn Screenshot Agent');
  assert(d.version === '2.0.0', `Version: ${d.version}`);
  assert(d.skills.length === 3);
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
  assert(d.version === '2.0.0', `Version: ${d.version}`);
  assert(d.protocols.a2a.version === '0.3.0');
  assert(d.protocols.x402.version === '2.0', `x402 version: ${d.protocols.x402.version}`);
  assert(d.protocols.x402.networks.length >= 2, 'Has multiple networks');
  assert(d.protocols.x402.networks[0].network === 'eip155:8453', 'Base CAIP-2 ID');
  assert(d.protocols.x402.features.siwx, 'SIWx feature documented');
  assert(d.endpoints.length === 3);
  assert(d.endpoints[0].price === '$0.01');
  assert(d.endpoints[2].price === 'free');
});

await test('GET /api/info returns V2 agent info with stats', async () => {
  const r = await fetch(`${BASE}/api/info`);
  const d = await r.json();
  assert(d.agent.name === 'OpSpawn Screenshot Agent');
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

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
