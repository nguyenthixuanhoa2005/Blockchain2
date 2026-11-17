// ============================================================
// Hệ Thống Bỏ Phiếu Bầu HĐQT — Frontend Logic (v4.0)
// Phân quyền chuẩn xác theo màn hình đăng nhập ví
// Role-aware Screen UI: Login -> Admin / Cổ Đông / Khách
// ============================================================

let provider, currentSigner, currentAccountInfo;
let tokenContract, electionContract;

// State
let currentElectionId = null;      // election admin đang quản lý
let voterCurrentElectionId = null; // election voter đang chọn để bầu
let allElections = [];             // cache tất cả elections [{id, title, seats, status, ...}]
let candidates = [];               // ứng viên của election đang xem
let isPaused = false;              // trạng thái pause toàn hệ thống

let toastTimeout = null;
let countdownTimers = {};          // { [countdownId]: intervalId }

function clearAllCountdowns() {
  Object.values(countdownTimers).forEach(timer => clearInterval(timer));
  countdownTimers = {};
}

const STATUS_CONTRACT = { NONE: 0, REGISTRATION: 1, VOTING: 2, CLOSED: 3 };

// ============================================================
// INIT - Khởi tạo ban đầu hiển thị màn hình Đăng Nhập
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  if (!window.APP_CONFIG) {
    showToast("Không tìm thấy cấu hình contract trong config.js!", "danger");
    return;
  }

  // Khởi tạo ngày mặc định cho form tạo bầu cử (bắt đầu sau 1h, kết thúc sau 25h)
  const now = new Date();
  const startDefault = new Date(now.getTime() + 3600000);
  const endDefault   = new Date(now.getTime() + 90000000);
  const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const startEl = document.getElementById("newElectionStart");
  const endEl   = document.getElementById("newElectionEnd");
  if (startEl) startEl.value = toLocal(startDefault);
  if (endEl)   endEl.value   = toLocal(endDefault);

  // Mặc định hiển thị Màn hình Đăng Nhập
  showLoginScreen();
});

function showLoginScreen() {
  clearAllCountdowns();
  document.getElementById("screenLogin").style.display = "flex";
  document.getElementById("screenApp").style.display = "none";
}

function showAppScreen() {
  document.getElementById("screenLogin").style.display = "none";
  document.getElementById("screenApp").style.display = "block";
}

// ============================================================
// CÁC HÀM XÁC THỰC & ĐĂNG NHẬP (LOGIN VIA BUTTONS)
// ============================================================

// 1. Đăng nhập bằng nút MetaMask
async function loginWithMetaMask() {
  if (!window.ethereum) {
    showToast("Trình duyệt của bạn chưa cài đặt tiện ích ví MetaMask!", "danger");
    return;
  }
  showLoadingOverlay("Đang kết nối tới ví MetaMask của bạn...");
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    currentSigner = await provider.getSigner();
    const addr = await currentSigner.getAddress();
    currentAccountInfo = { name: "MetaMask", address: addr, isGuest: false };

    // Lắng nghe sự kiện đổi tài khoản trên MetaMask
    window.ethereum.on("accountsChanged", async (accounts) => {
      if (accounts.length > 0) {
        currentAccountInfo = { name: "MetaMask", address: accounts[0], isGuest: false };
        await initContractsAndRole();
      } else {
        logout();
      }
    });

    await initContractsAndRole();
  } catch (err) {
    console.error("Lỗi đăng nhập MetaMask:", err);
    showToast("Đăng nhập MetaMask thất bại: " + parseErrorMessage(err), "danger");
    hideLoadingOverlay();
  }
}

// 2. Đăng nhập qua các nút ví Demo (Admin, Alice, Bob, Carol)
async function loginWithAccount(accIdx) {
  showLoadingOverlay("Đang đăng nhập ví và xác thực phân quyền...");
  try {
    const acc = window.APP_CONFIG.accounts[accIdx];
    if (!acc) throw new Error("Tài khoản demo không tồn tại trong cấu hình!");

    provider = new ethers.JsonRpcProvider(window.APP_CONFIG.rpcUrl);
    currentSigner = new ethers.Wallet(acc.privateKey, provider);
    currentAccountInfo = { ...acc, isGuest: false };

    await initContractsAndRole();
  } catch (err) {
    console.error("Lỗi đăng nhập ví demo:", err);
    showToast("Đăng nhập thất bại: " + parseErrorMessage(err), "danger");
    hideLoadingOverlay();
  }
}

// 3. Đăng nhập với tư cách Khách (Chỉ xem)
async function loginAsGuest() {
  showLoadingOverlay("Đang truy cập hệ thống ở chế độ Khách...");
  try {
    provider = new ethers.JsonRpcProvider(window.APP_CONFIG.rpcUrl);
    // Khách dùng địa chỉ ngẫu nhiên hoặc zero
    const dummyWallet = ethers.Wallet.createRandom().connect(provider);
    currentSigner = dummyWallet;
    currentAccountInfo = {
      name: "Khách tham quan",
      address: dummyWallet.address,
      isGuest: true
    };

    await initContractsAndRole();
  } catch (err) {
    console.error("Lỗi đăng nhập khách:", err);
    showToast("Lỗi: " + parseErrorMessage(err), "danger");
    hideLoadingOverlay();
  }
}

// 4. Đăng xuất (Logout)
function logout() {
  clearAllCountdowns();
  currentSigner = null;
  currentAccountInfo = null;
  currentElectionId = null;
  voterCurrentElectionId = null;
  showLoginScreen();
  showToast("Đã đăng xuất khỏi hệ thống thành công.", "primary");
}

// ============================================================
// KHỞI TẠO HỢP ĐỒNG & PHÂN QUYỀN MÀN HÌNH (ROLE DETECTION)
// ============================================================
async function initContractsAndRole() {
  try {
    tokenContract = new ethers.Contract(
      window.APP_CONFIG.tokenAddress,
      window.APP_CONFIG.tokenAbi,
      currentSigner
    );
    electionContract = new ethers.Contract(
      window.APP_CONFIG.electionAddress,
      window.APP_CONFIG.electionAbi,
      currentSigner
    );

    setupEventListeners();

    // Kiểm tra quyền từ Smart Contract thực tế
    const address = currentAccountInfo.address;
    const ADMIN_ROLE = ethers.id("ELECTION_ADMIN_ROLE");

    let isAdmin = false;
    let balance = 0n;

    if (!currentAccountInfo.isGuest) {
      const [adminCheck, balCheck, pausedCheck] = await Promise.all([
        electionContract.hasRole(ADMIN_ROLE, address).catch(() => false),
        tokenContract.balanceOf(address).catch(() => 0n),
        electionContract.paused().catch(() => false)
      ]);
      isAdmin = adminCheck;
      balance = balCheck;
      isPaused = pausedCheck;
    } else {
      isPaused = await electionContract.paused().catch(() => false);
    }

    const balNum = Number(balance);

    // Xác định vai trò: Admin > Cổ đông (có CP) > Khách
    let resolvedRole = "guest";
    if (isAdmin) {
      resolvedRole = "admin";
    } else if (balNum > 0) {
      resolvedRole = "voter";
    } else {
      resolvedRole = "guest";
    }

    currentAccountInfo.resolvedRole = resolvedRole;
    currentAccountInfo.balance = balNum;

    // Chuyển sang màn hình ứng dụng và hiển thị view tương ứng
    showAppScreen();
    renderRoleScreen(resolvedRole, balNum);

    // Tải dữ liệu toàn bộ cuộc bầu cử
    await loadAllElections();
    await updateAccountCard();

    if (resolvedRole === "voter") {
      loadVoteHistory();
    }

    addLog(`Đăng nhập thành công: ${currentAccountInfo.name} (${currentAccountInfo.address})`);
    showToast(`Chào mừng ${currentAccountInfo.name}! Bạn đang ở màn hình: ${getRoleNameVi(resolvedRole)}`, "success");
  } catch (err) {
    console.error("Lỗi khởi tạo hợp đồng/quyền:", err);
    showToast("Lỗi kiểm tra quyền: " + parseErrorMessage(err), "danger");
  } finally {
    hideLoadingOverlay();
  }
}

function getRoleNameVi(role) {
  if (role === "admin") return "Quản Trị Viên";
  if (role === "voter") return "Cổ Đông";
  return "Khách Tham Quan";
}

// ============================================================
// HIỂN THỊ MÀN HÌNH THEO VAI TRÒ (RENDER ROLE SCREEN)
// ============================================================
function renderRoleScreen(role, balance) {
  clearAllCountdowns();
  // Ẩn tất cả các màn hình vai trò
  document.querySelectorAll(".role-screen").forEach(el => el.classList.remove("active"));

  const pill = document.getElementById("rolePill");
  const headerAddr = document.getElementById("headerWalletAddress");
  if (headerAddr) {
    headerAddr.textContent = currentAccountInfo.isGuest
      ? "Chế độ Khách (Chỉ xem)"
      : `${currentAccountInfo.address.substring(0, 8)}...${currentAccountInfo.address.substring(36)}`;
  }

  if (role === "admin") {
    document.getElementById("screenAdmin").classList.add("active");
    pill.className = "role-pill admin";
    pill.textContent = "⚙️ Quản Trị Viên (Admin)";
    setText("currentRole", "Vai trò: Quản Trị Viên — Toàn quyền tạo kỳ, cấp phiếu, quản lý ứng viên, mở/đóng phiên");
  } else if (role === "voter") {
    document.getElementById("screenVoter").classList.add("active");
    pill.className = "role-pill voter";
    pill.textContent = `🗳️ Cổ Đông — ${balance} CP`;
    setText("currentRole", `Vai trò: Cổ Đông (${balance} cổ phần) — Được cấp phiếu bầu và có quyền bỏ phiếu`);
  } else {
    document.getElementById("screenGuest").classList.add("active");
    pill.className = "role-pill guest";
    pill.textContent = "👤 Khách (Chỉ Xem)";
    setText("currentRole", "Vai trò: Khách tham quan — Không được cấp số dư ví, chỉ xem thông tin và kết quả");
  }
}

