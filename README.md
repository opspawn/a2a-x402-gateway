# A2A x402 Gateway

**Pay-per-request AI agent services via A2A protocol + x402 micropayments**

An A2A-compliant agent server that exposes screenshot, PDF, and document generation services with x402 cryptocurrency micropayments on Base network.

Built by [OpSpawn](https://opspawn.com) for the [SF Agentic Commerce x402 Hackathon](https://dorahacks.io/hackathon/x402).

## How It Works

```
Agent Client → A2A Gateway → 402: Pay USDC → Service Delivery
```

1. **Agent sends A2A message** (JSON-RPC over HTTP)
2. **Gateway returns payment requirements** (x402 payment details for paid skills)
3. **Agent signs USDC transfer** on Base network
4. **Gateway delivers result** (screenshot, PDF, or HTML)

## Agent Skills

| Skill | Price | Description |
|-------|-------|-------------|
| Web Screenshot | $0.01 USDC | Capture any webpage as PNG |
| Markdown to PDF | $0.005 USDC | Convert markdown to styled PDF |
| Markdown to HTML | Free | Convert markdown to styled HTML |

## Quick Start

```bash
npm install
npm start
```

Server starts on `http://localhost:4002`

### Key Endpoints

- `GET /.well-known/agent-card.json` — A2A agent discovery
- `POST /` — A2A JSON-RPC endpoint (message/send, tasks/get, tasks/cancel)
- `GET /x402` — x402 service catalog
- `GET /dashboard` — Web dashboard
- `GET /api/info` — Agent info + payment details
- `GET /api/payments` — Payment event log

## Protocol Details

### A2A Protocol (v0.3)

This server implements the [Agent-to-Agent Protocol](https://a2a-protocol.org/) specification:

- **AgentCard** at `/.well-known/agent-card.json` for agent discovery
- **JSON-RPC 2.0** message format
- **Task lifecycle**: submitted → working → completed/failed/input-required
- **Skills** with input/output modes and pricing metadata

### x402 Payment Protocol

Payment requirements are returned via A2A task metadata:

```json
{
  "x402.payment.required": true,
  "x402.accepts": [{
    "scheme": "exact",
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x7483a9F237cf8043704D6b17DA31c12BfFF860DD",
    "maxAmountRequired": "10000",
    "resource": "/screenshot",
    "description": "Screenshot - $0.01 USDC"
  }]
}
```

To pay, resend the message with payment proof in metadata:

```json
{
  "metadata": {
    "x402.payment.payload": {
      "scheme": "exact",
      "network": "base",
      "signature": "0x..."
    }
  }
}
```

## Example: A2A Client

### Free Skill (Markdown to HTML)

```javascript
const response = await fetch('http://localhost:4002', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'message/send',
    params: {
      message: {
        messageId: 'msg-1',
        role: 'user',
        kind: 'message',
        parts: [{ kind: 'text', text: '# Hello World\n\nConverted by A2A agent.' }],
      },
      configuration: { blocking: true },
    },
  }),
});

const { result } = await response.json();
// result.status.state === 'completed'
// result.status.message.parts[1].data.html contains the HTML
```

### Paid Skill (Screenshot)

```javascript
// Step 1: Send request (returns payment-required)
const r1 = await fetch('http://localhost:4002', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: '2', method: 'message/send',
    params: {
      message: {
        messageId: 'msg-2', role: 'user', kind: 'message',
        parts: [{ kind: 'text', text: 'Screenshot https://example.com' }],
      },
      configuration: { blocking: true },
    },
  }),
});

const { result: task } = await r1.json();
// task.status.state === 'input-required'
// task.status.message includes x402 payment requirements

// Step 2: Sign payment with ethers.js and resend with payment proof
// (See a2a-x402 npm package for client-side payment signing)
```

## Architecture

```
┌─────────────┐     A2A JSON-RPC     ┌──────────────┐     HTTP     ┌──────────┐
│ Agent Client │ ──────────────────── │  A2A Gateway  │ ─────────── │ SnapAPI  │
│  (any LLM)  │                      │  (port 4002)  │             │ (port 3001)│
└─────────────┘                      └──────────────┘             └──────────┘
                                           │
                                     x402 Payment
                                           │
                                    ┌──────────────┐
                                    │ Base Network  │
                                    │  (USDC)       │
                                    └──────────────┘
```

## Tech Stack

- **Runtime**: Node.js 22
- **Protocol**: A2A v0.3 (JSON-RPC 2.0 over HTTP)
- **Payments**: x402 protocol on Base (USDC)
- **Backend**: Express 5
- **Facilitator**: PayAI (facilitator.payai.network)
- **Services**: SnapAPI (Puppeteer + Chrome)

## Tests

```bash
npm start &
npm test
```

14 tests covering:
- Health check and agent card discovery
- x402 service catalog
- Free skill execution (markdown → HTML)
- Paid skill payment requirements (screenshot, PDF)
- Payment submission and service delivery
- Task lifecycle (get, cancel)
- Error handling (invalid requests, unknown methods)

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 4002 | Server port |
| `SNAPAPI_URL` | http://localhost:3001 | Backend SnapAPI URL |
| `SNAPAPI_API_KEY` | demo-key-001 | SnapAPI authentication key |

## License

MIT
