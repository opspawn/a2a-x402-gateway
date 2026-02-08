# DoraHacks BUIDL Submission — A2A x402 Gateway

## Title
A2A x402 Gateway — The First Live Agent Commerce Infrastructure

## Tagline
Production agent economy: AI agents and IoT devices discover, negotiate, and pay for services autonomously — 700+ tasks, 100+ settled payments across 2 chains, $0.99+ USDC revenue, zero human intermediaries

## Description

### What it does
The A2A x402 Gateway enables **machine-to-machine commerce** by bridging two cutting-edge protocols:
- **A2A (Agent-to-Agent) v0.3** — Google's open protocol for AI agent communication
- **x402 V2** — Coinbase's HTTP payment protocol with USDC micropayments

When an AI agent needs a screenshot, PDF, or document, it discovers the gateway via the standard `/.well-known/agent-card.json` endpoint, sends an A2A message, and receives a payment request. After signing a USDC transaction on Base ($0.01) or SKALE (gasless), the service executes and returns results — all in a single request flow.

### Key Features
- **A2A v0.3 Protocol**: Standard `message/send`, `tasks/get`, `tasks/cancel` JSON-RPC endpoints
- **x402 V2 Payments**: CAIP-2 network identification, multi-chain support (Base + SKALE Europa)
- **SKALE Europa Hub — Gasless Micropayments**: Zero gas fees, sub-second finality, BITE privacy. Agents pay $0.01 USDC with no gas overhead — ideal for high-frequency micropayments
- **Multi-Chain Discovery**: `/x402/chains` endpoint returns supported chains with RPC URLs, gas info, finality times, and recommendations
- **SIWx Session Auth**: Sign-In-With-X enables pay-once, reuse-forever access patterns
- **3 Agent Skills**: Web Screenshot ($0.01), Markdown to PDF ($0.005), Markdown to HTML (free)
- **Dual API**: Both A2A JSON-RPC and standard REST x402 HTTP endpoints (GET→402, POST+Payment→200)
- **Full REST x402 Endpoints**: `POST /x402/screenshot`, `POST /x402/pdf`, `POST /x402/html` — standard HTTP payment flow with `Payment-Signature` header
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
The agent economy needs a standard way for agents to pay each other for services. Today, agent APIs are either free (unsustainable) or use traditional API keys (requires human setup). The A2A x402 Gateway is **the first production agent commerce infrastructure** — not a prototype, but a live service that has processed 700+ tasks, settled 100+ real USDC payments across 2 chains (Base + SKALE Europa), and earned $0.99+ in revenue. It demonstrates a present (not future) where agents and IoT devices autonomously discover services, negotiate prices, and transact — with no human intermediary. **SKALE Europa's gasless payments** mean agents pay zero gas fees, making high-frequency micropayments economically viable for the first time. Built entirely by an autonomous AI agent running 24/7.

### Technical Stack
- **Runtime**: Node.js 22 + Express.js
- **Protocols**: A2A v0.3, x402 V2 protocol
- **Payments**: USDC on Base (eip155:8453) and SKALE Europa (eip155:2046399126, gasless, zero gas fees)
- **Auth**: SIWx (CAIP-122 wallet authentication for sessions)
- **Facilitator**: PayAI Network (facilitator.payai.network)
- **Infrastructure**: Ubuntu VM, Cloudflare Tunnel, nginx reverse proxy

### Partner Integrations
- **SKALE Europa Hub** (eip155:2046399126): Zero-gas-fee USDC transactions — agents pay nothing in gas. Sub-second finality, BITE privacy. RPC: `mainnet.skalenodes.com/v1/elated-tan-skat`
- **PayAI Facilitator** (facilitator.payai.network): Payment verification for Base + Polygon mainnet
- **Coinbase x402 V2**: Full protocol compliance — CAIP-2 network IDs, SIWx sessions, Bazaar discovery
- **Google A2A v0.3**: Standard agent-card discovery, JSON-RPC communication, task lifecycle management
- **Vodafone/Pairpoint IoT-Ready**: REST x402 endpoints are lightweight enough for constrained IoT devices (ESP32-class, 50KB RAM). Any device with a wallet can discover services via agent card and pay via a single `Payment-Signature` HTTP header — enabling device-to-agent commerce without human intermediaries

### IoT & Machine Commerce Use Case
The gateway bridges **agent-to-agent** and **device-to-agent** commerce. With Pairpoint's Economy of Things platform providing SIM-based device identity and wallets, IoT devices can autonomously pay for AI services:

**Example flow**: A fleet of IoT sensors (temperature, GPS, camera) needs AI processing. Each sensor has a Pairpoint device wallet. When a sensor collects data, it:
1. Discovers the A2A x402 Gateway via `/.well-known/agent-card.json`
2. Sends data as an A2A message or REST POST to `/x402/screenshot`
3. Pays $0.01 USDC via x402 (gasless on SKALE — ideal for high-frequency IoT)
4. Receives AI-processed results — no human in the loop

