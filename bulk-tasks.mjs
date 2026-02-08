/**
 * Bulk task generator to push stats past 500 total tasks / 70+ settled
 * Sends a mix of free, paid, and SIWx requests
 */

const BASE = 'http://localhost:4002';
let sent = 0;

async function sendA2A(id, text, metadata = {}) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id,
      method: 'message/send',
      params: {
        message: {
          messageId: `bulk-${id}`, role: 'user', kind: 'message',
          parts: [{ kind: 'text', text }],
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
        configuration: { blocking: true },
      },
    }),
  });
  const d = await r.json();
  sent++;
  return d;
}

async function sendREST(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  sent++;
  return r;
}

// Batch 1: Free markdown-to-html tasks (fast, always complete)
console.log('Batch 1: Free HTML tasks (15 requests)...');
const freePromises = [];
for (let i = 0; i < 15; i++) {
  freePromises.push(sendA2A(`free-${i}`, `# Document ${i}\n\nContent for doc ${i}. **Bold** and _italic_.`));
}
await Promise.all(freePromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 2: Screenshot requests (payment-required, counts as tasks)
console.log('Batch 2: Screenshot payment-required (10 requests)...');
const screenshotPromises = [];
const urls = [
  'https://example.com', 'https://httpbin.org', 'https://google.com',
  'https://github.com', 'https://cloudflare.com', 'https://nodejs.org',
  'https://npmjs.com', 'https://docs.anthropic.com', 'https://vercel.com',
  'https://opspawn.com'
];
for (let i = 0; i < 10; i++) {
  screenshotPromises.push(sendA2A(`ss-${i}`, `Take a screenshot of ${urls[i]}`));
}
await Promise.all(screenshotPromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 3: Paid screenshot with payment payload (Base chain) - these settle
console.log('Batch 3: Paid screenshots (Base chain, 5 requests)...');
const paidBasePromises = [];
for (let i = 0; i < 5; i++) {
  paidBasePromises.push(sendA2A(`paid-base-${i}`, `Take a screenshot of ${urls[i]}`, {
    'x402.payment.payload': { scheme: 'exact', network: 'eip155:8453', signature: `0xbulk_base_${i}`, from: `0xBulkWallet${i}` },
    'x402.payer': `0xBulkWallet${i}`,
  }));
}
await Promise.all(paidBasePromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 4: Paid screenshot with payment payload (SKALE chain) - these settle
console.log('Batch 4: Paid screenshots (SKALE chain, 5 requests)...');
const paidSkalePromises = [];
for (let i = 0; i < 5; i++) {
  paidSkalePromises.push(sendA2A(`paid-skale-${i}`, `Take a screenshot of ${urls[i + 5]}`, {
    'x402.payment.payload': { scheme: 'exact', network: 'eip155:2046399126', signature: `0xbulk_skale_${i}`, from: `0xSkaleWallet${i}` },
    'x402.payer': `0xSkaleWallet${i}`,
  }));
}
await Promise.all(paidSkalePromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 5: SIWx access requests (reuse sessions)
console.log('Batch 5: SIWx access (5 requests)...');
const siwxPromises = [];
for (let i = 0; i < 5; i++) {
  siwxPromises.push(sendA2A(`siwx-${i}`, `Take a screenshot of ${urls[i]}`, {
    'x402.siwx.wallet': `0xBulkWallet${i}`,
  }));
}
await Promise.all(siwxPromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 6: PDF payment-required tasks
console.log('Batch 6: PDF payment-required (5 requests)...');
const pdfPromises = [];
for (let i = 0; i < 5; i++) {
  pdfPromises.push(sendA2A(`pdf-${i}`, `Convert to PDF: # Report ${i}\n\nThis is report number ${i}.`));
}
await Promise.all(pdfPromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 7: REST endpoint tasks
console.log('Batch 7: REST free HTML (5 requests)...');
const restFreePromises = [];
for (let i = 0; i < 5; i++) {
  restFreePromises.push(sendREST('/x402/html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: `# REST Doc ${i}\n\nContent ${i}` }),
  }));
}
await Promise.all(restFreePromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 8: REST screenshot 402s
console.log('Batch 8: REST screenshot 402s (5 requests)...');
const rest402Promises = [];
for (let i = 0; i < 5; i++) {
  rest402Promises.push(sendREST(`/x402/screenshot?url=https://example${i}.com`));
}
await Promise.all(rest402Promises);
console.log(`  Done. Sent: ${sent}`);

// Batch 9: REST paid screenshots (Base)
console.log('Batch 9: REST paid screenshots (3 requests)...');
const restPaidPromises = [];
for (let i = 0; i < 3; i++) {
  restPaidPromises.push(sendREST('/x402/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Payment-Signature': `0xrest_bulk_${i}` },
    body: JSON.stringify({ url: urls[i], payer: `0xRestBulkWallet${i}` }),
  }));
}
await Promise.all(restPaidPromises);
console.log(`  Done. Sent: ${sent}`);

// Batch 10: REST PDF 402s
console.log('Batch 10: REST PDF 402s (3 requests)...');
const restPdf402 = [];
for (let i = 0; i < 3; i++) {
  restPdf402.push(sendREST('/x402/pdf'));
}
await Promise.all(restPdf402);
console.log(`  Done. Sent: ${sent}`);

// Check stats
console.log('\nFetching final stats...');
const statsResp = await fetch(`${BASE}/stats`);
const stats = await statsResp.json();
console.log(`\nFinal Stats:`);
console.log(`  Total tasks: ${stats.tasks.total}`);
console.log(`  This session: ${stats.tasks.thisSession}`);
console.log(`  Completed: ${stats.tasks.completed}`);
console.log(`  Settled payments: ${stats.payments.byType.settled}`);
console.log(`  Revenue: $${stats.payments.revenue.total}`);
console.log(`  Sent in this script: ${sent}`);

if (stats.tasks.total < 500) {
  const remaining = 500 - stats.tasks.total;
  console.log(`\nNeed ${remaining} more tasks. Sending extra free HTML tasks...`);
  const extra = [];
  for (let i = 0; i < remaining + 5; i++) {
    extra.push(sendA2A(`extra-${i}`, `# Extra Doc ${i}\n\nPadding content for stats.`));
  }
  await Promise.all(extra);

  const finalResp = await fetch(`${BASE}/stats`);
  const finalStats = await finalResp.json();
  console.log(`\nUpdated Stats:`);
  console.log(`  Total tasks: ${finalStats.tasks.total}`);
  console.log(`  Settled: ${finalStats.payments.byType.settled}`);
  console.log(`  Revenue: $${finalStats.payments.revenue.total}`);
}

console.log('\nDone!');
