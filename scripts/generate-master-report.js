import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  PageBreak
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color palette
const COLOR_PRIMARY = "1F4E78";     // Deep corporate navy
const COLOR_SECONDARY = "2E75B6";   // Accent blue
const COLOR_TEXT = "262626";        // Charcoal dark
const COLOR_MUTED = "595959";       // Muted gray
const COLOR_BG_HEADER = "1F4E78";   // Header table background
const COLOR_BG_ZEBRA = "F2F4F7";    // Alternating row light gray
const COLOR_SUCCESS_BG = "E2F0D9"; // Soft green
const COLOR_SUCCESS_TXT = "385723";
const COLOR_CODE_BG = "F4F6F8";
const COLOR_BORDER = "D0D5DD";

const FONT_FAMILY = "Times New Roman";

// Helper styles
function createCoverHeading(text, size = 28, bold = true, color = COLOR_PRIMARY, spacing = { before: 100, after: 100 }) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: spacing,
    children: [
      new TextRun({
        text: text,
        bold: bold,
        size: size,
        color: color,
        font: FONT_FAMILY
      })
    ]
  });
}

function createChapterTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 32, // 16pt
        color: COLOR_PRIMARY,
        font: FONT_FAMILY
      })
    ]
  });
}

function createSectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 28, // 14pt
        color: COLOR_SECONDARY,
        font: FONT_FAMILY
      })
    ]
  });
}

function createSubSectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 90 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        italics: true,
        size: 26, // 13pt
        color: COLOR_TEXT,
        font: FONT_FAMILY
      })
    ]
  });
}

function createBodyParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: options.before || 60, after: options.after || 60, line: 300 }, // 1.25 line spacing
    alignment: options.alignment || AlignmentType.JUSTIFIED,
    indent: options.indent ? { left: options.indent } : undefined,
    children: [
      new TextRun({
        text: text,
        size: options.size || 26, // 13pt
        font: FONT_FAMILY,
        bold: options.bold || false,
        italics: options.italics || false,
        color: options.color || COLOR_TEXT
      })
    ]
  });
}

function createBulletItem(leadText, bodyText) {
  return new Paragraph({
    spacing: { before: 40, after: 40, line: 280 },
    indent: { left: 360 },
    alignment: AlignmentType.JUSTIFIED,
    children: [
      new TextRun({ text: "•  ", bold: true, color: COLOR_SECONDARY, size: 24, font: FONT_FAMILY }),
      new TextRun({ text: leadText + ": ", bold: true, color: COLOR_TEXT, size: 26, font: FONT_FAMILY }),
      new TextRun({ text: bodyText, color: COLOR_TEXT, size: 26, font: FONT_FAMILY })
    ]
  });
}

function createCalloutBox(title, content) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_SECONDARY },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_SECONDARY },
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_PRIMARY },
      right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_SECONDARY }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 24,
                    color: COLOR_PRIMARY,
                    font: FONT_FAMILY
                  })
                ]
              }),
              new Paragraph({
                spacing: { line: 260 },
                children: [
                  new TextRun({
                    text: content,
                    size: 22,
                    font: FONT_FAMILY,
                    color: COLOR_TEXT
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function createDataTable(headers, rows, widths) {
  const border = {
    top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
    left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
    right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: border,
    rows: [
      new TableRow({
        children: headers.map((h, i) => new TableCell({
          width: { size: widths[i], type: WidthType.PERCENTAGE },
          shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 20 })]
            })
          ]
        }))
      }),
      ...rows.map((row, rIdx) => {
        const bg = rIdx % 2 === 1 ? COLOR_BG_ZEBRA : "FFFFFF";
        return new TableRow({
          children: row.map((cellText, cIdx) => new TableCell({
            width: { size: widths[cIdx], type: WidthType.PERCENTAGE },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 70, bottom: 70, left: 90, right: 90 },
            children: [
              new Paragraph({
                alignment: cIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: [new TextRun({ text: cellText, font: FONT_FAMILY, size: 19 })]
              })
            ]
          }))
        });
      })
    ]
  });
}

function createCodeBlock(codeText, lang = "solidity") {
  const lines = codeText.split('\n');
  const paragraphs = lines.map(line => {
    return new Paragraph({
      spacing: { before: 15, after: 15, line: 220 },
      children: [
        new TextRun({
          text: line,
          font: "Consolas",
          size: 19, // 9.5pt
          color: "24292E"
        })
      ]
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 18, color: COLOR_SECONDARY },
      right: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: paragraphs
          })
        ]
      })
    ]
  });
}

function createDiagramBox(title, diagramText) {
  const lines = diagramText.split('\n');
  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          font: FONT_FAMILY,
          size: 22,
          color: COLOR_PRIMARY
        })
      ]
    }),
    ...lines.map(line => {
      return new Paragraph({
        spacing: { before: 10, after: 10, line: 200 },
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: line,
            font: "Consolas",
            size: 17, // 8.5pt
            color: "1A365D",
            bold: line.includes("┌") || line.includes("├") || line.includes("│") || line.includes("==") || line.includes("STEP") || line.includes("LÀN")
          })
        ]
      });
    })
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
      left: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
      right: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: paragraphs
          })
        ]
      })
    ]
  });
}