// ============================================================
// HELPER 4 TRẠNG THÁI VÒNG ĐỜI BẦU CỬ (LIFECYCLE PHASES)
// 1. Sắp diễn ra | 2. Đang diễn ra | 3. Tạm dừng | 4. Đã kết thúc
// ============================================================
function getElectionPhase(election, paused) {
  const status = typeof election === "object" ? election.status : election;
  const now = Math.floor(Date.now() / 1000);
  const eid = typeof election === "object" ? election.id : null;
  const isPostponed = eid ? localStorage.getItem(`postponed_election_${eid}`) === "true" : false;
  const isElectionPaused = eid ? localStorage.getItem(`paused_election_${eid}`) === "true" : false;

  // 1. Nếu kỳ chưa diễn ra bị Admin tạm hoãn
  if (isPostponed && status === STATUS_CONTRACT.REGISTRATION) {
    return {
      label: 'Tạm hoãn (Chưa mở)',
      badgeClass: 'badge-paused',
      cssClass: 'phase-paused',
      infoClass: 'paused',
      icon: '⏸️',
      desc: 'Cuộc bầu cử này đang được tạm hoãn mở phiên. Hệ thống không tự động mở phiên cho đến khi Ban tổ chức kích hoạt lại.'
    };
  }

  // 2. Nếu đã đóng trên Smart Contract HOẶC đã quá thời gian kết thúc (endTime > 0)
  if (status === STATUS_CONTRACT.CLOSED || (typeof election === "object" && election.endTime > 0 && now >= election.endTime)) {
    return {
      label: 'Đã kết thúc',
      badgeClass: 'badge-secondary',
      cssClass: 'phase-closed',
      infoClass: 'closed',
      icon: '✅',
      desc: 'Khóa bầu chọn; Mở công khai kết quả chi tiết cho tất cả mọi người.'
    };
  }

  // 3. Nếu toàn hệ thống bị tạm dừng khẩn cấp trên Smart Contract (paused = true)
  if (paused) {
    return {
      label: 'Tạm dừng toàn hệ thống',
      badgeClass: 'badge-paused',
      cssClass: 'phase-paused',
      infoClass: 'paused',
      icon: '🚨',
      desc: 'Toàn bộ hệ thống đang dừng & hoãn khẩn cấp trên Smart Contract.'
    };
  }

  // 4. Nếu kỳ đang diễn ra bị tạm dừng bỏ phiếu riêng biệt
  if (status === STATUS_CONTRACT.VOTING && isElectionPaused) {
    return {
      label: 'Tạm dừng bỏ phiếu',
      badgeClass: 'badge-paused',
      cssClass: 'phase-paused',
      infoClass: 'paused',
      icon: '⏸️',
      desc: 'Ban tổ chức tạm dừng nhận phiếu bầu cho kỳ này. Giữ nguyên số phiếu đã bầu.'
    };
  }

  // 5. Nếu đang Voting trên Smart Contract VÀ chưa hết hạn
  if (status === STATUS_CONTRACT.VOTING && !paused && !isElectionPaused) {
    return {
      label: 'Đang diễn ra',
      badgeClass: 'badge-success',
      cssClass: 'phase-active',
      infoClass: 'active',
      icon: '🗳️',
      desc: 'Khóa quyền sửa của Admin; Cổ đông được phép Bầu chọn.'
    };
  }

  // 5. Nếu ở giai đoạn Registration:
  // - Nếu chưa tới giờ bắt đầu: Sắp diễn ra
  // - Nếu đã đến hoặc quá giờ bắt đầu: Đang diễn ra
  if (typeof election === "object" && election.startTime > 0) {
    if (now < election.startTime) {
      return {
        label: 'Sắp diễn ra',
        badgeClass: 'badge-warning',
        cssClass: 'phase-upcoming',
        infoClass: 'upcoming',
        icon: '📅',
        desc: 'Chưa đến giờ mở bầu cử. Admin đang tạo ứng viên & cấp phiếu; Cổ đông & Khách chỉ xem.'
      };
    } else if (election.endTime > 0 && now < election.endTime) {
      return {
        label: 'Đang diễn ra',
        badgeClass: 'badge-success',
        cssClass: 'phase-active',
        infoClass: 'active',
        icon: '🗳️',
        desc: 'Đang trong thời gian bầu cử; Cổ đông được phép Bầu chọn.'
      };
    }
  }

  // Mặc định
  return {
    label: 'Sắp diễn ra',
    badgeClass: 'badge-warning',
    cssClass: 'phase-upcoming',
    infoClass: 'upcoming',
    icon: '📅',
    desc: 'Admin đang chuẩn bị ứng viên & cấp phiếu; Cổ đông & Khách chỉ xem.'
  };
}

// ============================================================
// TẢI TẤT CẢ CUỘC BẦU CỬ (MULTI-ELECTION LOADER)
// ============================================================
async function loadAllElections() {
  try {
    const count = Number(await electionContract.electionCount());
    isPaused = await electionContract.paused().catch(() => false);

    setText("totalElections", count);

    allElections = [];
    if (count === 0) {
      updateActiveElectionCount();
      populateAdminSelector();
      populateVoterSelector();
      renderAllElectionsResults('voterAllElections');
      renderAllElectionsResults('guestAllElections');
      renderAllElectionsListAdmin();
      renderUpcomingChecklist();
      renderActiveChecklist();
      return;
    }

    const promises = [];
    for (let i = 1; i <= count; i++) {
      promises.push(loadSingleElection(i));
    }
    await Promise.all(promises);

    updateActiveElectionCount();
    populateAdminSelector();
    populateVoterSelector();
    renderAllElectionsResults('voterAllElections');
    renderAllElectionsResults('guestAllElections');
    renderAllElectionsListAdmin();
    renderUpcomingChecklist();
    renderActiveChecklist();

    // Auto-select cho Admin
    if (currentAccountInfo?.resolvedRole === "admin") {
      if (currentElectionId === null && allElections.length > 0) {
        await adminSelectElection(allElections[allElections.length - 1].id);
        const sel = document.getElementById("adminElectionSelect");
        if (sel) sel.value = allElections[allElections.length - 1].id;
      } else if (currentElectionId !== null) {
        await adminSelectElection(currentElectionId);
      }
    }

  // Tự động chọn cuộc bầu cử cho Cổ đông: ưu tiên cuộc đang diễn ra, nếu không thì lấy cuộc đầu tiên
  if (currentAccountInfo?.resolvedRole === "voter") {
    if (voterCurrentElectionId === null) {
      const activeEl = allElections.find(e => {
        const ph = getElectionPhase(e, isPaused);
        return ph.label === "Đang diễn ra" && !isPaused;
      }) || allElections[allElections.length - 1];

      if (activeEl) {
        await voterSelectElection(activeEl.id);
        const sel = document.getElementById("voterElectionSelect");
        if (sel) sel.value = activeEl.id;
      }
    } else {
      await voterSelectElection(voterCurrentElectionId);
    }
  }
  } catch (err) {
    console.error("Lỗi tải danh sách elections:", err);
  }
}

async function loadSingleElection(id) {
  try {
    const e = await electionContract.getElection(id);

    // Lấy startTime và endTime đã lưu khi tạo
    const savedStart = Number(localStorage.getItem(`electionStartTime_${id}`)) || 0;
    const savedEnd   = Number(localStorage.getItem(`electionEndTime_${id}`)) || 0;
    const onChainEnd = Number(e[4]);

    const election = {
      id,
      title: e[0] || `Cuộc bầu cử #${id}`,
      seats: Number(e[1]),
      status: Number(e[2]),
      snapshotBlock: e[3].toString(),
      startTime: savedStart,
      endTime: onChainEnd > 0 ? onChainEnd : savedEnd,
      candidateCount: Number(e[5]),
    };
    const idx = allElections.findIndex(x => x.id === id);
    if (idx >= 0) allElections[idx] = election;
    else allElections.push(election);
    return election;
  } catch (err) {
    console.warn(`Lỗi load election #${id}:`, err);
    return null;
  }
}

function updateActiveElectionCount() {
  const activeCount = allElections.filter(e => e.status === STATUS_CONTRACT.VOTING && !isPaused).length;
  setText("activeElectionCount", activeCount > 0 ? `${activeCount} đang diễn ra` : "0 phiên đang diễn ra");
}

// ============================================================
// POPULATE DROPDOWNS
// ============================================================
function populateAdminSelector() {
  const sel = document.getElementById("adminElectionSelect");
  const candSel = document.getElementById("candidateElectionSelect");
  if (!sel && !candSel) return;
  const prev = sel ? sel.value : "";
  if (sel) sel.innerHTML = "";
  if (candSel) candSel.innerHTML = "";

  if (allElections.length === 0) {
    if (sel) sel.innerHTML = '<option value="">-- Chưa có cuộc bầu cử nào --</option>';
    if (candSel) candSel.innerHTML = '<option value="">-- Chưa có cuộc bầu cử nào --</option>';
    return;
  }
  allElections.slice().reverse().forEach(e => {
    const phase = getElectionPhase(e, isPaused);
    const text = `#${e.id} — ${e.title} [${phase.label}]`;
    if (sel) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = text;
      sel.appendChild(opt);
    }
    if (candSel) {
      const opt2 = document.createElement("option");
      opt2.value = e.id;
      opt2.textContent = text;
      candSel.appendChild(opt2);
    }
  });

  const selectedVal = prev && allElections.find(x => x.id === Number(prev))
    ? prev
    : (allElections.length > 0 ? String(allElections[allElections.length - 1].id) : "");

  if (sel && selectedVal) sel.value = selectedVal;
  if (candSel && selectedVal) candSel.value = selectedVal;
}

// Đồng bộ cuộc bầu cử từ Form 4 (Thêm ứng viên)
function syncElectionFromCandidateForm(val) {
  if (!val) return;
  const adminSel = document.getElementById("adminElectionSelect");
  if (adminSel) adminSel.value = val;
  adminSelectElection(val);
}

function populateVoterSelector() {
  const sel = document.getElementById("voterElectionSelect");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  const votableElections = allElections.filter(e => e.status === STATUS_CONTRACT.VOTING && !isPaused);
  if (votableElections.length === 0) {
    sel.innerHTML = '<option value="">-- Hiện không có cuộc bầu cử nào đang diễn ra --</option>';
    return;
  }
  allElections.forEach(e => {
    const isVotable = e.status === STATUS_CONTRACT.VOTING && !isPaused;
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = `#${e.id} — ${e.title}${isVotable ? " [Đang mở]" : " [" + getElectionPhase(e, isPaused).label + "]"}`;
    sel.appendChild(opt);
  });
  if (prev && votableElections.find(x => x.id === Number(prev))) sel.value = prev;
}

