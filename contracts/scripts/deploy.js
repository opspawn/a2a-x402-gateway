const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("ERROR: No ETH balance. Get testnet ETH from a faucet first.");
    process.exit(1);
  }

  console.log("Deploying AgentPaymentSettlement...");
  const Contract = await hre.ethers.getContractFactory("AgentPaymentSettlement");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AgentPaymentSettlement deployed to:", address);

  const txHash = contract.deploymentTransaction().hash;
  console.log("Deployment tx:", txHash);
  console.log("Arbiscan URL:", `https://sepolia.arbiscan.io/address/${address}`);

  const deployInfo = {
    contract: "AgentPaymentSettlement",
    address: address,
    deployer: deployer.address,
    network: "Arbitrum Sepolia",
    chainId: 421614,
    txHash: txHash,
    arbiscanUrl: `https://sepolia.arbiscan.io/address/${address}`,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("deployment.json", JSON.stringify(deployInfo, null, 2));
  console.log("Deployment info saved to deployment.json");

  // Wait for confirmations before verification
  console.log("\nWaiting 30s for block confirmations...");
  await new Promise(r => setTimeout(r, 30000));

  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: [],
    });
    console.log("Contract verified on Arbiscan!");
    deployInfo.verified = true;
    fs.writeFileSync("deployment.json", JSON.stringify(deployInfo, null, 2));
  } catch (e) {
    console.log("Verification attempt:", e.message);
    deployInfo.verified = false;
    deployInfo.verificationError = e.message;
    fs.writeFileSync("deployment.json", JSON.stringify(deployInfo, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
