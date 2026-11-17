// Script triển khai chuyên dụng cho mạng Ethereum Sepolia Testnet
// Chạy: node scripts/deploy-sepolia.js [PRIVATE_KEY]
// Hoặc: npm run deploy:sepolia
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Tự động nạp biến môi trường từ .env
function loadEnv() {
  const envCandidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
    path.join(__dirname, "..", "He_Thong_Bau_HDQT", ".env"),
    path.join(process.cwd(), "He_Thong_Bau_HDQT", ".env")
  ];
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, "utf8");
        content.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const eqIndex = trimmed.indexOf("=");
            const key = trimmed.slice(0, eqIndex).trim();
            const val = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
        console.log(`[Config] Đã nạp biến môi trường từ: ${envFile}`);
        break;
      } catch (err) {
        console.warn(`[Config] Không thể đọc file .env (${envFile}):`, err.message);
      }
    }
  }
}
loadEnv();

// Địa chỉ ví Admin tối cao nhận toàn bộ quyền quản trị theo yêu cầu
const SUPER_ADMIN_ADDRESS = "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66";

// Cấu hình mạng Sepolia mặc định
const SEPOLIA_RPC_FALLBACKS = [
  process.env.SEPOLIA_RPC_URL,
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
  "https://1rpc.io/sepolia"
].filter(Boolean);

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 TRIỂN KHAI HỆ THỐNG BẦU HỘI ĐỒNG QUẢN TRỊ LÊN MẠNG SEPOLIA TESTNET");
  console.log("=".repeat(70));
  console.log(`👑 Địa chỉ Super Admin thụ hưởng toàn quyền: ${SUPER_ADMIN_ADDRESS}`);

  // Lấy private key từ CLI argument hoặc biến môi trường
  let rawPrivateKey = process.argv[2] || process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!rawPrivateKey || rawPrivateKey === "your_sepolia_wallet_private_key_without_0x_prefix") {
    console.error("\n❌ LỖI: Chưa cấu hình khóa bí mật (SEPOLIA_PRIVATE_KEY) của ví triển khai!");
    console.log("\n👉 HƯỚNG DẪN:");
    console.log("   Cách 1: Tạo file .env và thêm:");
    console.log("           SEPOLIA_PRIVATE_KEY=0x_khoa_bi_mat_cua_ban");
    console.log("           SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_key");
    console.log("   Cách 2: Chạy trực tiếp kèm tham số:");
    console.log("           node scripts/deploy-sepolia.js <PRIVATE_KEY_SEPOLIA>");
    process.exit(1);
  }

  // Chuẩn hóa định dạng private key
  if (!rawPrivateKey.startsWith("0x")) {
    rawPrivateKey = "0x" + rawPrivateKey;
  }

  // Kết nối tới mạng Sepolia RPC
  let provider = null;
  let activeRpcUrl = "";
  for (const rpc of SEPOLIA_RPC_FALLBACKS) {
    try {
      console.log(`📡 Đang thử kết nối RPC: ${rpc}...`);
      const testProvider = new ethers.JsonRpcProvider(rpc);
      const network = await testProvider.getNetwork();
      if (network.chainId === 11155111n) {
        provider = testProvider;
        activeRpcUrl = rpc;
        console.log(`   ✅ Kết nối thành công mạng Sepolia (Chain ID: 11155111) qua RPC: ${rpc}`);
        break;
      } else {
        console.warn(`   ⚠️ Cảnh báo: Chain ID nhận được là ${network.chainId}, không phải Sepolia (11155111).`);
      }
    } catch (e) {
      console.warn(`   ❌ RPC ${rpc} không phản hồi:`, e.message);
    }
  }

  if (!provider) {
    throw new Error("Không thể kết nối tới bất kỳ RPC Sepolia nào! Vui lòng kiểm tra lại mạng hoặc SEPOLIA_RPC_URL.");
  }

  const deployerWallet = new ethers.Wallet(rawPrivateKey, provider);
  const deployerAddress = await deployerWallet.getAddress();
  const balance = await provider.getBalance(deployerAddress);

  console.log(`\n💼 Ví thực hiện deploy: ${deployerAddress}`);
  console.log(`💰 Số dư ví deploy   : ${ethers.formatEther(balance)} SepoliaETH`);

  if (balance === 0n) {
    console.error("\n❌ LỖI: Số dư ví deploy bằng 0 SepoliaETH! Không đủ phí gas để triển khai smart contract.");
    console.log("👉 Nhận SepoliaETH miễn phí tại các vòi (faucet):");
    console.log("   - https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    console.log("   - https://sepoliafaucet.com");
    console.log("   - https://www.infura.io/faucet/sepolia");
    process.exit(1);
  }

  // Đọc ABI & Bytecode từ artifacts
  const tokenArtifactPath = path.join(process.cwd(), "artifacts/contracts/ShareToken.sol/ShareToken.json");
  const electionArtifactPath = path.join(process.cwd(), "artifacts/contracts/BoardElection.sol/BoardElection.json");

  if (!fs.existsSync(tokenArtifactPath) || !fs.existsSync(electionArtifactPath)) {
    throw new Error("Không tìm thấy artifacts của contract! Vui lòng chạy 'npx hardhat compile' trước.");
  }

  const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, "utf8"));
  const electionArtifact = JSON.parse(fs.readFileSync(electionArtifactPath, "utf8"));

  // 1. Triển khai ShareToken với Super Admin
  console.log("\n------------------------------------------------------------");
  console.log("[1/3] Đang triển khai ShareToken...");
  console.log(`      Khởi tạo với admin: ${SUPER_ADMIN_ADDRESS}`);
  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, deployerWallet);
  const tokenContract = await tokenFactory.deploy(SUPER_ADMIN_ADDRESS);
  const tokenDeployTx = tokenContract.deploymentTransaction();
  console.log(`      Tx Hash: ${tokenDeployTx.hash}`);
  console.log("      Đang chờ xác nhận khối trên mạng Sepolia...");
  await tokenContract.waitForDeployment();
  const tokenAddress = await tokenContract.getAddress();
  console.log(`   ✅ ShareToken đã triển khai thành công tại: ${tokenAddress}`);
  console.log(`   🔗 Etherscan: https://sepolia.etherscan.io/address/${tokenAddress}`);

  // 2. Triển khai BoardElection kết nối với ShareToken & Super Admin
  console.log("\n------------------------------------------------------------");
  console.log("[2/3] Đang triển khai BoardElection...");
  console.log(`      ShareToken tham chiếu: ${tokenAddress}`);
  console.log(`      Khởi tạo với admin   : ${SUPER_ADMIN_ADDRESS}`);
  const electionFactory = new ethers.ContractFactory(electionArtifact.abi, electionArtifact.bytecode, deployerWallet);
  const electionContract = await electionFactory.deploy(tokenAddress, SUPER_ADMIN_ADDRESS);
  const electionDeployTx = electionContract.deploymentTransaction();
  console.log(`      Tx Hash: ${electionDeployTx.hash}`);
  console.log("      Đang chờ xác nhận khối trên mạng Sepolia...");
  await electionContract.waitForDeployment();
  const electionAddress = await electionContract.getAddress();
  console.log(`   ✅ BoardElection đã triển khai thành công tại: ${electionAddress}`);
  console.log(`   🔗 Etherscan: https://sepolia.etherscan.io/address/${electionAddress}`);

  // 3. Kiểm tra & Đảm bảo toàn quyền cho Super Admin
  console.log("\n------------------------------------------------------------");
  console.log("[3/3] Xác thực phân quyền cho Quản trị viên tối cao (Super Admin)...");
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const ELECTION_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ELECTION_ADMIN_ROLE"));

  const hasTokenAdmin = await tokenContract.hasRole(DEFAULT_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);
  const hasTokenMinter = await tokenContract.hasRole(MINTER_ROLE, SUPER_ADMIN_ADDRESS);
  const hasElectionAdmin = await electionContract.hasRole(DEFAULT_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);
  const hasElectionAdminRole = await electionContract.hasRole(ELECTION_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);

  console.log(`   👉 ShareToken:`);
  console.log(`      - DEFAULT_ADMIN_ROLE: ${hasTokenAdmin ? "✅ ĐÃ CẤP" : "❌ CHƯA CẤP"}`);
  console.log(`      - MINTER_ROLE       : ${hasTokenMinter ? "✅ ĐÃ CẤP" : "❌ CHƯA CẤP"}`);
  console.log(`   👉 BoardElection:`);
  console.log(`      - DEFAULT_ADMIN_ROLE : ${hasElectionAdmin ? "✅ ĐÃ CẤP" : "❌ CHƯA CẤP"}`);
  console.log(`      - ELECTION_ADMIN_ROLE: ${hasElectionAdminRole ? "✅ ĐÃ CẤP" : "❌ CHƯA CẤP"}`);

  // Bổ sung grantRole nếu deployer nắm quyền mà admin chưa có (dự phòng)
  if (!hasTokenAdmin && (await tokenContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress))) {
    console.log("   ⚙️ Đang cấp DEFAULT_ADMIN_ROLE trên ShareToken cho Super Admin...");
    const tx = await tokenContract.grantRole(DEFAULT_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);
    await tx.wait(1);
    console.log("   ✅ Đã cấp thành công!");
  }
  if (!hasTokenMinter && (await tokenContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress))) {
    console.log("   ⚙️ Đang cấp MINTER_ROLE trên ShareToken cho Super Admin...");
    const tx = await tokenContract.grantRole(MINTER_ROLE, SUPER_ADMIN_ADDRESS);
    await tx.wait(1);
    console.log("   ✅ Đã cấp thành công!");
  }
  if (!hasElectionAdmin && (await electionContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress))) {
    console.log("   ⚙️ Đang cấp DEFAULT_ADMIN_ROLE trên BoardElection cho Super Admin...");
    const tx = await electionContract.grantRole(DEFAULT_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);
    await tx.wait(1);
    console.log("   ✅ Đã cấp thành công!");
  }
  if (!hasElectionAdminRole && (await electionContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress))) {
    console.log("   ⚙️ Đang cấp ELECTION_ADMIN_ROLE trên BoardElection cho Super Admin...");
    const tx = await electionContract.grantRole(ELECTION_ADMIN_ROLE, SUPER_ADMIN_ADDRESS);
    await tx.wait(1);
    console.log("   ✅ Đã cấp thành công!");
  }

  // 4. Cập nhật và lưu cấu hình triển khai
  const deploymentSummary = {
    network: "sepolia",
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    rpcUrl: activeRpcUrl,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    superAdmin: SUPER_ADMIN_ADDRESS,
    contracts: {
      shareToken: {
        address: tokenAddress,
        explorerUrl: `https://sepolia.etherscan.io/address/${tokenAddress}`
      },
      boardElection: {
        address: electionAddress,
        explorerUrl: `https://sepolia.etherscan.io/address/${electionAddress}`
      }
    }
  };

  const deploymentLogPath = path.join(process.cwd(), "frontend", "sepolia-deployment.json");
  fs.writeFileSync(deploymentLogPath, JSON.stringify(deploymentSummary, null, 2), "utf8");
  console.log(`\n💾 Đã lưu thông tin triển khai vào: frontend/sepolia-deployment.json`);

  // Cập nhật frontend/config.js với địa chỉ contract Sepolia mới
  const configJsPath = path.join(process.cwd(), "frontend", "config.js");
  if (fs.existsSync(configJsPath)) {
    try {
      let configContent = fs.readFileSync(configJsPath, "utf8");
      // Cập nhật tokenAddress và electionAddress trong config nếu có
      configContent = configContent.replace(
        /"tokenAddress":\s*"0x[a-fA-F0-9]{40}"/,
        `"tokenAddress": "${tokenAddress}"`
      );
      configContent = configContent.replace(
        /"electionAddress":\s*"0x[a-fA-F0-9]{40}"/,
        `"electionAddress": "${electionAddress}"`
      );
      fs.writeFileSync(configJsPath, configContent, "utf8");
      console.log("🔄 Đã tự động cập nhật địa chỉ contract mới vào frontend/config.js");
    } catch (e) {
      console.warn("⚠️ Không thể cập nhật frontend/config.js tự động:", e.message);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("🎉 TRIỂN KHAI THÀNH CÔNG LÊN SEPOLIA TESTNET!");
  console.log("=".repeat(70));
  console.log(`📌 ShareToken   : ${tokenAddress}`);
  console.log(`📌 BoardElection: ${electionAddress}`);
  console.log(`👑 Super Admin  : ${SUPER_ADMIN_ADDRESS}`);
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("\n❌ LỖI TRONG QUÁ TRÌNH TRIỂN KHAI:", err);
  process.exit(1);
});
