// Web Server tích hợp API Backend Upload IPFS qua Pinata & Quản lý Danh bạ Ví Nội bộ Công ty
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động nạp biến môi trường từ .env nếu có
function loadEnv() {
  const envCandidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env")
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
        console.log(`[Config] Đã nạp thành công biến môi trường từ: ${envFile}`);
        break;
      } catch (err) {
        console.warn(`[Config] Không thể đọc file .env (${envFile}):`, err.message);
      }
    }
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;

// Cấu hình Pinata IPFS (Ưu tiên lấy từ biến môi trường/file .env để bảo mật)
const DEFAULT_PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzMmU5MTgxNi1lMWM4LTRmZjUtODljMy1lOTA4ODQyMDU1YjgiLCJlbWFpbCI6ImxvdmV5b3Vyc2VsZjI0MTIyMDA1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiI1ODg4OGJmZDQ5NDlhMzlhZmEzZiIsInNjb3BlZEtleVNlY3JldCI6IjM4OTBlMmM2OTVjMGMxZTM3YmE0Yjk0OTFhNGFmMGE1NDkxYjZjMTJjNzlkMzY4MDU3ZWFhOGQyYjgyNjZiZTciLCJleHAiOjE4MjY0MzIwNjN9.T1cQ03ykvyooFQb86tOwd2wmOuIAUGVxFYfyjQy3zlc";
const PINATA_JWT = process.env.PINATA_JWT && process.env.PINATA_JWT !== "your_pinata_jwt_token_here" 
  ? process.env.PINATA_JWT 
  : DEFAULT_PINATA_JWT;

// Dedicated Gateway riêng của tài khoản Pinata
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://purple-fashionable-rooster-653.mypinata.cloud/ipfs/";

// Đường dẫn file lưu trữ danh bạ ví nội bộ công ty & thông báo hủy/dừng kỳ bầu cử
const WALLETS_FILE = path.join(__dirname, "company-wallets.json");
const ANNOUNCEMENTS_FILE = path.join(__dirname, "election-announcements.json");
const DEFAULT_ADMIN_WALLET = "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66";

// Quản lý thông báo hủy / dừng kỳ bầu cử
function getAnnouncements() {
  try {
    if (!fs.existsSync(ANNOUNCEMENTS_FILE)) {
      fs.writeFileSync(ANNOUNCEMENTS_FILE, "[]", "utf8");
      return [];
    }
    const raw = fs.readFileSync(ANNOUNCEMENTS_FILE, "utf8");
    let list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("[Announcements DB] Lỗi đọc election-announcements.json:", err.message);
    return [];
  }
}

function saveAnnouncements(list) {
  fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(list, null, 2), "utf8");
}