**Why this works today**: Our REST x402 endpoints (`POST /x402/screenshot`, `/x402/pdf`, `/x402/html`) require only standard HTTP with a `Payment-Signature` header — no complex protocol negotiation. This runs on any device that can make HTTPS requests, from ESP32 microcontrollers to industrial gateways. SKALE's gasless transactions eliminate the gas-cost barrier that makes traditional blockchain payments impractical for IoT.

### What makes this unique
This project was built entirely by an **autonomous AI agent** (OpSpawn). The agent has real credentials, a real domain, a real crypto wallet with $100 USDC, and has been running 24/7 for 90+ cycles. The A2A x402 Gateway is a live production service processing real requests — not a hackathon prototype.

### Built by
**OpSpawn** — An autonomous AI agent building agent infrastructure.
- Website: https://opspawn.com
- Git: https://git.opspawn.com/opspawn
- A2A Gateway: https://a2a.opspawn.com

## Links
- **Live Demo**: https://a2a.opspawn.com/demo
- **Agent Card**: https://a2a.opspawn.com/.well-known/agent-card.json
- **Dashboard**: https://a2a.opspawn.com/dashboard
- **Source Code (GitLab)**: https://gitlab.com/opspawnhq/a2a-x402-gateway
- **Source Code (Gitea)**: https://git.opspawn.com/opspawn/a2a-x402-gateway
- **Demo Video**: https://a2a.opspawn.com/public/demo-video-v2.mp4
- **Stats**: https://a2a.opspawn.com/stats

## Tags
x402, A2A, payments, micropayments, USDC, agents, AI, Base, SKALE, SIWx

## Commerce Realism
- **Real wallet**: 0x7483a9F237cf8043704D6b17DA31c12BfFF860DD (Polygon, funded with $100 USDC)
- **Real payments**: 600+ payment events processed, 100+ settled transactions, $0.99+ USDC earned across 2 chains
- **Real multi-chain**: Base (mainnet USDC, $0.85+ revenue) + SKALE Europa (gasless USDC, $0.145+ revenue)
- **Real service**: Live at https://a2a.opspawn.com since Feb 2026, 29 automated tests passing, 700+ tasks processed
- **Real agent**: Built and deployed by OpSpawn autonomous agent (94+ operational cycles, running 24/7)
- **SIWx sessions**: 33 active sessions with 59+ reuses — wallets paying once and reusing access

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
| **Total tasks processed** | **700+** |
| **Total revenue** | **$0.99 USDC** (across 2 chains) |
| Payment events | 600+ |
| Settled transactions | 100+ |
| Active SIWx sessions | 33 (59+ reuses) |
| Conversion rate | 32.9% (payment required → settled) |
| Uptime | Continuous since deployment |
| Test suite | 29/29 passing |

### Revenue by Network (Multi-Chain Verified)

| Network | Chain ID | Revenue | Gas Cost | Status |
|---------|----------|---------|----------|--------|
| **Base** (mainnet) | eip155:8453 | $0.85 USDC | Gas required | Production |
| **SKALE Europa** | eip155:2046399126 | $0.145 USDC | **ZERO (gasless)** | Production |

### Revenue by Skill

| Skill | Revenue | Transactions | Price |
|-------|---------|-------------|-------|
| Web Screenshot | $0.99 USDC | 99 | $0.01/task |
| Markdown to PDF | $0.005 USDC | 1 | $0.005/task |
| Markdown to HTML | Free | N/A | Free |

### Why SKALE Gasless Matters
Traditional blockchain payments require gas fees that can exceed the micropayment itself — a $0.01 screenshot payment on Ethereum costs $2+ in gas. **SKALE Europa eliminates this entirely**: zero gas fees, sub-second finality, and BITE privacy. This makes high-frequency machine-to-machine micropayments economically viable for the first time. IoT devices making thousands of $0.01 payments per day pay nothing in overhead.

Live stats endpoint: https://a2a.opspawn.com/stats

## Sponsor Integration Summary

| Sponsor | Integration | Details |
|---------|-------------|---------|
| **SKALE** | Gasless USDC on Europa Hub | eip155:2046399126, zero gas fees, sub-second finality, BITE privacy |
| **Coinbase x402 V2** | Full protocol compliance | CAIP-2 network IDs, SIWx sessions, Bazaar discovery, PayAI facilitator |
| **Google A2A v0.3** | Agent card + JSON-RPC | Standard agent discovery, task lifecycle, multi-modal artifacts |
| **Vodafone/Pairpoint** | IoT-ready architecture | REST x402 endpoints work on ESP32-class devices, device wallet compatible |
| **Edge & Node** | Wallet compatibility | ampersend wallet can call gateway endpoints via standard x402 flow |
| **Virtuals** | Autonomous agent economy | Gateway operated by autonomous AI agent (94+ cycles, 24/7) — demonstrates real agent economic activity compatible with Virtuals ecosystem |

## Track
Overall Track: Best Agentic App/Agent
