// ============================================================
// Hệ Thống Bỏ Phiếu Bầu HĐQT — Frontend Logic (v4.0 Sepolia)
// Phân quyền chuẩn xác theo màn hình đăng nhập ví
// Role-aware Screen UI: Login -> Admin / Cổ Đông / Khách
// Tích hợp MetaMask Web3 & Quản lý Danh bạ Ví Nội Bộ Công Ty
// ============================================================

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const SEPOLIA_CHAIN_ID_DEC = 11155111;
const SUPER_ADMIN_ADDRESS = (window.APP_CONFIG && (window.APP_CONFIG.superAdmin || window.APP_CONFIG.adminAddress)) || "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66";
const SEPOLIA_EXPLORER_URL = (window.APP_CONFIG && window.APP_CONFIG.sepolia && window.APP_CONFIG.sepolia.explorerUrl) || "https://sepolia.etherscan.io";

let provider, currentSigner, currentAccountInfo;
let tokenContract, electionContract;
let companyWallets = [];
let companyWalletsFiltered = [];

// State
let currentElectionId = null;      // election admin đang quản lý
let voterCurrentElectionId = null; // election voter đang chọn để bầu
let allElections = [];             // cache tất cả elections [{id, title, seats, status, ...}]
let candidates = [];               // ứng viên của election đang xem
let isPaused = false;              // trạng thái pause toàn hệ thống
let currentAdminFilter = "all";    // bộ lọc danh sách bầu cử của admin: all | upcoming | active | closed

let toastTimeout = null;
let countdownTimers = {};          // { [countdownId]: intervalId }

function clearAllCountdowns() {
  Object.values(countdownTimers).forEach(timer => clearInterval(timer));
  countdownTimers = {};
}

const STATUS_CONTRACT = { NONE: 0, REGISTRATION: 1, VOTING: 2, CLOSED: 3 };

// ============================================================
// MẠNG BLOCKCHAIN & CHUYỂN MẠNG SEPOLIA (1-CLICK SWITCH CHAIN)
// ============================================================

async function switchToSepolia() {
  if (!window.ethereum) {
    showToast("Trình duyệt của bạn chưa cài đặt tiện ích ví MetaMask!", "danger");
    return false;
  }
  showLoadingOverlay("Đang yêu cầu ví chuyển sang mạng Ethereum Sepolia Testnet...");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
    });
    hideLoadingOverlay();
    showToast("Đã chuyển sang mạng Sepolia thành công!", "success");
    await checkCurrentNetwork();
    return true;
  } catch (switchError) {
    // Mã lỗi 4902: Chain chưa được nạp vào MetaMask
    if (
      switchError.code === 4902 ||
      switchError.data?.originalError?.code === 4902 ||
      (switchError.message && switchError.message.includes("wallet_addEthereumChain"))
    ) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID_HEX,
              chainName: "Sepolia Test Network",
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18
              },
              rpcUrls: [
                "https://ethereum-sepolia-rpc.publicnode.com",
                "https://rpc.sepolia.org",
                "https://sepolia.gateway.tenderly.co"
              ],
              blockExplorerUrls: ["https://sepolia.etherscan.io/"]
            }
          ]
        });
        hideLoadingOverlay();
        showToast("Đã thêm và chuyển sang mạng Sepolia thành công!", "success");
        await checkCurrentNetwork();
        return true;
      } catch (addError) {
        hideLoadingOverlay();
        console.error("Lỗi thêm mạng Sepolia:", addError);
        showToast("Thêm mạng Sepolia thất bại: " + parseErrorMessage(addError), "danger");
        return false;
      }
    } else {
      hideLoadingOverlay();
      console.error("Lỗi chuyển mạng Sepolia:", switchError);
      showToast("Chuyển mạng thất bại: " + parseErrorMessage(switchError), "danger");
      return false;
    }
  }
}

async function checkCurrentNetwork() {
  if (!window.ethereum) return null;
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    const isSepolia = (chainId.toLowerCase() === SEPOLIA_CHAIN_ID_HEX.toLowerCase() || parseInt(chainId, 16) === SEPOLIA_CHAIN_ID_DEC);

    // Cập nhật các phần tử hiển thị trạng thái mạng trên UI
    const loginAlert = document.getElementById("loginNetworkAlert");
    const loginBadge = document.getElementById("loginSepoliaBadge");
    const headerBadge = document.getElementById("headerNetworkBadge");
    const headerDot = document.getElementById("headerNetworkDot");
    const headerText = document.getElementById("headerNetworkText");
    const appAlert = document.getElementById("networkAlertBanner");
    const alertMsg = document.getElementById("networkAlertMessage");

    if (isSepolia) {
      if (loginAlert) loginAlert.style.display = "none";
      if (loginBadge) {
        loginBadge.className = "network-status-badge sepolia";
        loginBadge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span> Sepolia 11155111`;
      }
      if (headerBadge) headerBadge.className = "network-status-badge sepolia";
      if (headerDot) headerDot.style.background = "#10b981";
      if (headerText) headerText.textContent = "Sepolia Testnet";
      if (appAlert) appAlert.style.display = "none";
    } else {
      const decId = parseInt(chainId, 16) || 0;
      if (loginAlert) {
        loginAlert.style.display = "flex";
        const desc = document.getElementById("loginNetworkAlertDesc");
        if (desc) desc.textContent = `Hiện tại ví đang ở Chain ID: ${decId} (${chainId}). Vui lòng chuyển sang Sepolia (11155111).`;
      }
      if (loginBadge) {
        loginBadge.className = "network-status-badge wrong-network";
        loginBadge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> Sai mạng (${decId})`;
      }
      if (headerBadge) headerBadge.className = "network-status-badge wrong-network";
      if (headerDot) headerDot.style.background = "#ef4444";
      if (headerText) headerText.textContent = `Sai mạng (${decId}) - Bấm chuyển`;
      if (appAlert) {
        appAlert.style.display = "flex";
        if (alertMsg) alertMsg.innerHTML = `Hiện tại bạn đang ở Chain ID: <strong>${decId} (${chainId})</strong>. Vui lòng chuyển sang <strong>Ethereum Sepolia (Chain ID: 11155111 / 0xaa36a7)</strong> để giao dịch Smart Contract chính xác.`;
      }
    }
    return { isSepolia, chainId };
  } catch (err) {
    console.warn("Lỗi kiểm tra mạng Ethereum:", err);
    return null;
  }
}

// ============================================================
// INIT - Khởi tạo ban đầu hiển thị màn hình Đăng Nhập
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  if (!window.APP_CONFIG) {
    showToast("Không tìm thấy cấu hình contract trong config.js!", "danger");
    return;
  }

  // Khởi tạo ngày mặc định cho form tạo bầu cử (bắt đầu sau 30 phút, kết thúc sau 24h30)
  const now = new Date();
  const startDefault = new Date(now.getTime() + 1800000); // +30 phút
  const endDefault   = new Date(now.getTime() + 1800000 + 24 * 3600000); // +24 tiếng bỏ phiếu
  const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const startEl = document.getElementById("newElectionStart");
  const endEl   = document.getElementById("newElectionEnd");
  if (startEl) {
    startEl.value = toLocal(startDefault);
    startEl.min = toLocal(now); // Chặn chọn ngày quá khứ trên lịch trình duyệt
  }
  if (endEl)   endEl.value   = toLocal(endDefault);

  // Khởi tạo các bộ lắng nghe sự kiện toàn cục từ MetaMask (đổi tài khoản, đổi mạng)
  if (window.ethereum) {
    setupGlobalMetaMaskListeners();
    checkCurrentNetwork();
  }

  // Nạp danh bạ ví công ty sẵn sàng
  fetchCompanyWallets();

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
// CÁC HÀM XÁC THỰC & ĐĂNG NHẬP (METAMASK / WEB3 LOGIN)
// ============================================================

// Thiết lập bộ lắng nghe sự kiện toàn cục từ MetaMask (đổi tài khoản, đổi mạng)
function setupGlobalMetaMaskListeners() {
  if (!window.ethereum || window._metaMaskListenersRegistered) return;
  window._metaMaskListenersRegistered = true;

  // Khi người dùng bấm đổi tài khoản trong tiện ích MetaMask
  window.ethereum.on("accountsChanged", async (newAccounts) => {
    console.log("[MetaMask] Phát hiện thay đổi tài khoản:", newAccounts);
    if (newAccounts && newAccounts.length > 0) {
      const newAddr = newAccounts[0];
      const isSuper = (newAddr.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase());

      // Nếu đang trong giao diện App, tự động nạp lại thông tin theo ví mới
      const screenApp = document.getElementById("screenApp");
      const isAppActive = screenApp && screenApp.style.display !== "none";

      if (isAppActive && currentAccountInfo && !currentAccountInfo.isGuest) {
        showToast(`MetaMask đã chuyển sang ví: ${newAddr.substring(0, 6)}...${newAddr.substring(38)}`, "primary");
        provider = new ethers.BrowserProvider(window.ethereum);
        currentSigner = await provider.getSigner();
        currentAccountInfo = {
          name: isSuper ? "Chủ tịch HĐQT / Quản trị viên tối cao" : `MetaMask (${newAddr.substring(0, 6)}...${newAddr.substring(38)})`,
          address: newAddr,
          isGuest: false,
          isSuperAdmin: isSuper,
          isMetaMask: true
        };
        await initContractsAndRole();
      }
    } else {
      // Người dùng ngắt toàn bộ kết nối trên MetaMask
      logout();
    }
  });

  // Khi người dùng chuyển đổi mạng (Network/Chain)
  window.ethereum.on("chainChanged", async () => {
    await checkCurrentNetwork();
    if (currentAccountInfo && !currentAccountInfo.isGuest) {
      provider = new ethers.BrowserProvider(window.ethereum);
      currentSigner = await provider.getSigner();
      await initContractsAndRole();
    }
  });
}

