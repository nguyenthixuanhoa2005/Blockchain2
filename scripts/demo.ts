// Script demo end-to-end: cấp cổ phần -> tạo kỳ bầu cử -> bỏ phiếu bầu dồn -> kiểm phiếu
// Chạy: node node_modules/hardhat/dist/src/cli.js run scripts/demo.ts
import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  const signers = await ethers.getSigners();
  const [admin, alice, bob] = signers;

  console.log("=".repeat(60));
  console.log("DEMO HỆ THỐNG BỔ PHIẾU BẦU HĐQT - BẦU DỒN PHIẾU");
  console.log("=".repeat(60));
  console.log("Admin :", admin.address);
  console.log("Alice :", alice.address);
  console.log("Bob   :", bob.address);

  // Triển khai
  const TokenFactory = await ethers.getContractFactory("ShareToken");
  const token = await TokenFactory.deploy(admin.address);
  await token.waitForDeployment();

  const ElectionFactory = await ethers.getContractFactory("BoardElection");
  const election = await ElectionFactory.deploy(await token.getAddress(), admin.address);
  await election.waitForDeployment();

  console.log("\nShareToken   :", await token.getAddress());
  console.log("BoardElection:", await election.getAddress());

  // 1. Cấp phát cổ phần (Alice 60, Bob 40)
  console.log("\n[Bước 1] Cấp phát cổ phần...");
  const mintAlice = await token.mint(alice.address, 60n);
  await mintAlice.wait();
  console.log("  mint Alice 60 cổ phần - tx:", mintAlice.hash);

  const mintBob = await token.mint(bob.address, 40n);
  await mintBob.wait();
  console.log("  mint Bob   40 cổ phần - tx:", mintBob.hash);

  console.log("  Alice votes:", (await token.getVotes(alice.address)).toString());
  console.log("  Bob   votes:", (await token.getVotes(bob.address)).toString());

  // 2. Tạo kỳ bầu cử 2 ghế, 3 ứng viên
  console.log("\n[Bước 2] Tạo kỳ bầu cử...");
  const createTx = await election.createElection("Bau HDQT 2027", 2);
  await createTx.wait();
  console.log("  createElection - tx:", createTx.hash);

  const candidates = ["Nguyen Van A", "Tran Thi B", "Le Van C"];
  for (const name of candidates) {
    const addTx = await election.addCandidate(1, name, "ipfs://demo-" + name.replace(/ /g, "-"));
    await addTx.wait();
    console.log(`  addCandidate "${name}" - tx:`, addTx.hash);
  }

  // 3. Mở phiên bỏ phiếu (60 giây)
  console.log("\n[Bước 3] Mở phiên bỏ phiếu (60 giây)...");
  const startTx = await election.startVoting(1, 60n);
  await startTx.wait();
  console.log("  startVoting - tx:", startTx.hash);

  const [, , , snapshotBlock, endTime] = await election.getElection(1);
  console.log("  snapshotBlock:", snapshotBlock.toString());
  console.log("  endTime      :", new Date(Number(endTime) * 1000).toISOString());

  // Hiển thị quyền bầu cử
  const alicePower = await election.votingPowerOf(1, alice.address);
  const bobPower = await election.votingPowerOf(1, bob.address);
  console.log("  Alice votingPower:", alicePower.toString(), "phiếu (60cp × 2 ghế)");
  console.log("  Bob   votingPower:", bobPower.toString(), "phiếu (40cp × 2 ghế)");

  // 4. Bỏ phiếu bầu dồn
  console.log("\n[Bước 4] Bỏ phiếu bầu dồn...");
  // Alice: A=70, B=50 (tổng 120 = 60x2)
  const t1 = await election.connect(alice).vote(1, [0n, 1n], [70n, 50n]);
  await t1.wait();
  console.log("  Alice vote [A=70, B=50] - tx:", t1.hash);

  // Bob: C=80 (tổng 80 = 40x2)
  const t2 = await election.connect(bob).vote(1, [2n], [80n]);
  await t2.wait();
  console.log("  Bob   vote [C=80] - tx:", t2.hash);

  // 5. Chờ hết hạn rồi đóng phiên
  console.log("\n[Bước 5] Chờ hết thời hạn bỏ phiếu (tăng thời gian local)...");
  const evm = ethers.provider as any;
  await evm.send("evm_increaseTime", [61]);
  await evm.send("evm_mine", []);

  const closeTx = await election.closeElection(1);
  await closeTx.wait();
  console.log("  closeElection - tx:", closeTx.hash);

  // 6. Đọc kết quả
  console.log("\n[Bước 6] Kết quả bầu cử...");
  const [winners, tied] = await election.getWinners(1);
  console.log("Ứng viên trúng cử (ID):", winners.map((w: bigint) => Number(w)), "| Đồng phiếu:", tied);
  for (const id of winners) {
    const [name, , votes] = await election.getCandidate(1, id);
    console.log(` - #${id} ${name}: ${votes} phiếu`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("DEMO HOÀN THÀNH!");
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
