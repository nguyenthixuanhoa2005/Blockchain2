import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.join("frontend", "index.html"), "utf8");
const app = fs.readFileSync(path.join("frontend", "app.js"), "utf8");

const idRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
const uniqueIds = new Set();
let match;
while ((match = idRegex.exec(app)) !== null) {
  uniqueIds.add(match[1]);
}

console.log("Total unique getElementById in app.js:", uniqueIds.size);

const missing = [];
for (const id of uniqueIds) {
  const hasId = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  if (!hasId) {
    missing.push(id);
  }
}

if (missing.length === 0) {
  console.log("✅ All element IDs exist in index.html!");
} else {
  console.log("❌ Missing IDs in index.html:", missing);
}
