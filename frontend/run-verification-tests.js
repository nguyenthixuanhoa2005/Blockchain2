import { server } from "./server.js";
import { Readable, Writable } from "stream";
import fs from "fs";
import path from "path";

// Backup original company-wallets.json
const walletsPath = path.join("frontend", "company-wallets.json");
const originalWalletsData = fs.readFileSync(walletsPath, "utf8");

function simulateRequest(method, url, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const handler = server.listeners("request")[0];
    if (!handler) return reject(new Error("No request handler found on server"));

    // Mock Request (Readable stream)
    const req = new Readable({
      read() {}
    });
    req.method = method;
    req.url = url;
    req.headers = {
      "content-type": "application/json",
      host: "localhost:3000"
    };

    // Mock Response (Writable stream)
    const res = new Writable({
      write(chunk, encoding, callback) {
        resBody += chunk.toString();
        callback();
      }
    });

    let resBody = "";
    res.statusCode = 200;
    res.headers = {};

    res.writeHead = function (status, headers) {
      res.statusCode = status;
      if (headers) {
        Object.assign(res.headers, headers);
      }
      return res;
    };

    res.setHeader = function (name, val) {
      res.headers[name.toLowerCase()] = val;
    };

    res.end = function (data) {
      if (data) {
        resBody += data.toString();
      }
      let json = null;
      try {
        json = JSON.parse(resBody);
      } catch (e) {
        json = resBody;
      }
      resolve({
        status: res.statusCode,
        headers: res.headers,
        body: json
      });
    };

    try {
      handler(req, res);
      process.nextTick(() => {
        if (bodyObj !== null) {
          const payload = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
          req.push(payload);
        }
        req.push(null);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function runTests() {
  console.log("=================================================");
  console.log("🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG VERIFIER TOÀN DIỆN");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`   ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`   ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Kiểm tra GET /api/pinata-status
    console.log("\n[1] Kiểm tra GET /api/pinata-status");
    const pinataRes = await simulateRequest("GET", "/api/pinata-status");
    assert(pinataRes.status === 200, "GET /api/pinata-status trả về 200");
    assert(pinataRes.body.active === true, "Pinata status active === true");

    // 2. Kiểm tra GET /api/company-wallets
    console.log("\n[2] Kiểm tra GET /api/company-wallets");
    const getRes = await simulateRequest("GET", "/api/company-wallets");
    assert(getRes.status === 200, "GET /api/company-wallets trả về 200");
    assert(Array.isArray(getRes.body), "GET trả về danh sách mảng ví");
    const superAdmin = getRes.body.find(
      (w) => w.address && w.address.toLowerCase() === "0xed9d3be4a094b9cb82f864f793f4f96098323f66"
    );
    assert(!!superAdmin, "Super Admin 0xeD9D3BE4A094B9cb82f864f793F4F96098323F66 có mặt trong danh bạ");
    assert(superAdmin.role === "admin", "Super Admin có role là 'admin'");

    // 3. Kiểm tra POST /api/company-wallets (Thêm ví mới)
    console.log("\n[3] Kiểm tra POST /api/company-wallets (Thêm ví mới)");
    const newWallet = {
      address: "0x1111111111111111111111111111111111111111",
      name: "Nguyễn Kiểm Thử",
      title: "Kỹ sư Blockchain",
      role: "voter",
      shares: 100,
      notes: "Ví thử nghiệm automated test"
    };
    const postRes = await simulateRequest("POST", "/api/company-wallets", newWallet);
    console.log("postRes status:", postRes.status, "body:", postRes.body);
    assert(postRes.status === 201, "POST trả về HTTP 201 Created");
    assert(postRes.body && postRes.body.success === true, "POST trả về success: true");
    assert(postRes.body && postRes.body.wallet && postRes.body.wallet.address === "0x1111111111111111111111111111111111111111", "Địa chỉ ví đã lưu chính xác");

    // 4. Kiểm tra POST trùng lặp địa chỉ ví (Duplicate wallet)
    console.log("\n[4] Kiểm tra POST trùng địa chỉ ví (Conflict 409)");
    const dupRes = await simulateRequest("POST", "/api/company-wallets", newWallet);
    assert(dupRes.status === 409, "POST trùng lặp trả về HTTP 409 Conflict");

    // 5. Kiểm tra POST địa chỉ ví không hợp lệ (Bad Request 400)
    console.log("\n[5] Kiểm tra POST địa chỉ ví sai định dạng");
    const badRes = await simulateRequest("POST", "/api/company-wallets", {
      address: "invalid_address",
      name: "Bad Wallet"
    });
    assert(badRes.status === 400, "POST ví không hợp lệ trả về HTTP 400 Bad Request");

    // 6. Kiểm tra PUT /api/company-wallets/:address (Chỉnh sửa thông tin ví)
    console.log("\n[6] Kiểm tra PUT /api/company-wallets/:address");
    const updateRes = await simulateRequest("PUT", "/api/company-wallets/0x1111111111111111111111111111111111111111", {
      name: "Nguyễn Kiểm Thử (Đã Sửa)",
      shares: 250,
      role: "auditor"
    });
    assert(updateRes.status === 200, "PUT trả về HTTP 200 OK");
    assert(updateRes.body.wallet.name === "Nguyễn Kiểm Thử (Đã Sửa)", "Tên đã được cập nhật chính xác");
    assert(updateRes.body.wallet.shares === 250, "Cổ phần đã cập nhật thành 250");
    assert(updateRes.body.wallet.role === "auditor", "Vai trò đã cập nhật thành auditor");

    // 7. Kiểm tra bảo vệ không cho xóa ví Super Admin (Forbidden 403)
    console.log("\n[7] Kiểm tra bảo vệ xóa ví Super Admin (HTTP 403)");
    const delAdminRes = await simulateRequest("DELETE", "/api/company-wallets/0xeD9D3BE4A094B9cb82f864f793F4F96098323F66");
    assert(delAdminRes.status === 403, "Xóa ví Super Admin trả về HTTP 403 Forbidden");

    // 8. Kiểm tra DELETE ví test thông thường
    console.log("\n[8] Kiểm tra DELETE ví test thông thường");
    const delRes = await simulateRequest("DELETE", "/api/company-wallets/0x1111111111111111111111111111111111111111");
    assert(delRes.status === 200, "Xóa ví thành công trả về HTTP 200 OK");
    assert(delRes.body.success === true, "DELETE trả về success: true");

    // 9. Kiểm tra Static Files
    console.log("\n[9] Kiểm tra phục vụ tệp tĩnh");
    const htmlRes = await simulateRequest("GET", "/index.html");
    assert(htmlRes.status === 200 && typeof htmlRes.body === "string" && htmlRes.body.includes("<!DOCTYPE html>"), "Tệp /index.html phục vụ tốt");

    const appJsRes = await simulateRequest("GET", "/app.js");
    assert(appJsRes.status === 200 && typeof appJsRes.body === "string" && appJsRes.body.includes("SEPOLIA_CHAIN_ID_HEX"), "Tệp /app.js phục vụ tốt");

    const configJsRes = await simulateRequest("GET", "/config.js");
    assert(configJsRes.status === 200 && typeof configJsRes.body === "string" && configJsRes.body.includes("APP_CONFIG"), "Tệp /config.js phục vụ tốt");

    const styleCssRes = await simulateRequest("GET", "/style.css");
    assert(styleCssRes.status === 200 && typeof styleCssRes.body === "string" && styleCssRes.body.includes(":root"), "Tệp /style.css phục vụ tốt");

  } finally {
    // Đóng server
    server.close();
    // Khôi phục dữ liệu ban đầu
    await new Promise((r) => setTimeout(r, 200));
    for (let retry = 0; retry < 5; retry++) {
      try {
        fs.writeFileSync(walletsPath, originalWalletsData, "utf8");
        console.log("\n🧹 Đã khôi phục dữ liệu company-wallets.json về trạng thái sạch ban đầu.");
        break;
      } catch (err) {
        if (err.code === "EPERM" && retry < 4) {
          await new Promise((r) => setTimeout(r, 200));
        } else {
          console.warn("Lưu ý khi khôi phục company-wallets.json:", err.message);
        }
      }
    }
  }

  console.log("\n=================================================");
  console.log(`KẾT QUẢ KIỂM THỬ: ${passed} PASS, ${failed} FAIL`);
  console.log("=================================================");
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("Test Exception:", e);
  process.exit(1);
});