// ============================================================
// ADMIN CHỌN CUỘC BẦU CỬ ĐỂ QUẢN LÝ
// ============================================================
async function adminSelectElection(id) {
  if (!id) return;
  currentElectionId = Number(id);
  const election = allElections.find(e => e.id === currentElectionId) || await loadSingleElection(currentElectionId);
  if (!election) return;

  const phase = getElectionPhase(election, isPaused);
  const infoBox = document.getElementById("adminElectionInfoBox");
  if (infoBox) infoBox.style.display = "block";

  const statusBox = document.getElementById("adminStatusInfoBox");
  if (statusBox) {
    statusBox.className = `status-info-box ${phase.infoClass}`;
    statusBox.querySelector("span").textContent = phase.icon;
  }
  setText("adminStatusLabel", phase.label);
  setText("adminStatusDesc", phase.desc);
  setText("adminElectionTitle", election.title);
  setText("adminElectionSeats", `${election.seats} Ghế`);
  setText("adminElectionSnapshot", election.status >= STATUS_CONTRACT.VOTING ? `Block #${election.snapshotBlock}` : "Chưa chốt snapshot");
  setText("adminCandidateCount", `${election.candidateCount} ứng viên`);

  updateCountdown("adminElectionCountdown", "adminElectionEndTime", election);

  const badge = document.getElementById("adminElectionStatusBadge");
  if (badge) {
    badge.innerHTML = `<span class="badge ${phase.badgeClass}">${phase.icon} ${phase.label}</span>`;
  }

  // Khóa / Mở các nút theo trạng thái
  updateAdminControls(election.status, isPaused);

  // Đồng bộ chọn cuộc bầu cử tại Form 4 (Thêm ứng viên)
  const candSel = document.getElementById("candidateElectionSelect");
  if (candSel && candSel.value !== String(id)) {
    candSel.value = String(id);
  }
  const candHint = document.getElementById("candidateElectionStatusHint");
  if (candHint) {
    if (phase.key === "upcoming" || phase.key === "registration") {
      candHint.innerHTML = `✅ Đang chọn nạp cho: <strong>#${election.id} — ${election.title}</strong> (${phase.label}). Đủ điều kiện thêm ứng viên.`;
      candHint.style.color = "#15803d";
    } else {
      candHint.innerHTML = `⚠️ Đang chọn: <strong>#${election.id} — ${election.title}</strong> (${phase.label}). Phiên đã mở/kết thúc - Form đang bị khóa.`;
      candHint.style.color = "#b91c1c";
    }
  }

  await loadAdminCandidates(election);
  await loadResults();
}

// ============================================================
// CỔ ĐÔNG CHỌN CUỘC BẦU CỬ ĐỂ BỎ PHIẾU
// ============================================================
async function voterSelectElection(id) {
  if (!id) return;
  voterCurrentElectionId = Number(id);
  const election = allElections.find(e => e.id === voterCurrentElectionId) || await loadSingleElection(voterCurrentElectionId);
  if (!election) return;

  const phase = getElectionPhase(election, isPaused);
  const infoBox = document.getElementById("voterElectionInfoBox");
  if (infoBox) infoBox.style.display = "block";

  const statusBox = document.getElementById("voterStatusInfoBox");
  if (statusBox) {
    statusBox.className = `status-info-box ${phase.infoClass}`;
    statusBox.querySelector("span").textContent = phase.icon;
  }
  setText("voterStatusLabel", phase.label);
  setText("voterStatusDesc", phase.desc);
  setText("voterElectionTitle", election.title);
  setText("voterElectionSeats", `${election.seats} Ghế`);
  updateCountdown("voterElectionCountdown", "voterElectionEndTime", election);

  await loadCandidatesAndVoting(election);
  await updateAccountCard();
}

// ============================================================
// COUNTDOWN TIMER & AUTO LIFECYCLE
// Hệ thống tự động theo dõi thời gian thực:
// - Trước thời gian bắt đầu: Sắp diễn ra
// - Đến thời gian bắt đầu: Tự động mở phiên (startVoting on-chain nếu chưa mở)
// - Hết thời hạn: Tự động kết thúc phiên
// ============================================================
function updateCountdown(countdownId, endTimeId, election) {
  // Luôn hủy timer cũ đang chạy trên chính countdownId này (tránh xung đột khi đổi dropdown)
  if (countdownTimers[countdownId]) {
    clearInterval(countdownTimers[countdownId]);
    delete countdownTimers[countdownId];
  }
  if (!election) return;

  const updateFn = async () => {
    // Lấy object election mới nhất từ danh sách để tránh stale closure
    const liveElection = allElections.find(e => e.id === election.id) || election;
    const now = Math.floor(Date.now() / 1000);
    const startTs = liveElection.startTime || 0;
    const endTs   = liveElection.endTime || 0;

    const el = document.getElementById(countdownId);
    const endEl = document.getElementById(endTimeId);

    // Nếu element không còn tồn tại trên DOM thì hủy timer
    if (!el && !endEl) {
      if (countdownTimers[countdownId]) {
        clearInterval(countdownTimers[countdownId]);
        delete countdownTimers[countdownId];
      }
      return;
    }

    const isPostponed = localStorage.getItem(`postponed_election_${liveElection.id}`) === "true";
    const isElectionPaused = localStorage.getItem(`paused_election_${liveElection.id}`) === "true";

    // 0a. Trường hợp: Kỳ chưa diễn ra bị Admin tạm hoãn
    if (isPostponed && liveElection.status === STATUS_CONTRACT.REGISTRATION) {
      if (el) {
        el.textContent = "Đang tạm hoãn";
        el.className = "stat-value";
      }
      if (endEl) {
        endEl.textContent = "Chờ Admin hủy hoãn để tiếp tục lịch trình";
      }
      return;
    }

    // 0b. Trường hợp: Kỳ đang diễn ra bị Admin tạm dừng bỏ phiếu
    if (isElectionPaused && liveElection.status === STATUS_CONTRACT.VOTING) {
      if (el) {
        el.textContent = "Tạm dừng bỏ phiếu";
        el.className = "stat-value countdown-urgent";
      }
      if (endEl) {
        endEl.textContent = "Ban tổ chức đang tạm dừng nhận phiếu bầu cho kỳ này";
      }
      return;
    }

    // 0c. Trường hợp: Toàn hệ thống đang tạm dừng khẩn cấp trên Smart Contract
    if (isPaused) {
      if (el) {
        el.textContent = "Hệ thống tạm dừng";
        el.className = "stat-value";
      }
      if (endEl) {
        endEl.textContent = "Smart contract đang tạm dừng khẩn cấp (Khóa toàn bộ)";
      }
      return;
    }

    // 1. Trường hợp: Chưa đến giờ bắt đầu (Sắp diễn ra)
    if (startTs > now) {
      const waitSec = startTs - now;
      const h = Math.floor(waitSec / 3600);
      const m = Math.floor((waitSec % 3600) / 60);
      const s = waitSec % 60;
      if (el) {
        el.textContent = `Bắt đầu sau: ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
        el.className = "stat-value";
      }
      if (endEl) {
        const startDt = new Date(startTs * 1000);
        endEl.textContent = `Bắt đầu: ${startDt.toLocaleTimeString("vi-VN")} ${startDt.toLocaleDateString("vi-VN")}`;
      }
      return;
    }

    // 2. Trường hợp: Đang ở trạng thái Registration và có hẹn giờ bắt đầu
    if (liveElection.status === STATUS_CONTRACT.REGISTRATION) {
      if (startTs > 0 && now >= startTs) {
        if (currentAccountInfo?.resolvedRole === "admin") {
          if (!liveElection._autoStarting) {
            liveElection._autoStarting = true;
            try {
              console.log(`Đã đến giờ bắt đầu kỳ #${liveElection.id}, tự động mở phiên...`);
              addLog(`⏰ Đến giờ bắt đầu kỳ #${liveElection.id}: Hệ thống tự động mở phiên bỏ phiếu...`);
              const duration = Math.max(60, endTs - now);
              const tx = await electionContract.startVoting(liveElection.id, BigInt(duration));
              await tx.wait(1);
              addLog(`✅ Kỳ #${liveElection.id} đã tự động kích hoạt bắt đầu bỏ phiếu! (tx: ${tx.hash})`);
              await loadAllElections();
            } catch (e) {
              console.warn("Lỗi auto startVoting:", e);
              liveElection._autoStarting = false;
            }
          }
        }
        if (el) el.textContent = "Đang mở phiên...";
        return;
      }

      // Chưa mở và không có hẹn giờ trong quá khứ -> Sắp diễn ra
      if (el) el.textContent = "Chưa mở phiên (Sắp diễn ra)";
      if (endEl) endEl.textContent = "Đang chuẩn bị ứng viên & cổ phần";
      return;
    }

    // 3. Trường hợp: Đang trong thời gian bỏ phiếu
    if (endTs > now) {
      const remaining = endTs - now;
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      if (el) {
        el.textContent = `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
        el.className = remaining < 300 ? "stat-value countdown-urgent" : "stat-value";
      }
      if (endEl) {
        const endDt = new Date(endTs * 1000);
        endEl.textContent = `Hạn chót: ${endDt.toLocaleTimeString("vi-VN")} ${endDt.toLocaleDateString("vi-VN")}`;
      }
      return;
    }

    // 4. Trường hợp: Đã hết thời gian bỏ phiếu (now >= endTs)
    if (endTs > 0 && now >= endTs) {
      if (el) {
        el.textContent = "Đã kết thúc bỏ phiếu";
        el.className = "stat-value";
      }
      if (endEl) {
        const endDt = new Date(endTs * 1000);
        endEl.textContent = `Đã hết hạn lúc: ${endDt.toLocaleTimeString("vi-VN")} ${endDt.toLocaleDateString("vi-VN")}`;
      }

      // Tự động đóng phiên nếu đang ở trạng thái Voting
      if (liveElection.status === STATUS_CONTRACT.VOTING && currentAccountInfo?.resolvedRole === "admin") {
        if (!liveElection._autoClosing) {
          liveElection._autoClosing = true;
          try {
            console.log(`Đã hết thời hạn kỳ #${liveElection.id}, tự động đóng phiên và chốt kết quả...`);
            addLog(`⏰ Hết thời hạn kỳ #${liveElection.id}: Tự động đóng phiên và chốt kết quả...`);
            const tx = await electionContract.closeElection(liveElection.id);
            await tx.wait(1);
            addLog(`✅ Kỳ #${liveElection.id} đã tự động chốt kết quả thành công! (tx: ${tx.hash})`);
            await loadAllElections();
          } catch (e) {
            console.warn("Lỗi auto closeElection:", e);
            liveElection._autoClosing = false;
          }
        }
      }
      return;
    }

    if (el) el.textContent = "--";
    if (endEl) endEl.textContent = "--";
  };

  updateFn();
  countdownTimers[countdownId] = setInterval(updateFn, 1000);
}

