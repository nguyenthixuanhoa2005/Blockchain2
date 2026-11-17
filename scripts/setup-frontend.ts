// Script khởi tạo dữ liệu demo cho frontend
// Chạy: node node_modules/hardhat/dist/src/cli.js run scripts/setup-frontend.ts
// Sau đó mở frontend/index.html bằng trình duyệt
import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const { ethers } = await network.connect();

async function main() {
  const signers = await ethers.getSigners();
  const [admin, alice, bob, carol] = signers;

  console.log("=".repeat(60));
  console.log("TRIỂN KHAI VÀ KHỞI TẠO DỮ LIỆU CHO FRONTEND");
  console.log("=".repeat(60));

  // Deploy ShareToken
  const TokenFactory = await ethers.getContractFactory("ShareToken");
  const token = await TokenFactory.deploy(admin.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("ShareToken   :", tokenAddr);

  // Deploy BoardElection
  const ElectionFactory = await ethers.getContractFactory("BoardElection");
  const election = await ElectionFactory.deploy(tokenAddr, admin.address);
  await election.waitForDeployment();
  const electionAddr = await election.getAddress();
  console.log("BoardElection:", electionAddr);

  // Cấp cổ phần
  await token.mint(alice.address, 60n);
  await token.mint(bob.address, 25n);
  await token.mint(carol.address, 35n);
  console.log("\nCấp cổ phần: Alice=60, Bob=25, Carol=35");

  // Tạo kỳ bầu cử 3 ghế
  await election.createElection("Bầu HĐQT Nhiệm Kỳ 2027-2032", 3);
  const candidates = [
    { name: "Nguyễn Văn An", cid: "ipfs://Qm1" },
    { name: "Trần Thị Bình", cid: "ipfs://Qm2" },
    { name: "Lê Văn Cường", cid: "ipfs://Qm3" },
    { name: "Phạm Thị Dung", cid: "ipfs://Qm4" },
    { name: "Hoàng Minh Đức", cid: "ipfs://Qm5" },
  ];
  for (const c of candidates) {
    await election.addCandidate(1, c.name, c.cid);
  }
  console.log("Tạo kỳ bầu cử với 5 ứng viên, 3 ghế");

  // Mở phiên bỏ phiếu (24 giờ)
  await election.startVoting(1, 86400n);
  console.log("Mở phiên bỏ phiếu (24 giờ)");

  // Lưu config cho frontend
  const frontendConfig = {
    tokenAddress: tokenAddr,
    electionAddress: electionAddr,
    rpcUrl: "http://127.0.0.1:8545",
    accounts: {
      admin: { address: admin.address, privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
      alice: { address: alice.address, privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
      bob:   { address: bob.address,   privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
      carol: { address: carol.address, privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
    },
  };

  const configPath = path.join("frontend", "config.json");
  fs.writeFileSync(configPath, JSON.stringify(frontendConfig, null, 2), "utf8");
  console.log("\nConfig đã lưu vào frontend/config.json");
  console.log("\n=".repeat(60));
  console.log("Bây giờ mở frontend/index.html bằng trình duyệt!");
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
