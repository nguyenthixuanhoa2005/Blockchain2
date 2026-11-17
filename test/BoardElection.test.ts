import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers } = await network.create();

const DURATION = 3600; // 1 giờ

// ===================== FIXTURE =====================

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [admin, alice, bob, carol, dave, eve] = signers;

  const TokenFactory = await ethers.getContractFactory("ShareToken");
  const token = await TokenFactory.deploy(admin.address);
  await token.waitForDeployment();

  const ElectionFactory = await ethers.getContractFactory("BoardElection");
  const election = await ElectionFactory.deploy(await token.getAddress(), admin.address);
  await election.waitForDeployment();

  // Cơ cấu cổ phần: alice 60, bob 25, carol 35 (tổng 120)
  await token.mint(alice.address, 60n);
  await token.mint(bob.address, 25n);
  await token.mint(carol.address, 35n);

  return { token, election, admin, alice, bob, carol, dave, eve };
}

// Kỳ bầu cử 3 ghế, 5 ứng viên (id 0..4), đã mở phiên bỏ phiếu
async function votingFixture() {
  const ctx = await deployFixture();
  const { election } = ctx;

  await election.createElection("Bau HDQT 2027", 3);
  for (const n of ["A", "B", "C", "D", "E"]) {
    await election.addCandidate(1, n, "ipfs://cid-" + n);
  }
  await election.startVoting(1, DURATION);

  return ctx;
}

// ===================== TESTS =====================

