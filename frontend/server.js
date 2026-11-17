// Web Server tích hợp API Backend Upload IPFS qua Pinata
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url.split("?")[0];

  // 1. API: Kiểm tra trạng thái Pinata
  if (req.method === "GET" && reqUrl === "/api/pinata-status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ active: true, gateway: PINATA_GATEWAY }));
    return;
  }

  // 2. API: Upload tệp lên IPFS qua Pinata
  if (req.method === "POST" && reqUrl === "/api/upload-pinata") {
    try {
      const rawBody = await getRequestBody(req);
      const payload = JSON.parse(rawBody.toString("utf-8"));
      const { name, type, base64 } = payload;

      if (!base64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Không tìm thấy dữ liệu tệp tải lên (base64 rỗng)." }));
        return;
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
        res.writeHead(pinataRes.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Pinata API Error: ${errText}` }));
        return;
      }

      const pinataData = await pinataRes.json();
      console.log(`[Pinata IPFS Success] CID: ${pinataData.IpfsHash} - Size: ${pinataData.PinSize} bytes`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        cid: pinataData.IpfsHash,
        name: pinataData.Name || name,
        size: pinataData.PinSize,
        gatewayUrl: `${PINATA_GATEWAY}${pinataData.IpfsHash}`
      }));
      return;
    } catch (err) {
      console.error("[Server Error Uploading]:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Lỗi xử lý upload tệp tại server" }));
      return;
    }
  }

  // 3. Phục vụ Static Files cho Frontend
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
  console.log(`👉 Mở trình duyệt và truy cập: http://localhost:${PORT}`);
  console.log("=".repeat(60));
});
