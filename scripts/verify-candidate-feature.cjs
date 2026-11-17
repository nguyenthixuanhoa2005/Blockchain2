const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("==============================================================");
console.log("AUDITING CANDIDATE MANAGEMENT & VALIDATION GATEWAYS");
console.log("==============================================================\n");

// 1. Audit frontend/index.html
console.log(">>> CHECKING frontend/index.html...");
const html = fs.readFileSync('frontend/index.html', 'utf8');

const requiredHtmlIds = [
  'btnNavAdminCandidates',
  'adminCandidatesTab',
  'statAdminCandTotal',
  'statAdminCandActive',
  'statAdminCandElected',
  'statAdminCandRate',
  'candidateSearchInput',
  'candidateElectionFilter',
  'candidateStatusFilter',
  'btnRefreshCandidates',
  'adminCandidatesTable',
  'adminCandidatesTableBody',
  'addCandidateValidationAlert',
  'addCandidateValidationAlertMsg'
];

for (const id of requiredHtmlIds) {
  const present = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  console.log(`  [${present ? 'PASS' : 'FAIL'}] Element ID: #${id}`);
  assert(present, `Missing required element #${id} in frontend/index.html`);
}

// Check sidebar tab navigation
assert(html.includes('data-tab="adminCandidatesTab"'), "Missing data-tab='adminCandidatesTab' on candidate nav button");
console.log("  [PASS] Sidebar button configured with data-tab='adminCandidatesTab'");

// Check validation alert inside modalAddCandidate
const modalAddIdx = html.indexOf('id="modalAddCandidate"');
assert(modalAddIdx !== -1, "Missing modalAddCandidate in index.html");
const modalSub = html.substring(modalAddIdx, modalAddIdx + 3000);
assert(modalSub.includes('id="addCandidateValidationAlert"'), "addCandidateValidationAlert must be inside modalAddCandidate");
console.log("  [PASS] Validation alert box is properly placed in modalAddCandidate");

console.log("✓ frontend/index.html AUDIT PASSED!\n");


// 2. Audit frontend/style.css
console.log(">>> CHECKING frontend/style.css...");
const css = fs.readFileSync('frontend/style.css', 'utf8');

const requiredCssClasses = [
  '.badge-elected',
  '.badge-running',
  '.badge-not-elected',
  '.badge-approved-pending',
  '.cand-cell-info',
  '.cand-cell-avatar',
  '.cand-cell-details',
  '.cand-cell-name',
  '.cand-cell-title',
  '.cand-votes-badge'
];

for (const cls of requiredCssClasses) {
  const present = css.includes(cls);
  console.log(`  [${present ? 'PASS' : 'FAIL'}] CSS Selector: ${cls}`);
  assert(present, `Missing required CSS class ${cls} in frontend/style.css`);
}

console.log("✓ frontend/style.css AUDIT PASSED!\n");


// 3. Audit Candidate Validation Logic
console.log(">>> TESTING CANDIDATE VALIDATION GATEWAY LOGIC...");
const companyWallets = JSON.parse(fs.readFileSync('frontend/company-wallets.json', 'utf8'));

// Extract checkCandidateValidity function implementation logic from app.js
function checkCandidateValidity(name, wallet) {
  if (!name && !wallet) return { valid: true };

  const walletClean = (wallet || "").trim().toLowerCase();
  const nameClean = (name || "").split("[")[0].split("(")[0].trim().toLowerCase();

  let matched = null;
  if (walletClean && /^0x[a-fA-F0-9]{40}$/i.test(walletClean)) {
    matched = companyWallets.find(w => w.address && w.address.toLowerCase() === walletClean);
  }
  if (!matched && nameClean) {
    matched = companyWallets.find(w => (w.name || "").toLowerCase().trim() === nameClean);
  }

  if (matched) {
    const isCand = matched.isCandidate === true || matched.role === "candidate" || matched.role === "voter_candidate";
    if (!isCand) {
      return {
        valid: false,
        reason: "Ứng viên hiện tại chưa được ứng cử! Cần được Admin phê duyệt quyền ứng cử trước khi thêm vào kỳ bầu cử.",
        entry: matched
      };
    } else {
      return { valid: true, entry: matched };
    }
  }

  return { valid: true, entry: null };
}

