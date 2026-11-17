// Script deploy contracts directly to local node (http://127.0.0.1:8545)
// and generate config for frontend
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // Default hardhat accounts
  const adminKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const aliceKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const bobKey   = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
  const carolKey = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

  const admin = new ethers.Wallet(adminKey, provider);
  const alice = new ethers.Wallet(aliceKey, provider);
  const bob   = new ethers.Wallet(bobKey, provider);
  const carol = new ethers.Wallet(carolKey, provider);

  console.log("=== TRIỂN KHAI VÀO LOCAL BLOCKCHAIN NODE (8545) ===");
  console.log("Admin address:", admin.address);

  // Load ABI and Bytecode from artifacts
  const tokenArtifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/ShareToken.sol/ShareToken.json", "utf8")
  );
  const electionArtifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/BoardElection.sol/BoardElection.json", "utf8")
  );

  // 1. Deploy ShareToken
  console.log("\n1. Triển khai ShareToken...");
  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, admin);
  const token = await tokenFactory.deploy(admin.address, { nonce: await provider.getTransactionCount(admin.address, "pending") });
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("-> ShareToken deployed tại:", tokenAddr);

  // Helper function to send transaction with fresh nonce
  async function sendWithFreshNonce(txPromiseFunc: (nonce: number) => Promise<any>) {
    const freshNonce = await provider.getTransactionCount(admin.address, "pending");
    const tx = await txPromiseFunc(freshNonce);
    await tx.wait(1);
    return tx;
  }

  // 2. Deploy BoardElection
  console.log("\n2. Triển khai BoardElection...");
  const electionNonce = await provider.getTransactionCount(admin.address, "pending");
  const electionFactory = new ethers.ContractFactory(electionArtifact.abi, electionArtifact.bytecode, admin);
  const election = await electionFactory.deploy(tokenAddr, admin.address, { nonce: electionNonce });
  await election.waitForDeployment();
  const electionAddr = await election.getAddress();
  console.log("-> BoardElection deployed tại:", electionAddr);

  // 3. Khởi tạo dữ liệu ban đầu
  console.log("\n3. Khởi tạo cổ phần mẫu cho cổ đông...");
  await sendWithFreshNonce((n) => token.mint(alice.address, 60n, { nonce: n }));
  await sendWithFreshNonce((n) => token.mint(bob.address, 25n, { nonce: n }));
  await sendWithFreshNonce((n) => token.mint(carol.address, 35n, { nonce: n }));
  console.log("-> Alice (60 cổ phần), Bob (25 cổ phần), Carol (35 cổ phần)");

  // 4. Tạo kỳ bầu cử mẫu
  console.log("\n4. Tạo kỳ bầu cử mẫu (3 ghế HĐQT)...");
  await sendWithFreshNonce((n) => election.createElection("Đại hội Cổ đông 2027 - Bầu HĐQT Doanh nghiệp", 3, { nonce: n }));

  // Thêm ứng viên
  const candidates = [
    { name: "Nguyễn Văn An", cid: "ipfs://QmCandidate1An" },
    { name: "Trần Thị Bình", cid: "ipfs://QmCandidate2Binh" },
    { name: "Lê Văn Cường", cid: "ipfs://QmCandidate3Cuong" },
    { name: "Phạm Thị Dung", cid: "ipfs://QmCandidate4Dung" },
    { name: "Hoàng Minh Đức", cid: "ipfs://QmCandidate5Duc" },
  ];
  for (const c of candidates) {
    await sendWithFreshNonce((n) => election.addCandidate(1, c.name, c.cid, { nonce: n }));
    console.log(`   + Đã thêm ứng viên: ${c.name}`);
  }

  // 5. Mở phiên bỏ phiếu (thời hạn 24 giờ = 86400s)
  console.log("\n5. Mở phiên bỏ phiếu (snapshotBlock & thời hạn 24 giờ)...");
  await sendWithFreshNonce((n) => election.startVoting(1, 86400n, { nonce: n }));
  console.log("-> Đã mở phiên bỏ phiếu thành công cho Kỳ bầu cử #1!");

  // Lưu config và ABI vào frontend/config.js để web truy cập trực tiếp
  const frontendConfig = {
    rpcUrl: "http://127.0.0.1:8545",
    tokenAddress: tokenAddr,
    electionAddress: electionAddr,
    accounts: [
      { name: "Quản trị viên (Admin)", address: admin.address, privateKey: adminKey, role: "admin" },
      { name: "Cổ đông Alice (60 cổ phần - 50%)", address: alice.address, privateKey: aliceKey, role: "voter" },
      { name: "Cổ đông Bob (25 cổ phần - 20.8%)", address: bob.address, privateKey: bobKey, role: "voter" },
      { name: "Cổ đông Carol (35 cổ phần - 29.2%)", address: carol.address, privateKey: carolKey, role: "voter" },
    ],
    tokenAbi: tokenArtifact.abi,
    electionAbi: electionArtifact.abi,
  };

  const configJsContent = `// File cấu hình tự động cho Frontend dApp
window.APP_CONFIG = ${JSON.stringify(frontendConfig, null, 2)};
`;

  fs.writeFileSync(path.join("frontend", "config.js"), configJsContent, "utf8");
  console.log("\n-> Đã xuất cấu hình và ABI ra: frontend/config.js");
  console.log("=== HOÀN TẤT SETUP DỮ LIỆU ===");
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
