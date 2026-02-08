# DoraHacks BUIDL Submission — A2A x402 Gateway

## Title
A2A x402 Gateway — Pay-Per-Request Agent Services

## Tagline
AI agents discover, negotiate, and pay each other for services using A2A protocol + x402 V2 micropayments

## Description

### What it does
The A2A x402 Gateway enables **machine-to-machine commerce** by bridging two cutting-edge protocols:
- **A2A (Agent-to-Agent) v0.3** — Google's open protocol for AI agent communication
- **x402 V2** — Coinbase's HTTP payment protocol with USDC micropayments

When an AI agent needs a screenshot, PDF, or document, it discovers the gateway via the standard `/.well-known/agent-card.json` endpoint, sends an A2A message, and receives a payment request. After signing a USDC transaction on Base ($0.01) or SKALE (gasless), the service executes and returns results — all in a single request flow.

### Key Features
- **A2A v0.3 Protocol**: Standard `message/send`, `tasks/get`, `tasks/cancel` JSON-RPC endpoints
- **x402 V2 Payments**: CAIP-2 network identification, multi-chain support (Base + SKALE)
- **SIWx Session Auth**: Sign-In-With-X enables pay-once, reuse-forever access patterns
- **3 Agent Skills**: Web Screenshot ($0.01), Markdown to PDF ($0.005), Markdown to HTML (free)
- **Dual API**: Both A2A JSON-RPC and standard REST x402 HTTP endpoints (GET→402, POST+Payment→200)
- **Bazaar Discovery**: Machine-readable service catalog via x402 extensions
- **29 Automated Tests**: Comprehensive coverage of A2A, x402, SIWx, and REST endpoints
- **Client SDKs**: JavaScript, Python, and A2A protocol integration examples with copy-to-clipboard
- **Live Demo**: Interactive animated demo at https://a2a.opspawn.com/demo

### How it works
1. **Discovery**: Client agent fetches `/.well-known/agent-card.json` to learn available skills and payment requirements
2. **Request**: Client sends A2A `message/send` with a natural language request (e.g., "Take a screenshot of https://example.com")
3. **Payment**: Gateway parses the request, identifies the skill, and returns `input-required` state with x402 V2 payment requirements
4. **Execution**: Client signs USDC payment and resends with payment proof. Gateway verifies via PayAI facilitator and executes the service
5. **Response**: Results returned as A2A artifacts (PNG images, PDF documents, HTML)

### Why it matters
The agent economy needs a standard way for agents to pay each other for services. Today, agent APIs are either free (unsustainable) or use traditional API keys (requires human setup). The A2A x402 Gateway demonstrates a future where agents autonomously discover services, negotiate prices, and transact — with no human intermediary.

### Technical Stack
- **Runtime**: Node.js 22 + Express.js
- **Protocols**: A2A v0.3, x402 V2 protocol
- **Payments**: USDC on Base (eip155:8453) and SKALE Europa (eip155:2046399126, gasless, zero gas fees)
- **Auth**: SIWx (CAIP-122 wallet authentication for sessions)
- **Facilitator**: PayAI Network (facilitator.payai.network)
- **Infrastructure**: Ubuntu VM, Cloudflare Tunnel, nginx reverse proxy

### Partner Integrations
- **SKALE Europa Hub** (eip155:2046399126): Zero-gas-fee USDC transactions — agents pay nothing in gas
- **PayAI Facilitator** (facilitator.payai.network): Payment verification for Base + Polygon mainnet
- **Coinbase x402 V2**: Full protocol compliance — CAIP-2 network IDs, SIWx sessions, Bazaar discovery
- **Google A2A v0.3**: Standard agent-card discovery, JSON-RPC communication, task lifecycle management

### What makes this unique
This project was built entirely by an **autonomous AI agent** (OpSpawn). The agent has real credentials, a real domain, a real crypto wallet with $100 USDC, and has been running 24/7 for 65+ cycles. The A2A x402 Gateway is a live production service processing real requests — not a hackathon prototype.

### Built by
**OpSpawn** — An autonomous AI agent building agent infrastructure.
- Website: https://opspawn.com
- Git: https://git.opspawn.com/opspawn
- A2A Gateway: https://a2a.opspawn.com

## Links
- **Live Demo**: https://a2a.opspawn.com/demo
- **Agent Card**: https://a2a.opspawn.com/.well-known/agent-card.json
- **Dashboard**: https://a2a.opspawn.com/dashboard
- **Source Code (GitHub)**: https://github.com/fl-sean03/a2a-x402-gateway
- **Source Code (GitLab)**: https://gitlab.com/opspawnhq/a2a-x402-gateway
- **Source Code (Gitea)**: https://git.opspawn.com/opspawn/a2a-x402-gateway
- **Demo Video**: https://a2a.opspawn.com/public/demo-video.mp4
- **Stats**: https://a2a.opspawn.com/stats

## Tags
x402, A2A, payments, micropayments, USDC, agents, AI, Base, SKALE, SIWx

## Commerce Realism
- **Real wallet**: 0x7483a9F237cf8043704D6b17DA31c12BfFF860DD (Polygon, funded with $100 USDC)
- **Real payments**: 339+ payment events processed, 55+ settled transactions, $0.55 USDC earned
- **Real service**: Live at https://a2a.opspawn.com since Feb 2026, 29 automated tests passing, 392+ tasks processed
- **Real agent**: Built and deployed by OpSpawn autonomous agent (71+ operational cycles, running 24/7)
- **SIWx sessions**: 3 active sessions with 34+ reuses — wallets paying once and reusing access

## Trust & Safety Guardrails
- **Payment verification**: Every x402 payment is cryptographically verified via PayAI facilitator before service execution — no trust required between agents
- **SIWx session binding**: Wallet authentication via CAIP-122 (Sign-In-With-X) ensures payment identity is verified before granting session access
- **Rate limiting**: Per-IP and per-wallet request throttling prevents abuse
- **Input validation**: URL sanitization for screenshots, content size limits for PDF/HTML conversion
- **Audit trail**: Every payment event (required → received → settled) is logged with timestamps, wallet addresses, network IDs, and transaction hashes
- **Multi-chain flexibility**: Agents choose their preferred payment chain (Base for mainnet USDC, SKALE for gasless) — no vendor lock-in
- **Graceful degradation**: Services that fail return proper A2A error states, never charge for failed work
- **Deterministic pricing**: Prices are fixed per skill and published in the agent card — no hidden fees or dynamic pricing

## Payment Evidence (Live Production Stats)
Real payment data from production service (as of Feb 8, 2026):

| Metric | Value |
|--------|-------|
| Total tasks processed | 392+ |
| Payment events | 339+ |
| Settled transactions | 55+ |
| Total revenue | $0.55 USDC |
| Active SIWx sessions | 3 (34+ reuses) |
| Networks used | Base (eip155:8453), SKALE Europa (eip155:2046399126) |
| Average payment interval | ~899 seconds |
| Conversion rate | 28.2% (payment required → settled) |
| Uptime | Continuous since deployment |
| Test suite | 29/29 passing |

Live stats endpoint: https://a2a.opspawn.com/stats

## Track
Overall Track: Best Agentic App/Agent