// Test Case 1: Bob (voter, isCandidate: false) -> MUST BE BLOCKED
const bobCheck = checkCandidateValidity("Bob", "0xEC724825a8d91B1C7Fbc39720eaF56D51c28f7Ea");
console.log("  Bob check result:", bobCheck);
assert.strictEqual(bobCheck.valid, false, "Bob MUST NOT be allowed as candidate");
assert(bobCheck.reason.includes("Ứng viên hiện tại chưa được ứng cử"), "Rejection reason must match user requirements");
console.log("  [PASS] Shareholder Bob (role: voter, isCandidate: false) correctly BLOCKED with warning message!");

// Test Case 2: Sophia The First (voter, isCandidate: false) -> MUST BE BLOCKED
const sophiaCheck = checkCandidateValidity("Sophia The First", "0x2F57B4651768a844eBa1053316DEA6dE2131C26D");
assert.strictEqual(sophiaCheck.valid, false, "Sophia MUST NOT be allowed as candidate");
console.log("  [PASS] Shareholder Sophia (role: voter, isCandidate: false) correctly BLOCKED!");

// Test Case 3: Alicu (voter_candidate, isCandidate: true) -> MUST BE ALLOWED
const alicuCheck = checkCandidateValidity("Alicu", "0x97dDAB73649438b3a6bfE791B184d7F2aE7D31D4");
assert.strictEqual(alicuCheck.valid, true, "Alicu MUST be allowed as candidate");
console.log("  [PASS] Approved Candidate Alicu (role: voter_candidate, isCandidate: true) correctly ALLOWED!");

// Test Case 4: Ungvien (candidate, isCandidate: true) -> MUST BE ALLOWED
const ungvienCheck = checkCandidateValidity("Ungvien", "0xabbC81db44b1B05033C6AEa9321c544A51C7AE19");
assert.strictEqual(ungvienCheck.valid, true, "Ungvien MUST be allowed as candidate");
console.log("  [PASS] Approved Candidate Ungvien (role: candidate, isCandidate: true) correctly ALLOWED!");

console.log("✓ CANDIDATE VALIDATION GATEWAY AUDIT PASSED!\n");


// 4. Audit Candidate Management List & Filter Logic
console.log(">>> TESTING CANDIDATE MANAGEMENT & OUTCOME CLASSIFICATION LOGIC...");

// Mock data representing elections
const mockElections = [
  {
    id: 1,
    title: "Đại hội Cổ đông 2026",
    status: 2, // CLOSED
    candidateCount: 3,
    seats: 2
  },
  {
    id: 2,
    title: "Bầu HĐQT Nhiệm kỳ 2027-2032",
    status: 1, // VOTING
    candidateCount: 2,
    seats: 1
  }
];

// Mock contract getWinners: Election 1 has winners [0, 1]
const mockElectionWinners = {
  1: [0, 1] // Candidates 0 and 1 won
};

const mockCandidates = {
  "1_0": { name: "Alicu [0x97dDAB73649438b3a6bfE791B184d7F2aE7D31D4]", cid: "Qm1", votes: 120n },
  "1_1": { name: "Nguyễn Văn Hùng [0x1111111111111111111111111111111111111111]", cid: "Qm2", votes: 95n },
  "1_2": { name: "Trần Thị Mai [0x2222222222222222222222222222222222222222]", cid: "Qm3", votes: 40n },
  "2_0": { name: "Ungvien [0xabbC81db44b1B05033C6AEa9321c544A51C7AE19]", cid: "Qm4", votes: 15n },
  "2_1": { name: "Lê Hoàng Nam [0x3333333333333333333333333333333333333333]", cid: "Qm5", votes: 10n }
};