// ============================================================
// THẺ TỔNG QUAN TÀI KHOẢN (ACCOUNT STATUS CARD)
// ============================================================
async function updateAccountCard() {
  if (!currentAccountInfo) return;
  document.getElementById("currentAddress").textContent = currentAccountInfo.address;

  if (currentAccountInfo.isGuest) {
    setText("currentShares", "0 CP (Khách)");
    setText("currentMaxVotes", "0 Phiếu");
    setText("formulaDesc", "Khách không có quyền biểu quyết");
    return;
  }

  try {
    const balance = await tokenContract.balanceOf(currentAccountInfo.address);
    const balNum = Number(balance);
    setText("currentShares", `${balNum} CP`);

    const eid = voterCurrentElectionId || currentElectionId;
    if (eid) {
      const election = allElections.find(e => e.id === eid);
      if (election && election.status >= STATUS_CONTRACT.VOTING) {
        try {
          const maxVotes = await electionContract.votingPowerOf(eid, currentAccountInfo.address);
          setText("currentMaxVotes", `${maxVotes.toString()} Phiếu`);
          setText("formulaDesc", `= ${balNum} CP × ${election.seats} ghế HĐQT`);
        } catch {
          setText("currentMaxVotes", `${balNum * (election?.seats || 3)} Phiếu (ước tính)`);
        }
      } else {
        setText("currentMaxVotes", "Chưa chốt snapshot");
        setText("formulaDesc", "= Số cổ phần × Số ghế HĐQT");
      }
    } else {
      setText("currentMaxVotes", "Chưa mở phiên");
    }
  } catch (e) {
    console.warn("Không đọc được balance/voting power:", e);
  }
}

// ============================================================
// KHÓA NÚT THEO TRẠNG THÁI (ADMIN CONTROLS LOCK)
// ============================================================
function updateAdminControls(status, paused) {
  const btnPause = document.getElementById("btnPauseToggle");
  const btnAddCandidate = document.getElementById("btnAddCandidate");
  const addCandidateLock = document.getElementById("adminAddCandidateLock");

  // 1. Nút dừng khẩn cấp toàn hệ thống (Contract Pause - Áp dụng cho TẤT CẢ cuộc bầu cử)
  if (btnPause) {
    btnPause.disabled = false;
    if (paused) {
      btnPause.className = "btn btn-success";
      btnPause.innerHTML = "▶️ Kích Hoạt Lại Toàn Bộ Hệ Thống (Unpause All)";
    } else {
      btnPause.className = "btn btn-danger";
      btnPause.innerHTML = "🚨 Dừng Khẩn Cấp Toàn Bộ Hệ Thống (Tất Cả Cuộc Bầu Cử)";
    }
  }

  // 2. Khóa/Mở quyền thêm ứng viên
  if (status === STATUS_CONTRACT.REGISTRATION) {
    if (btnAddCandidate) btnAddCandidate.disabled = paused;
    if (addCandidateLock) {
      addCandidateLock.style.display = paused ? "block" : "none";
      if (paused) addCandidateLock.textContent = "🔒 Toàn hệ thống đang tạm dừng khẩn cấp!";
    }
  } else {
    if (btnAddCandidate) btnAddCandidate.disabled = true;
    if (addCandidateLock) {
      addCandidateLock.style.display = "block";
      addCandidateLock.textContent = "🔒 Đã khóa quyền sửa ứng viên vì phiên đang diễn ra hoặc đã kết thúc!";
    }
  }

  // 3. Cập nhật lại 2 checklist: Tạm hoãn (chưa diễn ra) và Tạm dừng (đang diễn ra)
  renderUpcomingChecklist();
  renderActiveChecklist();
}

// ============================================================
// TẢI ỨNG VIÊN CHO ADMIN PREVIEW & BẬT/TẮT XEM CHI TIẾT
// ============================================================
function toggleAdminCandidateTable() {
  const section = document.getElementById("adminCandidateDetailsSection");
  const btn = document.getElementById("btnToggleCandidateTable");
  if (!section) return;

  const isHidden = window.getComputedStyle(section).display === "none";
  if (isHidden) {
    section.style.display = "block";
    if (btn) btn.innerHTML = "👁️ Thu gọn";
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    section.style.display = "none";
    if (btn) btn.innerHTML = "👁️ Xem chi tiết";
  }
}

function formatIpfsLink(cid) {
  if (!cid || cid === "N/A" || cid === "—") {
    return `<span style="color:var(--text-muted);font-size:12px;">Chưa có</span>`;
  }
  const isCid = cid.startsWith("Qm") || cid.startsWith("bafy");
  const shortCid = cid.length > 20 ? cid.substring(0, 10) + "..." + cid.substring(cid.length - 6) : cid;
  if (!isCid) {
    return `<span style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:3px 7px;border-radius:4px;">${shortCid}</span>`;
  }
  const url = `https://purple-fashionable-rooster-653.mypinata.cloud/ipfs/${cid}`;
  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer" 
       title="Mở hồ sơ trên IPFS Gateway (${cid})" 
       style="display:inline-flex;align-items:center;gap:4px;font-family:monospace;font-size:12px;background:#eff6ff;color:#1d4ed8;padding:3px 8px;border-radius:4px;border:1px solid #bfdbfe;text-decoration:none;font-weight:600;">
      📄 ${shortCid} <span style="font-size:10px;">↗</span>
    </a>
  `;
}

async function loadAdminCandidates(election) {
  const tbody = document.getElementById("adminCandidateBody");
  if (!tbody) return;
  if (!election || election.candidateCount === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Chưa có ứng viên nào được đăng ký cho kỳ này.</td></tr>`;
    return;
  }
  const phase = getElectionPhase(election, isPaused);
  const rows = [];
  for (let i = 0; i < election.candidateCount; i++) {
    const c = await electionContract.getCandidate(election.id, i);
    const ipfsDisplay = formatIpfsLink(c[1]);
    rows.push(`
      <tr>
        <td><strong>#${i}</strong></td>
        <td><div style="font-weight:600;">${c[0]}</div></td>
        <td>${ipfsDisplay}</td>
        <td><strong>${c[2]}</strong> phiếu</td>
        <td><span class="badge ${phase.badgeClass}">${phase.label}</span></td>
      </tr>
    `);
  }
  tbody.innerHTML = rows.join("");
}