// Quản lý dữ liệu danh bạ ví nội bộ công ty
function getCompanyWallets() {
  try {
    if (!fs.existsSync(WALLETS_FILE)) {
      const initial = [
        {
          address: DEFAULT_ADMIN_WALLET,
          name: "Chủ tịch HĐQT / Quản trị viên tối cao",
          title: "Chủ tịch Hội đồng Quản trị",
          role: "admin",
          shares: 100,
          notes: "Quản trị viên tối cao hệ thống (Super Admin)",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(WALLETS_FILE, "utf8");
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];

    // Luôn đảm bảo ví Quản trị viên tối cao mặc định tồn tại trong danh bạ
    const adminIndex = list.findIndex(
      (w) => w.address && w.address.toLowerCase() === DEFAULT_ADMIN_WALLET.toLowerCase()
    );
    if (adminIndex === -1) {
      list.unshift({
        address: DEFAULT_ADMIN_WALLET,
        name: "Chủ tịch HĐQT / Quản trị viên tối cao",
        title: "Chủ tịch Hội đồng Quản trị",
        role: "admin",
        shares: 100,
        notes: "Quản trị viên tối cao hệ thống (Super Admin)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(list, null, 2), "utf8");
    } else {
      // Đảm bảo vai trò quản trị viên
      if (list[adminIndex].role !== "admin") {
        list[adminIndex].role = "admin";
        fs.writeFileSync(WALLETS_FILE, JSON.stringify(list, null, 2), "utf8");
      }
    }
    return list;
  } catch (err) {
    console.error("[Wallets DB] Lỗi đọc company-wallets.json:", err.message);
    return [];
  }
}

function saveCompanyWallets(wallets) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");
}

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
};

// Helper đọc toàn bộ body của request
function getRequestBody(req, maxBytes = 35 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(new Error("Dung lượng tệp vượt quá giới hạn 35MB!"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url.split("?")[0];

  // Helper gửi JSON response
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=UTF-8" });
    res.end(JSON.stringify(data));
  };

  // 1. API: Kiểm tra trạng thái Pinata
  if (req.method === "GET" && reqUrl === "/api/pinata-status") {
    return sendJson(200, { active: true, gateway: PINATA_GATEWAY });
  }

  // 2. API: Upload tệp lên IPFS qua Pinata
  if (req.method === "POST" && reqUrl === "/api/upload-pinata") {
    try {
      const rawBody = await getRequestBody(req);
      const payload = JSON.parse(rawBody.toString("utf-8"));
      const { name, type, base64 } = payload;

      if (!base64) {
        return sendJson(400, { error: "Không tìm thấy dữ liệu tệp tải lên (base64 rỗng)." });
      }

      console.log(`[Pinata IPFS] Đang tải lên tệp "${name || "candidate_profile"}"...`);

      const fileBuffer = Buffer.from(base64, "base64");
      const blob = new Blob([fileBuffer], { type: type || "application/octet-stream" });

      const formData = new FormData();
      formData.append("file", blob, name || "candidate_profile.pdf");

      const pinataMetadata = JSON.stringify({
        name: name || "Ho_so_ung_vien_HDQT",
        keyvalues: {
          app: "He_Thong_Bau_HDQT",
          uploadedAt: new Date().toISOString()
        }
      });
      formData.append("pinataMetadata", pinataMetadata);

      const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`
        },
        body: formData
      });

      if (!pinataRes.ok) {
        const errText = await pinataRes.text();
        console.error("[Pinata IPFS Error]:", errText);
        return sendJson(pinataRes.status, { error: `Pinata API Error: ${errText}` });
      }

      const pinataData = await pinataRes.json();
      console.log(`[Pinata IPFS Success] CID: ${pinataData.IpfsHash} - Size: ${pinataData.PinSize} bytes`);

      return sendJson(200, {
        success: true,
        cid: pinataData.IpfsHash,
        name: pinataData.Name || name,
        size: pinataData.PinSize,
        gatewayUrl: `${PINATA_GATEWAY}${pinataData.IpfsHash}`
      });
    } catch (err) {
      console.error("[Server Error Uploading]:", err);
      return sendJson(500, { error: err.message || "Lỗi xử lý upload tệp tại server" });
    }
  }

  // ---------------------------------------------------------
  // 3. REST API: Danh bạ ví nội bộ công ty (Company Wallets)
  // ---------------------------------------------------------

  // GET /api/announcements
  if (req.method === "GET" && reqUrl === "/api/announcements") {
    try {
      const list = getAnnouncements();
      return sendJson(200, list);
    } catch (err) {
      return sendJson(500, { error: "Lỗi đọc danh sách thông báo: " + err.message });
    }
  }

  // POST /api/announcements (Hủy hoặc dừng kỳ bầu cử có lý do)
  if (req.method === "POST" && reqUrl === "/api/announcements") {
    try {
      const rawBody = await getRequestBody(req);
      const payload = JSON.parse(rawBody.toString("utf-8") || "{}");
      const { electionId, title, actionType, reason, author, signature } = payload;

      if (!electionId) {
        return sendJson(400, { error: "Thiếu electionId!" });
      }

      const list = getAnnouncements();
      const newAnnouncement = {
        id: Date.now(),
        electionId: Number(electionId),
        title: title || `Kỳ #${electionId}`,
        actionType: actionType || "CANCEL", // CANCEL / FORCE_STOP
        reason: reason || "Phát hiện dấu hiệu gian lận hoặc vi phạm quy chế bầu cử.",
        author: author || "Admin",
        signature: signature || null,
        createdAt: new Date().toISOString()
      };

      list.unshift(newAnnouncement);
      saveAnnouncements(list.slice(0, 100)); // Lưu tối đa 100 thông báo gần nhất
      console.log(`[Announcements] Đã ghi nhận quyết định hủy/dừng kỳ #${electionId}: ${newAnnouncement.reason}`);
      return sendJson(201, { success: true, announcement: newAnnouncement });
    } catch (err) {
      return sendJson(500, { error: "Lỗi ghi nhận thông báo hủy/dừng: " + err.message });
    }
  }

  // DELETE /api/announcements/:id (Khôi phục lại kỳ nếu cần)
  if (req.method === "DELETE" && reqUrl.startsWith("/api/announcements/")) {
    try {
      const targetEid = Number(decodeURIComponent(reqUrl.replace("/api/announcements/", "")).trim());
      let list = getAnnouncements();
      list = list.filter(a => Number(a.electionId) !== targetEid && Number(a.id) !== targetEid);
      saveAnnouncements(list);
      return sendJson(200, { success: true, message: "Đã hủy quyết định dừng kỳ bầu cử" });
    } catch (err) {
      return sendJson(500, { error: "Lỗi hủy thông báo: " + err.message });
    }
  }

  // GET /api/company-wallets
  if (req.method === "GET" && reqUrl === "/api/company-wallets") {
    try {
      const wallets = getCompanyWallets();
      return sendJson(200, wallets);
    } catch (err) {
      return sendJson(500, { error: "Lỗi đọc danh bạ ví: " + err.message });
    }
  }

  // POST /api/company-wallets
  if (req.method === "POST" && reqUrl === "/api/company-wallets") {
    try {
      const rawBody = await getRequestBody(req);
      const payload = JSON.parse(rawBody.toString("utf-8") || "{}");
      const { address, name, title, role, shares, notes } = payload;

      if (!address || typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
        return sendJson(400, { error: "Địa chỉ ví không hợp lệ (phải bắt đầu bằng 0x kèm 40 ký tự hex)!" });
      }

      const formattedAddress = address.trim();
      const wallets = getCompanyWallets();

      const exists = wallets.some((w) => w.address.toLowerCase() === formattedAddress.toLowerCase());
      if (exists) {
        return sendJson(409, { error: "Địa chỉ ví này đã tồn tại trong danh bạ công ty!" });
      }

      const newWallet = {
        address: formattedAddress,
        name: (name || "Chưa đặt tên").trim(),
        title: (title || "Nhân sự").trim(),
        role: (role || "voter").trim(),
        isCandidate: Boolean(payload.isCandidate || role === "candidate" || role === "voter_candidate"),
        shares: Number(shares) || 0,
        notes: (notes || "").trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      wallets.push(newWallet);
      saveCompanyWallets(wallets);
      console.log(`[Wallets DB] Đã thêm ví mới: ${newWallet.address} (${newWallet.name})`);
      return sendJson(201, { success: true, message: "Thêm ví vào danh bạ thành công", wallet: newWallet });
    } catch (err) {
      return sendJson(500, { error: "Lỗi xử lý thêm ví: " + err.message });
    }
  }

  // PUT /api/company-wallets/:address
  if (req.method === "PUT" && reqUrl.startsWith("/api/company-wallets/")) {
    try {
      const targetAddress = decodeURIComponent(reqUrl.replace("/api/company-wallets/", "")).trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
        return sendJson(400, { error: "Địa chỉ ví URL không hợp lệ!" });
      }

      const rawBody = await getRequestBody(req);
      const payload = JSON.parse(rawBody.toString("utf-8") || "{}");
      const wallets = getCompanyWallets();

      const index = wallets.findIndex((w) => w.address.toLowerCase() === targetAddress.toLowerCase());
      if (index === -1) {
        return sendJson(404, { error: "Không tìm thấy địa chỉ ví trong danh bạ công ty!" });
      }

      // Cập nhật các trường được cung cấp
      if (payload.name !== undefined) wallets[index].name = String(payload.name).trim();
      if (payload.title !== undefined) wallets[index].title = String(payload.title).trim();
      if (payload.role !== undefined) wallets[index].role = String(payload.role).trim();
      if (payload.isCandidate !== undefined) wallets[index].isCandidate = Boolean(payload.isCandidate);
      if (payload.shares !== undefined) wallets[index].shares = Number(payload.shares) || 0;
      if (payload.notes !== undefined) wallets[index].notes = String(payload.notes).trim();
      wallets[index].updatedAt = new Date().toISOString();

      saveCompanyWallets(wallets);
      console.log(`[Wallets DB] Đã cập nhật ví: ${wallets[index].address} (${wallets[index].name})`);
      return sendJson(200, { success: true, message: "Cập nhật thông tin ví thành công", wallet: wallets[index] });
    } catch (err) {
      return sendJson(500, { error: "Lỗi cập nhật thông tin ví: " + err.message });
    }
  }

  // DELETE /api/company-wallets/:address
  if (req.method === "DELETE" && reqUrl.startsWith("/api/company-wallets/")) {
    try {
      const targetAddress = decodeURIComponent(reqUrl.replace("/api/company-wallets/", "")).trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
        return sendJson(400, { error: "Địa chỉ ví URL không hợp lệ!" });
      }

      // Không cho phép xóa ví Super Admin mặc định
      if (targetAddress.toLowerCase() === DEFAULT_ADMIN_WALLET.toLowerCase()) {
        return sendJson(403, { error: "Không thể xóa ví Quản trị viên tối cao mặc định của hệ thống!" });
      }

      const wallets = getCompanyWallets();
      const index = wallets.findIndex((w) => w.address.toLowerCase() === targetAddress.toLowerCase());
      if (index === -1) {
        return sendJson(404, { error: "Không tìm thấy địa chỉ ví trong danh bạ công ty!" });
      }

      const removed = wallets.splice(index, 1)[0];
      saveCompanyWallets(wallets);
      console.log(`[Wallets DB] Đã xóa ví: ${removed.address} (${removed.name})`);
      return sendJson(200, { success: true, message: "Đã xóa ví khỏi danh bạ thành công", address: targetAddress });
    } catch (err) {
      return sendJson(500, { error: "Lỗi xóa ví: " + err.message });
    }
  }

  // ---------------------------------------------------------
  // 4. Phục vụ Static Files cho Frontend
  // ---------------------------------------------------------
  let filePath = path.join(__dirname, reqUrl === "/" ? "/index.html" : reqUrl);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("=".repeat(60));
  console.log(`🌐 WEB SERVER ĐÃ SẴN SÀNG TẠI: http://127.0.0.1:${PORT}`);
  console.log(`📡 Đã tích hợp IPFS Pinata Gateway: ${PINATA_GATEWAY}`);
  console.log(`💼 Đã tích hợp REST API Danh bạ ví công ty: /api/company-wallets`);
  console.log(`👉 Mở trình duyệt và truy cập: http://localhost:${PORT}`);
  console.log("=".repeat(60));
});

export { server };