describe("ShareToken", function () {
  it("TC01 - Kiểm tra decimals của ShareToken", async function () {
    const { token } = await deployFixture();
    expect(await token.decimals()).to.equal(0n);
  });

  it("TC02 - Admin mint cổ phần: số dư = 60; tự ủy quyền; getVotes = 60", async function () {
    const { token, alice } = await deployFixture();
    expect(await token.balanceOf(alice.address)).to.equal(60n);
    expect(await token.getVotes(alice.address)).to.equal(60n);
  });

  it("TC03 - Mint bởi tài khoản không có MINTER_ROLE bị revert", async function () {
    const { token, eve } = await deployFixture();
    await expect(token.connect(eve).mint(eve.address, 100n)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("TC04 - Chuyển token cập nhật quyền biểu quyết: Alice 50, Dave 10", async function () {
    const { token, alice, dave } = await deployFixture();
    await token.connect(alice).transfer(dave.address, 10n);
    expect(await token.getVotes(alice.address)).to.equal(50n);
    expect(await token.getVotes(dave.address)).to.equal(10n);
  });
});

describe("BoardElection - Quản trị", function () {
  it("TC05 - Admin tạo kỳ bầu cử: phát ElectionCreated; trạng thái Registration", async function () {
    const { election } = await deployFixture();
    await expect(election.createElection("Bau HDQT 2027", 3))
      .to.emit(election, "ElectionCreated")
      .withArgs(1n, "Bau HDQT 2027", 3n);
    const [, , status] = await election.getElection(1);
    expect(status).to.equal(1n); // Status.Registration = 1
  });

  it("TC06 - Tạo kỳ bầu cử bởi người không có quyền bị revert", async function () {
    const { election, eve } = await deployFixture();
    await expect(
      election.connect(eve).createElection("x", 3)
    ).to.be.revertedWithCustomError(election, "AccessControlUnauthorizedAccount");
  });

  it("TC07 - Số ghế bằng 0 bị revert", async function () {
    const { election } = await deployFixture();
    await expect(election.createElection("x", 0)).to.be.revertedWith("Seats must be > 0");
  });

  it("TC08 - Thêm ứng viên: phát CandidateAdded; đọc lại đúng tên, CID, 0 phiếu", async function () {
    const { election } = await deployFixture();
    await election.createElection("Bau HDQT 2027", 3);
    await expect(election.addCandidate(1, "Nguyen Van A", "ipfs://cid-a"))
      .to.emit(election, "CandidateAdded")
      .withArgs(1n, 0n, "Nguyen Van A");
    const [name, cid, votes] = await election.getCandidate(1, 0);
    expect(name).to.equal("Nguyen Van A");
    expect(cid).to.equal("ipfs://cid-a");
    expect(votes).to.equal(0n);
  });

  it("TC09 - Thêm ứng viên bởi người không có quyền bị revert", async function () {
    const { election, eve } = await deployFixture();
    await election.createElection("x", 1);
    await expect(
      election.connect(eve).addCandidate(1, "Eve", "cid")
    ).to.be.revertedWithCustomError(election, "AccessControlUnauthorizedAccount");
  });

  it("TC10 - Mở phiên khi thiếu ứng viên (3 ghế, 1 ứng viên) bị revert", async function () {
    const { election } = await deployFixture();
    await election.createElection("x", 3);
    await election.addCandidate(1, "A", "cid");
    await expect(election.startVoting(1, DURATION)).to.be.revertedWith("Not enough candidates");
  });

  it("TC11 - Mở phiên hợp lệ: trạng thái Voting; snapshotBlock đúng", async function () {
    const { election } = await deployFixture();
    await election.createElection("x", 1);
    await election.addCandidate(1, "A", "cid");
    const tx = await election.startVoting(1, DURATION);
    const receipt = await tx.wait();
    const blockNumber = receipt!.blockNumber;
    const [, , status, snapshotBlock] = await election.getElection(1);
    expect(status).to.equal(2n); // Status.Voting = 2
    expect(snapshotBlock).to.equal(BigInt(blockNumber - 1));
  });

  it("TC12 - Thêm ứng viên sau khi mở phiên bị revert", async function () {
    const { election } = await votingFixture();
    await expect(
      election.addCandidate(1, "F", "cid-f")
    ).to.be.revertedWith("Invalid election status");
  });
});

describe("BoardElection - Bỏ phiếu", function () {
  it("TC13 - Bỏ phiếu hợp lệ bằng đúng số phiếu tối đa (Alice 60cp x 3 ghế = 180)", async function () {
    const { election, alice } = await votingFixture();
    await expect(election.connect(alice).vote(1, [0, 1], [90n, 90n]))
      .to.emit(election, "VoteCast")
      .withArgs(1n, alice.address, 180n);
    const [, , votes0] = await election.getCandidate(1, 0);
    const [, , votes1] = await election.getCandidate(1, 1);
    expect(votes0).to.equal(90n);
    expect(votes1).to.equal(90n);
    expect(await election.hasVotedCheck(1, alice.address)).to.equal(true);
  });

  it("TC14 - Bỏ phiếu lần hai bị revert Already voted", async function () {
    const { election, alice } = await votingFixture();
    await election.connect(alice).vote(1, [0], [90n]);
    await expect(
      election.connect(alice).vote(1, [1], [90n])
    ).to.be.revertedWith("Already voted");
  });

  it("TC15 - Người không có cổ phần (Dave) bỏ phiếu bị revert No voting power", async function () {
    const { election, dave } = await votingFixture();
    await expect(
      election.connect(dave).vote(1, [0], [1n])
    ).to.be.revertedWith("No voting power");
  });

  it("TC16 - Dồn vượt số phiếu tối đa (Bob 75 phiếu, dồn 76) bị revert", async function () {
    const { election, bob } = await votingFixture();
    await expect(
      election.connect(bob).vote(1, [0], [76n])
    ).to.be.revertedWith("Exceeds voting power");
  });

  it("TC17 - Ứng viên trùng / không tăng dần bị revert", async function () {
    const { election, alice } = await votingFixture();
    await expect(
      election.connect(alice).vote(1, [1n, 1n], [45n, 45n])
    ).to.be.revertedWith("Ids must be ascending");
    await expect(
      election.connect(alice).vote(1, [2n, 1n], [45n, 45n])
    ).to.be.revertedWith("Ids must be ascending");
  });

  it("TC18 - Ứng viên không tồn tại bị revert Candidate not found", async function () {
    const { election, alice } = await votingFixture();
    await expect(
      election.connect(alice).vote(1, [99n], [1n])
    ).to.be.revertedWith("Candidate not found");
  });

  it("TC19 - Nhận cổ phần sau snapshot bị revert No voting power", async function () {
    const { token, election, dave } = await votingFixture();
    // Phiên đã mở (snapshot đã chốt), Dave nhận token sau snapshot
    await token.mint(dave.address, 1000n);
    await expect(
      election.connect(dave).vote(1, [0], [1n])
    ).to.be.revertedWith("No voting power");
  });

  it("TC20 - Chuyển token sau snapshot: người nhận không được cộng quyền, người gửi giữ nguyên", async function () {
    const { token, election, alice, dave } = await votingFixture();
    await token.connect(alice).transfer(dave.address, 60n);
    await expect(
      election.connect(dave).vote(1, [0], [1n])
    ).to.be.revertedWith("No voting power");
    await expect(
      election.connect(alice).vote(1, [0], [180n])
    ).to.emit(election, "VoteCast");
  });

  it("TC21 - Bỏ phiếu sau hạn bị revert Voting ended", async function () {
    const { election, alice } = await votingFixture();
    // Tăng thời gian lên quá endTime
    const evm = ethers.provider as any;
    await evm.send("evm_increaseTime", [DURATION + 10]);
    await evm.send("evm_mine", []);
    await expect(
      election.connect(alice).vote(1, [0], [90n])
    ).to.be.revertedWith("Voting ended");
  });

  it("TC22 - Bỏ phiếu khi chưa mở phiên (Registration) bị revert", async function () {
    const { election, alice } = await deployFixture();
    await election.createElection("x", 1);
    await election.addCandidate(1, "A", "cid");
    await expect(
      election.connect(alice).vote(1, [0], [1n])
    ).to.be.revertedWith("Invalid election status");
  });

  it("TC23 - Tấn công bỏ phiếu 2 lần trong 1 giao dịch (DoubleVoter) bị chặn", async function () {
    const { token, election } = await deployFixture();
    const DoubleVoterFactory = await ethers.getContractFactory("DoubleVoter");
    const attacker = await DoubleVoterFactory.deploy();
    await attacker.waitForDeployment();

    await token.mint(await attacker.getAddress(), 10n);
    await election.createElection("x", 1);
    await election.addCandidate(1, "A", "cid");
    await election.startVoting(1, DURATION);

    await expect(
      attacker.attack(await election.getAddress(), 1, [0n], [5n])
    ).to.be.revertedWith("Already voted");

    const [, , votes] = await election.getCandidate(1, 0);
    expect(votes).to.equal(0n);
  });
});

describe("BoardElection - Đóng phiên & Kết quả", function () {
  it("TC24 - Đóng phiên trước hạn / sai quyền bị revert; Admin đóng sau hạn thành công", async function () {
    const { election, eve } = await votingFixture();

    // Đóng sớm
    await expect(election.closeElection(1)).to.be.revertedWith("Voting not ended");

    // Eve đóng sau hạn - không có quyền
    const evm = ethers.provider as any;
    await evm.send("evm_increaseTime", [DURATION + 10]);
    await evm.send("evm_mine", []);
    await expect(election.connect(eve).closeElection(1)).to.be.revertedWithCustomError(
      election,
      "AccessControlUnauthorizedAccount"
    );

    // Admin đóng sau hạn - thành công
    await expect(election.closeElection(1)).to.emit(election, "ElectionClosed").withArgs(1n);
  });

  it("TC25 - Xem kết quả khi chưa đóng phiên bị revert", async function () {
    const { election } = await votingFixture();
    await expect(election.getWinners(1)).to.be.revertedWith("Invalid election status");
  });

  it("TC26 - Kịch bản bầu dồn: cổ đông thiểu số (29%) vẫn giành được 1 ghế", async function () {
    const { election, alice, bob, carol } = await votingFixture();
    await election.connect(alice).vote(1, [0n, 1n], [90n, 90n]); // A=90, B=90
    await election.connect(bob).vote(1, [3n], [75n]);              // D=75
    await election.connect(carol).vote(1, [4n], [105n]);           // E=105

    const evm = ethers.provider as any;
    await evm.send("evm_increaseTime", [DURATION + 10]);
    await evm.send("evm_mine", []);
    await election.closeElection(1);

    const [winners, tied] = await election.getWinners(1);
    const winnerIds = winners.map((w: bigint) => Number(w)).sort((a: number, b: number) => a - b);
    expect(winnerIds).to.deep.equal([0, 1, 4]); // A, B, E trúng cử
    expect(Number(winners[0])).to.equal(4); // E nhiều phiếu nhất đứng đầu
    expect(tied).to.equal(false);
  });

  it("TC27 - Phát hiện đồng phiếu (1 ghế, 2 ứng viên cùng 25 phiếu): tied = true", async function () {
    const { token, election, alice, bob } = await deployFixture();
    await election.createElection("Tied", 1);
    await election.addCandidate(1, "X", "cid-x");
    await election.addCandidate(1, "Y", "cid-y");
    await election.startVoting(1, DURATION);

    // Alice (60cp x 1 ghế = 60 phiếu) dồn 25 cho X
    await election.connect(alice).vote(1, [0n], [25n]);
    // Bob (25cp x 1 ghế = 25 phiếu) dồn 25 cho Y
    await election.connect(bob).vote(1, [1n], [25n]);

    const evm = ethers.provider as any;
    await evm.send("evm_increaseTime", [DURATION + 10]);
    await evm.send("evm_mine", []);
    await election.closeElection(1);

    const [, tied] = await election.getWinners(1);
    expect(tied).to.equal(true);
  });

  it("TC28 - Tạm dừng hệ thống: vote bị chặn; sau unpause vote thành công", async function () {
    const { election, alice, eve } = await votingFixture();

    // Eve không có quyền pause
    await expect(election.connect(eve).pause()).to.be.revertedWithCustomError(
      election,
      "AccessControlUnauthorizedAccount"
    );

    // Admin pause
    await election.pause();

    // Vote bị chặn
    await expect(
      election.connect(alice).vote(1, [0n], [90n])
    ).to.be.revertedWithCustomError(election, "EnforcedPause");

    // Unpause và vote thành công
    await election.unpause();
    await expect(
      election.connect(alice).vote(1, [0n], [90n])
    ).to.emit(election, "VoteCast");
  });

  it("TC29 - Khởi tạo với địa chỉ 0 bị revert Zero address", async function () {
    const { token } = await deployFixture();
    const ElectionFactory = await ethers.getContractFactory("BoardElection");
    await expect(
      ElectionFactory.deploy(await token.getAddress(), "0x0000000000000000000000000000000000000000")
    ).to.be.revertedWith("Zero address");
    await expect(
      ElectionFactory.deploy("0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000")
    ).to.be.revertedWith("Zero address");
  });

  it("TC30 - Giới hạn số ứng viên: ứng viên thứ 51 bị revert Too many candidates", async function () {
    const { election } = await deployFixture();
    await election.createElection("MaxTest", 1);
    // Thêm 50 ứng viên
    for (let i = 0; i < 50; i++) {
      await election.addCandidate(1, `Candidate ${i}`, `cid-${i}`);
    }
    // Ứng viên thứ 51 bị revert
    await expect(
      election.addCandidate(1, "Candidate 51", "cid-51")
    ).to.be.revertedWith("Too many candidates");
  });
});