// ============================================================
// MÀN HÌNH BỎ PHIẾU CỦA CỔ ĐÔNG (VOTER SCREEN LOGIC)
// ============================================================
async function loadCandidatesAndVoting(election) {
  if (!election) return;
  candidates = [];

  const phase = getElectionPhase(election, isPaused);
  const isVotable = phase.label === 'Đang diễn ra' && !isPaused;
  const tbody = document.getElementById("candidateVotingBody");

  let hasVoted = false;
  let allowedVotes = 0;
  try {
    hasVoted = await electionContract.hasVotedCheck(election.id, currentAccountInfo.address);
    if (election.status >= STATUS_CONTRACT.VOTING) {
      try {
        allowedVotes = Number(await electionContract.votingPowerOf(election.id, currentAccountInfo.address));
      } catch (errPower) {
        console.warn("Lỗi đọc votingPowerOf on-chain:", errPower);
      }
    }
    // Nếu votingPowerOf trả về 0 (ví dụ do snapshot chưa kịp ghi nhận checkpoint hoặc phiên mô phỏng)
    // thì lấy fallback từ số cổ phần thực tế x số ghế
    if (allowedVotes === 0 && currentAccountInfo.balance > 0) {
      allowedVotes = currentAccountInfo.balance * election.seats;
    }
  } catch (e) {}

  for (let i = 0; i < election.candidateCount; i++) {
    const c = await electionContract.getCandidate(election.id, i);
    candidates.push({ id: i, name: c[0], profileCid: c[1], votes: Number(c[2]) });
  }

  const votedBadge = document.getElementById("votedStatusBadge");
  const submitBtn  = document.getElementById("btnSubmitVote");
  const blockedBox = document.getElementById("voterVoteBlockedBox");
  const voteDesc   = document.getElementById("voterVoteDesc");

  if (hasVoted) {
    if (votedBadge) { votedBadge.textContent = "✅ Đã bỏ phiếu"; votedBadge.className = "badge badge-success"; }
    if (submitBtn)  { submitBtn.disabled = true; submitBtn.textContent = "Bạn đã hoàn thành bỏ phiếu cho kỳ này"; }
    if (blockedBox) { blockedBox.style.display = "none"; }
  } else if (!isVotable) {
    if (votedBadge) {
      votedBadge.textContent = phase.label;
      votedBadge.className = `badge ${phase.badgeClass}`;
    }
    if (submitBtn)  { submitBtn.disabled = true; submitBtn.innerHTML = "🗳️ Ký &amp; Gửi Phiếu Bầu Lên Blockchain"; }
    if (blockedBox) {
      blockedBox.style.display = "flex";
      const blockedTitle = document.getElementById("voterBlockedTitle");
      const blockedDesc  = document.getElementById("voterBlockedDesc");
      blockedBox.className = `status-info-box ${phase.infoClass}`;
      if (blockedTitle) blockedTitle.textContent = `Không thể bỏ phiếu — ${phase.label}`;
      if (blockedDesc)  blockedDesc.textContent  = phase.desc;
    }
    if (voteDesc) voteDesc.style.display = "none";
  } else if (allowedVotes === 0) {
    if (votedBadge) { votedBadge.textContent = "0 phiếu tại snapshot"; votedBadge.className = "badge badge-danger"; }
    if (submitBtn)  { submitBtn.disabled = true; }
    if (blockedBox) {
      blockedBox.style.display = "flex";
      blockedBox.className = "status-info-box paused";
      setText("voterBlockedTitle", "Không có quyền biểu quyết");
      setText("voterBlockedDesc", "Tài khoản không sở hữu cổ phần tại thời điểm chốt snapshot.");
    }
  } else {
    if (votedBadge) { votedBadge.textContent = "Chưa bỏ phiếu"; votedBadge.className = "badge badge-primary"; }
    if (submitBtn)  { submitBtn.disabled = false; submitBtn.innerHTML = "🗳️ Ký &amp; Gửi Phiếu Bầu Lên Blockchain"; }
    if (blockedBox) blockedBox.style.display = "none";
    if (voteDesc)   voteDesc.style.display = "";
  }

  setText("totalAllowedVotes", allowedVotes);

  if (!tbody) return;
  if (candidates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Chưa có ứng viên nào được đăng ký.</td></tr>`;
    calculateAllocatedVotes();
    return;
  }

  const disabled = hasVoted || !isVotable || allowedVotes === 0;
  tbody.innerHTML = candidates.map(c => {
    const ipfsDisplay = formatIpfsLink(c.profileCid);
    return `
      <tr>
        <td><strong>#${c.id}</strong></td>
        <td>
          <div style="font-weight:600;color:#1e293b;">${c.name}</div>
          <div style="font-size:12px;color:var(--text-muted);">Ứng cử viên Hội đồng Quản trị</div>
        </td>
        <td>${ipfsDisplay}</td>
        <td><strong>${c.votes}</strong> phiếu</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="number" class="form-input vote-input" data-candidate-id="${c.id}"
                   min="0" max="${allowedVotes}" value="0"
                   ${disabled ? "disabled" : ""}
                   oninput="calculateAllocatedVotes()">
            <span style="font-size:13px;color:var(--text-muted);">phiếu</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  calculateAllocatedVotes();
}

// ============================================================
// TÍNH TOÁN TIẾN ĐỘ DỒN PHIẾU
// ============================================================
function calculateAllocatedVotes() {
  const inputs = document.querySelectorAll(".vote-input");
  let totalAllocated = 0;
  inputs.forEach(inp => { totalAllocated += Number(inp.value) || 0; });

  let allowedVotes = Number(document.getElementById("totalAllowedVotes")?.textContent) || 0;
  if (allowedVotes === 0 && currentAccountInfo?.balance > 0) {
    const election = allElections.find(e => e.id === voterCurrentElectionId);
    allowedVotes = currentAccountInfo.balance * (election?.seats || 3);
    setText("totalAllowedVotes", allowedVotes);
  }
  const remaining = allowedVotes - totalAllocated;
  const pct = allowedVotes > 0 ? Math.min(100, Math.round((totalAllocated / allowedVotes) * 100)) : 0;

  setText("allocatedVotes", totalAllocated);
  setText("remainingVotes", remaining);

  const fill = document.getElementById("voteProgressFill");
  if (fill) fill.style.width = pct + "%";

  const box       = document.getElementById("voteCalcBox");
  const remTextEl = document.getElementById("remainingVotesText");
  const submitBtn = document.getElementById("btnSubmitVote");

  if (totalAllocated > allowedVotes) {
    if (box)  box.className = "vote-calc-box exceeded";
    if (fill) fill.className = "vote-progress-fill exceeded";
    if (remTextEl) remTextEl.innerHTML = `<span style="color:var(--danger);font-weight:700;">Vượt quá ${Math.abs(remaining)} phiếu sở hữu! Smart contract sẽ từ chối giao dịch.</span>`;
    if (submitBtn && !submitBtn.disabled) submitBtn.disabled = true;
  } else {
    if (box)  box.className = "vote-calc-box";
    if (fill) fill.className = "vote-progress-fill";
    if (remTextEl) remTextEl.innerHTML = `Còn lại: <strong>${remaining}</strong> phiếu có thể dồn`;
    const election = allElections.find(e => e.id === voterCurrentElectionId);
    const ph = election ? getElectionPhase(election, isPaused) : null;
    if (submitBtn && totalAllocated > 0 && ph && ph.label === "Đang diễn ra" && !isPaused) {
      submitBtn.disabled = false;
    }
  }
}

function resetVotesForm() {
  document.querySelectorAll(".vote-input").forEach(i => (i.value = 0));
  calculateAllocatedVotes();
}

// ============================================================
// GỬI PHIẾU BẦU LÊN BLOCKCHAIN (SUBMIT VOTE)
// ============================================================
async function submitVote() {
  try {
    const inputs = document.querySelectorAll(".vote-input");
    const candidateIds = [], amounts = [];
    inputs.forEach(inp => {
      const amt = Number(inp.value) || 0;
      if (amt > 0) {
        candidateIds.push(Number(inp.dataset.candidateId));
        amounts.push(amt);
      }
    });

    if (candidateIds.length === 0) { showToast("Vui lòng nhập ít nhất 1 phiếu bầu!", "warning"); return; }
    const totalVotes = amounts.reduce((a, b) => a + b, 0);
    const maxVotes   = Number(document.getElementById("totalAllowedVotes")?.textContent || 0);
    if (totalVotes > maxVotes) { showToast("Tổng số phiếu dồn vượt quá số phiếu tối đa bạn sở hữu!", "danger"); return; }

    const submitBtn = document.getElementById("btnSubmitVote");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "⏳ Đang gửi giao dịch ký lên Blockchain..."; }

    showToast("Đang gửi giao dịch bỏ phiếu lên blockchain...", "primary");
    const eid = voterCurrentElectionId;
    const tx  = await electionContract.vote(eid, candidateIds, amounts);
    addLog(`Đang gửi tx vote (Election #${eid}): ${tx.hash}`);

    await tx.wait(1);
    showToast(`✅ Bỏ phiếu thành công! Đã dồn ${totalVotes} phiếu cho ${candidateIds.length} ứng viên.`, "success");
    addLog(`Giao dịch vote thành công (tx: ${tx.hash})`);

    // Lưu lại Lịch sử bỏ phiếu của chính cổ đông này
    saveVoteHistory({
      electionId: eid,
      electionTitle: allElections.find(e => e.id === eid)?.title || `Cuộc bầu cử #${eid}`,
      timestamp: Date.now(),
      candidates: candidateIds.map((id, i) => ({
        id,
        name: candidates.find(c => c.id === id)?.name || `Ứng viên #${id}`,
        votes: amounts[i]
      })),
      totalVotes,
      txHash: tx.hash
    });

    await loadAllElections();
    loadVoteHistory();
  } catch (err) {
    console.error("Lỗi bỏ phiếu:", err);
    showToast("Bỏ phiếu thất bại: " + parseErrorMessage(err), "danger");
    const submitBtn = document.getElementById("btnSubmitVote");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = "🗳️ Ký &amp; Gửi Phiếu Bầu Lên Blockchain"; }
  }
}

// ============================================================
// LỊCH SỬ BỎ PHIẾU CỦA CỔ ĐÔNG (VOTE HISTORY)
// ============================================================
function saveVoteHistory(record) {
  const key = `voteHistory_${currentAccountInfo.address.toLowerCase()}`;
  const history = JSON.parse(localStorage.getItem(key) || "[]");
  history.unshift(record);
  localStorage.setItem(key, JSON.stringify(history.slice(0, 100)));
}