// 1. Đăng nhập bằng nút MetaMask
// forceSelect = true: Mở bảng chọn tài khoản của MetaMask (EIP-2255) để đổi ví khác
async function loginWithMetaMask(forceSelect = false) {
  if (!window.ethereum) {
    showToast("Trình duyệt của bạn chưa cài đặt tiện ích ví MetaMask! Vui lòng cài đặt tại https://metamask.io", "danger");
    return;
  }
  showLoadingOverlay(forceSelect ? "Đang mở bảng chọn tài khoản trên tiện ích MetaMask..." : "Đang kết nối tới ví MetaMask của bạn...");
  try {
    let accounts = [];

    // Nếu người dùng chọn đổi ví HOẶC vừa đăng xuất, gọi wallet_requestPermissions để MetaMask popup danh sách ví
    const shouldForceSelect = forceSelect || window._forceSelectAccount;
    window._forceSelectAccount = false;
    if (shouldForceSelect) {
      try {
        const permissions = await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
        const accountsPerm = permissions.find((p) => p.parentCapability === "eth_accounts");
        if (accountsPerm && accountsPerm.caveats) {
          const caveat = accountsPerm.caveats.find((c) => c.type === "filterResponse" || c.type === "exposedAccounts");
          if (caveat && caveat.value) {
            accounts = Array.isArray(caveat.value) ? caveat.value : [caveat.value];
          }
        }
      } catch (permErr) {
        if (permErr.code === 4001) {
          hideLoadingOverlay();
          showToast("Bạn đã đóng cửa sổ chọn tài khoản ví.", "warning");
          return;
        }
        console.warn("Lưu ý khi yêu cầu chọn quyền ví:", permErr.message);
      }
    }

    // Nếu chưa có accounts từ popup permissions, lấy từ eth_requestAccounts
    if (!accounts || accounts.length === 0) {
      accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    }

    if (!accounts || accounts.length === 0) {
      throw new Error("Không có tài khoản ví nào được chọn kết nối!");
    }

    // Tự động kiểm tra mạng Sepolia
    const netInfo = await checkCurrentNetwork();
    if (netInfo && !netInfo.isSepolia) {
      showToast("Đang ở mạng khác. Hệ thống đang yêu cầu chuyển sang Ethereum Sepolia...", "warning");
      const switched = await switchToSepolia();
      if (!switched) {
        showToast("Lưu ý: Bạn chưa chuyển sang Sepolia! Dữ liệu contract có thể không tải được.", "warning");
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    currentSigner = await provider.getSigner();
    const addr = await currentSigner.getAddress();

    const isSuperAdmin = (addr.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase());
    currentAccountInfo = {
      name: isSuperAdmin ? "Chủ tịch HĐQT / Quản trị viên tối cao" : `MetaMask (${addr.substring(0, 6)}...${addr.substring(38)})`,
      address: addr,
      isGuest: false,
      isSuperAdmin: isSuperAdmin,
      isMetaMask: true
    };

    // Đảm bảo các listener đã được đăng ký
    setupGlobalMetaMaskListeners();

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
    if (acc.privateKey) {
      currentSigner = new ethers.Wallet(acc.privateKey, provider);
    } else {
      // Nếu là ví Genesis Sepolia mà không có privateKey local, dùng provider ngẫu nhiên để mô phỏng
      const dummy = ethers.Wallet.createRandom().connect(provider);
      currentSigner = dummy;
    }
    const isSuper = (acc.address && acc.address.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase());
    currentAccountInfo = { ...acc, isGuest: false, isSuperAdmin: isSuper };

    await initContractsAndRole();
  } catch (err) {
    console.error("Lỗi đăng nhập ví demo:", err);
    showToast("Đăng nhập thất bại: " + parseErrorMessage(err), "danger");
    hideLoadingOverlay();
  }
}

// 3. Xử lý modal Từ Chối Truy Cập (Ví Ngoài Công Ty)
function showAccessDeniedModal(walletAddress) {
  const modal = document.getElementById("modalAccessDenied");
  const addrEl = document.getElementById("deniedWalletAddress");
  if (addrEl) addrEl.textContent = walletAddress || "0x...";
  if (modal) modal.style.display = "flex";
}

function closeAccessDeniedModal() {
  const modal = document.getElementById("modalAccessDenied");
  if (modal) modal.style.display = "none";
  logout();
}

// Chế độ khách đã bị vô hiệu hóa trong hệ thống nội bộ công ty
async function loginAsGuest() {
  showToast("Hệ thống chỉ dành cho thành viên nội bộ công ty có trong danh bạ ví!", "warning");
}

// 4. Đăng xuất (Logout)
function logout(showNotice = true) {
  clearAllCountdowns();
  currentSigner = null;
  currentAccountInfo = null;
  currentElectionId = null;
  voterCurrentElectionId = null;
  provider = null;
  tokenContract = null;
  electionContract = null;
  window._forceSelectAccount = true;
  showLoginScreen();
  if (showNotice) {
    showToast("Đã đăng xuất khỏi tài khoản.", "primary");
  }
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

    // Kiểm tra quyền từ Smart Contract thực tế & ví Super Admin
    const address = currentAccountInfo.address;
    const isSuperAdmin = (address && address.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase());
    const ADMIN_ROLE = ethers.id("ELECTION_ADMIN_ROLE");
    const DEFAULT_ADMIN = ethers.ZeroHash;

    let isAdmin = isSuperAdmin;
    let balance = 0n;

    if (!currentAccountInfo.isGuest) {
      const [adminCheck, defaultCheck, balCheck, pausedCheck] = await Promise.all([
        electionContract.hasRole(ADMIN_ROLE, address).catch(() => false),
        electionContract.hasRole(DEFAULT_ADMIN, address).catch(() => false),
        tokenContract.balanceOf(address).catch(() => 0n),
        electionContract.paused().catch(() => false)
      ]);
      if (adminCheck || defaultCheck || isSuperAdmin) {
        isAdmin = true;
      }
      balance = balCheck;
      isPaused = pausedCheck;
    } else {
      isPaused = await electionContract.paused().catch(() => false);
    }

    const balNum = Number(balance);

    // Đối soát với danh bạ ví nội bộ công ty
    let companyEntry = companyWallets.find(
      (w) => w.address && w.address.toLowerCase() === address.toLowerCase()
    );
    if (!companyEntry && companyWallets.length === 0) {
      await fetchCompanyWallets();
      companyEntry = companyWallets.find(
        (w) => w.address && w.address.toLowerCase() === address.toLowerCase()
      );
    }

    // Xác định vai trò nội bộ:
    // 1. Admin: isSuperAdmin, contract admin hoặc role 'admin' trong danh bạ
    // 2. Voter: balNum > 0 hoặc role 'voter' trong danh bạ hoặc ví mới
    // 3. Auditor: role 'auditor' (Ban kiểm soát / Kiểm toán viên)
    let resolvedRole = "voter";
    if (isAdmin || (companyEntry && companyEntry.role === "admin")) {
      resolvedRole = "admin";
    } else if (companyEntry && companyEntry.role === "auditor") {
      resolvedRole = "auditor";
    } else if (balNum > 0 || (companyEntry && companyEntry.role === "voter")) {
      resolvedRole = "voter";
    } else {
      resolvedRole = "voter"; // Mặc định là Cổ đông / Nhân sự nội bộ
    }

    if (companyEntry && companyEntry.name) {
      currentAccountInfo.name = companyEntry.name;
    } else if (isSuperAdmin) {
      currentAccountInfo.name = "Chủ tịch HĐQT / Quản trị viên tối cao";
    } else {
      currentAccountInfo.name = `Cổ đông nội bộ (${address.substring(0, 6)}...${address.substring(38)})`;
    }

    currentAccountInfo.resolvedRole = resolvedRole;
    currentAccountInfo.isSuperAdmin = isSuperAdmin;
    currentAccountInfo.balance = balNum;

    // Chuyển sang màn hình ứng dụng và hiển thị view tương ứng
    showAppScreen();
    renderRoleScreen(resolvedRole, balNum);

    // Tải dữ liệu toàn bộ cuộc bầu cử & danh bạ ví nội bộ
    await loadAllElections();
    await updateAccountCard();
    fetchCompanyWallets();

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
  if (role === "admin") return "Quản Trị Viên (Admin)";
  if (role === "voter") return "Cổ Đông (Shareholder)";
  if (role === "auditor") return "Ban Kiểm Soát / Kiểm Toán";
  return "Nhân sự nội bộ công ty";
}

// ============================================================
// HIỂN THỊ MÀN HÌNH THEO VAI TRÒ (RENDER ROLE SCREEN)
// ============================================================
function renderRoleScreen(role, balance) {
  clearAllCountdowns();
  // Ẩn tất cả các màn hình vai trò
  document.querySelectorAll(".role-screen").forEach((el) => el.classList.remove("active"));

  const pill = document.getElementById("rolePill");
  const headerAddr = document.getElementById("headerWalletAddress");
  if (headerAddr) {
    headerAddr.textContent = `${currentAccountInfo.address.substring(0, 8)}...${currentAccountInfo.address.substring(36)}`;
  }

  if (role === "admin") {
    document.getElementById("screenAdmin").classList.add("active");
    if (currentAccountInfo.isSuperAdmin) {
      pill.className = "role-pill super-admin";
      pill.textContent = "👑 Quản Trị Tối Cao (Super Admin)";
      setText("currentRole", "Vai trò: Quản Trị Viên Tối Cao — Toàn quyền kiểm soát và điều hành hệ thống bầu cử công ty");
    } else {
      pill.className = "role-pill admin";
      pill.textContent = "⚙️ Quản Trị Viên (Admin)";
      setText("currentRole", "Vai trò: Quản Trị Viên — Toàn quyền tạo kỳ, cấp phiếu, quản lý ứng viên, mở/đóng phiên");
    }
  } else if (role === "voter") {
    document.getElementById("screenVoter").classList.add("active");
    pill.className = "role-pill voter";
    pill.textContent = `🗳️ Cổ Đông — ${balance} CP`;
    setText("currentRole", `Vai trò: Cổ Đông (${balance} cổ phần) — Được cấp phiếu bầu và có quyền bỏ phiếu biểu quyết`);
  } else {
    // Ban kiểm soát / Kiểm toán viên (Auditor)
    document.getElementById("screenGuest").classList.add("active");
    pill.className = "role-pill auditor";
    pill.textContent = "🔍 Ban Kiểm Soát / BKS";
    setText("currentRole", "Vai trò: Ban Kiểm Soát — Giám sát độc lập tính minh bạch của các cuộc bầu cử và danh bạ ví công ty");
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

  // 5. Nếu ở giai đoạn Registration trên Smart Contract: Luôn là Sắp diễn ra / Chuẩn bị
  // Chỉ khi Admin mở phiên (startVoting thành công on-chain) thì mới thành Đang diễn ra
  if (status === STATUS_CONTRACT.REGISTRATION) {
    if (typeof election === "object" && election.startTime > 0 && now < election.startTime) {
      return {
        label: 'Sắp diễn ra',
        badgeClass: 'badge-warning',
        cssClass: 'phase-upcoming',
        infoClass: 'upcoming',
        icon: '📅',
        desc: 'Chưa đến giờ mở bầu cử. Admin đang tạo ứng viên & cấp phiếu; Cổ đông & Khách chỉ xem.'
      };
    }
    return {
      label: 'Chờ mở phiên',
      badgeClass: 'badge-warning',
      cssClass: 'phase-upcoming',
      infoClass: 'upcoming',
      icon: '⏳',
      desc: 'Đang trong giai đoạn đăng ký ứng viên & cấp phiếu. Chờ Admin kích hoạt mở phiên on-chain.'
    };
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
      renderAllElectionsResults('allElectionsListAdmin');
      renderAdminUnifiedElectionList();
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
    renderAllElectionsResults('allElectionsListAdmin');
    renderAdminUnifiedElectionList();
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

  // Tự động chọn cuộc bầu cử cho Cổ đông: ưu tiên cuộc đang diễn ra, nếu không thì lấy cuộc mới nhất
  if (currentAccountInfo?.resolvedRole === "voter") {
    const activeEl = allElections.find(e => {
      const ph = getElectionPhase(e, isPaused);
      return ph.label === "Đang diễn ra" && !isPaused;
    }) || allElections[allElections.length - 1];

    if (activeEl) {
      const targetId = (voterCurrentElectionId && allElections.some(e => e.id === voterCurrentElectionId))
        ? voterCurrentElectionId
        : activeEl.id;
      await voterSelectElection(targetId);
      const sel = document.getElementById("voterElectionSelect");
      if (sel) sel.value = targetId;
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

    // Tự động dọn dẹp cờ tạm hoãn/tạm dừng không còn phù hợp với trạng thái on-chain
    if (Number(e[2]) >= STATUS_CONTRACT.VOTING) {
      localStorage.removeItem(`postponed_election_${id}`);
    }
    if (Number(e[2]) === STATUS_CONTRACT.CLOSED) {
      localStorage.removeItem(`paused_election_${id}`);
    }

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
  if (prev && allElections.find(x => x.id === Number(prev))) {
    sel.value = prev;
  } else if (voterCurrentElectionId) {
    sel.value = voterCurrentElectionId;
  }
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
  updateAdminControls(election.status, isPaused, election);

  // Đồng bộ chọn cuộc bầu cử tại Form 4 (Thêm ứng viên)
  const candSel = document.getElementById("candidateElectionSelect");
  if (candSel && candSel.value !== String(id)) {
    candSel.value = String(id);
  }
  const candHint = document.getElementById("candidateElectionStatusHint");
  if (candHint) {
    if (election.status === STATUS_CONTRACT.REGISTRATION && !isPaused) {
      candHint.innerHTML = `✅ Đang chọn nạp cho: <strong>#${election.id} — ${election.title}</strong> [Chưa mở phiên]. Trạng thái on-chain cho phép Admin thêm ứng viên.`;
      candHint.style.color = "#15803d";
    } else if (isPaused) {
      candHint.innerHTML = `⚠️ Toàn hệ thống đang tạm dừng khẩn cấp trên Smart Contract.`;
      candHint.style.color = "#b91c1c";
    } else {
      candHint.innerHTML = `🔒 Đang chọn: <strong>#${election.id} — ${election.title}</strong> [Phiên đã mở hoặc đã kết thúc trên Smart Contract]. Form thêm ứng viên bị khóa.`;
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
        // Kiểm tra điều kiện tối thiểu số ứng viên trước khi tự động gọi on-chain
        if (Number(liveElection.candidateCount) < Number(liveElection.seats)) {
          if (el) el.textContent = `Chưa thể mở (Thiếu ứng viên: ${liveElection.candidateCount}/${liveElection.seats})`;
          if (endEl) endEl.textContent = "Cần thêm ứng viên >= số ghế HĐQT";
          updateAdminPreflightChecklist(liveElection.status, isPaused, liveElection);
          return;
        }

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
function updateAdminControls(status, paused, electionObj) {
  const btnPause = document.getElementById("btnPauseToggle");
  const btnAddCandidate = document.getElementById("btnAddCandidate");
  const addCandidateLock = document.getElementById("adminAddCandidateLock");

  const election = electionObj || allElections.find(e => e.id === currentElectionId);

  // Cập nhật Pre-flight Checklist điều kiện mở phiên
  updateAdminPreflightChecklist(status, paused, election);

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

// Cập nhật Pre-flight Checklist cho Admin
function updateAdminPreflightChecklist(status, paused, election) {
  const preflightBox = document.getElementById("adminPreflightBox");
  const badge = document.getElementById("adminPreflightBadge");
  const btnStart = document.getElementById("btnAdminManualStartVoting");
  const notice = document.getElementById("adminPreflightNotice");

  const cardCand = document.getElementById("checkCandidatesCard");
  const descCand = document.getElementById("checkCandidatesDesc");

  const cardTime = document.getElementById("checkTimeCard");
  const descTime = document.getElementById("checkTimeDesc");

  const cardSys = document.getElementById("checkSystemCard");
  const descSys = document.getElementById("checkSystemDesc");

  if (!preflightBox || !election) return;

  // Nếu phiên đã mở hoặc đã kết thúc
  if (status >= STATUS_CONTRACT.VOTING) {
    preflightBox.style.display = "block";
    if (badge) {
      badge.className = status === STATUS_CONTRACT.VOTING ? "badge badge-success" : "badge badge-secondary";
      badge.textContent = status === STATUS_CONTRACT.VOTING ? "Phiên đang diễn ra" : "Phiên đã kết thúc";
    }
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.style.opacity = "0.5";
      btnStart.innerHTML = status === STATUS_CONTRACT.VOTING ? "🗳️ Đang trong thời gian bỏ phiếu" : "✅ Phiên đã kết thúc";
    }
    if (notice) {
      notice.innerHTML = status === STATUS_CONTRACT.VOTING 
        ? "ℹ️ Cuộc bầu cử này đã được kích hoạt thành công trên Smart Contract và đã chốt snapshot quyền biểu quyết."
        : "ℹ️ Cuộc bầu cử này đã đóng phiên bỏ phiếu.";
    }
    return;
  }

  // Nếu đang ở trạng thái Registration (Chuẩn bị / Sắp diễn ra)
  preflightBox.style.display = "block";

  const candidateCount = Number(election.candidateCount) || 0;
  const seats = Number(election.seats) || 1;
  const now = Math.floor(Date.now() / 1000);
  const startTs = Number(election.startTime) || 0;
  const isPostponed = localStorage.getItem(`postponed_election_${election.id}`) === "true";

  // Điều kiện 1: Số lượng ứng viên >= số ghế HĐQT
  const condCandidate = candidateCount >= seats;
  if (condCandidate) {
    if (cardCand) cardCand.style.borderColor = "#10b981";
    if (descCand) descCand.innerHTML = `<span style="color:#059669; font-weight:600;">✅ Đạt (${candidateCount}/${seats} ứng viên)</span>`;
  } else {
    if (cardCand) cardCand.style.borderColor = "#ef4444";
    if (descCand) descCand.innerHTML = `<span style="color:#dc2626; font-weight:600;">❌ Chưa đạt: Có ${candidateCount}/${seats} ứng viên (Cần thêm ít nhất ${seats - candidateCount} người)</span>`;
  }

  // Điều kiện 2: Thời gian bắt đầu
  let condTime = true;
  if (startTs > 0) {
    if (now >= startTs) {
      if (cardTime) cardTime.style.borderColor = "#10b981";
      if (descTime) descTime.innerHTML = `<span style="color:#059669; font-weight:600;">✅ Đã đến giờ hẹn bắt đầu</span>`;
    } else {
      condTime = false;
      const waitMin = Math.ceil((startTs - now) / 60);
      if (cardTime) cardTime.style.borderColor = "#f59e0b";
      if (descTime) descTime.innerHTML = `<span style="color:#d97706; font-weight:600;">⏳ Chưa đến giờ hẹn (Còn ~${waitMin} phút)</span>`;
    }
  } else {
    if (cardTime) cardTime.style.borderColor = "#10b981";
    if (descTime) descTime.innerHTML = `<span style="color:#059669; font-weight:600;">✅ Không hẹn giờ (Mở bất kỳ lúc nào)</span>`;
  }

  // Điều kiện 3: Trạng thái hệ thống & hoãn
  let condSystem = true;
  if (paused) {
    condSystem = false;
    if (cardSys) cardSys.style.borderColor = "#ef4444";
    if (descSys) descSys.innerHTML = `<span style="color:#dc2626; font-weight:600;">❌ Toàn hệ thống đang tạm dừng</span>`;
  } else if (isPostponed) {
    condSystem = false;
    if (cardSys) cardSys.style.borderColor = "#f59e0b";
    if (descSys) descSys.innerHTML = `<span style="color:#d97706; font-weight:600;">⏸️ Đang bị tạm hoãn mở</span>`;
  } else {
    if (cardSys) cardSys.style.borderColor = "#10b981";
    if (descSys) descSys.innerHTML = `<span style="color:#059669; font-weight:600;">✅ Hệ thống sẵn sàng</span>`;
  }

  // Đánh giá tổng thể
  // Lưu ý: Về mặt Smart Contract, chỉ bắt buộc: condCandidate = true VÀ !paused
  const readyToStart = condCandidate && condSystem;

  if (readyToStart) {
    if (badge) {
      badge.className = "badge badge-success";
      badge.textContent = "✅ Đủ điều kiện mở phiên";
    }
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.style.opacity = "1";
      btnStart.className = "btn btn-success";
      btnStart.innerHTML = "<span>🚀</span> Mở Phiên Bỏ Phiếu Ngay";
    }
    if (notice) {
      if (!condTime) {
        notice.innerHTML = `💡 Chưa đến giờ hẹn nhưng <strong>đã đủ ứng viên</strong>. Admin có thể bấm <strong>"Mở Phiên Bỏ Phiếu Ngay"</strong> trước giờ hẹn nếu muốn!`;
      } else {
        notice.innerHTML = `💡 Đã đủ điều kiện! Bấm <strong>"Mở Phiên Bỏ Phiếu Ngay"</strong> để chốt snapshot cổ phần và mở cho cổ đông bỏ phiếu.`;
      }
    }
  } else {
    if (badge) {
      badge.className = "badge badge-danger";
      badge.textContent = "❌ Chưa đủ điều kiện";
    }
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.style.opacity = "0.5";
      btnStart.className = "btn btn-outline";
      btnStart.innerHTML = "<span>⚠️</span> Chưa Thể Mở Phiên";
    }
    if (notice) {
      if (!condCandidate) {
        notice.innerHTML = `<strong style="color:#dc2626;">Chưa thể mở phiên:</strong> Smart Contract quy định số ứng viên (${candidateCount}) phải lớn hơn hoặc bằng số ghế (${seats}). Vui lòng thêm thêm ứng viên ở Form 4 bên dưới.`;
      } else if (paused) {
        notice.innerHTML = `<strong style="color:#dc2626;">Chưa thể mở phiên:</strong> Hệ thống đang dừng khẩn cấp. Vui lòng Unpause trước.`;
      } else if (isPostponed) {
        notice.innerHTML = `<strong style="color:#d97706;">Chưa thể mở phiên:</strong> Cuộc bầu cử đang bị Admin tạm hoãn. Bỏ tạm hoãn để kích hoạt.`;
      }
    }
  }
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

// ============================================================
// UI-UX PRO MAX: TRUNG TÂM QUẢN LÝ CUỘC BẦU CỬ UNIFIED
// ============================================================

function setAdminElectionFilter(filterType, btnEl) {
  currentAdminFilter = filterType;
  document.querySelectorAll(".filter-chip").forEach(el => el.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderAdminUnifiedElectionList();
}

async function renderAdminUnifiedElectionList() {
  const container = document.getElementById("adminUnifiedElectionList");
  if (!container) return;

  // Cập nhật số liệu các bộ lọc
  const total = allElections.length;
  const countUpcoming = allElections.filter(e => e.status === STATUS_CONTRACT.REGISTRATION).length;
  const countActive = allElections.filter(e => e.status === STATUS_CONTRACT.VOTING && !isPaused).length;
  const countClosed = allElections.filter(e => e.status === STATUS_CONTRACT.CLOSED || (e.endTime > 0 && Math.floor(Date.now()/1000) >= e.endTime)).length;

  setText("countFilterAll", total);
  setText("countFilterUpcoming", countUpcoming);
  setText("countFilterActive", countActive);
  setText("countFilterClosed", countClosed);
  setText("adminElectionCountBadge", `${total} cuộc bầu cử`);

  const globalHint = document.getElementById("adminGlobalPauseStatusHint");
  if (globalHint) {
    if (isPaused) {
      globalHint.style.background = "#fef2f2";
      globalHint.style.borderColor = "#fecaca";
      globalHint.style.color = "#991b1b";
      globalHint.innerHTML = "🚨 Trạng thái hiện tại: <strong>HỆ THỐNG ĐANG DỪNG KHẨN CẤP TRÊN BLOCKCHAIN</strong>";
    } else {
      globalHint.style.background = "#f0fdf4";
      globalHint.style.borderColor = "#bbf7d0";
      globalHint.style.color = "#166534";
      globalHint.innerHTML = "✅ Trạng thái hiện tại: <strong>Hệ thống hoạt động bình thường, sẵn sàng giao dịch</strong>";
    }
  }

  if (total === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:48px 24px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px;">
        <div style="font-size:44px; margin-bottom:10px;">🏛️</div>
        <h4 style="font-size:16px; font-weight:700; color:#334155; margin-bottom:6px;">Chưa có cuộc bầu cử nào được tạo</h4>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
          Bắt đầu thiết lập cuộc bầu cử HĐQT đầu tiên bằng nút bên dưới.
        </p>
        <button type="button" class="btn btn-primary" onclick="openCreateElectionModal()">
          ➕ Tạo Cuộc Bầu Cử Đầu Tiên
        </button>
      </div>
    `;
    return;
  }

  // Lọc theo currentAdminFilter
  let filtered = [...allElections].reverse();
  if (currentAdminFilter === "upcoming") {
    filtered = filtered.filter(e => e.status === STATUS_CONTRACT.REGISTRATION);
  } else if (currentAdminFilter === "active") {
    filtered = filtered.filter(e => e.status === STATUS_CONTRACT.VOTING && !isPaused);
  } else if (currentAdminFilter === "closed") {
    filtered = filtered.filter(e => e.status === STATUS_CONTRACT.CLOSED || (e.endTime > 0 && Math.floor(Date.now()/1000) >= e.endTime));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:32px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; color:var(--text-muted); font-size:13px;">
        Không có cuộc bầu cử nào phù hợp với bộ lọc đã chọn.
      </div>
    `;
    return;
  }

  const itemsHtml = [];
  for (const e of filtered) {
    const phase = getElectionPhase(e, isPaused);
    const isUpcoming = e.status === STATUS_CONTRACT.REGISTRATION;
    const isActive = e.status === STATUS_CONTRACT.VOTING && !isPaused;
    const isClosed = e.status === STATUS_CONTRACT.CLOSED || (e.endTime > 0 && Math.floor(Date.now()/1000) >= e.endTime);

    const candCount = Number(e.candidateCount) || 0;
    const seats = Number(e.seats) || 1;
    const hasEnoughCand = candCount >= seats;

    // Tải danh sách ứng viên của kỳ này
    let candList = [];
    let winners = [];
    let isTied = false;
    let totalVotes = 0;

    for (let i = 0; i < candCount; i++) {
      try {
        const c = await electionContract.getCandidate(e.id, i);
        const v = Number(c[2]);
        totalVotes += v;
        candList.push({ id: i, name: c[0], profileCid: c[1], votes: v });
      } catch {}
    }

    if (isClosed && candList.length > 0) {
      try {
        const res = await electionContract.getWinners(e.id);
        winners = res[0].map(Number);
        isTied = res[1];
      } catch {}
    }

    candList.sort((a, b) => b.votes - a.votes);

    // Thời gian hiển thị
    const startStr = e.startTime > 0 ? new Date(e.startTime * 1000).toLocaleString("vi-VN") : "Ngay khi mở";
    const endStr = e.endTime > 0 ? new Date(e.endTime * 1000).toLocaleString("vi-VN") : "--";

    // 1. Phân vùng Action theo trạng thái
    let actionAreaHtml = "";
    if (isUpcoming) {
      actionAreaHtml = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="openAddCandidateModal(${e.id})" style="border-color:#3b82f6; color:#2563eb; background:#eff6ff; font-weight:700;">
            👤 + Thêm Ứng Viên (${candCount}/${seats})
          </button>
          <button type="button" class="btn btn-success btn-sm" onclick="adminQuickStartVoting(${e.id})" ${!hasEnoughCand || isPaused ? 'disabled style="opacity:0.5;"' : 'style="font-weight:700;"'}>
            🚀 Mở Phiên Ngay
          </button>
        </div>
      `;
    } else if (isActive) {
      actionAreaHtml = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px; font-weight:600; color:#16a34a; background:#dcfce7; padding:4px 10px; border-radius:6px; border:1px solid #bbf7d0;">
            🗳️ Phiên đang mở nhận phiếu bầu
          </span>
          <button type="button" class="btn btn-outline btn-sm" onclick="adminQuickCloseVoting(${e.id})" title="Đóng phiên bỏ phiếu trên blockchain">
            🔒 Đóng Phiên
          </button>
        </div>
      `;
    } else {
      actionAreaHtml = `
        <span style="font-size:12px; font-weight:600; color:#475569; background:#f1f5f9; padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1;">
          ✅ Đã kết thúc &amp; chốt kết quả
        </span>
      `;
    }

    // 2. Render danh sách ứng viên / kết quả
    let detailsHtml = "";
    if (isUpcoming) {
      // Hiển thị danh sách ứng viên đã nạp
      if (candList.length === 0) {
        detailsHtml = `
          <div style="padding:14px; background:#fffbeb; border:1px dashed #fde68a; border-radius:8px; font-size:13px; color:#92400e; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <span>⚠️ <strong>Chưa có ứng viên nào:</strong> Cần thêm ít nhất <strong>${seats} ứng viên</strong> để đáp ứng điều kiện mở phiên bỏ phiếu.</span>
            <button type="button" class="btn btn-warning btn-sm" onclick="openAddCandidateModal(${e.id})">
              ➕ Thêm Ứng Viên Đầu Tiên
            </button>
          </div>
        `;
      } else {
        const candItems = candList.map((c, idx) => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="candidate-avatar" style="width:28px; height:28px; font-size:12px;">#${idx+1}</span>
              <div>
                <strong style="color:#0f172a;">${c.name}</strong>
                <div style="font-size:11px; color:var(--text-muted);">Mã ứng viên #${c.id}</div>
              </div>
            </div>
            <div>
              ${formatIpfsLink(c.profileCid)}
            </div>
          </div>
        `).join("");

        detailsHtml = `
          <div style="margin-top:12px; border-top:1px solid #e2e8f0; padding-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:13px; font-weight:700; color:#334155;">
                Danh sách ứng viên đã đăng ký (${candList.length}/${seats} ghế):
              </span>
              <span style="font-size:12px; font-weight:600; color:${hasEnoughCand ? '#16a34a' : '#dc2626'};">
                ${hasEnoughCand ? '✅ Đủ điều kiện mở phiên' : `⚠️ Thiếu ${seats - candList.length} người`}
              </span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:8px;">
              ${candItems}
            </div>
          </div>
        `;
      }
    } else {
      // Đang diễn ra hoặc Đã kết thúc: Render bảng kết quả chi tiết
      if (candList.length === 0) {
        detailsHtml = `<div style="font-size:13px; color:var(--text-muted); padding:8px 0;">Không có thông tin ứng viên.</div>`;
      } else {
        const candRows = candList.map((c, rank) => {
          const isWinner = winners.includes(c.id) || (isActive && rank < seats && c.votes > 0);
          const pct = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
          let badgeHtml = "";
          if (isClosed && winners.includes(c.id)) {
            badgeHtml = `<span class="badge badge-success" style="font-weight:700;">🏆 ĐẮC CỬ</span>`;
          } else if (isActive && rank < seats && c.votes > 0) {
            badgeHtml = `<span class="badge badge-primary">📈 Dẫn đầu</span>`;
          } else {
            badgeHtml = `<span class="badge badge-secondary">Tranh cử</span>`;
          }
          const rankIcon = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
          return `
            <tr>
              <td style="font-weight:700;">${rankIcon}</td>
              <td>
                <div style="font-weight:700; color:#0f172a;">${c.name}</div>
                <div style="font-size:11px; color:var(--text-muted);">Mã #${c.id}</div>
              </td>
              <td>${formatIpfsLink(c.profileCid)}</td>
              <td><strong style="color:var(--primary); font-size:15px;">${c.votes}</strong> phiếu</td>
              <td>
                <div style="display:flex; align-items:center; gap:6px;">
                  <div class="progress-bar-container" style="flex:1;">
                    <div class="progress-bar-fill" style="width:${pct}%; background:${isWinner ? 'var(--success)' : 'var(--primary)'};"></div>
                  </div>
                  <span style="font-size:12px; font-weight:600; min-width:32px;">${pct}%</span>
                </div>
              </td>
              <td>${badgeHtml}</td>
            </tr>
          `;
        }).join("");

        detailsHtml = `
          <div style="margin-top:12px; border-top:1px solid #e2e8f0; padding-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:13px; font-weight:700; color:#334155;">
                📊 Bảng thống kê số phiếu &amp; ứng viên trúng cử:
              </span>
              <span style="font-size:12px; color:var(--text-muted);">
                Tổng phiếu đã bỏ: <strong style="color:var(--primary);">${totalVotes}</strong> phiếu
              </span>
            </div>
            ${isTied ? `<div class="tied-warning" style="display:block; margin-bottom:8px;">⚠️ Phát hiện đồng phiếu ở ghế cuối cùng! Cần bầu lại hoặc xử lý theo điều lệ.</div>` : ""}
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th style="width:50px">Hạng</th>
                    <th>Ứng viên</th>
                    <th>Hồ sơ IPFS</th>
                    <th style="width:130px">Số phiếu</th>
                    <th style="min-width:140px">Tỷ lệ</th>
                    <th style="width:140px">Kết quả</th>
                  </tr>
                </thead>
                <tbody>${candRows}</tbody>
              </table>
            </div>
          </div>
        `;
      }
    }

    itemsHtml.push(`
      <div class="election-card-item ${phase.cssClass}" id="adminElectionCard_${e.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h4 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">
                ${phase.icon} #${e.id} — ${e.title}
              </h4>
              <span class="badge ${phase.badgeClass}">${phase.label}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px; display:flex; gap:14px; flex-wrap:wrap;">
              <span>🪑 Số ghế: <strong>${e.seats} ghế</strong></span>
              <span>👤 Ứng viên: <strong>${candCount} người</strong></span>
              <span>📅 Bắt đầu: <strong>${startStr}</strong></span>
              <span>⏰ Kết thúc: <strong>${endStr}</strong></span>
              ${e.snapshotBlock > 0 ? `<span>🔗 Snapshot: <strong>Block #${e.snapshotBlock}</strong></span>` : ''}
            </div>
          </div>
          <div>
            ${actionAreaHtml}
          </div>
        </div>

        <!-- Chi tiết ứng viên / kết quả -->
        ${detailsHtml}
      </div>
    `);
  }

  container.innerHTML = itemsHtml.join("");
  renderUpcomingChecklist();
  renderActiveChecklist();
}

// ------------------------------------------------------------
// MODAL CONTROLLERS & FORM VALIDATION
// ------------------------------------------------------------
function openCreateElectionModal() {
  const modal = document.getElementById("modalCreateElection");
  if (!modal) return;
  modal.style.display = "flex";

  // Khởi tạo thời gian hợp lệ: Bắt đầu sau 30 phút, kết thúc sau 24h30
  const now = new Date();
  const startDefault = new Date(now.getTime() + 1800000); // +30 phút
  const endDefault   = new Date(now.getTime() + 1800000 + 24 * 3600000); // +24 tiếng bỏ phiếu
  const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const startEl = document.getElementById("newElectionStart");
  const endEl = document.getElementById("newElectionEnd");
  if (startEl) {
    startEl.value = toLocal(startDefault);
    startEl.min = toLocal(now);
  }
  if (endEl) {
    endEl.value = toLocal(endDefault);
  }
  validateCreateElectionForm();
}

function closeCreateElectionModal() {
  const modal = document.getElementById("modalCreateElection");
  if (modal) modal.style.display = "none";
}

// Validate thời gian thực cho Modal Tạo Kỳ Bầu Cử
function validateCreateElectionForm() {
  const title = (document.getElementById("newElectionTitle")?.value || "").trim();
  const seats = Number(document.getElementById("newElectionSeats")?.value) || 0;
  const startVal = document.getElementById("newElectionStart")?.value;
  const endVal = document.getElementById("newElectionEnd")?.value;

  const titleHint = document.getElementById("valTitleHint");
  const seatsHint = document.getElementById("valSeatsHint");
  const startHint = document.getElementById("valStartHint");
  const durationHint = document.getElementById("valDurationHint");
  const submitBtn = document.getElementById("btnSubmitCreateElection");
  const summaryText = document.getElementById("summaryElectionDuration");

  let isValidTitle = title.length > 0;
  if (titleHint) {
    titleHint.className = `validation-hint ${isValidTitle ? 'valid' : 'invalid'}`;
    titleHint.innerHTML = isValidTitle ? "✅ Tên cuộc bầu cử hợp lệ" : "❌ Chưa nhập tên cuộc bầu cử";
  }

  let isValidSeats = seats >= 1 && seats <= 20;
  if (seatsHint) {
    seatsHint.className = `validation-hint ${isValidSeats ? 'valid' : 'invalid'}`;
    seatsHint.innerHTML = isValidSeats ? `✅ Số ghế hợp lệ (${seats} ghế)` : "❌ Số ghế phải từ 1 đến 20";
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const startTs = startVal ? Math.floor(new Date(startVal).getTime() / 1000) : 0;
  const endTs = endVal ? Math.floor(new Date(endVal).getTime() / 1000) : 0;

  // Điều kiện 1: Bắt đầu > hiện tại (dung sai 60s)
  let isValidStart = startTs >= (nowTs - 60);
  if (startHint) {
    startHint.className = `validation-hint ${isValidStart ? 'valid' : 'invalid'}`;
    startHint.innerHTML = isValidStart ? "✅ Thời gian bắt đầu hợp lệ (> hiện tại)" : "❌ Thời gian bắt đầu phải lớn hơn thời gian hiện tại";
  }

  // Điều kiện 2: Thời lượng >= 12 tiếng (43200s)
  let duration = endTs - startTs;
  let isValidDuration = duration >= 43200;
  if (durationHint) {
    const hours = (duration / 3600).toFixed(1);
    durationHint.className = `validation-hint ${isValidDuration ? 'valid' : 'invalid'}`;
    if (endTs <= startTs) {
      durationHint.innerHTML = "❌ Thời gian kết thúc phải sau thời gian bắt đầu";
    } else {
      durationHint.innerHTML = isValidDuration 
        ? `✅ Thời lượng hợp lệ: ${hours} tiếng (>= 12 tiếng)` 
        : `❌ Thời hạn mở vote phải tối thiểu 12 tiếng (Hiện tại: ${hours}h)`;
    }
  }

  if (summaryText) {
    if (startTs > 0 && endTs > startTs) {
      const h = Math.floor(duration / 3600);
      const m = Math.floor((duration % 3600) / 60);
      summaryText.innerHTML = `<strong>${h} giờ ${m > 0 ? m + ' phút' : ''}</strong> (${seats} ghế HĐQT)`;
    } else {
      summaryText.innerHTML = "Chưa xác định";
    }
  }

  // Khóa / Mở nút submit
  const allValid = isValidTitle && isValidSeats && isValidStart && isValidDuration;
  if (submitBtn) {
    submitBtn.disabled = !allValid;
    submitBtn.style.opacity = allValid ? "1" : "0.5";
  }
}

// ------------------------------------------------------------
// MODAL THÊM ỨNG VIÊN CHO MỘT CUỘC BẦU CỬ CỤ THỂ
// ------------------------------------------------------------
async function openAddCandidateModal(electionId) {
  currentElectionId = Number(electionId);
  const election = allElections.find(e => e.id === currentElectionId) || await loadSingleElection(currentElectionId);
  if (!election) {
    showToast("Không tìm thấy cuộc bầu cử!", "warning");
    return;
  }

  // Chỉ cho phép thêm nếu đang ở Registration
  if (election.status !== STATUS_CONTRACT.REGISTRATION) {
    showToast("Cuộc bầu cử này đã mở hoặc đã kết thúc, không thể thêm ứng viên!", "warning");
    return;
  }

  const modal = document.getElementById("modalAddCandidate");
  const targetIdInput = document.getElementById("candidateTargetElectionId");
  const targetLabel = document.getElementById("modalCandidateTargetElection");
  if (targetIdInput) targetIdInput.value = currentElectionId;
  if (targetLabel) {
    targetLabel.innerHTML = `Đang thêm cho: <strong>#${election.id} — ${election.title}</strong> (${election.seats} ghế • Hiện có ${election.candidateCount} ứng viên)`;
  }

  // Reset form
  document.getElementById("candidateNameInput").value = "";
  if (document.getElementById("candidateWalletInput")) document.getElementById("candidateWalletInput").value = "";
  document.getElementById("candidateCidInput").value = "";
  if (document.getElementById("candidateFileInput")) document.getElementById("candidateFileInput").value = "";
  const successBox = document.getElementById("ipfsUploadSuccessBox");
  if (successBox) successBox.style.display = "none";
  const progressBox = document.getElementById("ipfsUploadProgress");
  if (progressBox) progressBox.style.display = "none";

  // Nạp danh bạ cổ đông vào select nhanh
  populateQuickCandidateDropdown();

  if (modal) modal.style.display = "flex";
}

function closeAddCandidateModal() {
  const modal = document.getElementById("modalAddCandidate");
  if (modal) modal.style.display = "none";
}

function populateQuickCandidateDropdown() {
  const sel = document.getElementById("quickCandidateSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Chọn cổ đông ứng cử viên nhanh --</option>';

  const voters = companyWallets.filter(w => w.role === "voter" || w.role === "shareholder" || (w.shares && w.shares > 0));
  if (voters.length === 0) {
    // Fallback nếu chưa tải xong danh bạ
    sel.innerHTML += `
      <option value="Cổ đông Alice (60 CP)|0x70997970C51812dc3A010C7d01b50e0d17dc79C8">Alice (Cổ đông lớn - 60 CP)</option>
      <option value="Cổ đông Bob (25 CP)|0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC">Bob (Cổ đông nhỏ - 25 CP)</option>
      <option value="Cổ đông Carol (35 CP)|0x90F79bf6EB2c4f870365E785982E1f101E93b906">Carol (Cổ đông nhỏ - 35 CP)</option>
    `;
    return;
  }

  voters.forEach(v => {
    const opt = document.createElement("option");
    opt.value = `${v.name} (${v.shares || 0} CP)|${v.address}`;
    opt.textContent = `${v.name} (${v.shares || 0} CP) — ${v.title || 'Cổ đông'}`;
    sel.appendChild(opt);
  });
}

// Mở phiên nhanh từ Card
async function adminQuickStartVoting(electionId) {
  currentElectionId = Number(electionId);
  await adminStartVoting();
  await loadAllElections();
}

// Đóng phiên nhanh từ Card
async function adminQuickCloseVoting(electionId) {
  currentElectionId = Number(electionId);
  await adminCloseElection();
  await loadAllElections();
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
    const nowTs   = Math.floor(Date.now() / 1000);

    // 1. Kiểm tra thời gian bắt đầu phải lớn hơn thời gian hiện tại (cho phép dung sai 60s để tránh lệch giây khi bấm)
    if (startTs < nowTs - 60) {
      showToast("Thời gian khởi tạo không hợp lệ! Thời gian bắt đầu phải lớn hơn thời gian hiện tại.", "danger");
      return;
    }

    // 2. Kiểm tra thời gian kết thúc phải sau thời gian bắt đầu
    if (endTs <= startTs) {
      showToast("Thời gian kết thúc phải sau thời gian bắt đầu!", "danger");
      return;
    }

    // 3. Quy định thời lượng bỏ phiếu tối thiểu 12 tiếng (12 * 3600 = 43200 giây)
    const duration = endTs - startTs;
    const MIN_DURATION = 12 * 3600; // 12 tiếng
    if (duration < MIN_DURATION) {
      const hoursGiven = (duration / 3600).toFixed(1);
      showToast(`Thời gian bỏ phiếu không hợp lệ! Thời hạn bỏ phiếu tối thiểu phải từ 12 tiếng trở lên để cổ đông kịp tham gia (Hiện tại: ${hoursGiven}h).`, "danger");
      return;
    }

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
    closeCreateElectionModal();

    await loadAllElections();

    if (newElectionId !== null) {
      currentElectionId = newElectionId;
      const sel = document.getElementById("adminElectionSelect");
      if (sel) sel.value = newElectionId;
      await adminSelectElection(newElectionId);
      // Gợi ý mở modal nạp ứng viên ngay
      setTimeout(() => {
        openAddCandidateModal(newElectionId);
      }, 500);
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

    // Cập nhật ngay số dư on-chain trong danh bạ ví và giao diện mà không cần reload trang
    try {
      const b = await tokenContract.balanceOf(to);
      const newBal = Number(b);
      const targetIdx = companyWallets.findIndex(w => w.address.toLowerCase() === to.toLowerCase());
      if (targetIdx >= 0) {
        companyWallets[targetIdx].shares = newBal;
        companyWallets[targetIdx].onChainBalance = newBal;
        localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
        fetch(`/api/company-wallets/${ethers.getAddress(to)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...companyWallets[targetIdx], shares: newBal })
        }).catch(() => {});
        filterCompanyWallets();
      }
    } catch (syncErr) {
      console.warn("Lỗi cập nhật số dư sau mint:", syncErr);
    }

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
    closeAddCandidateModal();
    renderAdminUnifiedElectionList();
  } catch (err) {
    showToast("Lỗi thêm ứng viên: " + parseErrorMessage(err), "danger");
  }
}

async function adminStartVoting() {
  if (!assertAdmin()) return;
  if (!currentElectionId) { showToast("Vui lòng chọn cuộc bầu cử trước!", "warning"); return; }

  const election = allElections.find(e => e.id === currentElectionId);
  if (election) {
    if (Number(election.candidateCount) < Number(election.seats)) {
      showToast(`Không thể mở phiên! Cần ít nhất ${election.seats} ứng viên (Hiện có ${election.candidateCount}).`, "danger");
      return;
    }
  }

  let duration = Number(localStorage.getItem(`electionDuration_${currentElectionId}`));
  if (!duration || duration <= 0) {
    const startTs = Number(election?.startTime) || 0;
    const endTs   = Number(election?.endTime) || 0;
    const now = Math.floor(Date.now() / 1000);
    if (endTs > now) {
      duration = endTs - now;
    } else {
      duration = 86400; // Mặc định 24h
    }
  }

  try {
    showToast("Đang mở phiên bỏ phiếu và chốt snapshot...", "primary");
    const tx = await electionContract.startVoting(currentElectionId, BigInt(duration));
    await tx.wait(1);

    localStorage.removeItem(`postponed_election_${currentElectionId}`);

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

    localStorage.removeItem(`paused_election_${currentElectionId}`);
    localStorage.removeItem(`postponed_election_${currentElectionId}`);

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

  const upcomingList = allElections.filter(e => Number(e.status) === STATUS_CONTRACT.REGISTRATION);
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
      ? `<span class="badge badge-paused" style="font-weight:700;">⏸️ Đang tạm hoãn</span>`
      : `<span class="badge badge-warning" style="font-weight:600;">📅 Sắp diễn ra</span>`;

    const timeStr = e.startTime > 0
      ? `Bắt đầu: ${new Date(e.startTime * 1000).toLocaleTimeString("vi-VN")} ${new Date(e.startTime * 1000).toLocaleDateString("vi-VN")}`
      : "Chưa đặt giờ bắt đầu";

    const isChecked = prevChecked.size > 0 ? prevChecked.has(e.id) : (isPostponed || e.id === currentElectionId);

    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; user-select:none; transition:background 0.2s; background:${isPostponed ? '#fffbeb' : '#fff'}; border-radius:6px; margin-bottom:4px;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isPostponed ? '#fffbeb' : '#fff'}'">
        <div style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" class="upcoming-chk" value="${e.id}" ${isChecked ? "checked" : ""} style="width:16px; height:16px; cursor:pointer; accent-color:#f59e0b;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#1e293b;">#${e.id} — ${e.title}</div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">${e.seats} ghế • ${e.candidateCount} ứng viên • ${timeStr}</div>
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

  const activeList = allElections.filter(e => Number(e.status) === STATUS_CONTRACT.VOTING);
  if (activeList.length === 0) {
    container.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">Hiện không có cuộc bầu cử nào đang diễn ra.</div>`;
    return;
  }

  const prevChecked = new Set(
    Array.from(container.querySelectorAll(".active-chk:checked")).map(el => Number(el.value))
  );

  container.innerHTML = activeList.slice().reverse().map(e => {
    const isPausedElection = localStorage.getItem(`paused_election_${e.id}`) === "true";
    const badgeHtml = isPausedElection
      ? `<span class="badge badge-paused" style="font-weight:700;">⏸️ Đang tạm dừng</span>`
      : `<span class="badge badge-success" style="font-weight:600;">🗳️ Đang mở bỏ phiếu</span>`;

    const endStr = e.endTime > 0
      ? `Hạn chót: ${new Date(e.endTime * 1000).toLocaleTimeString("vi-VN")}`
      : "--";

    const isChecked = prevChecked.size > 0 ? prevChecked.has(e.id) : (isPausedElection || e.id === currentElectionId);

    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #fed7aa; cursor:pointer; user-select:none; transition:background 0.2s; background:${isPausedElection ? '#fff7ed' : '#fff'}; border-radius:6px; margin-bottom:4px;" onmouseover="this.style.background='#ffedd5'" onmouseout="this.style.background='${isPausedElection ? '#fff7ed' : '#fff'}'">
        <div style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" class="active-chk" value="${e.id}" ${isChecked ? "checked" : ""} style="width:16px; height:16px; cursor:pointer; accent-color:#ea580c;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#1e293b;">#${e.id} — ${e.title}</div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">${e.seats} ghế • ${e.candidateCount} ứng viên • ${endStr}</div>
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

  if (tabId === "adminPanelTab") {
    renderAdminUnifiedElectionList();
    renderUpcomingChecklist();
    renderActiveChecklist();
  }
  if (tabId === "voterVotingTab" && voterCurrentElectionId) {
    voterSelectElection(voterCurrentElectionId);
  }
  if (tabId === "voterHistoryTab") loadVoteHistory();
  if (tabId === "voterResultsTab") renderAllElectionsResults("voterAllElections");
  if (tabId === "guestResultsTab") renderAllElectionsResults("guestAllElections");
  if (tabId === "adminResultsTab") { loadResults(); renderAllElectionsResults("allElectionsListAdmin"); }
  if (tabId === "adminWalletsTab" || tabId === "voterWalletsTab" || tabId === "guestWalletsTab") {
    fetchCompanyWallets();
  }
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

// ============================================================
// QUẢN LÝ DANH SÁCH VÍ NỘI BỘ CÔNG TY (INTERNAL WALLETS MANAGEMENT)
// ============================================================

const DEFAULT_COMPANY_WALLETS = [
  {
    address: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66",
    name: "Chủ tịch HĐQT / Quản trị viên tối cao",
    title: "Chủ tịch Hội đồng Quản trị",
    role: "admin",
    shares: 100,
    notes: "Quản trị viên tối cao hệ thống (Super Admin)",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    name: "Trần Thị Lan",
    title: "Trưởng Ban Kiểm soát",
    role: "auditor",
    shares: 50,
    notes: "Kiểm toán viên độc lập / Ban Kiểm soát",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    name: "Nguyễn Văn Hùng",
    title: "Cổ đông Sáng lập",
    role: "voter",
    shares: 80,
    notes: "Cổ đông chiến lược dài hạn",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    name: "Lê Thị Mai",
    title: "Cổ đông Thành viên",
    role: "voter",
    shares: 35,
    notes: "Cổ đông tham gia biểu quyết HĐQT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

async function fetchCompanyWallets(forceRefresh = false) {
  try {
    const res = await fetch("/api/company-wallets", { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        companyWallets = data;
        localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
        filterCompanyWallets();
        if (forceRefresh) showToast("Đã đồng bộ danh bạ ví công ty từ Backend thành công!", "success");
        return;
      }
    }
  } catch (err) {
    console.warn("[Company Wallets] Không gọi được API backend, fallback sang LocalStorage:", err.message);
  }

  // Fallback LocalStorage
  const cached = localStorage.getItem("company_wallets_cache");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        companyWallets = parsed;
        filterCompanyWallets();
        if (forceRefresh) showToast("Đã tải danh bạ ví từ bộ nhớ cục bộ (Offline)", "primary");
        return;
      }
    } catch (e) {}
  }

  // Fallback mặc định
  companyWallets = [...DEFAULT_COMPANY_WALLETS];
  localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
  filterCompanyWallets();
  if (forceRefresh) showToast("Đã nạp danh bạ ví công ty mặc định", "primary");
}

function filterCompanyWallets() {
  const query = (document.getElementById("walletSearchInput")?.value || "").trim().toLowerCase();
  const roleFilter = document.getElementById("walletRoleFilter")?.value || "";

  companyWalletsFiltered = companyWallets.filter(w => {
    const matchQuery = !query ||
      (w.address && w.address.toLowerCase().includes(query)) ||
      (w.name && w.name.toLowerCase().includes(query)) ||
      (w.title && w.title.toLowerCase().includes(query)) ||
      (w.notes && w.notes.toLowerCase().includes(query));

    const matchRole = !roleFilter || w.role === roleFilter;
    return matchQuery && matchRole;
  });

  renderCompanyWalletsTable();
  syncCompanyWalletsOnChainBalances();
}

function getRoleBadgeHtml(role) {
  if (role === "admin") {
    return `<span class="badge badge-role-admin">Quản trị viên (Admin)</span>`;
  } else if (role === "voter" || role === "shareholder") {
    return `<span class="badge badge-role-voter">Cổ đông biểu quyết</span>`;
  } else if (role === "auditor") {
    return `<span class="badge badge-role-auditor">Kiểm toán / BKS</span>`;
  }
  return `<span class="badge badge-role-guest">Khách tham quan</span>`;
}

function copyWalletAddress(addr) {
  navigator.clipboard.writeText(addr).then(() => {
    showToast(`Đã sao chép địa chỉ ví: ${addr}`, "success");
  }).catch(() => {
    prompt("Sao chép địa chỉ ví:", addr);
  });
}

let _isSyncingWallets = false;
async function syncCompanyWalletsOnChainBalances() {
  if (!tokenContract || _isSyncingWallets) return;
  _isSyncingWallets = true;
  try {
    let changed = false;
    for (const w of companyWallets) {
      if (w.address && ethers.isAddress(w.address)) {
        try {
          const bal = await tokenContract.balanceOf(w.address);
          const balNum = Number(bal);
          if (w.onChainBalance !== balNum || w.shares !== balNum) {
            w.onChainBalance = balNum;
            w.shares = balNum;
            changed = true;
          }
        } catch {}
      }
    }
    if (changed) {
      localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
      renderCompanyWalletsTable();
    }
  } finally {
    _isSyncingWallets = false;
  }
}

function renderCompanyWalletsTable() {
  // 1. Cập nhật số liệu thống kê
  const total = companyWallets.length;
  const adminCount = companyWallets.filter(w => w.role === "admin").length;
  const voterCount = companyWallets.filter(w => w.role === "voter" || w.role === "shareholder").length;
  const totalShares = companyWallets.reduce((sum, w) => sum + (Number(w.shares) || 0), 0);

  setText("statCompanyWalletsTotal", total);
  setText("statCompanyWalletsAdmin", adminCount);
  setText("statCompanyWalletsVoter", voterCount);
  setText("statCompanyWalletsShares", `${totalShares.toLocaleString()} CP`);

  const list = companyWalletsFiltered;

  // 2. Render Admin Table
  const adminTbody = document.getElementById("companyWalletsTableBody");
  if (adminTbody) {
    if (list.length === 0) {
      adminTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy ví nào khớp với bộ lọc.</td></tr>`;
    } else {
      adminTbody.innerHTML = list.map((w, idx) => {
        const isSuper = (w.address && w.address.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase());
        const shortAddr = `${w.address.substring(0, 8)}...${w.address.substring(36)}`;
        const etherscanUrl = `${SEPOLIA_EXPLORER_URL}/address/${w.address}`;

        return `
          <tr>
            <td style="font-weight:600; color:var(--text-muted);">${idx + 1}</td>
            <td>
              <div class="addr-badge-wrapper" title="${w.address}">
                <span class="addr-mono">${shortAddr}</span>
                <button type="button" class="btn-icon-link" onclick="copyWalletAddress('${w.address}')" title="Sao chép địa chỉ">📋</button>
                <a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" class="btn-icon-link" title="Xem trên Sepolia Etherscan">↗️</a>
              </div>
              ${isSuper ? '<div style="font-size:10px; color:#d97706; font-weight:700; margin-top:3px;">👑 Genesis Super Admin</div>' : ''}
            </td>
            <td>
              <div class="wallet-person-name">${escapeHtml(w.name || "Chưa đặt tên")}</div>
              <div class="wallet-person-title">${escapeHtml(w.title || "Nhân sự")}</div>
            </td>
            <td>${getRoleBadgeHtml(w.role)}</td>
            <td>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <strong style="color:#1d4ed8; font-size:14px;">${w.onChainBalance !== undefined ? w.onChainBalance : (Number(w.shares) || 0)} CP</strong>
                  <button type="button" class="btn-icon-link" onclick="checkWalletOnChainBalance('${w.address}')" title="Kiểm tra số dư Smart Contract trực tiếp" style="margin-left:2px;">🔍</button>
                </div>
                ${w.onChainBalance !== undefined ? `
                  <div style="font-size:11px; color:#15803d; font-weight:600;">
                    ✓ On-Chain: ${w.onChainBalance}
                  </div>
                ` : `
                  <div style="font-size:11px; color:var(--text-muted);">
                    Sổ sách: ${Number(w.shares) || 0} CP
                  </div>
                `}
              </div>
            </td>
            <td style="font-size:12.5px; color:#475569;">${escapeHtml(w.notes || "--")}</td>
            <td>
              <div class="table-actions" style="justify-content:center;">
                <button type="button" class="btn btn-outline btn-sm" onclick="openEditWalletModal('${w.address}')" title="Chỉnh sửa thông tin">
                  ✏️ Sửa
                </button>
                <button type="button" class="btn btn-success btn-sm" onclick="openQuickMintModal('${w.address}')" title="Cấp thêm cổ phần On-chain">
                  🪙 Mint
                </button>
                <button type="button" class="btn btn-primary btn-sm" onclick="openManageRoleModal('${w.address}')" title="Phân quyền Admin trên Smart Contract">
                  👑 Phân quyền
                </button>
                ${isSuper ? '' : `
                  <button type="button" class="btn btn-danger btn-sm" onclick="deleteCompanyWallet('${w.address}')" title="Xóa khỏi danh bạ">
                    🗑️ Xóa
                  </button>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  // 3. Render Voter Table (View-Only)
  const voterTbody = document.getElementById("voterCompanyWalletsTableBody");
  if (voterTbody) {
    voterTbody.innerHTML = companyWallets.map((w, idx) => {
      const shortAddr = `${w.address.substring(0, 8)}...${w.address.substring(36)}`;
      const etherscanUrl = `${SEPOLIA_EXPLORER_URL}/address/${w.address}`;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <div class="addr-badge-wrapper" title="${w.address}">
              <span class="addr-mono">${shortAddr}</span>
              <button type="button" class="btn-icon-link" onclick="copyWalletAddress('${w.address}')" title="Sao chép">📋</button>
              <a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" class="btn-icon-link" title="Etherscan">↗️</a>
            </div>
          </td>
          <td>
            <div class="wallet-person-name">${escapeHtml(w.name || "")}</div>
            <div class="wallet-person-title">${escapeHtml(w.title || "")}</div>
          </td>
          <td>${getRoleBadgeHtml(w.role)}</td>
          <td>
            <strong style="color:#1d4ed8;">${w.onChainBalance !== undefined ? w.onChainBalance : (Number(w.shares) || 0)} CP</strong>
            ${w.onChainBalance !== undefined ? `<div style="font-size:11px; color:#15803d; font-weight:600;">✓ On-Chain</div>` : ''}
          </td>
          <td style="font-size:12.5px; color:#475569;">${escapeHtml(w.notes || "--")}</td>
        </tr>
      `;
    }).join("");
  }

  // 4. Render Guest Table (View-Only)
  const guestTbody = document.getElementById("guestCompanyWalletsTableBody");
  if (guestTbody) {
    guestTbody.innerHTML = voterTbody ? voterTbody.innerHTML : "";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function checkWalletOnChainBalance(addr) {
  if (!tokenContract) {
    showToast("Smart contract chưa được khởi tạo để kiểm tra số dư!", "warning");
    return;
  }
  try {
    const bal = await tokenContract.balanceOf(addr);
    const balNum = Number(bal);
    const targetIdx = companyWallets.findIndex(w => w.address.toLowerCase() === addr.toLowerCase());
    if (targetIdx >= 0) {
      companyWallets[targetIdx].shares = balNum;
      companyWallets[targetIdx].onChainBalance = balNum;
      localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
      renderCompanyWalletsTable();
    }
    showToast(`Số dư on-chain của ví ${addr.substring(0, 8)}...: ${balNum} Token CP`, "success");
  } catch (err) {
    showToast("Lỗi kiểm tra số dư: " + parseErrorMessage(err), "danger");
  }
}

// Modal 1: Add / Edit Wallet
function openAddWalletModal() {
  document.getElementById("modalAddEditWalletTitle").textContent = "➕ Thêm Ví Nội Bộ Công Ty Mới";
  document.getElementById("walletFormIsEdit").value = "0";
  const addrEl = document.getElementById("walletFormAddress");
  addrEl.value = "";
  addrEl.disabled = false;
  document.getElementById("walletFormName").value = "";
  document.getElementById("walletFormTitle").value = "";
  document.getElementById("walletFormRole").value = "voter";
  document.getElementById("walletFormNotes").value = "";
  document.getElementById("walletOptGrantRole").checked = false;
  handleWalletRoleChange("voter");
  document.getElementById("modalAddEditWallet").style.display = "flex";
}

function openEditWalletModal(address) {
  const w = companyWallets.find(x => x.address.toLowerCase() === address.toLowerCase());
  if (!w) {
    showToast("Không tìm thấy dữ liệu ví!", "danger");
    return;
  }
  document.getElementById("modalAddEditWalletTitle").textContent = "✏️ Chỉnh Sửa Thông Tin Ví Nội Bộ";
  document.getElementById("walletFormIsEdit").value = "1";
  const addrEl = document.getElementById("walletFormAddress");
  addrEl.value = w.address;
  addrEl.disabled = true; // Không cho sửa địa chỉ khi đang edit
  document.getElementById("walletFormName").value = w.name || "";
  document.getElementById("walletFormTitle").value = w.title || "";
  document.getElementById("walletFormRole").value = w.role || "voter";
  document.getElementById("walletFormNotes").value = w.notes || "";
  document.getElementById("walletOptGrantRole").checked = false;
  handleWalletRoleChange(w.role || "voter");
  document.getElementById("modalAddEditWallet").style.display = "flex";
}

function closeAddEditWalletModal() {
  document.getElementById("modalAddEditWallet").style.display = "none";
}

function handleWalletRoleChange(role) {
  const optGrant = document.getElementById("optGrantRoleLabel");
  if (optGrant) {
    optGrant.style.display = (role === "admin") ? "flex" : "none";
  }
}

async function submitCompanyWalletForm() {
  const isEdit = document.getElementById("walletFormIsEdit").value === "1";
  const rawAddr = document.getElementById("walletFormAddress").value.trim();
  const name = document.getElementById("walletFormName").value.trim();
  const title = document.getElementById("walletFormTitle").value.trim();
  const role = document.getElementById("walletFormRole").value;
  const notes = document.getElementById("walletFormNotes").value.trim();
  const optGrant = document.getElementById("walletOptGrantRole").checked;

  if (!rawAddr || !ethers.isAddress(rawAddr)) {
    showToast("Địa chỉ ví Ethereum không hợp lệ!", "danger");
    return;
  }
  const formattedAddr = ethers.getAddress(rawAddr);

  if (!name) {
    showToast("Vui lòng nhập họ và tên nhân sự / cổ đông!", "danger");
    return;
  }

  showLoadingOverlay("Đang lưu thông tin ví vào hệ thống...");

  try {
    // Xác định số cổ phần hiện có trên on-chain hoặc trong cache
    const existingWallet = companyWallets.find(w => w.address.toLowerCase() === formattedAddr.toLowerCase());
    let currentShares = existingWallet ? (Number(existingWallet.shares) || 0) : 0;
    let onChainBal = existingWallet ? existingWallet.onChainBalance : undefined;

    if (tokenContract) {
      try {
        const bal = await tokenContract.balanceOf(formattedAddr);
        currentShares = Number(bal);
        onChainBal = currentShares;
      } catch (err) {
        console.warn("Không thể đọc số dư on-chain khi lưu ví:", err);
      }
    }

    // 1. Gọi backend API
    const url = isEdit ? `/api/company-wallets/${formattedAddr}` : "/api/company-wallets";
    const method = isEdit ? "PUT" : "POST";
    const payload = { address: formattedAddr, name, title, role, shares: currentShares, notes };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn("Backend API response error:", errJson);
      }
    } catch (apiErr) {
      console.warn("Backend API call failed, fallback LocalStorage:", apiErr.message);
    }

    // 2. Cập nhật mảng local & localStorage
    const idx = companyWallets.findIndex(w => w.address.toLowerCase() === formattedAddr.toLowerCase());
    const updatedRecord = {
      address: formattedAddr,
      name,
      title: title || "Nhân sự",
      role,
      shares: currentShares,
      onChainBalance: onChainBal,
      notes,
      updatedAt: new Date().toISOString()
    };
    if (idx >= 0) {
      companyWallets[idx] = { ...companyWallets[idx], ...updatedRecord };
    } else {
      companyWallets.push({ ...updatedRecord, createdAt: new Date().toISOString() });
    }
    localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
    filterCompanyWallets();

    // 3. Tác vụ On-Chain tự động nếu người dùng kích hoạt
    if (optGrant && role === "admin" && electionContract) {
      showLoadingOverlay("Đang gửi giao dịch phân quyền Admin on-chain (grantRole)...");
      try {
        const ADMIN_ROLE = ethers.id("ELECTION_ADMIN_ROLE");
        const tx = await electionContract.grantRole(ADMIN_ROLE, formattedAddr);
        addLog(`Đang cấp quyền Admin cho ${formattedAddr} (Tx: ${tx.hash.substring(0, 10)}...)`);
        await tx.wait();
        addLog(`Đã cấp quyền ELECTION_ADMIN_ROLE thành công cho ${formattedAddr}`);
        showToast("Đã cấp quyền Admin trên Smart Contract thành công!", "success");
      } catch (roleErr) {
        console.error("Lỗi cấp quyền on-chain:", roleErr);
        showToast("Lưu thông tin thành công, nhưng lỗi cấp quyền On-chain: " + parseErrorMessage(roleErr), "warning");
      }
    }

    closeAddEditWalletModal();
    showToast(isEdit ? "Cập nhật thông tin ví thành công!" : "Thêm ví vào danh bạ công ty thành công!", "success");
    addLog(`${isEdit ? "Cập nhật" : "Thêm mới"} ví công ty: ${formattedAddr} (${name})`);
  } catch (err) {
    console.error("Lỗi lưu ví:", err);
    showToast("Lỗi lưu thông tin ví: " + parseErrorMessage(err), "danger");
  } finally {
    hideLoadingOverlay();
  }
}

async function deleteCompanyWallet(address) {
  if (address.toLowerCase() === SUPER_ADMIN_ADDRESS.toLowerCase()) {
    showToast("Không thể xóa ví Quản trị viên tối cao mặc định của hệ thống!", "danger");
    return;
  }

  const w = companyWallets.find(x => x.address.toLowerCase() === address.toLowerCase());
  const name = w ? w.name : address;

  if (!confirm(`Bạn có chắc chắn muốn xóa ví "${name}" (${address}) khỏi danh bạ nội bộ công ty?`)) {
    return;
  }

  showLoadingOverlay("Đang xóa ví khỏi hệ thống...");
  try {
    try {
      const res = await fetch(`/api/company-wallets/${address}`, { method: "DELETE" });
      if (!res.ok) {
        console.warn("Backend DELETE API warning:", await res.text());
      }
    } catch (e) {
      console.warn("Backend DELETE failed, deleting from local cache:", e.message);
    }

    companyWallets = companyWallets.filter(x => x.address.toLowerCase() !== address.toLowerCase());
    localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
    filterCompanyWallets();
    showToast(`Đã xóa ví ${name} khỏi danh bạ công ty!`, "success");
    addLog(`Đã xóa ví nội bộ: ${address} (${name})`);
  } catch (err) {
    showToast("Lỗi xóa ví: " + parseErrorMessage(err), "danger");
  } finally {
    hideLoadingOverlay();
  }
}

// Modal 2: Quick Mint
async function openQuickMintModal(prefillAddress = "") {
  const selectEl = document.getElementById("quickMintWalletSelect");
  if (selectEl) {
    selectEl.innerHTML = `<option value="">-- Chọn ví cổ đông từ danh bạ --</option>` +
      companyWallets.map(w => `<option value="${w.address}">${escapeHtml(w.name)} (${w.address.substring(0, 6)}... - ${w.shares} CP)</option>`).join("");
  }

  const addrInput = document.getElementById("quickMintAddress");
  const amountInput = document.getElementById("quickMintAmount");
  const balanceBox = document.getElementById("quickMintBalanceBox");
  amountInput.value = 50;

  if (prefillAddress) {
    addrInput.value = prefillAddress;
    if (selectEl) selectEl.value = prefillAddress;
    await updateQuickMintBalanceDisplay(prefillAddress);
  } else {
    addrInput.value = "";
    if (balanceBox) balanceBox.style.display = "none";
  }

  document.getElementById("modalQuickMint").style.display = "flex";
}

function closeQuickMintModal() {
  document.getElementById("modalQuickMint").style.display = "none";
}

async function onQuickMintSelectWallet(addr) {
  const addrInput = document.getElementById("quickMintAddress");
  addrInput.value = addr;
  if (addr) {
    await updateQuickMintBalanceDisplay(addr);
  } else {
    document.getElementById("quickMintBalanceBox").style.display = "none";
  }
}

async function updateQuickMintBalanceDisplay(addr) {
  const box = document.getElementById("quickMintBalanceBox");
  const textEl = document.getElementById("quickMintCurrentBalance");
  if (!tokenContract || !ethers.isAddress(addr)) {
    if (box) box.style.display = "none";
    return;
  }
  try {
    box.style.display = "block";
    textEl.textContent = "Đang tra cứu từ Blockchain...";
    const bal = await tokenContract.balanceOf(addr);
    textEl.textContent = `${Number(bal).toLocaleString()} Token Cổ Phần (CP)`;
  } catch (e) {
    textEl.textContent = "Không thể đọc số dư (kiểm tra kết nối mạng)";
  }
}

async function executeQuickMint() {
  const addr = document.getElementById("quickMintAddress").value.trim();
  const amount = Number(document.getElementById("quickMintAmount").value);

  if (!addr || !ethers.isAddress(addr)) {
    showToast("Địa chỉ ví nhận không hợp lệ!", "danger");
    return;
  }
  if (!amount || amount <= 0) {
    showToast("Số lượng cổ phần phải lớn hơn 0!", "danger");
    return;
  }

  if (!tokenContract) {
    showToast("Smart Contract chưa sẵn sàng!", "danger");
    return;
  }

  showLoadingOverlay(`Đang gửi giao dịch mint ${amount} cổ phần cho ${addr.substring(0, 8)}...`);
  try {
    const tx = await tokenContract.mint(addr, amount);
    addLog(`Đang gửi mint ${amount} CP cho ${addr} (Tx: ${tx.hash.substring(0, 10)}...)`);
    await tx.wait(1);
    addLog(`Đã mint thành công ${amount} cổ phần cho ví ${addr}`);
    showToast(`Đã cấp phát thành công ${amount} cổ phần cho ví!`, "success");

    // Tra cứu số dư on-chain mới nhất ngay lập tức để cập nhật giao diện mà không cần tải lại trang
    let newBal = amount;
    try {
      const b = await tokenContract.balanceOf(addr);
      newBal = Number(b);
    } catch (e) {
      console.warn("Lỗi đọc số dư sau mint:", e);
    }

    // Cập nhật số cổ phần trong companyWallets
    const targetIdx = companyWallets.findIndex(w => w.address.toLowerCase() === addr.toLowerCase());
    if (targetIdx >= 0) {
      companyWallets[targetIdx].shares = newBal;
      companyWallets[targetIdx].onChainBalance = newBal;
      localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
      try {
        fetch(`/api/company-wallets/${ethers.getAddress(addr)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...companyWallets[targetIdx], shares: newBal })
        }).catch(() => {});
      } catch {}
      filterCompanyWallets();
    }

    // Cập nhật lại số dư trên Account Card nếu mint cho chính ví đang kết nối
    if (currentAccountInfo && currentAccountInfo.address.toLowerCase() === addr.toLowerCase()) {
      await updateAccountCard();
    }

    closeQuickMintModal();
  } catch (err) {
    console.error("Lỗi mint cổ phần:", err);
    showToast("Lỗi cấp phát cổ phần: " + parseErrorMessage(err), "danger");
  } finally {
    hideLoadingOverlay();
  }
}

// Modal 3: Manage Role
let currentRoleTargetAddress = "";

async function openManageRoleModal(address) {
  currentRoleTargetAddress = address;
  const w = companyWallets.find(x => x.address.toLowerCase() === address.toLowerCase());
  const name = w ? w.name : "Nhân sự công ty";
  const title = w ? w.title : "";

  document.getElementById("roleManageAddress").value = address;
  document.getElementById("roleManagePersonInfo").textContent = `${name} — ${title}`;
  const statusEl = document.getElementById("roleManageStatusDisplay");
  statusEl.textContent = "⏳ Đang kiểm tra quyền hạn từ Smart Contract...";

  document.getElementById("modalManageRole").style.display = "flex";

  if (!electionContract) {
    statusEl.textContent = "⚠️ Smart Contract chưa được khởi tạo!";
    return;
  }

  try {
    const ADMIN_ROLE = ethers.id("ELECTION_ADMIN_ROLE");
    const hasAdmin = await electionContract.hasRole(ADMIN_ROLE, address);
    if (hasAdmin) {
      statusEl.style.color = "#15803d";
      statusEl.innerHTML = "✅ <strong>ĐÃ CÓ QUYỀN:</strong> Ví này hiện đang nắm giữ <code>ELECTION_ADMIN_ROLE</code> trên Smart Contract.";
    } else {
      statusEl.style.color = "#b45309";
      statusEl.innerHTML = "❌ <strong>CHƯA CÓ QUYỀN:</strong> Ví này chưa được cấp quyền Quản trị viên trên Smart Contract.";
    }
  } catch (err) {
    statusEl.textContent = "Không thể kiểm tra: " + parseErrorMessage(err);
  }
}

function closeManageRoleModal() {
  document.getElementById("modalManageRole").style.display = "none";
}

async function executeRoleAction(grant = true) {
  const addr = currentRoleTargetAddress;
  if (!addr || !ethers.isAddress(addr)) {
    showToast("Địa chỉ ví không hợp lệ!", "danger");
    return;
  }
  if (!electionContract) {
    showToast("Smart Contract chưa sẵn sàng!", "danger");
    return;
  }

  const ADMIN_ROLE = ethers.id("ELECTION_ADMIN_ROLE");
  const actionText = grant ? "cấp quyền Quản trị viên (grantRole)" : "thu hồi quyền Quản trị viên (revokeRole)";
  showLoadingOverlay(`Đang gửi giao dịch ${actionText} cho ví ${addr.substring(0, 8)}...`);

  try {
    const tx = grant
      ? await electionContract.grantRole(ADMIN_ROLE, addr)
      : await electionContract.revokeRole(ADMIN_ROLE, addr);

    addLog(`Đang thực hiện ${actionText} (Tx: ${tx.hash.substring(0, 10)}...)`);
    await tx.wait();
    addLog(`Đã hoàn tất ${actionText} cho ${addr}`);
    showToast(`Đã ${grant ? "cấp" : "thu hồi"} quyền ELECTION_ADMIN_ROLE thành công!`, "success");

    // Cập nhật lại vai trò trong companyWallets
    const targetIdx = companyWallets.findIndex(w => w.address.toLowerCase() === addr.toLowerCase());
    if (targetIdx >= 0) {
      companyWallets[targetIdx].role = grant ? "admin" : "voter";
      localStorage.setItem("company_wallets_cache", JSON.stringify(companyWallets));
      filterCompanyWallets();
    }

    await openManageRoleModal(addr);
  } catch (err) {
    console.error("Lỗi phân quyền on-chain:", err);
    showToast("Lỗi phân quyền: " + parseErrorMessage(err), "danger");
  } finally {
    hideLoadingOverlay();
  }
}
