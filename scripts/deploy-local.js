// Pure Node.js script (ESM) to deploy to local Hardhat node
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

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

  const tokenArtifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/ShareToken.sol/ShareToken.json", "utf8")
  );
  const electionArtifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/BoardElection.sol/BoardElection.json", "utf8")
  );

  let curNonce = Number(await provider.send("eth_getTransactionCount", [admin.address, "latest"]));
  console.log("Starting nonce:", curNonce);

  // 1. Deploy ShareToken
  console.log("\n1. Triển khai ShareToken...");
  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, admin);
  const tokenDeployTx = await tokenFactory.deploy(admin.address, { nonce: curNonce++ });
  const tokenReceipt = await tokenDeployTx.deploymentTransaction().wait(1);
  const tokenAddr = await tokenDeployTx.getAddress();
  console.log("-> ShareToken deployed tại:", tokenAddr, "- tx:", tokenReceipt.hash);

  // 2. Deploy BoardElection
  console.log("\n2. Triển khai BoardElection...");
  const electionFactory = new ethers.ContractFactory(electionArtifact.abi, electionArtifact.bytecode, admin);
  const electionDeployTx = await electionFactory.deploy(tokenAddr, admin.address, { nonce: curNonce++ });
  const electionReceipt = await electionDeployTx.deploymentTransaction().wait(1);
  const electionAddr = await electionDeployTx.getAddress();
  console.log("-> BoardElection deployed tại:", electionAddr, "- tx:", electionReceipt.hash);

  const tokenContract = new ethers.Contract(tokenAddr, tokenArtifact.abi, admin);
  const electionContract = new ethers.Contract(electionAddr, electionArtifact.abi, admin);

  // 3. Khởi tạo cổ phần
  console.log("\n3. Khởi tạo cổ phần mẫu cho cổ đông...");
  let tx = await tokenContract.mint(alice.address, 60n, { nonce: curNonce++ });
  await tx.wait(1);
  console.log("-> Mint 60 token cho Alice:", tx.hash);

  tx = await tokenContract.mint(bob.address, 25n, { nonce: curNonce++ });
  await tx.wait(1);
  console.log("-> Mint 25 token cho Bob:", tx.hash);

  tx = await tokenContract.mint(carol.address, 35n, { nonce: curNonce++ });
  await tx.wait(1);
  console.log("-> Mint 35 token cho Carol:", tx.hash);

  // 4. Tạo kỳ bầu cử mẫu (3 ghế)
  console.log("\n4. Tạo kỳ bầu cử mẫu (3 ghế HĐQT)...");
  tx = await electionContract.createElection("Đại hội Cổ đông 2027 - Bầu HĐQT Doanh nghiệp", 3, { nonce: curNonce++ });
  await tx.wait(1);
  console.log("-> createElection tx:", tx.hash);

  // Thêm 5 ứng viên
  const candidates = [
    { name: "Nguyễn Văn An", cid: "ipfs://QmCandidate1An" },
    { name: "Trần Thị Bình", cid: "ipfs://QmCandidate2Binh" },
    { name: "Lê Văn Cường", cid: "ipfs://QmCandidate3Cuong" },
    { name: "Phạm Thị Dung", cid: "ipfs://QmCandidate4Dung" },
    { name: "Hoàng Minh Đức", cid: "ipfs://QmCandidate5Duc" },
  ];
  for (const c of candidates) {
    tx = await electionContract.addCandidate(1, c.name, c.cid, { nonce: curNonce++ });
    await tx.wait(1);
    console.log(`   + Thêm ứng viên "${c.name}" - tx:`, tx.hash);
  }

  console.log("-> Kỳ #1 đang ở trạng thái [Sắp diễn ra] (Registration), sẵn sàng cho quy trình tự động mở theo thời gian.");

  // Xuất cấu hình cho Frontend
  const frontendConfig = {
    rpcUrl: "http://127.0.0.1:8545",
    tokenAddress: tokenAddr,
    electionAddress: electionAddr,
    adminAddress: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66",
    superAdmin: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66",
    sepolia: {
      chainId: 11155111,
      chainIdHex: "0xaa36a7",
      chainName: "Sepolia Test Network",
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      rpcUrls: [
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://rpc.sepolia.org"
      ],
      explorerUrl: "https://sepolia.etherscan.io",
      blockExplorerUrls: ["https://sepolia.etherscan.io/"],
      nativeCurrency: {
        name: "Sepolia ETH",
        symbol: "ETH",
        decimals: 18
      },
      tokenAddress: tokenAddr,
      electionAddress: electionAddr,
      adminAddress: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66"
    },
    network: {
      name: "Sepolia Testnet",
      chainId: 11155111,
      chainIdHex: "0xaa36a7",
      explorerUrl: "https://sepolia.etherscan.io",
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com"
    },
    accounts: [
      { name: "Chủ tịch HĐQT / Quản trị viên tối cao", address: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66", role: "admin", isSuperAdmin: true },
      { name: "Quản trị viên (Admin)", address: admin.address, privateKey: adminKey, role: "admin" },
      { name: "Cổ đông Alice (60 cổ phần - 50%)", address: alice.address, privateKey: aliceKey, role: "voter" },
      { name: "Cổ đông Bob (25 cổ phần - 20.8%)", address: bob.address, privateKey: bobKey, role: "voter" },
      { name: "Cổ đông Carol (35 cổ phần - 29.2%)", address: carol.address, privateKey: carolKey, role: "voter" },
    ],
    tokenAbi: tokenArtifact.abi,
    electionAbi: electionArtifact.abi,
  };

  const configJsContent = `// File cấu hình tự động kết nối Smart Contract cho Frontend dApp
window.APP_CONFIG = ${JSON.stringify(frontendConfig, null, 2)};
`;

  fs.writeFileSync(path.join("frontend", "config.js"), configJsContent, "utf8");
  console.log("\n-> Xuất file thành công: frontend/config.js");
  console.log("=== HOÀN TẤT TRIỂN KHAI VÀ KHỞI TẠO DỮ LIỆU LOCAL ===");
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