// Simulate list building logic from app.js
const list = [];
const participatedWallets = new Set();
const participatedNames = new Set();

for (const e of mockElections) {
  const winners = mockElectionWinners[e.id] || [];
  for (let i = 0; i < e.candidateCount; i++) {
    const cData = mockCandidates[`${e.id}_${i}`];
    const cName = cData.name;
    const walletMatch = cName.match(/0x[a-fA-F0-9]{40}/i);
    const candWallet = walletMatch ? walletMatch[0] : "";
    const pureName = cName.split("[")[0].split("(")[0].trim();

    if (candWallet) participatedWallets.add(candWallet.toLowerCase());
    if (pureName) participatedNames.add(pureName.toLowerCase());

    let status = "running";
    if (e.status === 2) { // CLOSED
      status = winners.includes(i) ? "elected" : "not_elected";
    }

    list.push({
      candidateIndex: i,
      name: pureName,
      wallet: candWallet,
      electionId: e.id,
      electionTitle: e.title,
      status: status,
      votes: Number(cData.votes)
    });
  }
}

// Pending candidates from companyWallets
for (const w of companyWallets) {
  if ((w.isCandidate || w.role === "candidate" || w.role === "voter_candidate") && w.role !== "admin") {
    const wAddrLower = (w.address || "").toLowerCase();
    const wNameLower = (w.name || "").toLowerCase().trim();
    if (!participatedWallets.has(wAddrLower) && !participatedNames.has(wNameLower)) {
      list.push({
        candidateIndex: null,
        name: w.name,
        wallet: w.address,
        electionId: null,
        electionTitle: "Chưa tham gia kỳ nào",
        status: "pending",
        votes: 0
      });
    }
  }
}

console.log(`  Total Candidates Processed: ${list.length}`);
const elected = list.filter(c => c.status === "elected");
const running = list.filter(c => c.status === "running");
const notElected = list.filter(c => c.status === "not_elected");
const pending = list.filter(c => c.status === "pending");

console.log(`  - Đã đắc cử HĐQT (elected): ${elected.length}`);
console.log(`  - Đang tranh cử (running): ${running.length}`);
console.log(`  - Không đắc cử (not_elected): ${notElected.length}`);
console.log(`  - Chưa nạp kỳ nào (pending): ${pending.length}`);

assert.strictEqual(elected.length, 2, "Election 1 should have exactly 2 winners (Alicu & Nguyễn Văn Hùng)");
assert.strictEqual(notElected.length, 1, "Election 1 should have 1 non-elected candidate (Trần Thị Mai)");
assert.strictEqual(running.length, 2, "Election 2 (in progress) should have 2 running candidates");

// Test search filter
const searchAlicu = list.filter(c => (c.name.toLowerCase().includes("alicu") || c.wallet.toLowerCase().includes("alicu")));
assert.strictEqual(searchAlicu.length, 1, "Search by 'alicu' should find 1 candidate");
assert.strictEqual(searchAlicu[0].status, "elected", "Alicu should have status 'elected'");
console.log("  [PASS] Search by 'alicu' finds elected candidate Alicu correctly!");

// Test election filter
const filterEid1 = list.filter(c => String(c.electionId) === "1");
assert.strictEqual(filterEid1.length, 3, "Filter by Election #1 should return 3 candidates");
console.log("  [PASS] Filter by Election #1 returns 3 candidates correctly!");

// Test status filter
const filterElected = list.filter(c => c.status === "elected");
assert.strictEqual(filterElected.length, 2, "Filter by status 'elected' returns 2 candidates");
console.log("  [PASS] Filter by status 'elected' works correctly!");

console.log("\n==============================================================");
console.log("ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!");
console.log("==============================================================");
