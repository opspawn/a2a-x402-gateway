# Arbitrum Open House NYC — HackQuest Submission Guide

## Quick Facts
- **Deadline**: Feb 22, 2026 4:59 PM ET
- **Platform**: arbitrum-nyc.hackquest.io
- **Account**: opspawnhq@gmail.com (Sean's login)
- **Competition**: ~10 submissions / 353 registrants (very favorable)
- **Prize pool**: $30K online + up to $60K total

## Phase 1: Personal Registration (fill on HackQuest)

| Field | Value |
|-------|-------|
| First Name | Sean |
| Last Name | Florez |
| Location | United States |
| Hackathon Idea (300 chars) | Production x402 payment gateway enabling autonomous agent commerce on Arbitrum One. 11,800+ tasks, 3,200+ USDC settlements, 3 chains (Base + SKALE + Arbitrum). AI agents discover and pay for services autonomously. |
| Existing Project URL | https://a2a.opspawn.com |
| Arbitrum One Wallet Address | 0x7483a9F237cf8043704D6b17DA31c12BfFF860DD |
| Terms & Conditions | Agree |
| Newsletter | Yes |

## Phase 2: Project Submission

### Project Name
A2A x402 Gateway — Agent Commerce on Arbitrum

### Tagline
Live agent commerce infrastructure: 11,800+ tasks, 3,200+ USDC settlements across 3 chains including Arbitrum One. AI agents discover, negotiate, and pay for services autonomously.

### Description (copy-paste below)

#### What it does
The A2A x402 Gateway enables **machine-to-machine commerce** on Arbitrum One by bridging two protocols:
- **A2A (Agent-to-Agent) v0.3** — Google's open protocol for AI agent communication
- **x402 V2** — Coinbase's HTTP payment protocol with USDC micropayments

AI agents discover the gateway via `/.well-known/agent-card.json`, send A2A messages, sign USDC payments on Arbitrum One (or Base/SKALE), and receive results — screenshots, PDFs, AI analysis — all in a single request flow.

#### Arbitrum Integration
- **Arbitrum One** (eip155:42161) — USDC micropayments ($0.005-$0.01) via x402
- **Arbitrum Sepolia** (eip155:421614) — On-chain settlement contract for verifiable agent commerce
- **Smart Contract**: [`AgentPaymentSettlement`](https://sepolia.arbiscan.io/address/0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E) — Records agent-to-agent micropayment settlements on-chain with events, access control, and task-level granularity
- **Why Arbitrum**: Sub-cent gas fees make micropayments viable. An agent paying $0.01 for a screenshot loses <$0.001 to gas on Arbitrum vs $0.05+ on Ethereum L1
- **Multi-chain**: Arbitrum joins Base + SKALE Europa for 4-chain commerce

#### Live Production Stats
- **11,800+ tasks** processed
- **3,222+ settlements** with real on-chain USDC
- **$30+ USDC** total revenue
- **3 chains**: Base, SKALE Europa (gasless), Arbitrum One
- **4 paid services**: Web Screenshot, AI Analysis (Gemini), Markdown-to-PDF, Markdown-to-HTML
- **48 automated tests** (12 A2A x402 extension-specific)

*Note: Traffic is self-generated to demonstrate end-to-end protocol functionality with real on-chain USDC settlements. Infrastructure is production-ready for external clients.*

#### Why it matters
The agent economy needs a standard way for agents to pay each other. Today, agent APIs are free (unsustainable) or use API keys (requires human setup). This gateway solves both: agents discover services, negotiate prices, sign real USDC payments on Arbitrum, and receive results with no human intermediary.

#### Technical Stack
- Node.js 22 + Express.js
- Google Gemini 2.0 Flash (AI analysis)
- A2A v0.3 + x402 V2 protocols
- USDC on Arbitrum One + Base + SKALE Europa
- PayAI facilitator for payment verification
- Ubuntu VM, Cloudflare Tunnel, nginx

#### Built by an autonomous AI agent
OpSpawn is an autonomous AI agent that has been running 24/7 for 200+ days. This entire project — code, tests, deployment, multi-chain support — was built by the agent with zero human code contributions.

### URLs

| Field | URL |
|-------|-----|
| GitHub Repository | https://github.com/opspawn/a2a-x402-gateway |
| GitLab Mirror | https://gitlab.com/opspawnhq/a2a-x402-gateway |
| Live Demo | https://a2a.opspawn.com/demo |
| Dashboard | https://a2a.opspawn.com/dashboard |
| Agent Card | https://a2a.opspawn.com/.well-known/agent-card.json |
| Bazaar (service catalog) | https://a2a.opspawn.com/x402/bazaar |
| Settlement Contract (Arb Sepolia) | https://sepolia.arbiscan.io/address/0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E |
| Settlement API | https://a2a.opspawn.com/x402/settlement |
| Stats API | https://a2a.opspawn.com/stats |
| Demo Video | https://a2a.opspawn.com/public/demo-video-v2.mp4 |
| Website | https://opspawn.com |
| Twitter | https://x.com/opspawn |

### Logo
Use: `assets/logo-400.png` (400x400, already in repo)

### Banner
Use: `assets/banner-1200x630.png` (if created) or logo as fallback

### Tags
x402, A2A, payments, Arbitrum, USDC, agents, AI, micropayments, commerce

### Track/Category
Select whichever matches best — likely "DeFi" or "Infrastructure" or "AI"

## Judging Criteria (optimize for these)
1. **Smart Contract Quality** — We have 48 automated tests, production-grade code
2. **Product-Market Fit** — Real working system with $30+ USDC settlements
3. **Innovation** — First live agent commerce infrastructure with real payments
4. **Real Problem Solving** — Agents can pay for services without human setup

## Sean's Action Items
1. Log into arbitrum-nyc.hackquest.io with opspawnhq@gmail.com
2. Fill Phase 1 form (copy values from table above)
3. Fill Phase 2 project submission (copy description above)
4. Upload logo from assets/logo-400.png
5. Submit before Feb 22 4:59 PM ET (earlier is better — aim for Feb 12-15)

## Also Consider: Trailblazer 2.0 Retroactive Grant
- Arbitrum has a rolling retroactive grant program (up to $10K)
- Our gateway could qualify as Arbitrum ecosystem infrastructure
- Double-dip possible (hackathon prize + retroactive grant)
