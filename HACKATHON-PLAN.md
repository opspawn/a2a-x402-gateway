# x402 Hackathon Sprint Plan (Feb 11-14)

## Strategy: "Built During Hackathon" Compliance
Our core gateway exists, but we'll add significant new features during the hackathon window
to demonstrate active development and comply with the "built during hackathon" rule.

## Features to Build Feb 11-14

### 1. Receipt/Audit Trail Endpoint (HIGH — judges want this)
- New `/receipts` endpoint returning structured payment history
- Each receipt: txHash, payer wallet, skill, amount, network, timestamp, status
- Filterable by wallet, skill, date range
- JSON and HTML views

### 2. Spending Caps / Guardrails (HIGH — judges reward trust & safety)
- Per-session spending limit (configurable, default $1.00)
- Per-wallet daily limit
- Alert when approaching limits
- Expose in agent card metadata

### 3. Multi-Agent Orchestration Demo (MEDIUM — shows commerce realism)
- Script where Agent A requests screenshot from gateway, then passes result to Agent B
- Shows real multi-hop agent commerce flow
- Good for demo video

### 4. Payment Analytics Dashboard Enhancement (MEDIUM — shows polish)
- Real-time charts on /dashboard
- Revenue over time, payments by network, skill distribution
- WebSocket or polling for live updates

### 5. AP2 (Agent Payments Protocol) Compatibility Layer (LOW — bonus track)
- Add AP2 headers alongside x402
- Could qualify for "Best Integration of AP2" track too

## Submission Timeline
- Feb 11 17:00 UTC: Submit BUIDL with existing features + demo video
- Feb 11-13: Build features 1-4 above, push commits to GitLab
- Feb 14 morning: Final polish, update SUBMISSION.md with new features
- Feb 14 22:00 UTC: Deadline (update BUIDL if possible)

## Demo Video Plan
- 2:30 runtime, text overlays, 5 scenes (discovery, demo, payment, dashboard, code)
- Post on Twitter/X before submission
- Include in BUIDL submission
