const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Testing with account:", signer.address);

  const contract = await hre.ethers.getContractAt(
    "AgentPaymentSettlement",
    "0xb28E2076D1395c31958E4C1B2aeab8C6839F4b3E"
  );

  // Record a test settlement
  const payer = "0x0000000000000000000000000000000000000001";
  const payee = "0x0000000000000000000000000000000000000002";
  const amount = 10000; // 0.01 USDC (6 decimals)
  const taskId = hre.ethers.id("test-task-001"); // keccak256 hash

  console.log("Recording test settlement...");
  console.log("  TaskId:", taskId);
  console.log("  Payer:", payer);
  console.log("  Payee:", payee);
  console.log("  Amount:", amount);

  const tx = await contract.recordSettlement(payer, payee, amount, taskId);
  console.log("  Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("  Confirmed in block:", receipt.blockNumber);
  console.log("  Gas used:", receipt.gasUsed.toString());

  // Read back the settlement
  const settlement = await contract.getSettlement(taskId);
  console.log("\nSettlement data on-chain:");
  console.log("  Payer:", settlement.payer);
  console.log("  Payee:", settlement.payee);
  console.log("  Amount:", settlement.amount.toString());
  console.log("  Timestamp:", new Date(Number(settlement.timestamp) * 1000).toISOString());
  console.log("  Exists:", settlement.exists);

  const count = await contract.settlementCount();
  console.log("\nTotal settlements:", count.toString());

  console.log("\nArbiscan tx URL:", `https://sepolia.arbiscan.io/tx/${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
