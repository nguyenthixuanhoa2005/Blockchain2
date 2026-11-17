import http from "http";

console.log("Testing in-process server import...");

// Set port to 3456 before importing
process.env.PORT = "3456";

import("./server.js").then(async () => {
  console.log("Server module loaded.");
  
  // Wait 500ms
  await new Promise(r => setTimeout(r, 500));

  // Probe with http.get
  http.get("http://127.0.0.1:3456/api/company-wallets", (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      console.log("Response status:", res.statusCode);
      console.log("Data length:", data.length);
      const parsed = JSON.parse(data);
      console.log("Wallets count:", parsed.length);
      console.log("First wallet address:", parsed[0].address);
      process.exit(0);
    });
  }).on("error", (e) => {
    console.error("Connection error:", e.message);
    process.exit(1);
  });
}).catch(err => {
  console.error("Import error:", err);
  process.exit(1);
});
