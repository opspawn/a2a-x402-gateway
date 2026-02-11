const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
const address = "0x7483a9F237cf8043704D6b17DA31c12BfFF860DD";

async function main() {
  const balance = await provider.getBalance(address);
  console.log(`Balance on Arbitrum Sepolia for ${address}:`);
  console.log(`${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.log("\nNeed testnet ETH! Try these faucets:");
    console.log("1. https://faucets.chain.link/arbitrum-sepolia");
    console.log("2. https://www.alchemy.com/faucets/arbitrum-sepolia");
    console.log("3. https://faucet.quicknode.com/arbitrum/sepolia");
  }
}

main().catch(console.error);