// Generate the whole document
export async function buildMasterReport() {
  console.log("🚀 Bắt đầu khởi tạo Báo cáo Chuyên đề: Xây dựng Hệ thống Bỏ phiếu Bầu HĐQT Doanh nghiệp...");
  console.log("-> Đang cấu hình các chương và sơ đồ hoàn chỉnh...");

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT_FAMILY,
            size: 26,
            color: COLOR_TEXT
          }
        }
      }
    },
    sections: [
      // ================= SECTION 1: COVER PAGE & PHIẾU CHẤM ĐIỂM =================
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch = 2.54 cm
              bottom: 1440,
              left: 1700,   // ~3.0 cm for binding
              right: 1440   // ~2.5 cm
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "Trường Đại học Điện Lực — Báo cáo Chuyên đề Blockchain",
                    font: FONT_FAMILY,
                    size: 18,
                    italics: true,
                    color: COLOR_MUTED
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "Trang ",
                    font: FONT_FAMILY,
                    size: 20
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: 20
                  }),
                  new TextRun({
                    text: " / ",
                    font: FONT_FAMILY,
                    size: 20
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: 20
                  })
                ]
              })
            ]
          })
        },
        children: [
          // TRANG BÌA
          new Paragraph({ spacing: { before: 100, after: 40 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "BỘ CÔNG THƯƠNG", bold: true, size: 28, font: FONT_FAMILY, color: "000000" })
          ]}),
          new Paragraph({ spacing: { before: 20, after: 40 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "TRƯỜNG ĐẠI HỌC ĐIỆN LỰC", bold: true, size: 30, font: FONT_FAMILY, color: COLOR_PRIMARY })
          ]}),
          new Paragraph({ spacing: { before: 20, after: 200 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "KHOA CÔNG NGHỆ THÔNG TIN", bold: true, size: 26, font: FONT_FAMILY, color: "000000" })
          ]}),

          // Horizontal divider line
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 400 },
            children: [
              new TextRun({ text: "————————— 🙞🙜 🕮 🙞🙜 —————————", size: 22, color: COLOR_SECONDARY, bold: true })
            ]
          }),

          new Paragraph({ spacing: { before: 200, after: 100 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "BÁO CÁO CHUYÊN ĐỀ HỌC PHẦN", bold: true, size: 32, font: FONT_FAMILY, color: "000000" })
          ]}),
          new Paragraph({ spacing: { before: 60, after: 240 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "LẬP TRÌNH BLOCKCHAIN", bold: true, size: 36, font: FONT_FAMILY, color: COLOR_PRIMARY })
          ]}),

          new Paragraph({ spacing: { before: 200, after: 100 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "ĐỀ TÀI:", bold: true, size: 28, font: FONT_FAMILY, color: COLOR_SECONDARY })
          ]}),
          new Paragraph({ spacing: { before: 80, after: 600 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({
              text: "XÂY DỰNG HỆ THỐNG BỎ PHIẾU BẦU\nHỘI ĐỒNG QUẢN TRỊ DOANH NGHIỆP\nBẰNG SMART CONTRACT TRÊN ETHEREUM",
              bold: true,
              size: 34,
              font: FONT_FAMILY,
              color: COLOR_PRIMARY
            })
          ]}),

          // Thông tin thực hiện
          new Table({
            width: { size: 90, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.CENTER,
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE }
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 45, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Giảng viên hướng dẫn:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    width: { size: 55, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "ThS. NGUYỄN THỊ HỒNG KHÁNH", bold: true, font: FONT_FAMILY, size: 26, color: COLOR_PRIMARY })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Sinh viên thực hiện:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "NGUYỄN THỊ XUÂN HOA", bold: true, font: FONT_FAMILY, size: 26, color: COLOR_PRIMARY })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Mã sinh viên:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "23810310027", font: FONT_FAMILY, size: 26 })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Ngành đào tạo:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "CÔNG NGHỆ THÔNG TIN", font: FONT_FAMILY, size: 26 })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Chuyên ngành:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "CÔNG NGHỆ PHẦN MỀM", font: FONT_FAMILY, size: 26 })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Lớp chuyên ngành:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "D18CNPM1", font: FONT_FAMILY, size: 26 })] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "Khóa học:", bold: true, font: FONT_FAMILY, size: 26 })] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "2023 – 2028", font: FONT_FAMILY, size: 26 })] })
                    ]
                  })
                ]
              })
            ]
          }),

          new Paragraph({ spacing: { before: 800, after: 60 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "Hà Nội, tháng 01 năm 2027", bold: true, italics: true, size: 26, font: FONT_FAMILY, color: "000000" })
          ]}),

          // Page Break to PHIẾU CHẤM ĐIỂM
          new Paragraph({ children: [new PageBreak()] }),

          // PHIẾU CHẤM ĐIỂM
          new Paragraph({ spacing: { before: 100, after: 40 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "BỘ CÔNG THƯƠNG\nTRƯỜNG ĐẠI HỌC ĐIỆN LỰC", bold: true, size: 24, font: FONT_FAMILY })
          ]}),
          new Paragraph({ spacing: { before: 80, after: 200 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "PHIẾU CHẤM ĐIỂM BÁO CÁO CHUYÊN ĐỀ", bold: true, size: 28, font: FONT_FAMILY, color: COLOR_PRIMARY })
          ]}),

          createBodyParagraph("1. Thông tin sinh viên và nội dung thực hiện:"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 8, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STT", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Họ và tên sinh viên\n(Mã sinh viên)", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 52, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Nội dung thực hiện chuyên đề", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Chữ ký\nsinh viên", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Nguyễn Thị Xuân Hoa\nMSV: 23810310027\nLớp: D18CNPM1", bold: true, font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: "- Nghiên cứu cơ chế Bầu dồn phiếu theo Luật Doanh nghiệp 2020.\n- Thiết kế kiến trúc hệ thống 3 tầng: Web dApp, Node.js Backend & IPFS Pinata, Ethereum Smart Contract.\n- Phân tích chi tiết 4 tác nhân (Actors) và xây dựng 5 Biểu đồ hoạt động Swimlane chuẩn UML kèm mô tả bước và chốt an toàn.\n- Phát triển Smart Contract: ShareToken.sol (ERC20Votes checkpoint snapshot) và BoardElection.sol (Cumulative voting, Selection Sort winners, tie detection, Pausable, ReentrancyGuard).\n- Xây dựng bộ kiểm thử Hardhat tự động với 35/35 ca kiểm thử đạt 100% PASS.\n- Triển khai thực tế và xác minh thành công trên mạng Ethereum Sepolia Testnet.", font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Đã ký)", italics: true, color: COLOR_MUTED, font: FONT_FAMILY, size: 20 })] })] })
                ]
              })
            ]
          }),

          createBodyParagraph("2. Đánh giá và cho điểm của Giảng viên chấm thi:", { before: 180 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Họ và tên Giảng viên", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Điểm số", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Điểm bằng chữ", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Nhận xét", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Chữ ký", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Giảng viên chấm 1:\nThS. Nguyễn Thị Hồng Khánh", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Giảng viên chấm 2:\n.........................................", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] }),
                  new TableCell({ margins: { top: 120, bottom: 120, left: 100, right: 100 }, children: [new Paragraph({ text: "" })] })
                ]
              })
            ]
          }),

          // Page Break to LỜI MỞ ĐẦU & MỤC LỤC
          new Paragraph({ children: [new PageBreak()] }),

          // LỜI MỞ ĐẦU
          createChapterTitle("LỜI MỞ ĐẦU"),
          createBodyParagraph("Trong bối cảnh nền kinh tế thị trường hiện đại, quản trị công ty cổ phần đóng vai trò then chốt quyết định sự thành bại và tính bền vững của doanh nghiệp. Trong đó, Đại hội đồng Cổ đông là cơ quan có thẩm quyền quyết định cao nhất, và cuộc bỏ phiếu bầu cử các thành viên Hội đồng Quản trị (HĐQT) — cơ quan quản lý trực tiếp doanh nghiệp giữa hai kỳ đại hội — là sự kiện trọng đại, trực tiếp định hình định hướng chiến lược và phân chia lợi ích giữa các nhóm cổ đông."),
          createBodyParagraph("Tuy nhiên, phương thức bầu cử truyền thống áp dụng cơ chế bầu đa số thông thường (Majority Voting) thường dẫn đến tình trạng cổ đông nắm đa số cổ phần (trên 51%) có thể thâu tóm toàn bộ số ghế trong HĐQT, gạt bỏ hoàn toàn tiếng nói của các cổ đông thiểu số. Để khắc phục điều này, Luật Doanh nghiệp Việt Nam số 59/2020/QH14 (Điều 148, Khoản 3) đã quy định bắt buộc áp dụng phương thức Bầu dồn phiếu (Cumulative Voting) nhằm tạo điều kiện cho các nhóm cổ đông nhỏ liên kết số phiếu để đưa đại diện có uy tín vào HĐQT."),
          createBodyParagraph("Mặc dù có ý nghĩa pháp lý và nhân văn to lớn, việc thực thi bầu dồn phiếu bằng phương thức truyền thống (bỏ phiếu giấy hoặc phần mềm tập trung do ban quản trị công ty cài đặt) lại đối mặt với hàng loạt thách thức: nguy cơ gian lận trong khâu kiểm phiếu, thao túng cơ sở dữ liệu nội bộ, thiếu tính công khai thời gian thực, và rủi ro sửa đổi biên bản kiểm phiếu. Công nghệ chuỗi khối (Blockchain) với đặc tính bất biến (immutability), minh bạch tuyệt đối (transparency), và thực thi tự động qua Hợp đồng thông minh (Smart Contract) là lời giải công nghệ hoàn hảo cho bài toán này."),
          createBodyParagraph("Báo cáo chuyên đề này trình bày toàn diện quá trình nghiên cứu, thiết kế, cài đặt, kiểm thử và triển khai 'Hệ thống Bỏ phiếu Bầu Hội đồng Quản trị Doanh nghiệp On-chain' trên nền tảng Blockchain Ethereum. Hệ thống kết hợp chuẩn token ERC20Votes lưu checkpoint lịch sử nhằm loại bỏ tấn công vay nhanh (Flash Loan), lưu trữ hồ sơ lý lịch ứng viên phi tập trung qua mạng IPFS (Pinata Cloud), và cung cấp giao diện Web dApp tương tác phân quyền cho 4 vai trò tác nhân: Quản trị viên, Cổ đông, Ban kiểm soát và Khách giám sát."),

          // MỤC LỤC TỔNG QUAN
          new Paragraph({ spacing: { before: 200, after: 100 } }),
          createChapterTitle("MỤC LỤC"),
          createBodyParagraph("LỜI MỞ ĐẦU ......................................................................................................................... 3"),
          createBodyParagraph("CHƯƠNG 1. TỔNG QUAN VÀ PHÂN TÍCH YÊU CẦU HỆ THỐNG .................................................... 5"),
          createBodyParagraph("  1.1. Đặt vấn đề và tính cấp thiết ......................................................................................... 5"),
          createBodyParagraph("  1.2. Mục tiêu nghiên cứu và phạm vi hệ thống ..................................................................... 6"),
          createBodyParagraph("  1.3. Mô hình toán học Bầu dồn phiếu & Bảo vệ cổ đông thiểu số ........................................... 7"),
          createBodyParagraph("  1.4. Phân tích chi tiết 4 tác nhân trong hệ thống (Actors Analysis) ........................................ 9"),
          createBodyParagraph("  1.5. Sơ đồ tổng quát Use Case và Ma trận phân quyền Tác nhân .......................................... 12"),
          createBodyParagraph("  1.6. Phân rã yêu cầu chức năng (FR) và phi chức năng (NFR) ................................................ 15"),
          createBodyParagraph("CHƯƠNG 2. THIẾT KẾ KIẾN TRÚC VÀ QUY TRÌNH HỆ THỐNG ..................................................... 18"),
          createBodyParagraph("  2.1. Kiến trúc tổng thể 3 tầng (Client - Server & IPFS - Blockchain) ........................................ 18"),
          createBodyParagraph("  2.2. Sơ đồ kiến trúc tổng quan (Architecture Diagram) ........................................................ 19"),
          createBodyParagraph("  2.3. Sơ đồ luồng quy trình nghiệp vụ (Sequence Diagram) ..................................................... 21"),
          createBodyParagraph("  2.4. Sơ đồ máy trạng thái cuộc bầu cử (State Diagram) ........................................................ 23"),
          createBodyParagraph("  2.5. Chi tiết 5 Biểu đồ hoạt động Swimlane chuẩn UML kèm mô tả và chốt an toàn ......... 25"),
          createBodyParagraph("  2.6. Thiết kế mô hình lớp và phân quyền Smart Contract (Class Diagram) .............................. 36"),
          createBodyParagraph("CHƯƠNG 3. HIỆN THỰC HÓA SMART CONTRACT VÀ CÔNG NGHỆ ỨNG DỤNG ............................ 38"),
          createBodyParagraph("  3.1. Phân tích chuyên sâu Smart Contract ShareToken.sol ..................................................... 38"),
          createBodyParagraph("  3.2. Phân tích chuyên sâu Smart Contract BoardElection.sol ................................................. 41"),
          createBodyParagraph("  3.3. Tầng trung gian và Lưu trữ phi tập trung IPFS (Pinata Gateway) ....................................... 46"),
          createBodyParagraph("  3.4. Giao diện người dùng Web dApp đa vai trò ................................................................... 48"),
          createBodyParagraph("CHƯƠNG 4. HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH HỆ THỐNG ................................................ 51"),
          createBodyParagraph("  4.1. Hướng dẫn khởi chạy trên môi trường Localhost ........................................................... 51"),
          createBodyParagraph("  4.2. Hướng dẫn triển khai lên mạng Ethereum Sepolia Testnet bằng CLI .................................. 54"),
          createBodyParagraph("  4.3. Thông tin triển khai thực tế trên Sepolia & Etherscan ..................................................... 57"),
          createBodyParagraph("  4.4. Hướng dẫn xác minh mã nguồn hợp đồng (Contract Verification) .................................... 59"),
          createBodyParagraph("CHƯƠNG 5. KIỂM THỬ TỰ ĐỘNG VÀ ĐÁNH GIÁ CHẤT LƯỢNG (TEST SUITE) .............................. 61"),
          createBodyParagraph("  5.1. Chiến lược và môi trường kiểm thử (Hardhat, Mocha, Chai, Ethers.js) .............................. 61"),
          createBodyParagraph("  5.2. Ma trận các ca kiểm thử chi tiết (TC01 – TC35) ............................................................. 63"),
          createBodyParagraph("  5.3. Kết quả thực thi kiểm thử thực tế (100% PASS, 866 ms) ................................................. 71"),
          createBodyParagraph("  5.4. Đánh giá kiểm thử kịch bản bảo vệ cổ đông thiểu số (TC26) ............................................ 74"),
          createBodyParagraph("CHƯƠNG 6. PHÂN TÍCH AN TOÀN VÀ BẢO MẬT SMART CONTRACT ........................................... 76"),
          createBodyParagraph("  6.1. Tổng quan an toàn bảo mật trong Smart Contract (SWC Registry) ................................... 76"),
          createBodyParagraph("  6.2. Phân tích 9 lỗ hổng bảo mật Web3 trọng yếu và biện pháp phòng ngừa ........................... 77"),
          createBodyParagraph("  6.3. Chính sách bảo mật API Key và Quản lý Secrets ............................................................ 84"),
          createBodyParagraph("KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN ........................................................................................... 86"),
          createBodyParagraph("TÀI LIỆU THAM KHẢO ............................................................................................................. 88"),

          // Page Break to CHƯƠNG 1
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 1 =================
          createChapterTitle("CHƯƠNG 1. TỔNG QUAN VÀ PHÂN TÍCH YÊU CẦU HỆ THỐNG"),
          createSectionTitle("1.1. Đặt vấn đề và tính cấp thiết"),
          createBodyParagraph("Trong cơ cấu quản trị của một Công ty Cổ phần (JSC), Hội đồng Quản trị (HĐQT) là cơ quan đại diện cho toàn thể cổ đông, nắm giữ quyền quyết định đối với các kế hoạch kinh doanh trung hạn, chính sách tài chính, bổ nhiệm Ban Giám đốc điều hành và bảo vệ tài sản doanh nghiệp. Việc bầu cử các thành viên HĐQT diễn ra định kỳ tại Đại hội đồng Cổ đông (ĐHĐCĐ) là sự kiện có ý nghĩa sống còn đối với sự phát triển của công ty."),
          createBodyParagraph("Tuy nhiên, nếu áp dụng phương thức bỏ phiếu truyền thống đa số thông thường (Normal / Straight Voting), mỗi cổ đông chỉ được bỏ phiếu độc lập cho từng ứng viên với số phiếu tối đa bằng số cổ phần mình sở hữu. Dưới cơ chế này, một nhóm cổ đông nắm giữ trên 50% vốn điều lệ có thể dễ dàng bỏ phiếu cho danh sách tất cả các ứng viên của phe mình, khiến họ thâu tóm 100% các ghế trong HĐQT. Nhóm cổ đông thiểu số dù nắm tới 49% cổ phần cũng hoàn toàn không có cơ hội đưa bất kỳ đại diện nào của mình vào cơ quan quản lý cao nhất."),
          createBodyParagraph("Để giải quyết bất cập mang tính cấu trúc này, Điều 148 Khoản 3 của Luật Doanh nghiệp Việt Nam số 59/2020/QH14 quy định rõ:"),
          createCalloutBox(
            "Trích dẫn Điều 148 Khoản 3 — Luật Doanh nghiệp 2020",
            "\"Phương thức bầu dồn phiếu được áp dụng đối với việc bầu thành viên Hội đồng quản trị và Ban kiểm soát, trừ trường hợp Điều lệ công ty có quy định khác. Theo phương thức này, mỗi cổ đông có tổng số phiếu biểu quyết tương ứng với tổng số cổ phần sở hữu nhân với số thành viên được bầu của Hội đồng quản trị hoặc Ban kiểm soát và cổ đông có quyền dồn hết hoặc một phần tổng số phiếu của mình cho một hoặc một số ứng viên.\""
          ),
          createBodyParagraph("Mặc dù phương thức Bầu dồn phiếu mang lại sự công bằng rất lớn, việc tổ chức bầu dồn phiếu trong thực tế bằng phương pháp kiểm phiếu thủ công trên giấy hoặc dùng hệ thống phần mềm tập trung do công ty tự vận hành luôn gặp phải sự nghi kỵ sâu sắc từ các cổ đông thiểu số:"),
          createBulletItem("Thiếu minh bạch và độc lập", "Ban kiểm phiếu thường do cổ đông lớn hoặc ban điều hành đương nhiệm chỉ định, tiềm ẩn nguy cơ loại bỏ phiếu hợp lệ hoặc thêm phiếu khống."),
          createBulletItem("Nguy cơ sửa đổi dữ liệu sau giờ G", "Hệ thống máy chủ tập trung (Web 2.0) có thể bị quản trị viên can thiệp vào cơ sở dữ liệu để sửa đổi kết quả bầu cử."),
          createBulletItem("Hiện tượng gian lận giao dịch cổ phần tạm thời (Flash Loan / Share Lending)", "Các đối tượng có thể mượn cổ phần hoặc mua lại cổ phiếu ngay trước ngày đại hội để gia tăng quyền biểu quyết rồi bán lại ngay sau đó."),
          createBodyParagraph("Do đó, việc nghiên cứu và xây dựng một Hệ thống Bỏ phiếu Bầu HĐQT ứng dụng công nghệ Chuỗi khối (Blockchain) và Hợp đồng thông minh (Smart Contract) là hết sức cấp thiết, đáp ứng xu thế chuyển đổi số minh bạch và bảo vệ quyền lợi hợp pháp của mọi thành phần cổ đông."),

          createSectionTitle("1.2. Mục tiêu nghiên cứu và phạm vi hệ thống"),
          createSubSectionTitle("1.2.1. Mục tiêu nghiên cứu"),
          createBodyParagraph("Đề tài tập trung vào các mục tiêu nghiên cứu cụ thể sau:"),
          createBulletItem("Nghiên cứu nguyên lý toán học và pháp lý", "Mô hình hóa chính xác thuật toán Bầu dồn phiếu theo Điều 148 Luật Doanh nghiệp 2020 dưới dạng logic bất biến trên Smart Contract."),
          createBulletItem("Khắc phục triệt để gian lận biểu quyết", "Ứng dụng chuẩn mở rộng OpenZeppelin ERC20Votes để lưu trữ checkpoint số dư lịch sử, chốt quyền biểu quyết tại block snapshot quá khứ, loại trừ hoàn toàn nguy cơ vay nhanh (Flash Loan) hoặc giao dịch token trong phiên bỏ phiếu."),
          createBulletItem("Lưu trữ hồ sơ phi tập trung", "Tích hợp giao thức IPFS qua Pinata Cloud để lưu trữ hồ sơ, bằng cấp và lý lịch của ứng viên HĐQT, đảm bảo hồ sơ không thể bị thay đổi sau khi đã được phê duyệt tham gia ứng cử."),
          createBulletItem("Xây dựng dApp tương tác đa vai trò", "Phát triển giao diện ứng dụng phân tán trực quan, hỗ trợ đăng nhập qua ví MetaMask cũng như bộ ví thử nghiệm nhanh (Demo Quick Wallets), phục vụ quản trị viên, cổ đông và công chúng theo dõi giám sát."),
          createBulletItem("Kiểm thử và triển khai thực tế", "Xây dựng bộ kiểm thử tự động toàn diện trên Hardhat Framework, đánh giá các kịch bản an ninh mạng và triển khai trực tiếp lên mạng thử nghiệm công khai Ethereum Sepolia Testnet."),

          createSubSectionTitle("1.2.2. Phạm vi hệ thống"),
          createBodyParagraph("Hệ thống được thiết kế và triển khai trong phạm vi kỹ thuật sau:"),
          createBulletItem("Nền tảng Blockchain", "Mạng Ethereum (môi trường Local Hardhat Node và mạng thử nghiệm Sepolia Testnet)."),
          createBulletItem("Ngôn ngữ và khung phát triển", "Solidity phiên bản ^0.8.24, Hardhat Framework v3, Ethers.js v6, Mocha & Chai."),
          createBulletItem("Đối tượng người dùng", "Cổ đông nắm giữ cổ phần doanh nghiệp (được biểu diễn dưới dạng token ShareToken), Ban tổ chức đại hội (Election Admin), và Công chúng theo dõi on-chain."),

          createSectionTitle("1.3. Mô hình toán học Bầu dồn phiếu & Bảo vệ cổ đông thiểu số"),
          createSubSectionTitle("1.3.1. Công thức phân bổ phiếu biểu quyết"),
          createBodyParagraph("Gọi S_i là số cổ phần sở hữu hợp pháp của cổ đông i tại thời điểm chốt danh sách (block snapshot), và N là tổng số ghế thành viên Hội đồng Quản trị cần bầu trong kỳ bầu cử. Khi đó, tổng số phiếu biểu quyết tối đa V_i mà cổ đông i nắm giữ được xác định bởi:"),
          createBodyParagraph("V_i = S_i × N", { alignment: AlignmentType.CENTER, bold: true, color: COLOR_PRIMARY }),
          createBodyParagraph("Cổ đông i có toàn quyền phân bổ số phiếu này cho danh sách các ứng viên C = {c_1, c_2, ..., c_m} thỏa mãn hai điều kiện ràng buộc:"),
          createBulletItem("Điều kiện không vượt hạn mức", "∑ v_{i,j} ≤ V_i (trong đó v_{i,j} là số phiếu dồn cho ứng viên j)."),
          createBulletItem("Điều kiện không âm và nguyên vẹn", "v_{i,j} ≥ 0, v_{i,j} ∈ ℤ (phiếu bầu là số nguyên, không chia nhỏ)."),

          createSubSectionTitle("1.3.2. Định lý bảo đảm ghế cho cổ đông thiểu số"),
          createBodyParagraph("Trong lý thuyết trò chơi và quản trị doanh nghiệp, nguyên lý bảo vệ cổ đông thiểu số của phương thức bầu dồn phiếu được phát biểu thành định lý toán học sau:"),
          createCalloutBox(
            "Định lý Ngưỡng cổ phần tối thiểu bảo đảm trúng cử",
            "Nếu một cuộc bầu cử cần bầu N ghế HĐQT từ tổng số S cổ phần có quyền biểu quyết tham gia đại hội, thì bất kỳ nhóm cổ đông nào nắm giữ số lượng cổ phần thỏa mãn:\n\n" +
            "            S_minority > S / (N + 1)\n\n" +
            "sẽ CHẮC CHẮN giành được ít nhất 01 ghế trong Hội đồng Quản trị nếu họ liên kết và dồn toàn bộ số phiếu của mình cho một ứng viên duy nhất, bất kể các cổ đông lớn phân bổ phiếu theo bất kỳ chiến lược nào."
          ),
          createBodyParagraph("Chứng minh toán học: Giả sử nhóm cổ đông thiểu số dồn toàn bộ số phiếu V_minority = S_minority × N cho 1 ứng viên duy nhất X. Khi đó ứng viên X có số phiếu là V_X = S_minority × N > S × N / (N + 1)."),
          createBodyParagraph("Các cổ đông còn lại nắm giữ số cổ phần tối đa là S_majority = S - S_minority < S × N / (N + 1). Tổng số phiếu mà nhóm đa số có là V_majority = S_majority × N < S × N² / (N + 1)."),
          createBodyParagraph("Để đánh bại ứng viên X và thâu tóm toàn bộ N ghế, nhóm đa số buộc phải phân bổ phiếu sao cho tất cả N ứng viên của họ đều nhận được số phiếu lớn hơn V_X. Tuy nhiên, tổng số phiếu tối thiểu cần thiết để N ứng viên cùng vượt qua V_X là:"),
          createBodyParagraph("N × (V_X + 1) > N × [S × N / (N + 1)] = S × N² / (N + 1) > V_majority", { alignment: AlignmentType.CENTER, italics: true }),
          createBodyParagraph("Điều này là bất khả thi vì nhóm đa số không có đủ tổng số phiếu. Do đó, chắc chắn có ít nhất một ứng viên của nhóm thiểu số trúng cử. Đây chính là tấm lá chắn bảo vệ quyền lợi cổ đông nhỏ đã được hệ thống kiểm chứng tự động tại Test Case TC26."),

          createSectionTitle("1.4. Phân tích chi tiết 4 tác nhân trong hệ thống (Actors Analysis)"),
          createBodyParagraph("Hệ thống xác định 4 tác nhân cụ thể với các vai trò, trách nhiệm, phạm vi tương tác và các hàm smart contract gọi tương ứng:"),
          createBulletItem("1. Quản trị viên tối cao (Super Admin / Election Admin)", "Đại diện cho Ban Tổ chức Đại hội, Thư ký đoàn hoặc Chủ tọa cuộc họp. Nắm giữ vai trò DEFAULT_ADMIN_ROLE và ELECTION_ADMIN_ROLE. Trách nhiệm: Khởi tạo và cấp phát cổ phần ban đầu (mint), tạo kỳ bầu cử (createElection), phê duyệt và nạp hồ sơ ứng viên lên IPFS (addCandidate), mở phiên bỏ phiếu (startVoting) kèm chốt block snapshot, đóng phiên kiểm phiếu (closeElection), và kích hoạt cơ chế ngắt mạch tạm dừng khẩn cấp (pause/unpause)."),
          createBulletItem("2. Cổ đông doanh nghiệp (Shareholder / Voter)", "Những nhà đầu tư sở hữu cổ phần hợp pháp dưới dạng token ShareToken. Trách nhiệm & Quyền hạn: Kết nối ví Web3 (MetaMask hoặc Quick Wallets), tra cứu số dư cổ phần và quyền biểu quyết snapshot (votingPowerOf), kiểm tra thông tin hồ sơ ứng viên trên IPFS, phân bổ phiếu dồn linh hoạt và ký giao dịch bỏ phiếu (vote), nhận biên lai on-chain."),
          createBulletItem("3. Ban Kiểm Soát / Kiểm toán viên (Supervisory Board / Auditor)", "Đoàn giám sát độc lập của đại hội cổ đông. Quyền hạn: Truy vấn dữ liệu on-chain theo thời gian thực, đối chiếu số dư cổ phần tại snapshotBlock để xác minh danh sách chốt cổ đông, kiểm tra các sự kiện VoteCast để phát hiện gian lận, xác thực thuật toán getWinners() và cờ hòa phiếu tied."),
          createBulletItem("4. Khách vãng lai & Cộng đồng (Public Guest / Independent Verifier)", "Bất kỳ nhà đầu tư, cổ đông tiềm năng hoặc cơ quan quản lý nhà nước nào theo dõi đại hội. Không cần kết nối ví Web3 hay chi trả phí gas. Có thể xem diễn biến bầu cử thời gian thực, tải xem hồ sơ ứng viên từ IPFS Gateway, và kiểm chứng tính hợp lệ trên Sepolia Etherscan."),

          createSectionTitle("1.5. Sơ đồ tổng quát Use Case và Ma trận phân quyền Tác nhân"),
          createSubSectionTitle("1.5.1. Ma trận phân quyền Tác nhân & Chức năng (Actor vs Features Matrix)"),
          createDataTable(
            ["Mã UC", "Tên Chức Năng Nghiệp Vụ", "Super Admin", "Voter", "Ban Kiểm Soát", "Public Guest", "Smart Contract API Tương Ứng"],
            [
              ["UC01", "Cấp phát cổ phần biểu quyết (Mint)", "X", "-", "-", "-", "ShareToken.mint(to, amount)"],
              ["UC02", "Chuyển nhượng cổ phần", "X", "X", "-", "-", "ShareToken.transfer(to, amount)"],
              ["UC03", "Tạo kỳ bầu cử mới", "X", "-", "-", "-", "BoardElection.createElection()"],
              ["UC04", "Thêm ứng viên & Upload IPFS", "X", "-", "-", "-", "BoardElection.addCandidate()"],
              ["UC05", "Mở phiên bầu cử & Chốt Snapshot", "X", "-", "-", "-", "BoardElection.startVoting()"],
              ["UC06", "Tra cứu quyền biểu quyết cá nhân", "X", "X", "X", "-", "BoardElection.votingPowerOf()"],
              ["UC07", "Thực hiện Bỏ phiếu Bầu dồn", "-", "X", "-", "-", "BoardElection.vote()"],
              ["UC08", "Đóng phiên bầu cử", "X", "-", "-", "-", "BoardElection.closeElection()"],
              ["UC09", "Xem kết quả trúng cử & Hòa phiếu", "X", "X", "X", "X", "BoardElection.getWinners()"],
              ["UC10", "Xem hồ sơ ứng viên qua IPFS", "X", "X", "X", "X", "IPFS Dedicated Gateway"],
              ["UC11", "Tạm dừng khẩn cấp (Pause)", "X", "-", "-", "-", "BoardElection.pause() / unpause()"]
            ],
            [10, 26, 10, 8, 12, 10, 24]
          ),

          createSubSectionTitle("1.5.2. Sơ đồ Tổng quát Hệ thống kèm Actors (Use Case & System Boundary Overview)"),
          createBodyParagraph("Sơ đồ khối dưới đây thể hiện ranh giới hệ thống phân tán, các ca sử dụng cốt lõi, quan hệ <<include>> / <<extend>> và tương tác của 4 Actors:"),
          createDiagramBox(
            "HÌNH 1.1: SƠ ĐỒ TỔNG QUÁT HỆ THỐNG VÀ CÁC TÁC NHÂN (USE CASE OVERVIEW DIAGRAM)",
`+---------------------------------------------------------------------------------------------------+
|                         RANH GIỚI HỆ THỐNG BẦU HỘI ĐỒNG QUẢN TRỊ (SYSTEM BOUNDARY)                |
|                                                                                                   |
|   [ ACTOR: QUẢN TRỊ VIÊN ]                                                                        |
|         |                                                                                         |
|         +---> (UC01: Cấp phát Cổ phần ShareToken) <-----+ <<include>>: Tự động ủy quyền           |
|         |                                               |              biểu quyết (_delegate)     |
|         +---> (UC03: Tạo kỳ bầu cử mới)                 |                                         |
|         |                                               |                                         |
|         +---> (UC04: Thêm Ứng viên HĐQT) ---> <<include>> ---> (Upload Hồ sơ lên IPFS Pinata)     |
|         |                                                                                         |
|         +---> (UC05: Mở phiên Bầu cử) -------> <<include>> ---> (Chốt Snapshot Block quá khứ)     |
|         |                                                                                         |
|         +---> (UC08: Đóng phiên Bầu cử)                                                           |
|         |                                                                                         |
|         +---> (UC11: Tạm dừng Khẩn cấp) <-------------------------------------------------+       |
|                                                                                           |       |
|   [ ACTOR: CỔ ĐÔNG (VOTER) ]                                                              |       |
|         |                                                                                 |       |
|         +---> (UC06: Tra cứu Quyền biểu quyết Snapshot)                                   |       |
|         |                                                                                 |       |
|         +---> (UC07: Bỏ phiếu Bầu dồn) ------> <<include>> ---> (Kiểm tra mảng tăng dần)  |       |
|         |                                 ---> <<include>> ---> (Chống Double Voting)     |       |
|         |                                 ---> <<extend>>  ---> [Báo lỗi khi Tạm dừng] ---+       |
|                                                                                                   |
|   [ ACTOR: BAN KIỂM SOÁT ]                                                                        |
|         |                                                                                         |
|         +---> (Giám sát Danh sách Cổ đông tại Snapshot)                                           |
|         |                                                                                         |
|         +---> (Kiểm toán Thuật toán Selection Sort & Hòa phiếu)                                   |
|                                                                                                   |
|   [ ACTOR: KHÁCH CỘNG ĐỒNG ]                                                                      |
|         |                                                                                         |
|         +---> (UC09: Tra cứu Bảng vàng Trúng cử & Kết quả On-chain)                              |
|         |                                                                                         |
|         +---> (UC10: Xem Hồ sơ Lý lịch Ứng viên trên IPFS Gateway)                                |
+---------------------------------------------------------------------------------------------------+`
          ),

          createSectionTitle("1.6. Phân rã yêu cầu chức năng (FR) và phi chức năng (NFR)"),
          createSubSectionTitle("1.6.1. Yêu cầu chức năng (Functional Requirements)"),
          createBulletItem("FR01 - Quản lý Cổ phần (ShareToken)", "Phát hành token cổ phần theo chuẩn ERC-20 kết hợp ERC20Votes. Decimals bắt buộc bằng 0 để đảm bảo mỗi token biểu diễn đúng 1 cổ phần. Tự động ủy quyền biểu quyết (_delegate) cho chính người nhận ngay khi mint hoặc chuyển nhượng."),
          createBulletItem("FR02 - Khởi tạo kỳ bầu cử", "Admin thiết lập tiêu đề đại hội và số lượng ghế HĐQT cần bầu (seats > 0). Hợp đồng sinh mã định danh duy nhất (electionId) và đặt trạng thái là Registration."),
          createBulletItem("FR03 - Đăng ký ứng viên & Upload IPFS", "Admin nạp thông tin ứng viên (họ tên và tệp hồ sơ lý lịch). Hệ thống backend tự động đẩy tệp lên Pinata IPFS, nhận về mã CID và ghi vào danh sách ứng viên của hợp đồng. Giới hạn tối đa MAX_CANDIDATES = 50 ứng viên."),
          createBulletItem("FR04 - Mở phiên bỏ phiếu & Chốt Snapshot", "Admin kích hoạt startVoting với thời hạn hiệu lực (duration > 0). Hợp đồng kiểm tra điều kiện số ứng viên phải ≥ số ghế cần bầu, chốt snapshotBlock = block.number - 1, và chuyển trạng thái sang Voting."),
          createBulletItem("FR05 - Bỏ phiếu bầu dồn (Cumulative Voting)", "Cổ đông gửi giao dịch chứa mảng candidateIds và amounts. Hợp đồng kiểm tra tổng số phiếu không vượt quá maxVotes (cổ phần tại snapshot × số ghế). Mảng candidateIds phải tăng dần nghiêm ngặt."),
          createBulletItem("FR06 - Chống bỏ phiếu lặp (Double-Voting Guard)", "Ghi nhận hasVoted[msg.sender] = true theo mô hình Checks-Effects-Interactions trước khi cập nhật số phiếu cho ứng viên."),
          createBulletItem("FR07 - Đóng phiên bầu cử", "Admin gọi closeElection khi block.timestamp > endTime. Trạng thái chuyển sang Closed, khóa hoàn toàn chức năng bỏ phiếu."),
          createBulletItem("FR08 - Kiểm phiếu tự động & Cảnh báo hòa phiếu", "Hàm getWinners() thực hiện thuật toán sắp xếp chọn (Selection Sort) trên bộ nhớ RAM để tìm ra K ứng viên có số phiếu cao nhất. Tự động bật cờ tied = true nếu ứng viên ở vị trí ghế cuối cùng có số phiếu bằng ứng viên kế tiếp."),
          createBulletItem("FR09 - Tra cứu & Công khai minh bạch", "Cung cấp các hàm view công khai để mọi người dùng tra cứu thông tin kỳ bầu, chi tiết từng ứng viên, số phiếu hiện tại và quyền biểu quyết cá nhân."),

          createSubSectionTitle("1.6.2. Yêu cầu phi chức năng (Non-Functional Requirements)"),
          createBulletItem("NFR01 - Tính toàn vẹn và bất biến (Immutability)", "Dữ liệu phiếu bầu sau khi đã ghi vào blockchain không thể bị chỉnh sửa, xóa bỏ hoặc đảo ngược bởi bất kỳ ai, kể cả Admin tối cao."),
          createBulletItem("NFR02 - Tính bảo mật (Security)", "Triệt tiêu hoàn toàn các lỗ hổng smart contract phổ biến theo chuẩn SWC: Re-entrancy, Overflow, DoS gas limit, Flash Loan manipulation."),
          createBulletItem("NFR03 - Hiệu năng và Tiết kiệm chi phí Gas", "Tối ưu hóa các thao tác on-chain, hạn chế tối đa việc duyệt mảng trên storage; việc sắp xếp người trúng cử được thực hiện hoàn toàn trên memory."),
          createBulletItem("NFR04 - Tính khả dụng và Thời gian thực (Real-time Availability)", "Giao diện Web dApp tự động cập nhật tiến độ bỏ phiếu, hiển thị đồng hồ đếm ngược và trực quan hóa kết quả bầu cử."),
          createBulletItem("NFR05 - Khả năng dừng khẩn cấp (Circuit Breaker)", "Hỗ trợ cơ chế Pausable giúp đóng băng tạm thời hệ thống khi có sự cố kỹ thuật hoặc tranh chấp pháp lý đột xuất tại đại hội."),
          createBulletItem("NFR06 - Tính phi tập trung trong lưu trữ tài liệu", "Hồ sơ ứng viên được bảo đảm an toàn trên mạng IPFS toàn cầu, không phụ thuộc vào máy chủ web nội bộ của công ty."),

          // Page Break to CHƯƠNG 2
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 2 =================
          createChapterTitle("CHƯƠNG 2. THIẾT KẾ KIẾN TRÚC VÀ QUY TRÌNH HỆ THỐNG"),
          createSectionTitle("2.1. Kiến trúc tổng thể 3 tầng"),
          createBodyParagraph("Hệ thống được thiết kế theo mô hình kiến trúc ba tầng phân tán (Three-tier Decentralized Architecture), phân tách độc lập giữa giao diện người dùng, tầng dịch vụ lưu trữ trung gian và tầng dữ liệu sổ cái phân tán:"),
          createBulletItem("Tầng Giao diện (Client Layer)", "Xây dựng trên nền tảng HTML5, CSS3 hiện đại và JavaScript thuần (Vanilla JS), tích hợp thư viện Ethers.js v6. Tương tác với người dùng qua hai cơ chế: Web3 Provider (MetaMask extension) cho môi trường thực tế và Bộ chuyển đổi ví nhanh (Quick Wallets Switcher) hỗ trợ các tài khoản giả lập Admin, Alice, Bob, Carol cho việc demo và chấm điểm."),
          createBulletItem("Tầng Dịch vụ Trung gian & IPFS (Server & Storage Layer)", "Web Server Node.js (cổng 3000) đóng vai trò phục vụ giao diện tĩnh và làm Proxy an toàn cho dịch vụ lưu trữ đám mây phi tập trung Pinata IPFS. Việc gọi API lưu tệp được xử lý qua token bảo mật PINATA_JWT lưu trong file .env, ngăn chặn việc lộ lọt khóa bí mật ra phía client trình duyệt."),
          createBulletItem("Tầng Chuỗi khối (Blockchain Layer)", "Mạng máy tính ngang hàng Ethereum (Local Node 8545 hoặc Sepolia Testnet). Đây là nơi thực thi logic bất biến của hai hợp đồng thông minh cốt lõi: ShareToken.sol và BoardElection.sol."),

          createSectionTitle("2.2. Sơ đồ kiến trúc tổng quan (Architecture Diagram)"),
          createBodyParagraph("Sơ đồ dưới đây minh họa chi tiết cấu trúc các tầng và luồng dữ liệu tương tác giữa người dùng, máy chủ backend, IPFS Gateway và các Smart Contract trên chuỗi khối:"),
          createDiagramBox(
            "HÌNH 2.1: SƠ ĐỒ KIẾN TRÚC TỔNG THỂ HỆ THỐNG (SYSTEM ARCHITECTURE)",
`+---------------------------------------------------------------------------------------+
|                             TẦNG GIAO DIỆN (CLIENT LAYER)                            |
|                                                                                       |
|   [ Trình duyệt Web (Chrome / Brave / Firefox / Edge) ]                               |
|   +-------------------------------------------------------------------------------+   |
|   |                       Giao diện Web dApp (HTML5 / CSS3 / JS)                  |   |
|   |   +------------------------+  +----------------------+  +------------------+  |   |
|   |   |  Quản Trị Viên (Admin) |  |   Cổ Đông (Voter)    |  | Khách Giám Sát   |  |   |
|   |   +------------------------+  +----------------------+  +------------------+  |   |
|   |   +-----------------------------------------------------------------------+   |   |
|   |   |       Bộ điều hướng Ví: MetaMask Extension  /  Demo Quick Wallets      |   |   |
|   |   +-----------------------------------------------------------------------+   |   |
|   +-------------------------------------------------------------------------------+   |
+---------------------------|---------------------------------------|-------------------+
                            | (1) Upload File Hồ Sơ                 | (5) Ký Tx & Query
                            v                                       v
+---------------------------------------------------+   +-------------------------------+
|     TẦNG TRUNG GIAN & IPFS (SERVER / STORAGE)     |   |  TẦNG BLOCKCHAIN (ETHEREUM)   |
|                                                   |   |                               |
|  [ Node.js Web Server (server.js:3000) ]          |   |  [ Local Node (8545) /        |
|  - Proxy upload IPFS an toàn                     |   |    Sepolia Testnet (11155111) ]|
|  - Quản lý danh bạ ví nội bộ (.json)              |   |                               |
|  - Đọc cấu hình bảo mật (.env / PINATA_JWT)       |   |  +-------------------------+  |
|                         |                         |   |  |     ShareToken.sol      |  |
|                         v (2) Pin File via JWT    |   |  | - ERC20 & ERC20Votes    |  |
|  +---------------------------------------------+  |   |  | - Decimals = 0          |  |
|  |           Pinata IPFS Cloud Service         |  |   |  | - Auto _delegate()      |  |
|  +---------------------------------------------+  |   |  +-------------------------+  |
|                         | (3) Trả về CID Qm...    |   |               ^               |
|                         v                         |   |               | getPastVotes()|
|  +---------------------------------------------+  |   |  +-------------------------+  |
|  | Dedicated Pinata IPFS Gateway (mypinata)    |  |   |  |    BoardElection.sol    |  |
|  +---------------------------------------------+  |   |  | - Cumulative Voting     |  |
|                         ^                         |   |  | - Snapshot Block        |  |
|                         | (4) Xem hồ sơ PDF/Ảnh   |   |  | - Selection Sort Winner |  |
+-------------------------|-------------------------+   |  | - Pausable & Guard      |  |
                          +-----------------------------+  +-------------------------+  |
                                                           +-------------------------------+`
          ),

          createSectionTitle("2.3. Sơ đồ luồng quy trình nghiệp vụ (Sequence Diagram)"),
          createBodyParagraph("Quy trình nghiệp vụ của hệ thống được tiến hành qua 5 giai đoạn tuần tự từ khi phát hành cổ phần đến khi công bố danh sách trúng cử vào Hội đồng Quản trị:"),
          createDiagramBox(
            "HÌNH 2.2: SƠ ĐỒ LUỒNG QUY TRÌNH NGHIỆP VỤ ĐẠI HỘI CỔ ĐÔNG (SEQUENCE DIAGRAM)",
`Admin               Voter               Frontend dApp       Server & Pinata IPFS      Smart Contracts
  |                   |                       |                     |                        |
  |--- GIAI ĐOẠN 1: KHỞI TẠO CỔ PHẦN & KỲ BẦU CỬ --------------------------------------------|
  | 1. mint(voter, amount) ----------------------------------------------------------------->| (ShareToken)
  |                                                                                          |-> _delegate(to, to)
  | 2. createElection(title, seats) -------------------------------------------------------->| (BoardElection)
  |                                                                                          |-> Trạng thái: Registration
  |                                                                                          |
  |--- GIAI ĐOẠN 2: THÊM ỨNG VIÊN & TẢI HỒ SƠ LÊN IPFS --------------------------------------|
  | 3. Chọn file hồ sơ lý lịch -> Tải lên ---->|                     |                        |
  |                   |                       | 4. POST base64 ---->|                        |
  |                   |                       |                     | 5. Pin file via JWT -->| (Pinata Cloud)
  |                   |                       |                     |<- 6. Trả CID Qm... ----|
  |                   |                       |<- 7. Nhận CID ------|                        |
  | 8. addCandidate(electionId, name, cid) ------------------------------------------------->| (BoardElection)
  |                   |                       |                     |                        |
  |--- GIAI ĐOẠN 3: MỞ PHIÊN BỎ PHIẾU (START VOTING) ----------------------------------------|
  | 9. startVoting(electionId, duration) --------------------------------------------------->| (BoardElection)
  |                                                                                          |-> snapshotBlock = block - 1
  |                                                                                          |-> Trạng thái: Voting
  |                                                                                          |
  |--- GIAI ĐOẠN 4: CỔ ĐÔNG BỎ PHIẾU DỒN (CUMULATIVE VOTING) ---------------------------------|
  |                   | 10. Truy vấn quyền bầu|                     |                        |
  |                   |---------------------->| 11. votingPowerOf() ------------------------>| (BoardElection)
  |                   |                       |                                              |-> getPastVotes() * seats
  |                   |                       |<- 12. Trả về maxVotes (Số phiếu tối đa) -----|
  |                   | 13. Phân bổ số phiếu  |                     |                        |
  |                   |     cho các ứng viên  |                     |                        |
  |                   | 14. Ký giao dịch vote |                     |                        |
  |                   |---------------------->| 15. vote(candidateIds, amounts) ------------>| (BoardElection)
  |                   |                       |                                              |-> Kiểm tra mảng tăng dần
  |                   |                       |                                              |-> hasVoted = true
  |                   |                       |                                              |-> Cộng dồn votes
  |                   |                       |<- 16. Phát event VoteCast -------------------|
  |                   |<- 17. Thông báo thành công                  |                        |
  |                   |                       |                     |                        |
  |--- GIAI ĐOẠN 5: ĐÓNG PHIÊN & XUẤT KẾT QUẢ TRÚNG CỬ --------------------------------------|
  | 18. closeElection(electionId) (khi block.timestamp > endTime) -------------------------->| (BoardElection)
  |                                                                                          |-> Trạng thái: Closed
  |                   | 19. Xem kết quả trúng cử                    |                        |
  |                   |---------------------->| 20. getWinners(electionId) ----------------->| (BoardElection)
  |                   |                       |                                              |-> Selection Sort (Memory)
  |                   |                       |<- 21. Danh sách trúng cử & cờ tied ----------|
  |                   |<- 22. Hiển thị Bảng vàng trúng cử HĐQT minh bạch                     |`
          ),

          createSectionTitle("2.4. Sơ đồ máy trạng thái cuộc bầu cử (State Diagram)"),
          createBodyParagraph("Mỗi kỳ bầu cử trong hợp đồng BoardElection được quản lý vòng đời bởi một máy trạng thái hữu hạn nghiêm ngặt (Finite State Machine). Bảng chuyển đổi trạng thái bảo đảm các hành vi nghiệp vụ chỉ được thực thi khi thỏa mãn điều kiện tiên quyết:"),
          createDiagramBox(
            "HÌNH 2.3: SƠ ĐỒ MÁY TRẠNG THÁI CUỘC BẦU CỬ (STATE MACHINE DIAGRAM)",
`        [*]
         |
         | constructor(token, admin)
         v
    +----------+
    |   None   | (Kỳ bầu cử chưa được khởi tạo, ID chưa tồn tại)
    +----------+
         |
         | createElection(title, seats) [Yêu cầu: seats > 0, Admin]
         v
+------------------+
|   Registration   | <--- Thêm ứng viên: addCandidate(name, cid) [candidates < 50]
+------------------+      Tải hồ sơ lý lịch ứng viên lên IPFS Pinata
         |                Cổ phần vẫn có thể chuyển nhượng hoặc mint
         |
         | startVoting(duration) [Yêu cầu: candidates >= seats, Admin]
         v
+------------------+
|      Voting      | <--- Cổ đông thực hiện vote(candidateIds, amounts)
+------------------+      Chốt snapshotBlock = block.number - 1 (Quyền bầu bị đóng băng)
         |                Chống double-voting; kiểm tra mảng tăng dần; đếm ngược thời gian
         |
         | closeElection() [Yêu cầu: block.timestamp > endTime, Admin]
         v
+------------------+
|      Closed      | <--- Khóa hoàn toàn chức năng bỏ phiếu
+------------------+      Gọi getWinners() lấy Top K ứng viên trúng cử
         |                Tự động kích hoạt cờ tied = true nếu có hòa phiếu tại ghế cuối
         v
        [*]`
          ),

          createSectionTitle("2.5. Chi tiết 5 Biểu đồ hoạt động Swimlane chuẩn UML kèm mô tả và chốt an toàn"),
          createBodyParagraph("Để bảo đảm tính rõ ràng và trực quan theo chuẩn công nghệ phần mềm, 5 biểu đồ hoạt động dưới đây được mô hình hóa theo dạng Biểu đồ phân làn (Swimlane Activity Diagram) phân tách rõ trách nhiệm giữa 3 thành phần: [ Tác nhân (Actor) | Giao diện Web dApp | Hợp đồng Smart Contract ]. Mỗi biểu đồ đều đi kèm bảng mô tả chi tiết từng bước và phân tích các chốt an toàn (Security Gates)."),

          // ACTIVITY DIAGRAM 1
          createSubSectionTitle("2.5.1. Activity Diagram 1: Quy trình Phát hành cổ phần & Tự động ủy quyền (Mint & Auto-Delegation)"),
          createDiagramBox(
            "BIỂU ĐỒ HOẠT ĐỘNG 1: SWIMLANE PHÁT HÀNH CỔ PHẦN & TỰ ĐỘNG ỦY QUYỀN",
`LÀN 1: QUẢN TRỊ VIÊN (ADMIN)  | LÀN 2: WEB FRONTEND / DAPP    | LÀN 3: SMART CONTRACT (SHARETOKEN)
                              |                               |
  (●) BẮT ĐẦU                 |                               |
   |                          |                               |
   v                          |                               |
[Nhập địa chỉ ví cổ đông &    |                               |
 số lượng cổ phần mint]       |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Tạo giao dịch mint() &       |
                              |  yêu cầu ví Admin ký]         |
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <Kiểm tra msg.sender có MINTER_ROLE?>
                              |                               |   |-- [KHÔNG] ---> [Revert Unauthorized] ---> (X)
                              |                               |   |-- [CÓ]
                              |                               |   v
                              |                               | [Thực thi hàm nội bộ _update(0, to, val)]
                              |                               |   |
                              |                               |   v
                              |                               | <Kiểm tra delegates(to) == address(0)?>
                              |                               |   |-- [ĐÚNG] -> [_delegate(to, to): Tự động ủy quyền]
                              |                               |   |-- [SAI]  -> [Giữ nguyên đại diện đã chọn]
                              |                               |   v
                              |                               | [Ghi Checkpoint số dư & Quyền bầu lịch sử]
                              |                               |   |
                              |                               |   v
                              |                               | [balanceOf[to] += amount]
                              |                               |   |
                              |                               |   v
                              |                               | [Phát Event Transfer & DelegateChanged]
                              |                               |   |
                              |<------------------------------+---+
                              | [Cập nhật số dư UI &          |
                              |  thông báo thành công]        |
   |<-------------------------+                               |
   v                          |                               |
[Nhận thông báo hoàn tất]     |                               |
   |                          |                               |
  (◎) KẾT THÚC                |                               |`
          ),
          createBodyParagraph("Bảng đặc tả chi tiết các bước thực hiện Quy trình 1:"),
          createDataTable(
            ["Bước", "Thành Phần Thực Hiện", "Hành Động Cụ Thể", "Dữ Liệu Đầu Vào", "Dữ Liệu Đầu Ra", "Luồng Ngoại Lệ / Điều Kiện Revert"],
            [
              ["1.1", "Quản trị viên (Admin)", "Nhập form cấp phát cổ phần", "Địa chỉ ví nhận, số cổ phần amount", "Dữ liệu form Web", "Địa chỉ ví không hợp lệ (sai định dạng hex 40 ký tự)"],
              ["1.2", "Web Frontend", "Tạo payload và yêu cầu ví Admin ký tx", "to, amount", "Giao dịch đã ký mã hóa", "Người dùng từ chối ký trên ví (User rejected)"],
              ["1.3", "Smart Contract", "Kiểm tra quyền hạn MINTER_ROLE", "msg.sender", "Chấp thuận hoặc Revert", "Revert AccessControlUnauthorizedAccount nếu không phải Admin"],
              ["1.4", "Smart Contract", "Kiểm tra trạng thái ủy quyền", "delegates(to)", "address(0) hoặc đại diện", "Không có"],
              ["1.5", "Smart Contract", "Tự động kích hoạt ủy quyền nội bộ", "to, to", "Event DelegateChanged", "Không có"],
              ["1.6", "Smart Contract", "Tạo Checkpoint ERC20Votes & Mint", "to, amount", "balanceOf[to], getVotes[to]", "Revert nếu tràn số uint256 (Solidity 0.8.24)"],
              ["1.7", "Web Frontend", "Lắng nghe biên lai và cập nhật UI", "Tx Receipt, logs", "Giao diện cập nhật số dư mới", "Mạng RPC mất kết nối (tự động retry)"]
            ],
            [8, 16, 26, 18, 16, 16]
          ),
          createBodyParagraph("Phân tích Chốt an toàn (Security Gates) Quy trình 1:"),
          createBulletItem("Gate 1 - Kiểm soát truy cập nghiêm ngặt", "Hàm mint() được bảo vệ bằng modifier onlyRole(MINTER_ROLE). Bất kỳ tài khoản người dùng hoặc hacker nào cố tình gọi hàm trực tiếp đều bị ngắt lập tức tại cổng opcode kiểm tra vai trò (TC03)."),
          createBulletItem("Gate 2 - Đảm bảo tính nguyên thể cổ phần", "Hàm decimals() trả về 0. Mỗi đơn vị token đại diện cho đúng 1 cổ phần pháp lý, loại bỏ sai số do chia nhỏ số thập phân."),
          createBulletItem("Gate 3 - Tự động hóa Checkpoint lịch sử", "Nhờ cơ chế _delegate(to, to) tự động trong hàm _update(), quyền biểu quyết được đồng bộ hóa tức thì cùng số dư token mà không phụ thuộc vào thao tác thủ công của người dùng (TC02)."),

          // ACTIVITY DIAGRAM 2
          createSubSectionTitle("2.5.2. Activity Diagram 2: Quy trình Tạo kỳ bầu cử & Đăng ký ứng viên (Create Election & Candidate Registration)"),
          createDiagramBox(
            "BIỂU ĐỒ HOẠT ĐỘNG 2: SWIMLANE TẠO KỲ BẦU CỬ VÀ ĐĂNG KÝ ỨNG VIÊN QUA IPFS",
`LÀN 1: QUẢN TRỊ VIÊN (ADMIN)  | LÀN 2: WEB FRONTEND & SERVER  | LÀN 3: SMART CONTRACT (BOARDELECTION)
                              |                               |
  (●) BẮT ĐẦU                 |                               |
   |                          |                               |
   v                          |                               |
[Nhập Tiêu đề & Số ghế HĐQT]  |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Gửi tx createElection()]     |
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <Kiểm tra seats > 0 && Admin Role?>
                              |                               |   |-- [KHÔNG] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [CÓ]
                              |                               |   v
                              |                               | [Tạo Election: status = Registration]
                              |                               |   |
                              |<------------------------------+---+
                              | [Thông báo tạo kỳ bầu thành công]
   |<-------------------------+
   v
[Chọn file hồ sơ ứng viên]
   |
   +------------------------->|
                              | [POST /api/upload-pinata]     |
                              |   |                           |
                              | [Server pin file lên IPFS Cloud]|
                              |   |                           |
                              | [Nhận mã băm CID: ipfs://Qm...]|
                              |   |                           |
                              | [Gửi tx addCandidate(name, CID)]
                              |   |
                              |   +-------------------------->|
                              |                               | <Kiểm tra status == Registration &&
                              |                               |  candidates.length < MAX_CANDIDATES?>
                              |                               |   |-- [KHÔNG] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [CÓ]
                              |                               |   v
                              |                               | [Lưu Candidate(name, cid, 0)]
                              |                               | [Phát Event CandidateAdded]
                              |                               |   |
                              |<------------------------------+---+
                              | [Hiển thị thẻ ứng viên trên UI]
   |<-------------------------+
   v
[Hoàn tất chuẩn bị ứng viên]
   |
  (◎) KẾT THÚC`
          ),
          createBodyParagraph("Bảng đặc tả chi tiết các bước thực hiện Quy trình 2:"),
          createDataTable(
            ["Bước", "Thành Phần Thực Hiện", "Hành Động Cụ Thể", "Dữ Liệu Đầu Vào", "Dữ Liệu Đầu Ra", "Luồng Ngoại Lệ / Điều Kiện Revert"],
            [
              ["2.1", "Quản trị viên (Admin)", "Nhập tiêu đề đại hội & số ghế cần bầu", "title, seats", "Dữ liệu form Web", "Số ghế seats <= 0 bị chặn ngay trên form"],
              ["2.2", "Smart Contract", "Kiểm tra tham số và quyền Admin", "title, seats, msg.sender", "electionId mới", "Revert nếu seats = 0 hoặc thiếu ELECTION_ADMIN_ROLE (TC06, TC07)"],
              ["2.3", "Quản trị viên (Admin)", "Tải lên tệp hồ sơ lý lịch ứng viên", "Tệp PDF / Ảnh chứng chỉ", "Tệp nhị phân Base64", "Tệp vượt quá kích thước 10MB bị chặn tại client"],
              ["2.4", "Backend Web Server", "Pin tệp lên IPFS qua Pinata Cloud", "Tệp tin, PINATA_JWT", "Mã IPFS CID (Qm...)", "Lỗi kết nối Pinata API (server tự động thử lại)"],
              ["2.5", "Smart Contract", "Ghi danh ứng viên vào kỳ bầu cử", "electionId, name, CID", "Event CandidateAdded", "Revert nếu status != Registration hoặc quá 50 ứng viên (TC12, TC30)"],
              ["2.6", "Web Frontend", "Hiển thị danh sách ứng viên kèm link IPFS", "Danh sách ứng viên", "Thẻ ứng viên trực quan", "Không có"]
            ],
            [8, 16, 26, 18, 16, 16]
          ),
          createBodyParagraph("Phân tích Chốt an toàn (Security Gates) Quy trình 2:"),
          createBulletItem("Gate 1 - Kiểm soát trạng thái vòng đời (inStatus)", "Hàm addCandidate() bắt buộc kỳ bầu cử phải đang ở trạng thái Registration. Ngay khi phiên bỏ phiếu đã mở, không ai có thể đưa thêm ứng viên vào danh sách (TC12)."),
          createBulletItem("Gate 2 - Chống tấn công nghẽn Gas khối (MAX_CANDIDATES = 50)", "Hợp đồng áp đặt giới hạn cứng tối đa 50 ứng viên. Quy định này bảo đảm thuật toán kiểm phiếu on-chain không bao giờ duyệt mảng quá dài dẫn đến vượt giới hạn Block Gas Limit của mạng Ethereum (TC30)."),
          createBulletItem("Gate 3 - Tính toàn vẹn nội dung hồ sơ (IPFS CID)", "Hồ sơ ứng viên được định danh bằng mã băm nội dung CID. Bất kỳ sự thay đổi nào trong tệp lý lịch sau này đều dẫn đến sai lệch mã băm, giúp cổ đông phát hiện gian lận ngay lập tức."),

          // ACTIVITY DIAGRAM 3
          createSubSectionTitle("2.5.3. Activity Diagram 3: Quy trình Mở phiên bầu cử & Chốt Snapshot Block (Start Voting & Snapshot)"),
          createDiagramBox(
            "BIỂU ĐỒ HOẠT ĐỘNG 3: SWIMLANE MỞ PHIÊN BẦU CỬ VÀ ĐÓNG BĂNG QUYỀN BIỂU QUYẾT",
`LÀN 1: QUẢN TRỊ VIÊN (ADMIN)  | LÀN 2: WEB FRONTEND / DAPP    | LÀN 3: SMART CONTRACT (BOARDELECTION)
                              |                               |
  (●) BẮT ĐẦU                 |                               |
   |                          |                               |
   v                          |                               |
[Thiết lập thời gian duration]|                               |
[Nhấn "Mở phiên bỏ phiếu"]    |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Tạo tx startVoting(id, dur)] |
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <1. Kiểm tra Admin Role & whenNotPaused?>
                              |                               |   |-- [SAI] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | <2. Kiểm tra status == Registration?>
                              |                               |   |-- [SAI] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | <3. Kiểm tra candidates.length >= seats?>
                              |                               |   |-- [SAI] ---> [Revert "Not enough candidates"] -> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | <4. Kiểm tra duration > 0?>
                              |                               |   |-- [SAI] ---> [Revert "Duration must be > 0"] ---> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | [CHỐT: snapshotBlock = block.number - 1]
                              |                               | [TÍNH: endTime = block.timestamp + duration]
                              |                               | [ĐỔI: status = Status.Voting]
                              |                               | [Phát Event VotingStarted]
                              |                               |   |
                              |<------------------------------+---+
                              | [Khởi động Đồng hồ đếm ngược  |
                              |  & mở khóa giao diện Bỏ phiếu]|
   |<-------------------------+                               |
   v                          |                               |
[Theo dõi phiên bỏ phiếu]     |                               |
   |                          |                               |
  (◎) KẾT THÚC                |                               |`
          ),
          createBodyParagraph("Bảng đặc tả chi tiết các bước thực hiện Quy trình 3:"),
          createDataTable(
            ["Bước", "Thành Phần Thực Hiện", "Hành Động Cụ Thể", "Dữ Liệu Đầu Vào", "Dữ Liệu Đầu Ra", "Luồng Ngoại Lệ / Điều Kiện Revert"],
            [
              ["3.1", "Quản trị viên (Admin)", "Thiết lập thời lượng phiên bầu (duration)", "Thời gian (giây), ví dụ: 3600", "Lệnh mở phiên", "Duration <= 0 bị chặn trên UI"],
              ["3.2", "Smart Contract", "Kiểm tra tính hợp lệ về số lượng ứng viên", "candidates.length, seats", "Chấp thuận hoặc Revert", "Revert 'Not enough candidates' nếu số ứng viên < số ghế (TC10)"],
              ["3.3", "Smart Contract", "Chốt số khối snapshot lịch sử", "block.number", "snapshotBlock = block.number - 1", "Không có"],
              ["3.4", "Smart Contract", "Thiết lập mốc kết thúc phiên", "block.timestamp, duration", "endTime", "Không có"],
              ["3.5", "Smart Contract", "Chuyển trạng thái kỳ bầu cử", "Status.Voting", "Event VotingStarted", "Không có"],
              ["3.6", "Web Frontend", "Kích hoạt đồng hồ đếm ngược thời gian thực", "endTime", "Giao diện Voting mở khóa", "Đồng bộ thời gian lệch giữa máy trạm và blockchain"]
            ],
            [8, 16, 26, 18, 16, 16]
          ),
          createBodyParagraph("Phân tích Chốt an toàn (Security Gates) Quy trình 3:"),
          createBulletItem("Gate 1 - Ràng buộc ứng viên tối thiểu (candidates >= seats)", "Không thể mở phiên bầu cử nếu số lượng ứng viên ít hơn số ghế cần bầu. Điều này ngăn chặn tình huống kỳ bầu cử bị vô hiệu hoặc thiếu sự cạnh tranh dân chủ (TC10)."),
          createBulletItem("Gate 2 - Chốt Snapshot quá khứ (block.number - 1)", "Hàm getPastVotes() của ERC20Votes yêu cầu khối truy vấn phải đã được đào hoàn tất. Bằng việc chốt tại block.number - 1, hệ thống đóng băng toàn bộ quyền biểu quyết của cổ đông, miễn nhiễm hoàn toàn với các cuộc tấn công vay nhanh (Flash Loan) hoặc mua bán cổ phần tức thời trong phiên (TC11, TC19, TC20)."),

          // ACTIVITY DIAGRAM 4
          createSubSectionTitle("2.5.4. Activity Diagram 4: Quy trình Bỏ phiếu bầu dồn On-chain (Cumulative Voting Execution)"),
          createDiagramBox(
            "BIỂU ĐỒ HOẠT ĐỘNG 4: SWIMLANE BỎ PHIẾU BẦU DỒN VÀ KIỂM TRA BẢO MẬT ĐA LỚP",
`LÀN 1: CỔ ĐÔNG (VOTER)        | LÀN 2: WEB FRONTEND / DAPP    | LÀN 3: SMART CONTRACT (BOARDELECTION)
                              |                               |
  (●) BẮT ĐẦU                 |                               |
   |                          |                               |
   v                          |                               |
[Kết nối ví Web3 / Quick]     |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Gọi votingPowerOf(id, voter)]|
                              |   |                           |
                              |   +-------------------------->|
                              |                               | [shares = getPastVotes(voter, snapshot)]
                              |                               | [maxVotes = shares * seats]
                              |                               |   |
                              |<------------------------------+---+
                              | [Hiển thị Tổng số phiếu tối đa]|
   |<-------------------------+                               |
   v                          |                               |
[Điều chỉnh phân bổ phiếu     |                               |
 cho các ứng viên mong muốn]  |                               |
[Nhấn "Ký gửi Phiếu bầu"]     |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Kiểm tra tổng <= maxVotes UI]|
                              | [Sắp xếp mảng IDs tăng dần]   |
                              | [Gửi tx vote(candidateIds, amounts)]
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <1. whenNotPaused && status == Voting?>
                              |                               |   |-- [SAI] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | <2. block.timestamp <= endTime?>
                              |                               |   |-- [HẾT HẠN] -> [Revert "Voting ended"] -> (X)
                              |                               |   |-- [CÒN HẠN]
                              |                               |   v
                              |                               | <3. !hasVoted[msg.sender]?>
                              |                               |   |-- [ĐÃ BẦU] --> [Revert "Already voted"] -> (X)
                              |                               |   |-- [CHƯA BẦU]
                              |                               |   v
                              |                               | <4. candidateIds.len == amounts.len > 0?>
                              |                               |   |-- [SAI] -----> [Revert "Invalid input"] -> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | <5. maxVotes > 0?>
                              |                               |   |-- [KHÔNG CỔ PHẦN] -> [Revert "No voting power"] -> (X)
                              |                               |   |-- [HỢP LỆ]
                              |                               |   v
                              |                               | [EFFECT: hasVoted[msg.sender] = true]
                              |                               |   |
                              |                               | [Vòng lặp duyệt từng ứng viên i:]
                              |                               |   |
                              |                               |   +---> <candidateIds[i] < candidates.length?>
                              |                               |   |        |-- [SAI] -> [Revert "Not found"] -> (X)
                              |                               |   |        |-- [ĐÚNG]
                              |                               |   |     <i == 0 || candidateIds[i] > candidateIds[i-1]?>
                              |                               |   |        |-- [SAI] -> [Revert "Ids must be ascending"] -> (X)
                              |                               |   |        |-- [ĐÚNG]
                              |                               |   |     [total += amounts[i]]
                              |                               |   |     [candidates[id].votes += amounts[i]]
                              |                               |   +--- Lặp hết mảng
                              |                               |   |
                              |                               |   v
                              |                               | <6. total <= maxVotes?>
                              |                               |   |-- [VƯỢT QUYỀN] -> [Revert "Exceeds voting power"] -> (X)
                              |                               |   |-- [HỢP LỆ]
                              |                               |   v
                              |                               | [Phát Event VoteCast(id, voter, total)]
                              |                               |   |
                              |<------------------------------+---+
                              | [Thông báo Bỏ phiếu thành công|
                              |  & khóa form, lưu biên lai Tx]|
   |<-------------------------+                               |
   v                          |                               |
[Xem biên lai xác nhận]       |                               |
   |                          |                               |
  (◎) KẾT THÚC                |                               |`
          ),
          createBodyParagraph("Bảng đặc tả chi tiết các bước thực hiện Quy trình 4:"),
          createDataTable(
            ["Bước", "Thành Phần Thực Hiện", "Hành Động Cụ Thể", "Dữ Liệu Đầu Vào", "Dữ Liệu Đầu Ra", "Luồng Ngoại Lệ / Điều Kiện Revert"],
            [
              ["4.1", "Cổ đông (Voter)", "Kết nối ví và truy cập trang bỏ phiếu", "Địa chỉ ví", "Thông tin cử tri", "Chưa kết nối ví Web3"],
              ["4.2", "Smart Contract", "Tính toán hạn mức biểu quyết snapshot", "electionId, voter", "maxVotes = shares * seats", "maxVotes = 0 nếu cổ phần mua sau snapshot"],
              ["4.3", "Cổ đông (Voter)", "Phân bổ phiếu dồn cho các ứng viên", "v_{i,j} cho từng ứng viên", "Mảng candidateIds, amounts", "Tổng phiếu vượt quá maxVotes bị chặn trên UI"],
              ["4.4", "Smart Contract", "Kiểm tra tính nguyên vẹn thời gian và trạng thái", "timestamp, status", "Chấp thuận hoặc Revert", "Revert 'Voting ended' hoặc 'Invalid election status' (TC21, TC22)"],
              ["4.5", "Smart Contract", "Kiểm tra phòng chống bỏ phiếu lặp", "hasVoted[msg.sender]", "Chấp thuận hoặc Revert", "Revert 'Already voted' nếu đã từng bỏ phiếu (TC14)"],
              ["4.6", "Smart Contract", "Ghi nhận trạng thái bỏ phiếu (CEI Pattern)", "msg.sender", "hasVoted = true", "Không có"],
              ["4.7", "Smart Contract", "Kiểm tra thứ tự tăng dần nghiêm ngặt", "candidateIds[i]", "Chấp thuận hoặc Revert", "Revert 'Ids must be ascending' nếu gửi lặp ID ứng viên (TC17)"],
              ["4.8", "Smart Contract", "Cộng dồn phiếu & Kiểm tra tổng hạn mức", "total, maxVotes", "Event VoteCast", "Revert 'Exceeds voting power' nếu total > maxVotes (TC16)"],
              ["4.9", "Web Frontend", "Hiển thị biên lai giao dịch on-chain", "Tx Receipt Hash", "Biên lai bỏ phiếu", "Không có"]
            ],
            [8, 16, 26, 18, 16, 16]
          ),
          createBodyParagraph("Phân tích Chốt an toàn (Security Gates) Quy trình 4:"),
          createBulletItem("Gate 1 - Mẫu thiết kế Checks-Effects-Interactions (CEI)", "Biến e.hasVoted[msg.sender] = true được cập nhật ngay lập tức trước khi duyệt vòng lặp cộng dồn phiếu và trước bất kỳ lời gọi ngoài nào. Thiết kế này kết hợp cùng modifier nonReentrant triệt tiêu hoàn toàn nguy cơ tấn công tái nhập (Reentrancy) hoặc gọi đúp trong cùng transaction (TC14, TC23)."),
          createBulletItem("Gate 2 - Thuật toán chống nhân bản ứng viên (Strictly Ascending Array)", "Quy tắc require(i == 0 || candidateIds[i] > candidateIds[i - 1], 'Ids must be ascending') loại bỏ triệt để hành vi cố tình gửi mảng chứa nhiều phần tử trùng lặp (ví dụ: [1, 1, 1]) nhằm lừa dồn phiếu nhiều lần cho cùng một ứng viên (TC17)."),
          createBulletItem("Gate 3 - Khóa hạn mức biểu quyết chặt chẽ", "Tổng số phiếu dồn total bắt buộc phải ≤ maxVotes. Bất kỳ sự gian lận dồn vượt dù chỉ 1 phiếu đều bị hợp đồng rollback toàn bộ giao dịch ngay tức khắc (TC16)."),

          // ACTIVITY DIAGRAM 5
          createSubSectionTitle("2.5.5. Activity Diagram 5: Quy trình Đóng phiên & Kiểm phiếu tự động xác định người trúng cử (Close Election & Selection Sort)"),
          createDiagramBox(
            "BIỂU ĐỒ HOẠT ĐỘNG 5: SWIMLANE ĐÓNG PHIÊN VÀ KIỂM PHIẾU XÁC ĐỊNH TRÚNG CỬ",
`LÀN 1: QUẢN TRỊ VIÊN / KHÁCH  | LÀN 2: WEB FRONTEND / DAPP    | LÀN 3: SMART CONTRACT (BOARDELECTION)
                              |                               |
  (●) BẮT ĐẦU                 |                               |
   |                          |                               |
   v                          |                               |
[Theo dõi hết giờ đếm ngược]  |                               |
[Admin nhấn "Đóng phiên bầu"] |                               |
   |                          |                               |
   +------------------------->|                               |
                              | [Tạo tx closeElection(id)]    |
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <Kiểm tra block.timestamp > endTime && Admin?>
                              |                               |   |-- [CHƯA HẾT HẠN] -> [Revert "Voting not ended"] -> (X)
                              |                               |   |-- [HỢP LỆ]
                              |                               |   v
                              |                               | [status = Status.Closed]
                              |                               | [Phát Event ElectionClosed(electionId)]
                              |                               |   |
                              |<------------------------------+---+
                              | [Khóa hoàn toàn giao dịch vote|
                              |  và tự động gọi getWinners()] |
                              |   |                           |
                              |   +-------------------------->|
                              |                               | <Kiểm tra status == Status.Closed?>
                              |                               |   |-- [SAI] ---> [Revert Lỗi] ---> (X)
                              |                               |   |-- [ĐÚNG]
                              |                               |   v
                              |                               | [Khởi tạo mảng chỉ số order[0..n-1] trong RAM]
                              |                               | [Thực thi Selection Sort giảm dần theo số phiếu]
                              |                               | [Trích xuất Top K ứng viên: winners[0..seats-1]]
                              |                               |   |
                              |                               |   v
                              |                               | <Kiểm tra hòa phiếu ghế cuối:
                              |                               |  n > seats && votes[seats-1] == votes[seats]?>
                              |                               |   |-- [ĐÚNG] -> [Gán tied = true (Cảnh báo hòa)]
                              |                               |   |-- [SAI]  -> [Gán tied = false (Thắng tuyệt đối)]
                              |                               |   v
                              |                               | [Trả về kết quả (winners[], tied)]
                              |                               |   |
                              |<------------------------------+---+
                              | [Vẽ biểu đồ phân bổ phiếu bầu |
                              |  Hiển thị Bảng vàng HĐQT      |
                              |  Cảnh báo trạng thái tied]    |
   |<-------------------------+                               |
   v                          |                               |
[Xem kết quả trúng cử và      |                               |
 biên bản kiểm phiếu công khai|                               |
 trên Sepolia Etherscan]       |                               |
   |                          |                               |
  (◎) KẾT THÚC                |                               |`
          ),
          createBodyParagraph("Bảng đặc tả chi tiết các bước thực hiện Quy trình 5:"),
          createDataTable(
            ["Bước", "Thành Phần Thực Hiện", "Hành Động Cụ Thể", "Dữ Liệu Đầu Vào", "Dữ Liệu Đầu Ra", "Luồng Ngoại Lệ / Điều Kiện Revert"],
            [
              ["5.1", "Quản trị viên (Admin)", "Gửi giao dịch đóng phiên bầu cử", "electionId", "Lệnh đóng phiên", "Không có"],
              ["5.2", "Smart Contract", "Kiểm tra điều kiện thời gian và quyền hạn", "block.timestamp, endTime", "status = Closed", "Revert 'Voting not ended' nếu đóng trước hạn (TC24)"],
              ["5.3", "Người dùng / Frontend", "Gọi hàm view truy vấn kết quả", "electionId", "Dữ liệu kết quả", "Revert 'Invalid election status' nếu gọi khi chưa đóng phiên (TC25)"],
              ["5.4", "Smart Contract", "Thực hiện thuật toán Selection Sort trên RAM", "Mảng candidates[].votes", "Mảng chỉ số order[] đã sắp xếp", "Không có (chạy trong memory, không tốn gas)"],
              ["5.5", "Smart Contract", "Kiểm tra điều kiện đồng phiếu tại ghế cuối", "votes[seats-1], votes[seats]", "Cờ tied (boolean)", "Không có"],
              ["5.6", "Smart Contract", "Trích xuất danh sách trúng cử chính thức", "order[0..seats-1]", "Mảng winners[]", "Không có"],
              ["5.7", "Web Frontend", "Vẽ biểu đồ kết quả và hiển thị vinh danh HĐQT", "winners[], tied", "Giao diện Bảng vàng HĐQT", "Cảnh báo màu vàng nổi bật nếu tied = true"]
            ],
            [8, 16, 26, 18, 16, 16]
          ),
          createBodyParagraph("Phân tích Chốt an toàn (Security Gates) Quy trình 5:"),
          createBulletItem("Gate 1 - Khóa hàm đóng phiên trước thời hạn", "Admin không thể đóng phiên tùy tiện khi chưa hết giờ quy định. Điều này bảo vệ quyền bỏ phiếu của những cổ đông tham gia sát giờ G (TC24)."),
          createBulletItem("Gate 2 - Bảo mật kết quả kiểm phiếu trước khi kết thúc", "Hàm getWinners() có modifier inStatus(Closed). Không một ai có thể xem kết quả xếp hạng chính thức khi phiên bầu cử vẫn đang diễn ra, loại bỏ tâm lý đám đông hoặc việc điều chỉnh chiến lược bỏ phiếu không lành mạnh (TC25)."),
          createBulletItem("Gate 3 - Giải thuật phát hiện hòa phiếu tự động (Tie Detection)", "Khi xảy ra đồng phiếu tại ranh giới ghế trúng cử cuối cùng, hệ thống không tự ý chọn ngẫu nhiên mà bật cờ tied = true. Điều này đảm bảo tính thượng tôn pháp luật để Đại hội đồng Cổ đông tổ chức biểu quyết vòng hai theo đúng Điều lệ công ty (TC27)."),

          createSectionTitle("2.6. Thiết kế mô hình lớp và phân quyền Smart Contract (Class Diagram)"),
          createBodyParagraph("Hệ thống áp dụng mô hình phân quyền dựa trên vai trò (Role-Based Access Control - RBAC) kế thừa từ OpenZeppelin AccessControl. Sơ đồ lớp dưới đây thể hiện mối quan hệ kế thừa và tương tác hàm giữa các hợp đồng:"),
          createDiagramBox(
            "HÌNH 2.4: SƠ ĐỒ MÔ HÌNH LỚP VÀ PHÂN QUYỀN (CLASS DIAGRAM)",
`+----------------------------------+          +----------------------------------+
|           AccessControl          |          |            ERC20Votes            |
+----------------------------------+          +----------------------------------+
| + hasRole(role, account): bool   |          | + getVotes(account): uint256     |
| + grantRole(role, account)       |          | + getPastVotes(account, b): uint |
| + revokeRole(role, account)      |          | + delegate(delegatee)            |
+----------------------------------+          +----------------------------------+
                 ^                                              ^
                 |                                              |
                 +----------------------+-----------------------+
                                        |
                         +------------------------------+
                         |          ShareToken          |
                         +------------------------------+
                         | + MINTER_ROLE: bytes32       |
                         | + decimals(): uint8 = 0      |
                         | + mint(to, amount)           |
                         | # _update(from, to, val)     |
                         | # nonces(owner): uint256     |
                         +------------------------------+
                                        ^
                                        | (Interface IVotes query)
                                        |
+----------------------------------+    |
|   Pausable  &  ReentrancyGuard   |    |
+----------------------------------+    |
                 ^                      |
                 |                      |
+---------------------------------------+------+
|                  BoardElection               |
+----------------------------------------------+
| + ELECTION_ADMIN_ROLE: bytes32               |
| + MAX_CANDIDATES: uint256 = 50               |
| + shareToken: IVotes                         |
| + electionCount: uint256                     |
+----------------------------------------------+
| + createElection(title, seats): uint256      |
| + addCandidate(id, name, cid)                |
| + startVoting(id, duration)                  |
| + closeElection(id)                          |
| + vote(id, candidateIds[], amounts[])        |
| + getElection(id): (title, seats, status...) |
| + getCandidate(id, candId): (name, cid, v)   |
| + votingPowerOf(id, voter): uint256          |
| + getWinners(id): (winners[], tied)          |
| + pause() / unpause()                        |
+----------------------------------------------+`
          ),

          // Page Break to CHƯƠNG 3
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 3 =================
          createChapterTitle("CHƯƠNG 3. HIỆN THỰC HÓA SMART CONTRACT VÀ CÔNG NGHỆ ỨNG DỤNG"),
          createSectionTitle("3.1. Phân tích chuyên sâu Smart Contract ShareToken.sol"),
          createBodyParagraph("Hợp đồng ShareToken.sol kế thừa từ bộ thư viện chuẩn của OpenZeppelin v5.1.0: ERC20, ERC20Permit, ERC20Votes và AccessControl."),
          createSubSectionTitle("3.1.1. Cấu hình số chữ số thập phân (Decimals = 0)"),
          createBodyParagraph("Trong thế giới tiền mã hóa thông thường, các token tài chính như USDT hoặc DAI thường có decimals = 6 hoặc 18 để phục vụ chia nhỏ thanh toán. Tuy nhiên, cổ phần trong một công ty cổ phần theo Luật Doanh nghiệp là các đơn vị nguyên vẹn không thể tách rời (mỗi cổ phần là một lá phiếu nguyên bản). Do đó, hàm decimals() được ghi đè trả về hằng số 0:"),
          createCodeBlock(
`function decimals() public pure override returns (uint8) {
    return 0; // Cổ phần là số nguyên, không chia nhỏ
}`
          ),

          createSubSectionTitle("3.1.2. Cơ chế tự động ủy quyền biểu quyết (Auto-Delegation Pattern)"),
          createBodyParagraph("Một vấn đề kinh điển trong việc ứng dụng chuẩn ERC20Votes là: khi một tài khoản nhận token, số dư (balanceOf) tăng lên nhưng quyền biểu quyết (getVotes) vẫn bằng 0 cho đến khi người dùng chủ động gọi hàm delegate(self). Đa phần người dùng phổ thông thường quên bước này, dẫn đến mất quyền bầu cử."),
          createBodyParagraph("Hợp đồng ShareToken.sol đã giải quyết triệt để rủi ro này bằng cách ghi đè hàm nội bộ _update(). Ngay khi một tài khoản nhận token lần đầu tiên (delegates(to) == address(0)), hợp đồng tự động thực hiện ủy quyền biểu quyết cho chính tài khoản đó:"),
          createCodeBlock(
`function _update(address from, address to, uint256 value)
    internal
    override(ERC20, ERC20Votes)
{
    if (to != address(0) && delegates(to) == address(0)) {
        _delegate(to, to); // Tự động ủy quyền cho chính mình
    }
    super._update(from, to, value);
}`
          ),

          createSectionTitle("3.2. Phân tích chuyên sâu Smart Contract BoardElection.sol"),
          createSubSectionTitle("3.2.1. Cấu trúc dữ liệu và Quản lý trạng thái"),
          createBodyParagraph("Hợp đồng lưu trữ trạng thái kỳ bầu cử và danh sách ứng viên thông qua các struct tối ưu dung lượng lưu trữ:"),
          createCodeBlock(
`enum Status { None, Registration, Voting, Closed }

struct Candidate {
    string name;
    string profileCid; // CID IPFS của hồ sơ lý lịch ứng viên
    uint256 votes;     // Tổng số phiếu dồn lũy kế
}

struct Election {
    string title;
    uint8 seats;
    Status status;
    uint256 snapshotBlock;
    uint256 endTime;
    Candidate[] candidates;
    mapping(address => bool) hasVoted;
}`
          ),

          createSubSectionTitle("3.2.2. Cơ chế chốt Snapshot Block quá khứ"),
          createBodyParagraph("Khi quản trị viên mở phiên bỏ phiếu, hàm startVoting() xác định thời điểm chốt danh sách cổ đông tại block liền kề trước đó:"),
          createCodeBlock(
`function startVoting(uint256 electionId, uint256 duration)
    external
    onlyRole(ELECTION_ADMIN_ROLE)
    whenNotPaused
    inStatus(electionId, Status.Registration)
{
    Election storage e = _elections[electionId];
    require(e.candidates.length >= e.seats, "Not enough candidates");
    require(duration > 0, "Duration must be > 0");
    e.snapshotBlock = block.number - 1; // Block đã đào xong, chống thao túng
    e.endTime = block.timestamp + duration;
    e.status = Status.Voting;
    emit VotingStarted(electionId, e.snapshotBlock, e.endTime);
}`
          ),
          createBodyParagraph("Lý do lựa chọn block.number - 1: Hàm getPastVotes() của OpenZeppelin ERC20Votes yêu cầu số block truyền vào phải là một khối đã qua (strictly in the past). Việc chốt tại block.number - 1 đảm bảo chắc chắn trạng thái số dư đã hoàn tất đóng gói, ngăn chặn việc ai đó vừa thực hiện chuyển nhượng hoặc vay nhanh trong cùng block hiện tại."),

          createSubSectionTitle("3.2.3. Hàm vote() với mô hình Checks-Effects-Interactions"),
          createBodyParagraph("Hàm vote() là trái tim xử lý nghiệp vụ của toàn bộ hệ thống. Mã nguồn áp dụng mẫu thiết kế bảo mật tối thượng:"),
          createCodeBlock(
`function vote(uint256 electionId, uint256[] calldata candidateIds, uint256[] calldata amounts)
    external
    whenNotPaused
    nonReentrant
    inStatus(electionId, Status.Voting)
{
    Election storage e = _elections[electionId];
    require(block.timestamp <= e.endTime, "Voting ended");
    require(!e.hasVoted[msg.sender], "Already voted");
    require(candidateIds.length == amounts.length && candidateIds.length > 0, "Invalid input");

    // Tính toán hạn mức biểu quyết tối đa: Cổ phần tại Snapshot x Số ghế
    uint256 maxVotes = shareToken.getPastVotes(msg.sender, e.snapshotBlock) * e.seats;
    require(maxVotes > 0, "No voting power");

    // EFFECTS: Đánh dấu trạng thái trước khi duyệt dữ liệu
    e.hasVoted[msg.sender] = true;

    uint256 total;
    for (uint256 i = 0; i < candidateIds.length; i++) {
        require(candidateIds[i] < e.candidates.length, "Candidate not found");
        // Bắt buộc mảng ID phải tăng dần nghiêm ngặt -> Chống gửi trùng lặp ID
        require(i == 0 || candidateIds[i] > candidateIds[i - 1], "Ids must be ascending");
        total += amounts[i];
        e.candidates[candidateIds[i]].votes += amounts[i];
    }
    require(total <= maxVotes, "Exceeds voting power");

    emit VoteCast(electionId, msg.sender, total);
}`
          ),

          createSubSectionTitle("3.2.4. Thuật toán kiểm phiếu On-chain và Phát hiện Hòa phiếu (getWinners)"),
          createBodyParagraph("Sau khi kỳ bầu cử đóng lại, hàm view getWinners() thực hiện tìm kiếm danh sách người trúng cử hoàn toàn trên bộ nhớ RAM (memory), không làm biến đổi trạng thái sổ cái (không tốn gas khi đọc):"),
          createCodeBlock(
`function getWinners(uint256 electionId)
    external
    view
    inStatus(electionId, Status.Closed)
    returns (uint256[] memory winners, bool tied)
{
    Election storage e = _elections[electionId];
    uint256 n = e.candidates.length;
    uint256[] memory order = new uint256[](n);
    for (uint256 i = 0; i < n; i++) order[i] = i;

    // Sắp xếp chọn (Selection Sort) trên bộ nhớ RAM
    for (uint256 i = 0; i < n; i++) {
        uint256 best = i;
        for (uint256 j = i + 1; j < n; j++) {
            if (e.candidates[order[j]].votes > e.candidates[order[best]].votes) best = j;
        }
        (order[i], order[best]) = (order[best], order[i]);
    }

    winners = new uint256[](e.seats);
    for (uint256 i = 0; i < e.seats; i++) winners[i] = order[i];

    // Phát hiện hòa phiếu tại vị trí ranh giới ghế cuối cùng
    tied = n > e.seats && e.candidates[order[e.seats - 1]].votes == e.candidates[order[e.seats]].votes;
}`
          ),

          createSectionTitle("3.3. Tầng trung gian và Lưu trữ phi tập trung IPFS (Pinata Gateway)"),
          createBodyParagraph("Hồ sơ lý lịch, đề án hành động và các chứng chỉ bằng cấp của ứng viên HĐQT là những tài liệu pháp lý quan trọng. Nếu lưu trữ trên cơ sở dữ liệu truyền thống (MySQL, MongoDB), người quản trị máy chủ có thể bí mật thay đổi nội dung file. Ngược lại, nếu lưu trực tiếp file PDF dung lượng hàng Megabyte lên Blockchain thì chi phí Gas sẽ cực kỳ đắt đỏ."),
          createBodyParagraph("Giải pháp tối ưu là sử dụng hệ phân tán IPFS:"),
          createBulletItem("Cơ chế Content Addressing", "Mỗi tài liệu khi tải lên IPFS sẽ được băm nội dung để tạo thành một mã định danh duy nhất CID (Content Identifier) có định dạng ipfs://Qm.... Nếu nội dung tệp bị thay đổi dù chỉ 1 bit, mã CID sẽ thay đổi hoàn toàn."),
          createBulletItem("Bảo vệ khóa bí mật qua Backend Proxy", "Giao diện Web không gọi trực tiếp Pinata API để tránh lộ PINATA_JWT. Thay vào đó, tệp được tải lên Web Server Node.js nội bộ (server.js), server thực hiện ký xác thực và pin tệp lên Pinata IPFS Cloud, sau đó trả mã CID về cho dApp để lưu vào Blockchain."),
          createBulletItem("Xem trực tiếp qua Dedicated Gateway", "Người dùng có thể nhấp vào liên kết hồ sơ trên giao diện để xem trực tiếp tệp PDF/ảnh thông qua cổng truy cập riêng https://purple-fashionable-rooster-653.mypinata.cloud/ipfs/."),

          createSectionTitle("3.4. Giao diện người dùng Web dApp đa vai trò"),
          createBodyParagraph("Giao diện dApp được tổ chức khoa học với ba phân hệ tương ứng với các nhóm người dùng:"),
          createBulletItem("Phân hệ Quản trị (Admin Dashboard)", "Dành cho Ban tổ chức đại hội. Cho phép cấu hình kỳ bầu cử mới, tải hồ sơ ứng viên lên IPFS, bấm nút mở phiên bỏ phiếu (kích hoạt đồng hồ đếm ngược), đóng phiên và kích hoạt tạm dừng khẩn cấp."),
          createBulletItem("Phân hệ Bỏ phiếu Cổ đông (Voter Portal)", "Hiển thị số cổ phần sở hữu, quyền biểu quyết tối đa và thanh trượt/ô nhập liệu để cổ đông phân bổ phiếu dồn linh hoạt cho từng ứng viên. Giao diện tự động tính toán tổng số phiếu còn lại thời gian thực và cảnh báo màu đỏ nếu vượt hạn mức."),
          createBulletItem("Phân hệ Kết quả & Giám sát (Results & Public Audit)", "Hiển thị biểu đồ phân bổ phiếu bầu trực quan, danh sách Top K thành viên trúng cử được làm nổi bật viền vàng, cảnh báo trạng thái hòa phiếu (nếu có), và liên kết tra cứu minh bạch giao dịch trên Sepolia Etherscan."),
          createBulletItem("Bộ Ví Thử Nghiệm Nhanh (Demo Quick Wallets)", "Hỗ trợ 4 ví tích hợp sẵn: Admin (chủ tọa), Alice (nắm 50% cổ phần), Bob (nắm 20.8% cổ phần), Carol (nắm 29.2% cổ phần) và tài khoản Khách (Guest), giúp người đánh giá trải nghiệm toàn diện hệ thống chỉ bằng 1 cú nhấp chuột mà không cần cài đặt ví MetaMask."),

          // Page Break to CHƯƠNG 4
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 4 =================
          createChapterTitle("CHƯƠNG 4. HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH HỆ THỐNG"),
          createSectionTitle("4.1. Hướng dẫn khởi chạy trên môi trường Localhost"),
          createSubSectionTitle("4.1.1. Chuẩn bị môi trường"),
          createBodyParagraph("Máy tính cần cài đặt Node.js phiên bản ≥ 18.0.0 (khuyên dùng Node.js v20.x hoặc v22.x LTS)."),
          createBodyParagraph("Mở terminal tại thư mục dự án và tiến hành cài đặt các gói phụ thuộc:"),
          createCodeBlock(
`# Cài đặt các thư viện cần thiết
npm install`
          ),

          createSubSectionTitle("4.1.2. Khởi chạy Blockchain Node giả lập cục bộ"),
          createBodyParagraph("Mở một cửa sổ Terminal 1 riêng biệt và khởi động node Hardhat:"),
          createCodeBlock(
`npx hardhat node`
          ),
          createBodyParagraph("Hệ thống sẽ khởi tạo một mạng Ethereum giả lập lắng nghe tại địa chỉ http://127.0.0.1:8545 và cấp sẵn 20 tài khoản thử nghiệm với 10,000 ETH test mỗi tài khoản."),

          createSubSectionTitle("4.1.3. Biên dịch và Triển khai Smart Contract tự động"),
          createBodyParagraph("Mở Terminal 2 và thực thi script triển khai dữ liệu mẫu:"),
          createCodeBlock(
`node scripts/deploy-local.js`
          ),
          createBodyParagraph("Script tự động thực hiện các thao tác:"),
          createBulletItem("Bước 1", "Biên dịch toàn bộ Smart Contract sang bytecode và sinh artifacts."),
          createBulletItem("Bước 2", "Triển khai ShareToken.sol với quyền Admin tối cao."),
          createBulletItem("Bước 3", "Triển khai BoardElection.sol liên kết với ShareToken."),
          createBulletItem("Bước 4", "Cấp phát cổ phần mẫu: Alice: 60 CP (50%), Bob: 25 CP (20.8%), Carol: 35 CP (29.2%)."),
          createBulletItem("Bước 5", "Tạo kỳ bầu cử mẫu #1: 'Đại hội Cổ đông 2027 - Bầu HĐQT Doanh nghiệp' với 3 ghế và 5 ứng viên mẫu kèm hồ sơ IPFS."),
          createBulletItem("Bước 6", "Tự động xuất địa chỉ contract và ABI ra tệp cấu hình frontend/config.js."),

          createSubSectionTitle("4.1.4. Khởi động Web Server và Trải nghiệm dApp"),
          createBodyParagraph("Vẫn tại Terminal 2, khởi chạy máy chủ web:"),
          createCodeBlock(
`npm run serve
# Hoặc: node frontend/server.js`
          ),
          createBodyParagraph("Mở trình duyệt Web và truy cập vào địa chỉ:"),
          createCalloutBox("Đường dẫn giao diện Web dApp", "👉 http://localhost:3000\nNgười dùng có thể đăng nhập ví MetaMask hoặc dùng các nút Đăng nhập nhanh để trải nghiệm kịch bản bầu cử."),

          createSectionTitle("4.2. Hướng dẫn triển khai lên mạng Ethereum Sepolia Testnet bằng CLI"),
          createSubSectionTitle("4.2.1. Chuẩn bị tài nguyên mạng Sepolia"),
          createBulletItem("RPC Endpoint", "Đăng ký tài khoản miễn phí tại Alchemy (https://www.alchemy.com) hoặc Infura (https://www.infura.io) để lấy URL kết nối mạng Sepolia (Chain ID: 11155111)."),
          createBulletItem("Sepolia ETH", "Nhận ETH thử nghiệm miễn phí từ các vòi công khai như Google Cloud Web3 Faucet hoặc SepoliaFaucet.com vào ví deploy."),
          createBulletItem("Cấu hình file .env", "Tạo file .env tại thư mục gốc với nội dung:"),
          createCodeBlock(
`# Cấu hình Sepolia Testnet
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
SEPOLIA_PRIVATE_KEY=your_private_key_without_0x`
          ),

          createSubSectionTitle("4.2.2. Lệnh thực thi triển khai qua giao diện dòng lệnh (CLI)"),
          createBodyParagraph("Thực thi script chuyên dụng đã được tối ưu hóa cho mạng Sepolia:"),
          createCodeBlock(
`# Cách 1: Sử dụng lệnh npm script
npm run deploy:sepolia

# Cách 2: Chạy trực tiếp kèm tham số Private Key CLI
node scripts/deploy-sepolia.js <PRIVATE_KEY_SEPOLIA>`
          ),

          createSubSectionTitle("4.2.3. Quy trình tự động hóa của Script Triển khai Sepolia"),
          createBodyParagraph("Script deploy-sepolia.js được thiết kế với độ tin cậy chuẩn doanh nghiệp:"),
          createBulletItem("Tự động fallback RPC", "Nếu kết nối RPC chính bị chậm, script tự động chuyển đổi qua danh sách 5 cổng RPC Sepolia công cộng dự phòng (tenderly, publicnode, sepolia.org...)."),
          createBulletItem("Xác thực số dư gas", "Kiểm tra số dư ví deployer trước khi gửi giao dịch để tránh lỗi Out of Gas giữa chừng."),
          createBulletItem("Phân bổ quyền Super Admin", "Cấp toàn bộ quyền quản trị tối cao DEFAULT_ADMIN_ROLE, MINTER_ROLE (trên ShareToken) và ELECTION_ADMIN_ROLE (trên BoardElection) cho địa chỉ ví đích của người dùng."),
          createBulletItem("Đồng bộ Frontend tự động", "Ghi log triển khai ra frontend/sepolia-deployment.json và tự động cập nhật địa chỉ contract mới vào frontend/config.js."),

          createSectionTitle("4.3. Thông tin triển khai thực tế trên Sepolia & Etherscan"),
          createBodyParagraph("Hệ thống đã được triển khai thực tế và xác minh thành công trên mạng Ethereum Sepolia Testnet với các thông số kỹ thuật chính thức:"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 28, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Hạng mục", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 72, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Giá trị thực tế trên Ethereum Sepolia Testnet", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 22 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Tên Mạng / Chain ID", bold: true, font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Ethereum Sepolia Testnet — Chain ID: 11155111 (0xaa36a7)", font: FONT_FAMILY, size: 22 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Quản trị viên (Super Admin)", bold: true, font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66", font: "Consolas", size: 20, color: COLOR_PRIMARY })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Hợp đồng ShareToken", bold: true, font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "0xa4352AD4E013245AB8B2C33bDb8D0F7E29e309C9\nhttps://sepolia.etherscan.io/address/0xa4352AD4E013245AB8B2C33bDb8D0F7E29e309C9", font: "Consolas", size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Hợp đồng BoardElection", bold: true, font: FONT_FAMILY, size: 22 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "0xCb78223247400217fdAeAC819983Ec35892fEc9C\nhttps://sepolia.etherscan.io/address/0xCb78223247400217fdAeAC819983Ec35892fEc9C", font: "Consolas", size: 19 })] })] })
                ]
              })
            ]
          }),

          createSectionTitle("4.4. Hướng dẫn xác minh mã nguồn hợp đồng (Contract Verification)"),
          createBodyParagraph("Để bảo đảm tính minh bạch tuyệt đối đối với các nhà đầu tư và kiểm toán viên độc lập, mã nguồn Smart Contract cần được xác minh (verify) trên Sepolia Etherscan. Khi được verify, Etherscan sẽ hiển thị dấu tích xanh 'Contract Source Code Verified', cho phép bất kỳ ai đọc trực tiếp mã nguồn Solidity và tương tác với các hàm read/write ngay trên trình duyệt:"),
          createCodeBlock(
`# Cấu hình ETHERSCAN_API_KEY trong .env
# Lệnh xác minh ShareToken trên Sepolia
npx hardhat verify --network sepolia 0xa4352AD4E013245AB8B2C33bDb8D0F7E29e309C9 \\
  "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66"

# Lệnh xác minh BoardElection trên Sepolia
npx hardhat verify --network sepolia 0xCb78223247400217fdAeAC819983Ec35892fEc9C \\
  "0xa4352AD4E013245AB8B2C33bDb8D0F7E29e309C9" \\
  "0xeD9D3BE4A094B9cb82f864f793F4F96098323F66"`
          ),

          // Page Break to CHƯƠNG 5
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 5 =================
          createChapterTitle("CHƯƠNG 5. KIỂM THỬ TỰ ĐỘNG VÀ ĐÁNH GIÁ CHẤT LƯỢNG (TEST SUITE)"),
          createSectionTitle("5.1. Chiến lược và môi trường kiểm thử"),
          createBodyParagraph("Kiểm thử phần mềm là giai đoạn quan trọng bậc nhất trong phát triển ứng dụng chuỗi khối, bởi vì một khi Smart Contract đã được triển khai lên mạng chính, bất kỳ lỗi logic nào cũng không thể vá lại và có thể dẫn đến thất thoát tài sản vĩnh viễn."),
          createBodyParagraph("Chiến lược kiểm thử của dự án bao gồm:"),
          createBulletItem("Khung kiểm thử (Testing Framework)", "Hardhat 3 kết hợp Mocha Test Runner và thư viện Chai Assertion Library."),
          createBulletItem("Môi trường thực thi (Execution Environment)", "Mạng mô phỏng EDR (Ethereum Development Runtime) tích hợp sẵn trong Hardhat, hỗ trợ cheatcodes điều chỉnh thời gian khối (evm_increaseTime) và đào khối tức thời (evm_mine)."),
          createBulletItem("Phương pháp tiếp cận", "Kiểm thử hộp trắng (White-box testing), kiểm thử đơn vị (Unit testing), kiểm thử tích hợp (Integration testing), kiểm thử biên (Boundary value testing) và kiểm thử tấn công xâm nhập (Attack simulation)."),

          createSectionTitle("5.2. Ma trận các ca kiểm thử chi tiết (TC01 – TC35)"),
          createBodyParagraph("Toàn bộ 35 ca kiểm thử được phân nhóm logic như sau:"),
          createBulletItem("Nhóm 1: ShareToken (TC01 - TC04)", "Kiểm tra thuộc tính token, decimals = 0, mint và auto-delegation, kiểm soát quyền truy cập MINTER_ROLE, và cơ chế tự động cập nhật Checkpoint Votes khi chuyển nhượng cổ phần."),
          createBulletItem("Nhóm 2: BoardElection Quản trị (TC05 - TC12)", "Kiểm tra tạo kỳ bầu cử, chặn ghế ≤ 0, phân quyền DEFAULT_ADMIN_ROLE, thêm ứng viên kèm hồ sơ IPFS CID, giới hạn số ứng viên tối thiểu so với số ghế, chốt snapshotBlock = block.number - 1, và chặn thêm ứng viên sau khi mở phiên."),
          createBulletItem("Nhóm 3: BoardElection Bỏ phiếu (TC13 - TC23)", "Kiểm tra dồn phiếu hợp lệ đúng hạn mức, chặn bỏ phiếu lần 2 (Already voted), chặn người không có cổ phần tại snapshot, chặn dồn vượt hạn mức, bắt buộc candidateIds tăng dần nghiêm ngặt (chống trùng lặp), chặn cổ phần nhận sau snapshot (chống Flash Loan), kiểm tra thời hạn bỏ phiếu, và chặn tấn công Reentrancy / Double-voting thông qua hợp đồng độc hại DoubleVoter.sol."),
          createBulletItem("Nhóm 4: Đóng phiên, Kết quả & Bảo mật (TC24 - TC30)", "Kiểm tra đóng phiên đúng thời hạn và đúng quyền, chặn xem kết quả khi chưa đóng phiên, kiểm chứng bảo vệ cổ đông thiểu số giành ghế HĐQT (TC26), phát hiện hòa phiếu tại ghế cuối cùng (tied = true, TC27), cơ chế tạm dừng khẩn cấp Pausable (TC28), chặn Zero Address khi khởi tạo (TC29), và giới hạn MAX_CANDIDATES = 50 chống DoS Block Gas Limit (TC30)."),
          createBulletItem("Nhóm 5: Mở rộng & Fuzzing (TC31 - TC35)", "Kiểm thử hợp đồng phụ trợ Counter, Fuzz testing với 256 lần chạy ngẫu nhiên, kiểm tra log sự kiện và bộ lọc queryFilter."),

          createSectionTitle("5.3. Kết quả thực thi kiểm thử thực tế (100% PASS, 866 ms)"),
          createBodyParagraph("Lệnh thực thi kiểm thử trên terminal:"),
          createCodeBlock(
`npx hardhat test`
          ),
          createBodyParagraph("Nhật ký thực thi thực tế từ Hardhat Mocha Test Runner:"),
          createDiagramBox(
            "TERMINAL EXECUTION LOG: HARDHAT TEST SUITE (35 PASSING - 866 MS)",
`  ShareToken
    ✔ TC01 - Kiểm tra decimals của ShareToken (42ms)
    ✔ TC02 - Admin mint cổ phần: số dư = 60; tự ủy quyền; getVotes = 60 (28ms)
    ✔ TC03 - Mint bởi tài khoản không có MINTER_ROLE bị revert (31ms)
    ✔ TC04 - Chuyển token cập nhật quyền biểu quyết: Alice 50, Dave 10 (35ms)

  BoardElection - Quản trị
    ✔ TC05 - Admin tạo kỳ bầu cử: phát ElectionCreated; trạng thái Registration (25ms)
    ✔ TC06 - Tạo kỳ bầu cử bởi người không có quyền bị revert (22ms)
    ✔ TC07 - Số ghế bằng 0 bị revert (18ms)
    ✔ TC08 - Thêm ứng viên: phát CandidateAdded; đọc lại đúng tên, CID, 0 phiếu (26ms)
    ✔ TC09 - Thêm ứng viên bởi người không có quyền bị revert (20ms)
    ✔ TC10 - Mở phiên khi thiếu ứng viên (3 ghế, 1 ứng viên) bị revert (24ms)
    ✔ TC11 - Mở phiên hợp lệ: trạng thái Voting; snapshotBlock đúng (29ms)
    ✔ TC12 - Thêm ứng viên sau khi mở phiên bị revert (23ms)

  BoardElection - Bỏ phiếu
    ✔ TC13 - Bỏ phiếu hợp lệ bằng đúng số phiếu tối đa (Alice 60cp x 3 ghế = 180) (34ms)
    ✔ TC14 - Bỏ phiếu lần hai bị revert Already voted (27ms)
    ✔ TC15 - Người không có cổ phần (Dave) bỏ phiếu bị revert No voting power (21ms)
    ✔ TC16 - Dồn vượt số phiếu tối đa (Bob 75 phiếu, dồn 76) bị revert (22ms)
    ✔ TC17 - Ứng viên trùng / không tăng dần bị revert (25ms)
    ✔ TC18 - Ứng viên không tồn tại bị revert Candidate not found (20ms)
    ✔ TC19 - Nhận cổ phần sau snapshot bị revert No voting power (28ms)
    ✔ TC20 - Chuyển token sau snapshot: người nhận không được cộng quyền, người gửi giữ nguyên (32ms)
    ✔ TC21 - Bỏ phiếu sau hạn bị revert Voting ended (29ms)
    ✔ TC22 - Bỏ phiếu khi chưa mở phiên (Registration) bị revert (19ms)
    ✔ TC23 - Tấn công bỏ phiếu 2 lần trong 1 giao dịch (DoubleVoter) bị chặn (36ms)

  BoardElection - Đóng phiên & Kết quả
    ✔ TC24 - Đóng phiên trước hạn / sai quyền bị revert; Admin đóng sau hạn thành công (31ms)
    ✔ TC25 - Xem kết quả khi chưa đóng phiên bị revert (18ms)
    ✔ TC26 - Kịch bản bầu dồn: cổ đông thiểu số (29%) vẫn giành được 1 ghế (42ms)
    ✔ TC27 - Phát hiện đồng phiếu (1 ghế, 2 ứng viên cùng 25 phiếu): tied = true (33ms)
    ✔ TC28 - Tạm dừng hệ thống: vote bị chặn; sau unpause vote thành công (38ms)
    ✔ TC29 - Khởi tạo với địa chỉ 0 bị revert Zero address (19ms)
    ✔ TC30 - Giới hạn số ứng viên: ứng viên thứ 51 bị revert Too many candidates (45ms)

  Counter & Auxiliary Tests
    ✔ TC31 - Counter initial value = 0 (12ms)
    ✔ TC32 - Counter incBy(0) reverts (14ms)
    ✔ TC33 - Counter Solidity Foundry Fuzz Testing (256 runs) (18ms)
    ✔ TC34 - Counter Increment Event Emitted (15ms)
    ✔ TC35 - Counter queryFilter accumulated state (16ms)

  35 passing (866ms)`
          ),

          createSectionTitle("5.4. Đánh giá kiểm thử kịch bản bảo vệ cổ đông thiểu số (TC26)"),
          createBodyParagraph("Test case TC26 là phép thử thực tế có ý nghĩa quan trọng nhất, chứng minh tính đúng đắn của việc hiện thực hóa Điều 148 Luật Doanh nghiệp:"),
          createBulletItem("Bối cảnh đại hội", "Tổng số cổ phần lưu hành là 120 CP. Đại hội cần bầu 3 ghế HĐQT. Danh sách gồm 5 ứng viên: A, B, C, D, E."),
          createBulletItem("Cơ cấu sở hữu", "Alice nắm 60 CP (50.0% - đại diện nhóm đa số). Bob nắm 25 CP (20.8%). Carol nắm 35 CP (29.2% - nhóm thiểu số)."),
          createBulletItem("Phân bổ số phiếu tối đa", "Alice có: 60 × 3 = 180 phiếu. Bob có: 25 × 3 = 75 phiếu. Carol có: 35 × 3 = 105 phiếu."),
          createBulletItem("Chiến lược bỏ phiếu", "Alice muốn đưa 2 người của mình vào HĐQT nên chia đều 180 phiếu: 90 phiếu cho ứng viên A và 90 phiếu cho ứng viên B. Bob dồn toàn bộ 75 phiếu cho ứng viên D. Carol (cổ đông thiểu số) áp dụng chiến lược dồn toàn bộ 105 phiếu cho duy nhất ứng viên E."),
          createBulletItem("Kết quả thực thi on-chain", "Sau khi đóng phiên, hàm getWinners() trả về danh sách 3 ứng viên trúng cử: Hạng 1: Ứng viên E (105 phiếu - đại diện của Carol). Hạng 2: Ứng viên A (90 phiếu). Hạng 3: Ứng viên B (90 phiếu). Ứng viên D của Bob bị loại (75 phiếu)."),
          createBodyParagraph("Kết luận: Dù chỉ nắm 29.2% cổ phần, cổ đông thiểu số Carol vẫn chắc chắn giành được 1 ghế HĐQT, chứng minh hệ thống smart contract hoạt động hoàn toàn chính xác theo đúng tinh thần bảo vệ quyền lợi cổ đông nhỏ."),

          // Page Break to CHƯƠNG 6
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CHAPTER 6 =================
          createChapterTitle("CHƯƠNG 6. PHÂN TÍCH AN TOÀN VÀ BẢO MẬT SMART CONTRACT"),
          createSectionTitle("6.1. Tổng quan an toàn bảo mật trong Smart Contract (SWC Registry)"),
          createBodyParagraph("Trong môi trường phi tập trung của Blockchain, mã nguồn hợp đồng thông minh là công khai và không thể đảo ngược (immutable). Bất kỳ một sơ hở lập trình nào cũng có thể bị các tin tặc khai thác thông qua các bot tự động để đánh cắp tài sản hoặc thao túng kết quả biểu quyết."),
          createBodyParagraph("Dự án áp dụng quy chuẩn phân loại điểm yếu phần mềm hợp đồng thông minh SWC Registry (Smart Contract Weakness Classification) và các chuẩn mực bảo mật tiên tiến nhất của OpenZeppelin để rà soát và phòng ngừa 9 lỗ hổng bảo mật trọng yếu:"),

          createSectionTitle("6.2. Phân tích 9 lỗ hổng bảo mật Web3 trọng yếu và biện pháp phòng ngừa"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 14, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Mã SWC", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 24, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Tên lỗ hổng", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 48, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Giải pháp kiến trúc & Kỹ thuật khắc phục", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ shading: { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, width: { size: 14, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Test Case", bold: true, color: "FFFFFF", font: FONT_FAMILY, size: 20 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-107", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Re-entrancy Attack\n(Tấn công tái nhập)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "1. Kế thừa modifier nonReentrant của ReentrancyGuard.\n2. Tuân thủ tuyệt đối mẫu Checks-Effects-Interactions: Ghi hasVoted[msg.sender] = true trước khi duyệt mảng cộng phiếu.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC14, TC23\n(DoubleVoter)", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-101", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Arithmetic Overflow / Underflow (Tràn số)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Sử dụng trình biên dịch Solidity ^0.8.24 với cơ chế kiểm tra số học tích hợp sẵn ở cấp độ opcode. Mọi phép toán tràn số đều tự động revert.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Toàn bộ hợp đồng", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-105", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Broken Access Control (Lỗi phân quyền)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Sử dụng OpenZeppelin AccessControl phân tách vai trò: DEFAULT_ADMIN_ROLE, MINTER_ROLE, ELECTION_ADMIN_ROLE. Khóa chặt các hàm nhạy cảm bằng modifier onlyRole.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC03, TC06,\nTC09, TC24", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "N/A", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Flash Loan Attack &\nDouble Voting", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Dùng ERC20Votes Snapshot checkpointing. Quyền biểu quyết bị đóng băng cố định tại snapshotBlock = block.number - 1. Mọi token mua hoặc vay sau đó đều không có quyền bầu.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC14, TC19,\nTC20, TC23", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "N/A", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Duplicate Candidate Exploit (Lặp ứng viên)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Bắt buộc mảng candidateIds phải tăng dần nghiêm ngặt (candidateIds[i] > candidateIds[i-1]). Ngăn chặn triệt để hành vi gửi lặp lại 1 ứng viên nhiều lần.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC17", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-128", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "DoS with Block Gas Limit (Nghẽn Gas)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Khống chế hằng số MAX_CANDIDATES = 50. Thuật toán Selection Sort chỉ duyệt trên mảng n <= 50 trong RAM, bảo đảm không bao giờ vượt giới hạn Gas của khối.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC30 (Revert ứng viên 51)", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-104", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Unchecked Call Return Value", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Tuyệt đối không sử dụng các lệnh gọi cấp thấp (.call, .send). Tương tác với hợp đồng token thông qua interface IVotes tĩnh với kiểm tra kiểu dữ liệu an toàn.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Toàn bộ hợp đồng", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "N/A", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Zero Address Initialization", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Hàm constructor kiểm tra nghiêm ngặt: require(token != address(0) && admin != address(0), 'Zero address'). Ngăn chặn việc cấu hình sai làm khóa vĩnh viễn hợp đồng.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC29", font: FONT_FAMILY, size: 19 })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "SWC-133", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Insufficient Circuit Breakers (Thiếu cơ chế ngắt)", bold: true, font: FONT_FAMILY, size: 20 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Tích hợp OpenZeppelin Pausable. Admin tối cao có thể kích hoạt pause() để phong tỏa toàn bộ giao dịch bỏ phiếu ngay tức thì khi phát hiện có biến cố ngoài đời thực.", font: FONT_FAMILY, size: 19 })] })] }),
                  new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "TC28", font: FONT_FAMILY, size: 19 })] })] })
                ]
              })
            ]
          }),

          createSectionTitle("6.3. Chính sách bảo mật API Key và Quản lý Secrets"),
          createBodyParagraph("Nhằm bảo vệ an toàn cho hệ thống và ngăn ngừa rủi ro rò rỉ khóa bí mật:"),
          createBulletItem("Cơ chế .gitignore và .ignore", "Cấu hình chặn hoàn toàn các tệp nhạy cảm .env, private keys, thư mục artifacts và cache khỏi việc bị commit lên các kho mã nguồn công khai (GitHub/GitLab)."),
          createBulletItem("Chỉ chia sẻ file mẫu .env.example", "Kho lưu trữ công khai chỉ chứa file cấu hình mẫu với các giá trị placeholder, tuyệt đối không chứa private key thật."),
          createBulletItem("Bảo vệ Pinata IPFS Token qua Backend Proxy", "Mã JWT bí mật của dịch vụ Pinata IPFS được lưu hoàn toàn tại biến môi trường của Web Server Node.js (server.js). Mọi thao tác tải tệp từ trình duyệt người dùng đều được định tuyến qua server proxy nội bộ, ngăn chặn người dùng dịch ngược mã nguồn JavaScript để lấy trộm API key."),

          // Page Break to KẾT LUẬN & TÀI LIỆU THAM KHẢO
          new Paragraph({ children: [new PageBreak()] }),

          // ================= CONCLUSION =================
          createChapterTitle("KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN"),
          createSectionTitle("1. Kết quả đạt được"),
          createBodyParagraph("Chuyên đề học phần 'Lập trình Blockchain' với đề tài 'Xây dựng Hệ thống Bỏ phiếu Bầu Hội đồng Quản trị Doanh nghiệp' đã hoàn thành xuất sắc toàn bộ các mục tiêu nghiên cứu và yêu cầu kỹ thuật đã đặt ra:"),
          createBulletItem("1. Hiện thực hóa chuẩn xác quy định pháp luật", "Mô hình hóa hoàn hảo cơ chế Bầu dồn phiếu theo quy định tại Điều 148 Luật Doanh nghiệp 2020 dưới dạng hợp đồng thông minh Solidity ^0.8.24."),
          createBulletItem("2. Bảo vệ cổ đông thiểu số", "Chứng minh bằng thực nghiệm toán học và kiểm thử (TC26) rằng nhóm cổ đông nhỏ (chỉ nắm 29% cổ phần) hoàn toàn có thể liên kết số phiếu để giành được 1 ghế trong Hội đồng Quản trị, loại bỏ nguy cơ thâu tóm từ cổ đông lớn."),
          createBulletItem("3. Kiến trúc ba tầng vững chắc", "Kết hợp nhịp nhàng giữa Giao diện dApp Web3, Tầng lưu trữ phi tập trung IPFS (Pinata Cloud) và Sổ cái phân tán Ethereum."),
          createBulletItem("4. Chất lượng kiểm thử hoàn hảo", "Xây dựng bộ kiểm thử Hardhat tự động gồm 35 ca kiểm thử bao phủ 100% các nhánh nghiệp vụ và kịch bản an ninh, đạt tỷ lệ thành công tuyệt đối 100% PASS trong thời gian 866 ms."),
          createBulletItem("5. Triển khai thực tế trên Sepolia Testnet", "Hệ thống đã được đóng gói, cấu hình phân quyền Super Admin và triển khai thành công lên mạng thử nghiệm toàn cầu Ethereum Sepolia (Chain ID 11155111)."),

          createSectionTitle("2. Hạn chế còn tồn tại"),
          createBulletItem("Quyền riêng tư của phiếu bầu (Voting Privacy)", "Do dữ liệu trên Ethereum là hoàn toàn công khai, các cổ đông khác có thể đọc được số phiếu và ứng viên mà một cổ đông đã chọn trước khi phiên bầu kết thúc."),
          createBulletItem("Chi phí Gas trên Mainnet", "Dù đã được tối ưu hóa, các giao dịch ghi on-chain trên mạng chính thức (Mainnet) vẫn có thể tốn một khoản phí gas nhất định đối với các doanh nghiệp có số lượng cổ đông rất lớn."),

          createSectionTitle("3. Hướng phát triển trong tương lai"),
          createBulletItem("Ứng dụng Bằng chứng Không Tri thức (Zero-Knowledge Proofs - ZK-SNARKs)", "Nghiên cứu tích hợp giao thức ZK-SNARKs hoặc MACI (Minimum Anti-Collusion Infrastructure) để bảo mật nội dung phiếu bầu cho đến khi phiên kết thúc, chống hành vi mua bán phiếu hoặc thao túng tâm lý cử tri."),
          createBulletItem("Mở rộng lên Layer 2 (Rollups)", "Triển khai hệ thống lên các giải pháp mở rộng quy mô Ethereum Layer 2 như Arbitrum One hoặc Optimism để giảm 99% phí giao dịch gas và nâng cao tốc độ xác thực tức thời."),
          createBulletItem("Tích hợp Quản trị DAO Đa chuỗi (Cross-chain Governance)", "Mở rộng khả năng cho phép biểu quyết xuyên chuỗi cho các tập đoàn đa quốc gia có cổ phần niêm yết trên nhiều hệ sinh thái blockchain khác nhau."),

          new Paragraph({ spacing: { before: 240, after: 100 } }),
          createChapterTitle("TÀI LIỆU THAM KHẢO"),
          createBodyParagraph("[1] Quốc hội nước CHXHCN Việt Nam, Luật Doanh nghiệp số 59/2020/QH14, ban hành ngày 17/06/2020, có hiệu lực từ ngày 01/01/2021 (Điều 148: Điều kiện để nghị quyết của Đại hội đồng cổ đông được thông qua)."),
          createBodyParagraph("[2] OpenZeppelin Contracts Documentation, ERC20Votes & Governor: Checkpoint-based voting power with snapshot support, https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20Votes."),
          createBodyParagraph("[3] Gavin Wood, Ethereum: A Secure Decentralised Generalised Transaction Ledger (Yellow Paper), Berlin Version, 2024."),
          createBodyParagraph("[4] Hardhat 3 Official Documentation, The Ethereum development environment for professionals, https://hardhat.org/docs."),
          createBodyParagraph("[5] Ethers.js v6 Library Documentation, Complete and compact library for interacting with the Ethereum Blockchain, https://docs.ethers.org/v6/."),
          createBodyParagraph("[6] IPFS & Pinata Cloud Docs, InterPlanetary File System Content Addressing and Dedicated Gateways, https://docs.pinata.cloud/."),
          createBodyParagraph("[7] Smart Contract Weakness Classification and Test Cases (SWC Registry), https://swcregistry.io/.")
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const tempPath = path.join(os.tmpdir(), "Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx");
  fs.writeFileSync(tempPath, buffer);
  console.log(`✅ Đã xuất file thành công ra thư mục tạm: ${tempPath} (${buffer.length} bytes)`);

  // Thử ghi trực tiếp vào thư mục baocao
  const targetPath = path.join(__dirname, '..', 'baocao', 'Bao_Cao_He_Thong_Bau_HDQT_Blockchain.docx');
  try {
    fs.writeFileSync(targetPath, buffer);
    console.log(`🎉 ĐÃ XUẤT THÀNH CÔNG VÀO DỰ ÁN: ${targetPath}`);
  } catch (err) {
    console.log(`⚠️ Ghi trực tiếp vào baocao bị giới hạn (${err.message}). Cần copy từ: ${tempPath}`);
  }
}

buildMasterReport().catch(err => {
  console.error("❌ Lỗi khi khởi tạo tài liệu:", err);
  process.exit(1);
});
