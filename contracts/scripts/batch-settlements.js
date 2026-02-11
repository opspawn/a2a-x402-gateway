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

// Realistic settlement scenarios for demo
const SETTLEMENTS = [
  { payer: AGENTS.gateway, payee: AGENTS.codeReview, amount: 50000, taskSuffix: "code-review-pr-42" },
  { payer: AGENTS.gateway, payee: AGENTS.dataAnalysis, amount: 75000, taskSuffix: "data-pipeline-etl" },
  { payer: AGENTS.gateway, payee: AGENTS.nlpTranslate, amount: 25000, taskSuffix: "translate-en-es-batch" },
  { payer: AGENTS.gateway, payee: AGENTS.imageGen, amount: 100000, taskSuffix: "banner-gen-campaign" },
  { payer: AGENTS.codeReview, payee: AGENTS.summarizer, amount: 15000, taskSuffix: "diff-summary-v3" },
  { payer: AGENTS.gateway, payee: AGENTS.voiceAgent, amount: 35000, taskSuffix: "tts-podcast-ep12" },
  { payer: AGENTS.dataAnalysis, payee: AGENTS.searchAgent, amount: 45000, taskSuffix: "web-scrape-market" },
  { payer: AGENTS.gateway, payee: AGENTS.nlpTranslate, amount: 30000, taskSuffix: "translate-zh-en-docs" },
  { payer: AGENTS.gateway, payee: AGENTS.codeReview, amount: 60000, taskSuffix: "security-audit-api" },
  { payer: AGENTS.imageGen, payee: AGENTS.summarizer, amount: 10000, taskSuffix: "caption-gen-batch" },
  { payer: AGENTS.gateway, payee: AGENTS.dataAnalysis, amount: 80000, taskSuffix: "sentiment-analysis-q4" },
  { payer: AGENTS.gateway, payee: AGENTS.voiceAgent, amount: 40000, taskSuffix: "voice-clone-demo" },
  { payer: AGENTS.searchAgent, payee: AGENTS.nlpTranslate, amount: 20000, taskSuffix: "query-translate-fr" },
  { payer: AGENTS.gateway, payee: AGENTS.imageGen, amount: 90000, taskSuffix: "product-shots-batch" },
  { payer: AGENTS.gateway, payee: AGENTS.searchAgent, amount: 55000, taskSuffix: "competitor-intel-scan" },
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
    const taskId = hre.ethers.id(`opspawn-${s.taskSuffix}-${Date.now()}`);

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

      // Small delay between txs to avoid nonce issues
      if (i < SETTLEMENTS.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed++;
    }
  }

  const endCount = await contract.settlementCount();
  const endBalance = await hre.ethers.provider.getBalance(signer.address);

  console.log("\n========== SUMMARY ==========");
  console.log(`Succeeded: ${succeeded}/${SETTLEMENTS.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Settlement count: ${startCount.toString()} -> ${endCount.toString()}`);
  console.log(`ETH spent: ${hre.ethers.formatEther(balance - endBalance)} ETH`);
  console.log(`Remaining: ${hre.ethers.formatEther(endBalance)} ETH`);
  console.log(`\nContract: https://sepolia.arbiscan.io/address/0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E`);

  console.log("\nAll transaction URLs:");
  txHashes.forEach((t) => console.log(`  ${t.index}. ${t.arbiscanUrl}`));

  // Write results to JSON
  const fs = require("fs");
  fs.writeFileSync(
    "batch-settlement-results.json",
    JSON.stringify({ txHashes, succeeded, failed, totalCount: endCount.toString() }, null, 2)
  );
  console.log("\nResults saved to batch-settlement-results.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