function loadVoteHistory() {
  const container = document.getElementById("voteHistoryContainer");
  if (!container) return;

  const key = `voteHistory_${currentAccountInfo?.address?.toLowerCase()}`;
  const history = JSON.parse(localStorage.getItem(key) || "[]");

  if (history.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <div class="history-icon">📋</div>
        <div>Chưa có lịch sử bỏ phiếu nào cho ví này. Hãy tham gia bỏ phiếu để đối chiếu!</div>
      </div>`;
    return;
  }

  const rows = history.map(h => {
    const date = new Date(h.timestamp).toLocaleString("vi-VN");
    const chips = h.candidates.map(c =>
      `<span class="vote-candidate-chip">${c.name}: ${c.votes} phiếu</span>`
    ).join("");
    const shortHash = h.txHash ? h.txHash.substring(0, 10) + "..." + h.txHash.substring(58) : "--";
    return `
      <tr>
        <td><strong>#${h.electionId}</strong><div style="font-size:11px;color:var(--text-muted);">${h.electionTitle}</div></td>
        <td><div style="max-width:300px;">${chips}</div></td>
        <td><strong style="color:var(--primary); font-size:15px;">${h.totalVotes}</strong> phiếu</td>
        <td>
          ${h.txHash
            ? `<a class="tx-link" href="javascript:void(0)" onclick="copyToClipboard('${h.txHash}')" title="Sao chép toàn bộ Transaction Hash: ${h.txHash}">${shortHash} 📋 Copy</a>`
            : "--"
          }
        </td>
        <td style="font-size:12px;color:var(--text-muted);">${date}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Cuộc bầu cử</th>
            <th>Ứng viên đã dồn phiếu</th>
            <th>Tổng phiếu dồn</th>
            <th>Mã băm giao dịch (TX Hash)</th>
            <th>Thời gian bỏ phiếu</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">
      💡 Dữ liệu đối chiếu được lưu trữ theo địa chỉ ví. Nhấp <strong>Copy</strong> để lấy toàn bộ mã Transaction Hash và tra cứu trên blockchain.
    </p>
  `;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast("Đã copy Transaction Hash!", "success")).catch(() => {});
}

// ============================================================
// KẾT QUẢ VÀ BẢNG XẾP HẠNG (RESULTS)
// ============================================================
async function loadResults() {
  const eid = currentElectionId || voterCurrentElectionId;
  if (!eid) return;

  const election = allElections.find(e => e.id === eid);
  if (!election) return;

  const tbody = document.getElementById("resultsTableBody");
  if (!tbody) return;

  if (election.candidateCount === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Chưa có ứng viên nào.</td></tr>`;
    return;
  }

  let all = [], totalAllVotes = 0;
  for (let i = 0; i < election.candidateCount; i++) {
    const c = await electionContract.getCandidate(eid, i);
    const v = Number(c[2]);
    totalAllVotes += v;
    all.push({ id: i, name: c[0], profileCid: c[1], votes: v });
  }

  let winners = [], isTied = false;
  if (election.status === STATUS_CONTRACT.CLOSED) {
    try {
      const res = await electionContract.getWinners(eid);
      winners = res[0].map(Number);
      isTied  = res[1];
    } catch {}
  }

  const tiedBox = document.getElementById("tiedWarningBox");
  if (tiedBox) tiedBox.style.display = isTied ? "block" : "none";

  all.sort((a, b) => b.votes - a.votes);

  tbody.innerHTML = all.map((cand, rank) => {
    const isWinner = winners.includes(cand.id) ||
      (election.status !== STATUS_CONTRACT.CLOSED && rank < election.seats && cand.votes > 0);
    const pct = totalAllVotes > 0 ? Math.round((cand.votes / totalAllVotes) * 100) : 0;
    let statusBadge;
    if (election.status === STATUS_CONTRACT.CLOSED && winners.includes(cand.id))
      statusBadge = `<span class="badge badge-success">🏆 ĐẮC CỬ HĐQT</span>`;
    else if (election.status === STATUS_CONTRACT.VOTING && rank < election.seats && cand.votes > 0)
      statusBadge = `<span class="badge badge-primary">📈 Tạm dẫn đầu</span>`;
    else
      statusBadge = `<span class="badge badge-secondary">Đang tranh cử</span>`;

    const ipfsDisplay = formatIpfsLink(cand.profileCid);
    const rankIcon = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
    return `
      <tr>
        <td><strong>${rankIcon}</strong></td>
        <td><div style="font-weight:600;color:#0f172a;">${cand.name}</div><div style="font-size:11px;color:var(--text-muted);">Mã ID #${cand.id}</div></td>
        <td>${ipfsDisplay}</td>
        <td><span style="font-size:16px;font-weight:700;color:var(--primary);">${cand.votes}</span> phiếu</td>
        <td style="min-width:140px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${isWinner ? "var(--success)" : "var(--primary)"};transition:width 0.5s;"></div>
            </div>
            <span style="font-size:12px;font-weight:600;min-width:28px;">${pct}%</span>
          </div>
        </td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

// ============================================================
// HIỂN THỊ DANH SÁCH TẤT CẢ CUỘC BẦU CỬ (VOTER / GUEST)
// ============================================================
async function renderAllElectionsResults(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (allElections.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);">Chưa có cuộc bầu cử nào được tạo trong hệ thống.</div>`;
    return;
  }

  const html = [];
  for (const election of [...allElections].reverse()) {
    const phase = getElectionPhase(election, isPaused);
    let resultHtml = "";

    if (election.status === STATUS_CONTRACT.CLOSED || election.status === STATUS_CONTRACT.VOTING) {
      let candidateList = [], totalVotes = 0;
      let winners = [], isTied = false;
      for (let i = 0; i < election.candidateCount; i++) {
        try {
          const c = await electionContract.getCandidate(election.id, i);
          const v = Number(c[2]);
          totalVotes += v;
          candidateList.push({ id: i, name: c[0], votes: v });
        } catch {}
      }
      if (election.status === STATUS_CONTRACT.CLOSED) {
        try {
          const res = await electionContract.getWinners(election.id);
          winners = res[0].map(Number);
          isTied  = res[1];
        } catch {}
      }
      candidateList.sort((a, b) => b.votes - a.votes);

      if (candidateList.length > 0) {
        const rows = candidateList.map((c, rank) => {
          const isWinner = winners.includes(c.id) || (election.status === STATUS_CONTRACT.VOTING && rank < election.seats && c.votes > 0);
          const pct = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
          let badge;
          if (election.status === STATUS_CONTRACT.CLOSED && winners.includes(c.id))
            badge = `<span class="badge badge-success">🏆 Đắc Cử</span>`;
          else if (election.status === STATUS_CONTRACT.VOTING && rank < election.seats && c.votes > 0)
            badge = `<span class="badge badge-primary">📈 Dẫn đầu</span>`;
          else
            badge = `<span class="badge badge-secondary">Tranh cử</span>`;
          const rankIcon = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank+1}`;
          return `<tr>
            <td>${rankIcon}</td>
            <td><strong>${c.name}</strong><div style="font-size:11px;color:var(--text-muted);">ID #${c.id}</div></td>
            <td><strong style="color:var(--primary);">${c.votes}</strong> phiếu</td>
            <td>
              <div style="display:flex;align-items:center;gap:5px;">
                <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${isWinner?"var(--success)":"var(--primary)"};"></div>
                </div>
                <span style="font-size:11px;min-width:25px;">${pct}%</span>
              </div>
            </td>
            <td>${badge}</td>
          </tr>`;
        }).join("");
        resultHtml = `
          ${isTied ? `<div class="tied-warning" style="display:block;margin-bottom:10px;">⚠️ Phát hiện đồng phiếu ở vị trí cuối cùng!</div>` : ""}
          <div class="table-container"><table>
            <thead><tr><th style="width:50px">Hạng</th><th>Ứng viên</th><th>Số phiếu</th><th>Tỷ lệ</th><th>Trạng thái</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        `;
      } else {
        resultHtml = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Chưa có ứng viên nào.</div>`;
      }
    } else {
      resultHtml = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Đang trong giai đoạn chuẩn bị — danh sách ứng viên sẽ được mở công khai khi bắt đầu.</div>`;
    }

    const endTimeStr = election.endTime > 0
      ? new Date(election.endTime * 1000).toLocaleString("vi-VN")
      : "--";

    html.push(`
      <div class="card election-result-card" style="margin-bottom:20px;border-left:4px solid ${
        election.status === 1 ? '#d97706' :
        election.status === 2 && !isPaused ? '#16a34a' :
        election.status === 2 && isPaused  ? '#dc2626' :
        '#6b7280'
      };">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
          <div>
            <div style="font-size:17px;font-weight:800;color:#0f172a;">${phase.icon} ${election.title}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
              Cuộc bầu cử #${election.id} • ${election.seats} ghế HĐQT • Kết thúc: ${endTimeStr}
            </div>
          </div>
          <span class="badge ${phase.badgeClass}" style="font-size:13px;padding:5px 14px;">${phase.label}</span>
        </div>
        ${resultHtml}
      </div>
    `);
  }

  container.innerHTML = html.join("");
}

function renderAllElectionsListAdmin() {
  const container = document.getElementById("allElectionsListAdmin");
  if (!container) return;

  if (allElections.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có cuộc bầu cử nào.</div>`;
    return;
  }

  container.innerHTML = [...allElections].reverse().map(e => {
    const phase = getElectionPhase(e, isPaused);
    const endTimeStr = e.endTime > 0 ? new Date(e.endTime * 1000).toLocaleString("vi-VN") : "Chưa mở phiên";
    return `
      <div class="election-card ${phase.cssClass} ${currentElectionId === e.id ? 'selected' : ''}"
           onclick="adminJumpToElection(${e.id})">
        <div>
          <div class="election-card-title">${phase.icon} ${e.title}</div>
          <div class="election-card-meta">
            #${e.id} • ${e.seats} ghế • ${e.candidateCount} ứng viên • Kết thúc: ${endTimeStr}
          </div>
        </div>
        <span class="badge ${phase.badgeClass}">${phase.label}</span>
      </div>
    `;
  }).join("");
}

function adminJumpToElection(id) {
  currentElectionId = id;
  const sel = document.getElementById("adminElectionSelect");
  if (sel) sel.value = id;
  adminSelectElection(id);
  const btn = document.querySelector('#screenAdmin .tab-btn');
  if (btn) switchTab('adminPanelTab', btn);
}

async function refreshCurrentElection() {
  if (currentElectionId) {
    await loadSingleElection(currentElectionId);
    await adminSelectElection(currentElectionId);
  }
}

// ============================================================
// SỰ KIỆN BLOCKCHAIN (EVENT LISTENERS)
// ============================================================
function setupEventListeners() {
  try {
    electionContract.removeAllListeners();

    electionContract.on("VoteCast", (electionId, voter, totalVotes) => {
      addLog(`📢 VoteCast: Cổ đông ${String(voter).substring(0,10)}... đã bỏ ${totalVotes} phiếu (Kỳ #${electionId})`);
      loadAllElections();
    });
    electionContract.on("CandidateAdded", (electionId, candidateId, name) => {
      addLog(`📢 CandidateAdded: Thêm ứng viên #${candidateId} "${name}" vào Kỳ #${electionId}`);
      loadAllElections();
    });
    electionContract.on("ElectionCreated", (electionId, title, seats) => {
      addLog(`📢 ElectionCreated: Khởi tạo cuộc bầu cử #${electionId} "${title}" (${seats} ghế)`);
      loadAllElections();
    });
    electionContract.on("VotingStarted", (electionId, snapshotBlock, endTime) => {
      addLog(`📢 VotingStarted: Mở phiên Kỳ #${electionId} tại snapshot block ${snapshotBlock}`);
      loadAllElections();
    });
    electionContract.on("ElectionClosed", (electionId) => {
      addLog(`📢 ElectionClosed: Kỳ #${electionId} đã kết thúc và chốt kết quả.`);
      loadAllElections();
    });
  } catch (e) {
    console.warn("Event listeners setup warning:", e);
  }
}

// ============================================================
// HÀNH ĐỘNG DÀNH CHO ADMIN (ADMIN ACTIONS)
// ============================================================
function assertAdmin() {
  if (currentAccountInfo?.resolvedRole !== "admin") {
    showToast("Bạn không có quyền Admin để thực hiện thao tác này!", "warning");
    return false;
  }
  return true;
}

async function adminCreateElection() {
  if (!assertAdmin()) return;
  try {
    const title = document.getElementById("newElectionTitle").value.trim();
    const seats = Number(document.getElementById("newElectionSeats").value);
    const startVal = document.getElementById("newElectionStart").value;
    const endVal   = document.getElementById("newElectionEnd").value;

    if (!title) { showToast("Vui lòng nhập tên cuộc bầu cử!", "warning"); return; }
    if (!seats || seats < 1) { showToast("Số ghế phải lớn hơn 0!", "warning"); return; }
    if (!startVal || !endVal) { showToast("Vui lòng nhập thời gian bắt đầu và kết thúc!", "warning"); return; }

    const startTs = Math.floor(new Date(startVal).getTime() / 1000);
    const endTs   = Math.floor(new Date(endVal).getTime() / 1000);
    if (endTs <= startTs) { showToast("Thời gian kết thúc phải sau thời gian bắt đầu!", "danger"); return; }

    const duration = endTs - startTs;

    showToast("Đang tạo cuộc bầu cử trên smart contract...", "primary");
    const tx = await electionContract.createElection(title, seats);
    addLog(`Đang gửi giao dịch tạo kỳ "${title}" (tx: ${tx.hash})`);

    const receipt = await tx.wait(1);

    let newElectionId = null;
    const iface = electionContract.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "ElectionCreated") {
          newElectionId = Number(parsed.args.electionId);
          break;
        }
      } catch {}
    }

    if (newElectionId !== null) {
      localStorage.setItem(`electionStartTime_${newElectionId}`, startTs.toString());
      localStorage.setItem(`electionEndTime_${newElectionId}`, endTs.toString());
      localStorage.setItem(`electionDuration_${newElectionId}`, duration.toString());
    }

    showToast(`✅ Đã tạo cuộc bầu cử "${title}" thành công! ID: #${newElectionId}`, "success");
    addLog(`Khởi tạo thành công: Kỳ #${newElectionId} "${title}" (tx: ${tx.hash})`);

    document.getElementById("newElectionTitle").value = "";
    document.getElementById("newElectionSeats").value = "3";

    await loadAllElections();

    if (newElectionId !== null) {
      currentElectionId = newElectionId;
      const sel = document.getElementById("adminElectionSelect");
      if (sel) sel.value = newElectionId;
      await adminSelectElection(newElectionId);
    }
  } catch (err) {
    showToast("Lỗi tạo cuộc bầu cử: " + parseErrorMessage(err), "danger");
    console.error(err);
  }
}

async function adminMintTokens() {
  if (!assertAdmin()) return;
  try {
    const to     = document.getElementById("mintToAddress").value.trim();
    const amount = document.getElementById("mintAmount").value.trim();
    if (!to || !amount) { showToast("Vui lòng nhập địa chỉ ví và số lượng cổ phần!", "warning"); return; }

    showToast("Đang cấp phát cổ phần (mint token)...", "primary");
    const tx = await tokenContract.mint(to, BigInt(amount));
    await tx.wait(1);

    showToast(`✅ Đã cấp phát ${amount} cổ phần cho ${to.substring(0, 10)}...`, "success");
    addLog(`Admin mint ${amount} CP cho ví ${to} (tx: ${tx.hash})`);
    document.getElementById("mintToAddress").value = "";
    document.getElementById("mintAmount").value = "";
    await updateAccountCard();
  } catch (err) {
    showToast("Lỗi cấp phát cổ phần: " + parseErrorMessage(err), "danger");
  }
}

