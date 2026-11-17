const fs = require('fs');
const AdmZip = require('adm-zip');

function verifyDocx(filePath, docName) {
  console.log(`\n======================================================`);
  console.log(`VERIFYING DOCUMENT: ${docName}`);
  console.log(`Path: ${filePath}`);
  console.log(`======================================================`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  console.log(`File Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)`);
  if (stats.size < 1000) {
    throw new Error(`File size too small (${stats.size} bytes). Document may be empty or corrupted.`);
  }

  let zip;
  try {
    zip = new AdmZip(filePath);
  } catch (err) {
    throw new Error(`Failed to read as ZIP archive: ${err.message}`);
  }

  const zipEntries = zip.getEntries();
  console.log(`Total ZIP Entries: ${zipEntries.length}`);

  const requiredEntries = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
  for (const req of requiredEntries) {
    const entry = zip.getEntry(req);
    if (!entry) {
      throw new Error(`Missing required OpenXML entry: ${req}`);
    }
  }
  console.log(`✓ OpenXML core package structure is valid.`);

  const docEntry = zip.getEntry('word/document.xml');
  const xmlContent = docEntry.getData().toString('utf8');
  console.log(`word/document.xml uncompressed size: ${xmlContent.length} characters`);

  // Strip XML tags to get raw clean text
  const rawText = xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log(`Raw text character count: ${rawText.length}`);

  const paragraphCount = (xmlContent.match(/<w:p\b/g) || []).length;
  const tableCount = (xmlContent.match(/<w:tbl\b/g) || []).length;
  const tableRowCount = (xmlContent.match(/<w:tr\b/g) || []).length;
  const tableCellCount = (xmlContent.match(/<w:tc\b/g) || []).length;

  console.log(`Paragraphs: ${paragraphCount}`);
  console.log(`Tables: ${tableCount}`);
  console.log(`Table Rows: ${tableRowCount}`);
  console.log(`Table Cells: ${tableCellCount}`);

  return {
    rawText,
    xmlContent,
    stats,
    paragraphCount,
    tableCount,
    tableRowCount
  };
}

function checkKeyword(text, keyword, label) {
  const found = text.toLowerCase().includes(keyword.toLowerCase());
  console.log(`  [${found ? 'PASS' : 'FAIL'}] ${label} (keyword: "${keyword}")`);
  return found;
}

try {
  // 1. Verify Ket_Qua_Kiem_Thu.docx
  const testDoc = verifyDocx('baocao/Ket_Qua_Kiem_Thu.docx', 'Báo Cáo Kết Quả Kiểm Thử (Separate Test File)');
  
  console.log(`\n--- Checking Ket_Qua_Kiem_Thu.docx Checklist ---`);
  const testChecks = [
    checkKeyword(testDoc.rawText, 'ĐẠI HỌC ĐIỆN LỰC', 'University Name'),
    checkKeyword(testDoc.rawText, 'NGUYỄN THỊ XUÂN HOA', 'Student Name'),
    checkKeyword(testDoc.rawText, '23810310027', 'Student ID'),
    checkKeyword(testDoc.rawText, 'NGUYỄN THỊ HỒNG KHÁNH', 'Supervisor Name'),
    checkKeyword(testDoc.rawText, 'PHIẾU ĐÁNH GIÁ', 'Evaluation Sheet'),
    checkKeyword(testDoc.rawText, 'TC01', 'Test Case TC01'),
    checkKeyword(testDoc.rawText, 'TC26', 'Test Case TC26 (Minority Protection)'),
    checkKeyword(testDoc.rawText, 'TC30', 'Test Case TC30 (DoS Gas Limit)'),
    checkKeyword(testDoc.rawText, 'npx hardhat test', 'Execution Command'),
    checkKeyword(testDoc.rawText, '35 passing', '35 Tests Passing Status'),
    checkKeyword(testDoc.rawText, 'DoubleVoter', 'Double Voting Attack Contract'),
    checkKeyword(testDoc.rawText, 'Reentrancy', 'Reentrancy mitigation'),
    checkKeyword(testDoc.rawText, 'Flash Loan', 'Flash loan protection via snapshot'),
    checkKeyword(testDoc.rawText, 'Pausable', 'Pausable mechanism')
  ];

  if (testChecks.some(c => !c)) {
    throw new Error('Some checks in Ket_Qua_Kiem_Thu.docx failed!');
  }
  console.log('✓ 100% CHECKLIST ITEMS PASSED for Ket_Qua_Kiem_Thu.docx\n');

  // 2. Verify Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx
  const masterDoc = verifyDocx('baocao/Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx', 'Báo Cáo Tổng Thể Hệ Thống Bầu HĐQT Blockchain');

  console.log(`\n--- Checking Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx Checklist ---`);
  const masterChecks = [
    // University cover & metadata
    checkKeyword(masterDoc.rawText, 'ĐẠI HỌC ĐIỆN LỰC', 'University Name (Đại học Điện Lực)'),
    checkKeyword(masterDoc.rawText, 'KHOA CÔNG NGHỆ THÔNG TIN', 'Faculty Name (Khoa CNTT)'),
    checkKeyword(masterDoc.rawText, 'NGUYỄN THỊ XUÂN HOA', 'Student Name (Nguyễn Thị Xuân Hoa)'),
    checkKeyword(masterDoc.rawText, '23810310027', 'Student ID (23810310027)'),
    checkKeyword(masterDoc.rawText, 'NGUYỄN THỊ HỒNG KHÁNH', 'Supervisor Name (ThS. Nguyễn Thị Hồng Khánh)'),
    checkKeyword(masterDoc.rawText, 'D18CNPM1', 'Class D18CNPM1'),
    checkKeyword(masterDoc.rawText, 'PHIẾU CHẤM ĐIỂM', 'Evaluation / Grading Sheet (Phiếu chấm điểm)'),
    checkKeyword(masterDoc.rawText, 'MỤC LỤC', 'Table of Contents (Mục lục)'),

    // Functional & Domain Requirements
    checkKeyword(masterDoc.rawText, 'Luật Doanh nghiệp', 'Law on Enterprises (Luật Doanh nghiệp 2020)'),
    checkKeyword(masterDoc.rawText, 'Bầu dồn phiếu', 'Cumulative Voting Concept'),
    checkKeyword(masterDoc.rawText, 'cổ đông thiểu số', 'Minority Shareholder Protection Formula'),
    checkKeyword(masterDoc.rawText, 'FR01', 'Functional Requirement FR01 (ShareToken)'),
    checkKeyword(masterDoc.rawText, 'FR05', 'Functional Requirement FR05 (Cumulative Voting)'),
    checkKeyword(masterDoc.rawText, 'FR08', 'Functional Requirement FR08 (Tie Detection)'),

    // System Architecture & Activity Diagrams
    checkKeyword(masterDoc.rawText, 'Kiến trúc', 'System Architecture'),
    checkKeyword(masterDoc.rawText, 'Biểu đồ hoạt động', 'Activity Diagrams'),
    checkKeyword(masterDoc.rawText, 'Đăng ký ứng viên', 'Candidate Registration Activity'),
    checkKeyword(masterDoc.rawText, 'Bỏ phiếu dồn', 'Voting Activity Diagram'),
    checkKeyword(masterDoc.rawText, 'Đóng phiên', 'Close Election Activity'),

    // Smart Contracts & Tech Stack
    checkKeyword(masterDoc.rawText, 'ShareToken.sol', 'ShareToken Contract'),
    checkKeyword(masterDoc.rawText, 'BoardElection.sol', 'BoardElection Contract'),
    checkKeyword(masterDoc.rawText, 'ERC20Votes', 'ERC20Votes Standard'),
    checkKeyword(masterDoc.rawText, 'auto-delegation', 'Auto-delegation explanation'),
    checkKeyword(masterDoc.rawText, 'snapshotBlock', 'Snapshot Block = block.number - 1'),
    checkKeyword(masterDoc.rawText, 'IPFS', 'IPFS Pinata integration'),
    checkKeyword(masterDoc.rawText, 'Frontend', 'Frontend React / Vite DApp'),

    // Sepolia Testnet Deployment Guide
    checkKeyword(masterDoc.rawText, 'Sepolia', 'Sepolia Network Guide'),
    checkKeyword(masterDoc.rawText, 'deploy-sepolia.js', 'deploy-sepolia.js script'),
    checkKeyword(masterDoc.rawText, '0xa4352AD4E013245AB8B2C33bDb8D0F7E29e309C9', 'Real Deployed ShareToken Address'),
    checkKeyword(masterDoc.rawText, '0xCb78223247400217fdAeAC819983Ec35892fEc9C', 'Real Deployed BoardElection Address'),
    checkKeyword(masterDoc.rawText, 'hardhat verify', 'Contract verification CLI command'),
    checkKeyword(masterDoc.rawText, 'Etherscan', 'Sepolia Etherscan references'),

    // Localhost running guide
    checkKeyword(masterDoc.rawText, 'npx hardhat node', 'Localhost node run command'),
    checkKeyword(masterDoc.rawText, 'deploy-local.js', 'deploy-local.js command'),
    checkKeyword(masterDoc.rawText, '127.0.0.1:8545', 'Local node endpoint (127.0.0.1:8545)'),
    checkKeyword(masterDoc.rawText, 'npm run serve', 'Frontend run command (npm run serve)'),
    checkKeyword(masterDoc.rawText, 'localhost:3000', 'Frontend web endpoint (localhost:3000)'),

    // Testing & Test Cases
    checkKeyword(masterDoc.rawText, 'npx hardhat test', 'Hardhat test command'),
    checkKeyword(masterDoc.rawText, 'TC01', 'Test Case TC01'),
    checkKeyword(masterDoc.rawText, 'TC26', 'Test Case TC26 Minority Protection'),
    checkKeyword(masterDoc.rawText, '35/35', '35/35 Tests passing summary'),

    // Security Analysis (SWC vulnerabilities)
    checkKeyword(masterDoc.rawText, 'Re-entrancy', 'Re-entrancy (SWC-107)'),
    checkKeyword(masterDoc.rawText, 'SWC-107', 'SWC-107 identifier'),
    checkKeyword(masterDoc.rawText, 'Overflow', 'Overflow/Underflow (SWC-101)'),
    checkKeyword(masterDoc.rawText, 'Access Control', 'Access Control (SWC-105)'),
    checkKeyword(masterDoc.rawText, 'Flash Loan', 'Flash Loan manipulation defense'),
    checkKeyword(masterDoc.rawText, 'Double Voting', 'Double voting defense'),
    checkKeyword(masterDoc.rawText, 'Duplicate Candidate', 'Duplicate candidate exploit defense'),
    checkKeyword(masterDoc.rawText, 'DoS', 'Denial of Service Gas Limit (SWC-128)'),
    checkKeyword(masterDoc.rawText, 'MAX_CANDIDATES', 'MAX_CANDIDATES = 50 limit'),
    checkKeyword(masterDoc.rawText, 'Pausable', 'Pausable emergency brake (SWC-133)'),
    checkKeyword(masterDoc.rawText, 'Zero Address', 'Zero Address validation')
  ];

  if (masterChecks.some(c => !c)) {
    throw new Error('Some checks in Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx failed!');
  }
  console.log('✓ 100% CHECKLIST ITEMS PASSED for Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx\n');

  console.log(`======================================================`);
  console.log(`AUDIT RESULT: 100% OF REQUIREMENTS SATISFIED!`);
  console.log(`======================================================\n`);

} catch (err) {
  console.error(`Verification FAILED with error:`, err);
  process.exit(1);
}
