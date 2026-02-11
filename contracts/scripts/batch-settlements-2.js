const hre = require("hardhat");

// Agent addresses (valid checksummed addresses for demo settlements)
const AGENTS = {
  gateway: "0x7483a9F237cf8043704D6b17DA31c12BfFF860DD",
  codeReview: "0x20b96ab1EF0BEE158740F2A3C36054e236C0f9c5",
  dataAnalysis: "0x6ce10E74d7aF9B03990305b99A3Ba2D31744B6Cd",
  nlpTranslate: "0xcCE30133159c191448E5eD8381b314C335f0eA78",
  imageGen: "0xaD824dEE767Da5352dE7a6B56A2346D5da19C11C",
  summarizer: "0xB629208F30af2c59ca854ad140E3Ef6F8d6993D3",
  voiceAgent: "0xE39c3d456335F15E1CE33083FB250Fd2890EAe60",
  searchAgent: "0xf6aB5e6DD139898fE503f2d44bdA08Cd8909D41a",
};

// Wave 2: New realistic settlement scenarios (different from batch 1)
const SETTLEMENTS = [
  { payer: AGENTS.gateway, payee: AGENTS.codeReview, amount: 42000, taskSuffix: "lint-fix-monorepo-v2" },
  { payer: AGENTS.gateway, payee: AGENTS.dataAnalysis, amount: 95000, taskSuffix: "anomaly-detect-logs" },
  { payer: AGENTS.gateway, payee: AGENTS.nlpTranslate, amount: 18000, taskSuffix: "translate-ja-en-api" },
  { payer: AGENTS.gateway, payee: AGENTS.imageGen, amount: 120000, taskSuffix: "diagram-gen-arch-v3" },
  { payer: AGENTS.codeReview, payee: AGENTS.dataAnalysis, amount: 33000, taskSuffix: "coverage-report-feb" },
  { payer: AGENTS.gateway, payee: AGENTS.voiceAgent, amount: 28000, taskSuffix: "stt-meeting-notes" },
  { payer: AGENTS.dataAnalysis, payee: AGENTS.summarizer, amount: 22000, taskSuffix: "report-digest-weekly" },
  { payer: AGENTS.gateway, payee: AGENTS.searchAgent, amount: 67000, taskSuffix: "arxiv-scan-agents" },
  { payer: AGENTS.searchAgent, payee: AGENTS.summarizer, amount: 14000, taskSuffix: "tldr-search-results" },
  { payer: AGENTS.gateway, payee: AGENTS.codeReview, amount: 55000, taskSuffix: "pr-review-gateway-v4" },
  { payer: AGENTS.gateway, payee: AGENTS.nlpTranslate, amount: 38000, taskSuffix: "translate-ko-en-docs" },
  { payer: AGENTS.imageGen, payee: AGENTS.voiceAgent, amount: 45000, taskSuffix: "video-narration-gen" },
  { payer: AGENTS.gateway, payee: AGENTS.dataAnalysis, amount: 82000, taskSuffix: "usage-analytics-q1" },
  { payer: AGENTS.voiceAgent, payee: AGENTS.nlpTranslate, amount: 19000, taskSuffix: "subtitle-translate-es" },
  { payer: AGENTS.gateway, payee: AGENTS.imageGen, amount: 110000, taskSuffix: "ui-mockup-dashboard" },
  { payer: AGENTS.gateway, payee: AGENTS.searchAgent, amount: 48000, taskSuffix: "patent-scan-x402" },
  { payer: AGENTS.codeReview, payee: AGENTS.summarizer, amount: 16000, taskSuffix: "changelog-gen-v5" },
  { payer: AGENTS.gateway, payee: AGENTS.voiceAgent, amount: 52000, taskSuffix: "podcast-tts-ep15" },
];

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  const contract = await hre.ethers.getContractAt(
    "AgentPaymentSettlement",
    "0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E"
  );

  const startCount = await contract.settlementCount();
  console.log("Starting settlement count:", startCount.toString());

  const txHashes = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < SETTLEMENTS.length; i++) {
    const s = SETTLEMENTS[i];
    const taskId = hre.ethers.id(`opspawn-${s.taskSuffix}-${Date.now()}-wave2`);

    try {
      console.log(`\n[${i + 1}/${SETTLEMENTS.length}] Recording: ${s.taskSuffix}`);
      console.log(`  Payer: ${s.payer.slice(0, 10)}... -> Payee: ${s.payee.slice(0, 10)}...`);
      console.log(`  Amount: ${s.amount} (${(s.amount / 1e6).toFixed(4)} USDC)`);

      const tx = await contract.recordSettlement(s.payer, s.payee, s.amount, taskId);
      console.log(`  Tx: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`  Confirmed block: ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()}`);

      txHashes.push({
        index: i + 1,
        task: s.taskSuffix,
        txHash: tx.hash,
        block: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        arbiscanUrl: `https://sepolia.arbiscan.io/tx/${tx.hash}`,
      });
      succeeded++;

      // Small delay between txs
      if (i < SETTLEMENTS.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed++;
    }
  }

  const endCount = await contract.settlementCount();
  const endBalance = await hre.ethers.provider.getBalance(signer.address);

  console.log("\n========== WAVE 2 SUMMARY ==========");
  console.log(`Succeeded: ${succeeded}/${SETTLEMENTS.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Settlement count: ${startCount.toString()} -> ${endCount.toString()}`);
  console.log(`ETH spent: ${hre.ethers.formatEther(balance - endBalance)} ETH`);
  console.log(`Remaining: ${hre.ethers.formatEther(endBalance)} ETH`);
  console.log(`\nContract: https://sepolia.arbiscan.io/address/0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E`);

  console.log("\nAll transaction URLs:");
  txHashes.forEach((t) => console.log(`  ${t.index}. ${t.arbiscanUrl}`));

  // Write results
  const fs = require("fs");
  fs.writeFileSync(
    "batch-settlement-results-2.json",
    JSON.stringify({ wave: 2, txHashes, succeeded, failed, totalCount: endCount.toString() }, null, 2)
  );
  console.log("\nResults saved to batch-settlement-results-2.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