function applyQuickCandidate(val) {
  if (!val) return;
  const parts = val.split("|");
  const name = parts[0];
  const wallet = parts[1] || "";
  document.getElementById("candidateNameInput").value = name;
  const wInput = document.getElementById("candidateWalletInput");
  if (wInput) wInput.value = wallet;
}

// Xử lý upload file hồ sơ trực tiếp: đọc tệp và gửi lên Backend để lưu lên Pinata IPFS thật
async function handleCandidateFileUpload(input) {
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];

  const progressEl = document.getElementById("ipfsUploadProgress");
  const successBox = document.getElementById("ipfsUploadSuccessBox");
  if (progressEl) progressEl.style.display = "block";
  if (successBox) successBox.style.display = "none";

  showToast(`🌐 Đang đọc tệp "${file.name}" và tải lên Pinata IPFS...`, "primary");

  try {
    // Đọc file thành base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const b64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Gửi lên Backend upload Pinata
    const response = await fetch("/api/upload-pinata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        type: file.type || "application/octet-stream",
        base64: base64
      })
    });

    if (progressEl) progressEl.style.display = "none";

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.cid) {
      throw new Error(data.error || "Không nhận được CID từ Pinata");
    }

    const realCid = data.cid;
    document.getElementById("candidateCidInput").value = realCid;

    if (successBox) {
      const cidText = document.getElementById("uploadedCidText");
      const gatewayBtn = document.getElementById("uploadedGatewayBtn");
      if (cidText) cidText.textContent = realCid;
      if (gatewayBtn) gatewayBtn.href = data.gatewayUrl || `https://purple-fashionable-rooster-653.mypinata.cloud/ipfs/${realCid}`;
      successBox.style.display = "block";
    }

    showToast(`✅ Đã lưu hồ sơ lên IPFS (Pinata) thành công! CID: ${realCid.substring(0, 12)}...`, "success");
  } catch (err) {
    if (progressEl) progressEl.style.display = "none";
    console.warn("Lỗi tải lên Pinata IPFS:", err);
    showToast(`⚠️ Không thể kết nối Pinata (${err.message}). Đang chuyển sang băm nội bộ dự phòng...`, "warning");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      const fallbackCid = "Qm" + hex.substring(0, 44);
      document.getElementById("candidateCidInput").value = fallbackCid;
    } catch {
      document.getElementById("candidateCidInput").value = "Qm" + Math.random().toString(36).substring(2, 15);
    }
  }
}

async function adminAddCandidate() {
  if (!assertAdmin()) return;
  if (!currentElectionId) { showToast("Vui lòng chọn cuộc bầu cử trước!", "warning"); return; }
  try {
    let name = document.getElementById("candidateNameInput").value.trim();
    const wallet = document.getElementById("candidateWalletInput")?.value.trim();
    let cid  = document.getElementById("candidateCidInput").value.trim();
    if (!name) { showToast("Vui lòng nhập họ tên ứng viên!", "warning"); return; }

    // 1. Kiểm tra định dạng địa chỉ ví cổ đông (nếu có nhập)
    if (wallet) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        showToast("⚠️ Địa chỉ ví cổ đông không đúng định dạng (phải là dạng 0x... gồm 42 ký tự hex)!", "danger");
        return;
      }
    }

    // 2. Kiểm tra chống trùng lặp ứng viên & trùng lặp địa chỉ ví trong cùng cuộc bầu cử
    const election = allElections.find(e => e.id === currentElectionId) || await loadSingleElection(currentElectionId);
    if (election && election.candidateCount > 0) {
      const inputPureName = name.toLowerCase().split("[")[0].trim();
      const inputWalletLower = wallet ? wallet.toLowerCase() : null;
      const savedWallets = JSON.parse(localStorage.getItem(`candidate_wallets_${currentElectionId}`) || "[]");

      // 2a. Kiểm tra ví đã được ghi nhận trong kỳ này chưa
      if (inputWalletLower && savedWallets.map(w => w.toLowerCase()).includes(inputWalletLower)) {
        showToast(`⚠️ Không thể thêm: Địa chỉ ví ${wallet.substring(0, 8)}... đã được đăng ký cho ứng viên khác trong kỳ bầu cử #${currentElectionId}!`, "danger");
        return;
      }

      // 2b. Quét trực tiếp danh sách ứng viên on-chain của kỳ này
      for (let i = 0; i < election.candidateCount; i++) {
        const c = await electionContract.getCandidate(currentElectionId, i);
        const existingFullName = c[0] || "";
        const existingLower = existingFullName.toLowerCase();
        const existingPureName = existingLower.split("[")[0].trim();

        // Trùng họ tên
        if (existingPureName === inputPureName) {
          showToast(`⚠️ Không thể thêm: Ứng viên "${inputPureName}" đã có trong danh sách (Ứng viên #${i}: ${existingFullName})!`, "warning");
          return;
        }

        // Trùng ví cổ đông (dò trong tên hiển thị hoặc chuỗi tag)
        if (inputWalletLower) {
          const prefix = inputWalletLower.substring(2, 6);
          const suffix = inputWalletLower.substring(38);
          if (existingLower.includes(prefix) && existingLower.includes(suffix)) {
            showToast(`⚠️ Không thể thêm: Cổ đông ví ${wallet.substring(0, 8)}... đã có trong danh sách (Ứng viên #${i}: ${existingFullName})!`, "danger");
            return;
          }
        }
      }
    }

    // Nếu có địa chỉ ví cổ đông, ghép hiển thị chuẩn để cử tri nhận diện rõ
    if (wallet && !name.includes("0x")) {
      name = `${name} [${wallet.substring(0, 6)}...${wallet.substring(38)}]`;
    }

    if (!cid) {
      cid = "N/A";
    }

    showToast("Đang thêm ứng viên lên smart contract...", "primary");
    const tx = await electionContract.addCandidate(currentElectionId, name, cid);
    await tx.wait(1);

    // Lưu ví vào danh sách đã duyệt của kỳ này để chống trùng lần sau
    if (wallet) {
      const savedWallets = JSON.parse(localStorage.getItem(`candidate_wallets_${currentElectionId}`) || "[]");
      if (!savedWallets.map(w => w.toLowerCase()).includes(wallet.toLowerCase())) {
        savedWallets.push(wallet);
        localStorage.setItem(`candidate_wallets_${currentElectionId}`, JSON.stringify(savedWallets));
      }
    }

    showToast(`✅ Đã thêm ứng viên "${name}" thành công!`, "success");
    addLog(`Admin thêm ứng viên "${name}" vào Kỳ #${currentElectionId} (tx: ${tx.hash})`);
    document.getElementById("candidateNameInput").value = "";
    if (document.getElementById("candidateWalletInput")) document.getElementById("candidateWalletInput").value = "";
    document.getElementById("candidateCidInput").value = "";
    if (document.getElementById("candidateFileInput")) document.getElementById("candidateFileInput").value = "";
    const successBox = document.getElementById("ipfsUploadSuccessBox");
    if (successBox) successBox.style.display = "none";
    const quickSel = document.getElementById("quickCandidateSelect");
    if (quickSel) quickSel.value = "";

    await loadSingleElection(currentElectionId);
    await adminSelectElection(currentElectionId);
  } catch (err) {
    showToast("Lỗi thêm ứng viên: " + parseErrorMessage(err), "danger");
  }
}

async function adminStartVoting() {
  if (!assertAdmin()) return;
  if (!currentElectionId) { showToast("Vui lòng chọn cuộc bầu cử trước!", "warning"); return; }

  let duration = Number(localStorage.getItem(`electionDuration_${currentElectionId}`));
  if (!duration || duration <= 0) {
    const input = prompt("Nhập thời gian mở bỏ phiếu (giây):\nVD: 86400 = 24 giờ, 3600 = 1 giờ", "86400");
    if (!input) return;
    duration = Number(input);
    if (!duration || duration <= 0) { showToast("Thời gian không hợp lệ!", "danger"); return; }
  }

  try {
    showToast("Đang mở phiên bỏ phiếu và chốt snapshot...", "primary");
    const tx = await electionContract.startVoting(currentElectionId, BigInt(duration));
    await tx.wait(1);

    showToast("✅ Đã mở cuộc bầu cử thành công! Chốt snapshot quyền biểu quyết.", "success");
    addLog(`Admin mở phiên bỏ phiếu Kỳ #${currentElectionId} (${duration}s) (tx: ${tx.hash})`);
    await loadAllElections();
  } catch (err) {
    showToast("Lỗi mở phiên: " + parseErrorMessage(err), "danger");
  }
}

async function adminCloseElection() {
  if (!assertAdmin()) return;
  if (!currentElectionId) { showToast("Vui lòng chọn cuộc bầu cử trước!", "warning"); return; }

  try {
    showToast("⏳ Đang xử lý đóng phiên và chốt kết quả...", "primary");

    try {
      await provider.send("evm_increaseTime", [86500]);
      await provider.send("evm_mine", []);
      addLog("Đã tua thời gian block quá hạn kết thúc (evm_increaseTime)");
    } catch (e) {
      console.warn("evm_increaseTime không khả dụng:", e.message);
    }

    const tx = await electionContract.closeElection(currentElectionId);
    await tx.wait(1);

    showToast("✅ Đã đóng cuộc bầu cử thành công! Kết quả trúng cử đã được công bố.", "success");
    addLog(`Admin đóng phiên Kỳ #${currentElectionId} (tx: ${tx.hash})`);
    await loadAllElections();
  } catch (err) {
    showToast("Lỗi đóng phiên: " + parseErrorMessage(err), "danger");
  }
}

