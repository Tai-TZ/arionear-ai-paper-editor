import type { UiLanguage } from "@/lib/researcher-profile";

type CountMessage = (count: number) => string;

export type DocumentImportCopy = {
  menuItem: string;
  menuItemTitle: string;
  importing: string;
  importingDetailDocx: string;
  importingDetailPdf: string;
  warningsTitle: string;
  errors: {
    unsupported: string;
    legacyDoc: string;
    tooLarge: CountMessage;
    empty: string;
    contentMismatch: string;
    docxProtected: string;
    docxInvalid: string;
    pdfEncrypted: string;
    pdfInvalid: string;
    pdfNoText: string;
    conversionFailed: string;
    invalidResponse: string;
    generic: string;
  };
  warnings: {
    pdfTextOnly: string;
    pdfPagesTruncated: CountMessage;
    pdfNoHeadings: string;
    pdfUnmappedGlyphs: CountMessage;
    docxEquationsSkipped: CountMessage;
    docxFootnotesSkipped: CountMessage;
    docxImagesUnsupported: CountMessage;
    docxGraphicsSkipped: CountMessage;
    docxTableImagesSkipped: CountMessage;
    emptyDocument: string;
  };
};

const EN: DocumentImportCopy = {
  menuItem: "Word or PDF",
  menuItemTitle: "Convert a Word (.docx) or PDF file into a LaTeX project",
  importing: "Converting document…",
  importingDetailDocx: "Turning your Word document into LaTeX: headings, lists, tables and images.",
  importingDetailPdf: "Extracting text from your PDF. Images, tables and layout are not preserved.",
  warningsTitle: "Imported with notes — please review",
  errors: {
    unsupported: "Unsupported file. Choose a Word (.docx) or PDF (.pdf) file.",
    legacyDoc: "Legacy .doc files are not supported. Save the file as .docx in Word and try again.",
    tooLarge: (mb) => `File is too large. The limit is ${mb} MB.`,
    empty: "The file is empty.",
    contentMismatch:
      "The file content does not match its extension. Make sure it is a real .docx or .pdf file.",
    docxProtected:
      "This Word file is password-protected or in the old .doc format. Remove the password or save it as .docx.",
    docxInvalid: "The Word document could not be opened. It may be corrupt.",
    pdfEncrypted: "The PDF is password-protected. Remove the password and try again.",
    pdfInvalid: "The PDF could not be read. It may be corrupt.",
    pdfNoText: "No text found in this PDF. Scanned PDFs need OCR, which is not supported yet.",
    conversionFailed: "The document could not be converted.",
    invalidResponse: "The server returned an unexpected import result.",
    generic: "Document import failed.",
  },
  warnings: {
    pdfTextOnly: "PDF import is text-only: images, tables, equations and layout are not preserved.",
    pdfPagesTruncated: (pages) =>
      `Only the first pages were imported (the PDF has ${pages} pages).`,
    pdfNoHeadings: "No headings detected — the text was imported as plain paragraphs.",
    pdfUnmappedGlyphs: (count) => `${count} unreadable character(s) were removed.`,
    docxEquationsSkipped: (count) =>
      `${count} equation(s) could not be converted — search for “[equation omitted]”.`,
    docxFootnotesSkipped: (count) => `${count} footnote(s) were dropped.`,
    docxImagesUnsupported: (count) =>
      `${count} image(s) in unsupported formats (e.g. EMF/WMF) were skipped.`,
    docxGraphicsSkipped: (count) => `${count} chart(s), shape(s) or text box(es) were skipped.`,
    docxTableImagesSkipped: (count) => `${count} image(s) inside tables were skipped.`,
    emptyDocument: "No text content was found in the document.",
  },
};

const VI: DocumentImportCopy = {
  menuItem: "Word hoặc PDF",
  menuItemTitle: "Chuyển tệp Word (.docx) hoặc PDF thành dự án LaTeX",
  importing: "Đang chuyển đổi tài liệu…",
  importingDetailDocx:
    "Đang chuyển tài liệu Word sang LaTeX: tiêu đề, danh sách, bảng và hình ảnh.",
  importingDetailPdf:
    "Đang trích xuất văn bản từ PDF. Hình ảnh, bảng và bố cục sẽ không được giữ lại.",
  warningsTitle: "Đã nhập kèm lưu ý — hãy kiểm tra lại",
  errors: {
    unsupported: "Tệp không được hỗ trợ. Hãy chọn tệp Word (.docx) hoặc PDF (.pdf).",
    legacyDoc: "Không hỗ trợ định dạng .doc cũ. Hãy lưu lại thành .docx trong Word rồi thử lại.",
    tooLarge: (mb) => `Tệp quá lớn. Giới hạn là ${mb} MB.`,
    empty: "Tệp trống.",
    contentMismatch:
      "Nội dung tệp không khớp với phần mở rộng. Hãy chắc chắn đây là tệp .docx hoặc .pdf thật.",
    docxProtected:
      "Tệp Word này có mật khẩu hoặc ở định dạng .doc cũ. Hãy gỡ mật khẩu hoặc lưu thành .docx.",
    docxInvalid: "Không mở được tài liệu Word. Tệp có thể bị hỏng.",
    pdfEncrypted: "PDF được bảo vệ bằng mật khẩu. Hãy gỡ mật khẩu rồi thử lại.",
    pdfInvalid: "Không đọc được PDF. Tệp có thể bị hỏng.",
    pdfNoText:
      "Không tìm thấy văn bản trong PDF. PDF dạng ảnh quét cần OCR — hiện chưa được hỗ trợ.",
    conversionFailed: "Không thể chuyển đổi tài liệu.",
    invalidResponse: "Máy chủ trả về kết quả nhập không hợp lệ.",
    generic: "Nhập tài liệu thất bại.",
  },
  warnings: {
    pdfTextOnly:
      "Nhập PDF chỉ lấy văn bản: hình ảnh, bảng, công thức và bố cục không được giữ lại.",
    pdfPagesTruncated: (pages) => `Chỉ nhập những trang đầu (PDF có ${pages} trang).`,
    pdfNoHeadings: "Không phát hiện tiêu đề mục — văn bản được nhập thành các đoạn thường.",
    pdfUnmappedGlyphs: (count) => `Đã loại bỏ ${count} ký tự không đọc được.`,
    docxEquationsSkipped: (count) =>
      `${count} công thức không chuyển đổi được — hãy tìm “[equation omitted]”.`,
    docxFootnotesSkipped: (count) => `Đã bỏ qua ${count} chú thích cuối trang.`,
    docxImagesUnsupported: (count) =>
      `Đã bỏ qua ${count} hình ở định dạng không hỗ trợ (ví dụ EMF/WMF).`,
    docxGraphicsSkipped: (count) => `Đã bỏ qua ${count} biểu đồ, hình vẽ hoặc hộp văn bản.`,
    docxTableImagesSkipped: (count) => `Đã bỏ qua ${count} hình nằm trong bảng.`,
    emptyDocument: "Không tìm thấy nội dung văn bản trong tài liệu.",
  },
};

export function documentImportCopy(lang: UiLanguage): DocumentImportCopy {
  return lang === "vi" ? VI : EN;
}
