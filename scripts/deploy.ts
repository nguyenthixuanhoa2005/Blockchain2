// Script triển khai ShareToken và BoardElection
// Chạy: node node_modules/hardhat/dist/src/cli.js run scripts/deploy.ts
import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("=".repeat(60));
  console.log("TRIỂN KHAI HỆ THỐNG BỎ PHIẾU BẦU HĐQT");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  // Triển khai ShareToken
  console.log("\n[1] Triển khai ShareToken...");
  const TokenFactory = await ethers.getContractFactory("ShareToken");
  const token = await TokenFactory.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("    ShareToken:", tokenAddr);

  // Triển khai BoardElection
  console.log("\n[2] Triển khai BoardElection...");
  const ElectionFactory = await ethers.getContractFactory("BoardElection");
  const election = await ElectionFactory.deploy(tokenAddr, deployer.address);
  await election.waitForDeployment();
  const electionAddr = await election.getAddress();
  console.log("    BoardElection:", electionAddr);

  console.log("\n=".repeat(60));
  console.log("TRIỂN KHAI HOÀN THÀNH!");
  console.log("ShareToken   :", tokenAddr);
  console.log("BoardElection:", electionAddr);
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