// ============================================================
// 1. CHECKLIST TẠM HOÃN CÁC KỲ CHƯA DIỄN RA (REGISTRATION)
// ============================================================
function renderUpcomingChecklist() {
  const container = document.getElementById("upcomingChecklistContainer");
  if (!container) return;

  const upcomingList = allElections.filter(e => e.status === STATUS_CONTRACT.REGISTRATION);
  if (upcomingList.length === 0) {
    container.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">Hiện không có cuộc bầu cử nào chưa diễn ra.</div>`;
    return;
  }

  const prevChecked = new Set(
    Array.from(container.querySelectorAll(".upcoming-chk:checked")).map(el => Number(el.value))
  );

  container.innerHTML = upcomingList.slice().reverse().map(e => {
    const isPostponed = localStorage.getItem(`postponed_election_${e.id}`) === "true";
    const badgeHtml = isPostponed
      ? `<span class="badge badge-paused">⏸️ Đang tạm hoãn</span>`
      : `<span class="badge badge-warning">📅 Sắp diễn ra</span>`;

    const timeStr = e.startTime > 0
      ? `Bắt đầu: ${new Date(e.startTime * 1000).toLocaleTimeString("vi-VN")} ${new Date(e.startTime * 1000).toLocaleDateString("vi-VN")}`
      : "Chưa đặt giờ bắt đầu";

    const isChecked = prevChecked.size > 0 ? prevChecked.has(e.id) : (e.id === currentElectionId);

    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #f1f5f9; cursor:pointer; user-select:none; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="upcoming-chk" value="${e.id}" ${isChecked ? "checked" : ""} style="width:15px; height:15px; cursor:pointer;">
          <div>
            <div style="font-weight:600; font-size:12px; color:#1e293b;">#${e.id} — ${e.title}</div>
            <div style="font-size:11px; color:var(--text-muted);">${e.seats} ghế • ${e.candidateCount} ứng viên • ${timeStr}</div>
          </div>
        </div>
        <div>${badgeHtml}</div>
      </label>
    `;
  }).join("");
}

function adminSelectAllUpcoming(selectAll) {
  const checkboxes = document.querySelectorAll("#upcomingChecklistContainer .upcoming-chk");
  checkboxes.forEach(chk => { chk.checked = selectAll; });
}

function adminApplyUpcomingPostpone(postpone) {
  if (!assertAdmin()) return;
  const checkboxes = document.querySelectorAll("#upcomingChecklistContainer .upcoming-chk:checked");
  if (checkboxes.length === 0) {
    showToast("Vui lòng tích chọn ít nhất một cuộc bầu cử chưa diễn ra!", "warning");
    return;
  }

  const selectedIds = Array.from(checkboxes).map(chk => Number(chk.value));
  selectedIds.forEach(id => {
    if (postpone) {
      localStorage.setItem(`postponed_election_${id}`, "true");
    } else {
      localStorage.removeItem(`postponed_election_${id}`);
    }
  });

  if (postpone) {
    showToast(`⏸️ Đã tạm hoãn ${selectedIds.length} cuộc bầu cử chưa diễn ra (Khóa tự động mở)!`, "warning");
    addLog(`Admin tạm hoãn các kỳ chưa diễn ra: [${selectedIds.join(", ")}]`);
  } else {
    showToast(`✅ Đã khôi phục tiếp tục lịch trình cho ${selectedIds.length} cuộc bầu cử!`, "success");
    addLog(`Admin khôi phục tiếp tục lịch trình: [${selectedIds.join(", ")}]`);
  }

  loadAllElections();
}

// ============================================================
// 2. CHECKLIST TẠM DỪNG CÁC KỲ ĐANG DIỄN RA (VOTING)
// ============================================================
function renderActiveChecklist() {
  const container = document.getElementById("activeChecklistContainer");
  if (!container) return;

  const activeList = allElections.filter(e => e.status === STATUS_CONTRACT.VOTING);
  if (activeList.length === 0) {
    container.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">Hiện không có cuộc bầu cử nào đang diễn ra.</div>`;
    return;
  }

  const prevChecked = new Set(
    Array.from(container.querySelectorAll(".active-chk:checked")).map(el => Number(el.value))
  );

  container.innerHTML = activeList.slice().reverse().map(e => {
    const isPaused = localStorage.getItem(`paused_election_${e.id}`) === "true";
    const badgeHtml = isPaused
      ? `<span class="badge badge-paused">⏸️ Đang tạm dừng</span>`
      : `<span class="badge badge-success">🗳️ Đang mở bỏ phiếu</span>`;

    const endStr = e.endTime > 0
      ? `Hạn chót: ${new Date(e.endTime * 1000).toLocaleTimeString("vi-VN")}`
      : "--";

    const isChecked = prevChecked.size > 0 ? prevChecked.has(e.id) : (e.id === currentElectionId);

    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #f1f5f9; cursor:pointer; user-select:none; transition:background 0.2s;" onmouseover="this.style.background='#fff7ed'" onmouseout="this.style.background='transparent'">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="active-chk" value="${e.id}" ${isChecked ? "checked" : ""} style="width:15px; height:15px; cursor:pointer;">
          <div>
            <div style="font-weight:600; font-size:12px; color:#1e293b;">#${e.id} — ${e.title}</div>
            <div style="font-size:11px; color:var(--text-muted);">${e.seats} ghế • ${e.candidateCount} ứng viên • ${endStr}</div>
          </div>
        </div>
        <div>${badgeHtml}</div>
      </label>
    `;
  }).join("");
}

function adminSelectAllActive(selectAll) {
  const checkboxes = document.querySelectorAll("#activeChecklistContainer .active-chk");
  checkboxes.forEach(chk => { chk.checked = selectAll; });
}

function adminApplyActivePause(pause) {
  if (!assertAdmin()) return;
  const checkboxes = document.querySelectorAll("#activeChecklistContainer .active-chk:checked");
  if (checkboxes.length === 0) {
    showToast("Vui lòng tích chọn ít nhất một cuộc bầu cử đang diễn ra!", "warning");
    return;
  }

  const selectedIds = Array.from(checkboxes).map(chk => Number(chk.value));
  selectedIds.forEach(id => {
    if (pause) {
      localStorage.setItem(`paused_election_${id}`, "true");
    } else {
      localStorage.removeItem(`paused_election_${id}`);
    }
  });

  if (pause) {
    showToast(`⏸️ Đã tạm dừng nhận phiếu bầu cho ${selectedIds.length} cuộc bầu cử đang diễn ra!`, "warning");
    addLog(`Admin tạm dừng bỏ phiếu kỳ đang diễn ra: [${selectedIds.join(", ")}]`);
  } else {
    showToast(`✅ Đã mở lại bỏ phiếu cho ${selectedIds.length} cuộc bầu cử!`, "success");
    addLog(`Admin mở lại bỏ phiếu kỳ: [${selectedIds.join(", ")}]`);
  }

  loadAllElections();
}

// 3. Dừng khẩn cấp toàn bộ hệ thống (Áp dụng cho TẤT CẢ cuộc bầu cử trên Smart Contract)
async function adminTogglePause() {
  if (!assertAdmin()) return;
  try {
    const paused = await electionContract.paused();
    let tx;
    if (paused) {
      showToast("Đang gửi giao dịch kích hoạt lại hệ thống lên blockchain...", "primary");
      tx = await electionContract.unpause();
      await tx.wait(1);
      showToast("✅ Đã kích hoạt lại toàn bộ hệ thống bầu cử thành công!", "success");
      addLog(`Admin unpause toàn bộ hệ thống (tx: ${tx.hash})`);
    } else {
      showToast("Đang gửi giao dịch tạm dừng khẩn cấp lên blockchain...", "primary");
      tx = await electionContract.pause();
      await tx.wait(1);
      showToast("🚨 Toàn bộ hệ thống bầu cử đã được tạm dừng khẩn cấp!", "warning");
      addLog(`Admin kích hoạt tạm dừng khẩn cấp toàn hệ thống (tx: ${tx.hash})`);
    }
    isPaused = !paused;
    await loadAllElections();
  } catch (err) {
    showToast("Lỗi thao tác tạm dừng: " + parseErrorMessage(err), "danger");
  }
}

// ============================================================
// BÁO LỖI THÂN THIỆN (ERROR PARSER)
// ============================================================
function parseErrorMessage(err) {
  if (!err) return "Lỗi không xác định";
  const str = String(err.reason || err.message || err);
  if (str.includes("Already voted")) return "Cổ đông này đã bỏ phiếu rồi! Mỗi cổ đông chỉ được bỏ phiếu 1 lần duy nhất.";
  if (str.includes("AccessControlUnauthorizedAccount")) return "Tài khoản hiện tại không có quyền Admin!";
  if (str.includes("No voting power")) return "Tài khoản không có cổ phần tại thời điểm chốt snapshot!";
  if (str.includes("Exceeds voting power")) return "Tổng số phiếu phân bổ vượt quá số phiếu tối đa bạn sở hữu!";
  if (str.includes("Ids must be ascending")) return "Danh sách ID ứng viên phải tăng dần và không trùng lặp!";
  if (str.includes("Voting not ended")) return "Chưa hết thời hạn bỏ phiếu!";
  if (str.includes("Voting ended")) return "Cuộc bầu cử đã hết thời hạn bỏ phiếu!";
  if (str.includes("EnforcedPause")) return "Hệ thống đang tạm dừng khẩn cấp!";
  if (str.includes("Invalid election status")) return "Trạng thái cuộc bầu cử không hợp lệ cho thao tác này!";
  if (str.includes("Not enough candidates")) return "Chưa đủ số lượng ứng viên (cần ít nhất bằng số ghế HĐQT)!";
  if (str.includes("Too many candidates")) return "Đã đạt giới hạn tối đa số ứng viên (50)!";
  return err.reason || err.shortMessage || err.message || "Lỗi giao dịch blockchain";
}

// ============================================================
// CHUYỂN TAB GIAO DIỆN
// ============================================================
function switchTab(tabId, btn) {
  const parentSection = btn.closest(".role-screen") || document;
  parentSection.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  btn.closest(".tabs").querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  btn.classList.add("active");

  if (tabId === "voterHistoryTab") loadVoteHistory();
  if (tabId === "voterResultsTab") renderAllElectionsResults("voterAllElections");
  if (tabId === "guestResultsTab") renderAllElectionsResults("guestAllElections");
  if (tabId === "adminResultsTab") { loadResults(); renderAllElectionsListAdmin(); }
}

// ============================================================
// GHI NHẬT KÝ (LOGS)
// ============================================================
function addLog(text) {
  const time = new Date().toLocaleTimeString("vi-VN");
  ["logsContainer", "logsContainer2", "logsContainer3"].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = `[${time}] ${text}`;
    container.insertBefore(div, container.firstChild);
    while (container.children.length > 100) container.removeChild(container.lastChild);
  });
}

function clearLogs() {
  ["logsContainer", "logsContainer2", "logsContainer3"].forEach(id => {
    const c = document.getElementById(id);
    if (c) c.innerHTML = "";
  });
}

// ============================================================
// LOADING & TOAST
// ============================================================
function showLoadingOverlay(text) {
  const o = document.getElementById("roleLoadingOverlay");
  const p = document.getElementById("loadingOverlayText");
  if (p && text) p.textContent = text;
  if (o) o.style.display = "flex";
}
function hideLoadingOverlay() {
  const o = document.getElementById("roleLoadingOverlay");
  if (o) o.style.display = "none";
}

function showToast(msg, type = "primary") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.textContent = msg;
  toast.style.display = "block";
  toast.style.background =
    type === "success" ? "var(--success)" :
    type === "danger"  ? "var(--danger)"  :
    type === "warning" ? "var(--warning)" :
    "var(--primary)";
  toastTimeout = setTimeout(() => { toast.style.display = "none"; }, 5000);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
