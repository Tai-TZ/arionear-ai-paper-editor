import { describe, expect, it } from "vitest";
import { PdfLinkService } from "@/lib/pdf-link-service";
import { safeExternalPdfUrl } from "@/lib/pdf-safe-url";

describe("safeExternalPdfUrl", () => {
  it.each([
    ["https://arxiv.org/abs/1706.03762", "https://arxiv.org/abs/1706.03762"],
    ["http://example.org", "http://example.org/"],
    ["  HTTPS://Example.org/path?q=1  ", "https://example.org/path?q=1"],
    ["mailto:author@uni.edu", "mailto:author@uni.edu"],
  ])("allows %s", (input, expected) => {
    expect(safeExternalPdfUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(document.cookie)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.org/uuid",
    "ftp://example.org/file",
    "relative/path.html",
    "//evil.example/x",
    "",
    "   ",
  ])("blocks %j", (input) => {
    expect(safeExternalPdfUrl(input)).toBeNull();
  });
});

type FakeAnchor = {
  href: string;
  title: string;
  target: string;
  rel: string;
  onclick: (() => boolean) | null;
};

function fakeAnchor(): FakeAnchor {
  return { href: "", title: "", target: "", rel: "", onclick: null };
}

describe("PdfLinkService.addLinkAttributes", () => {
  const service = new PdfLinkService(() => {});

  it("keeps safe external links clickable", () => {
    const link = fakeAnchor();
    service.addLinkAttributes(link as unknown as HTMLAnchorElement, "https://doi.org/10.1/x", true);
    expect(link.href).toBe("https://doi.org/10.1/x");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("never turns a javascript: URL into an href", () => {
    const link = fakeAnchor();
    service.addLinkAttributes(link as unknown as HTMLAnchorElement, "javascript:alert(1)");
    expect(link.href).toBe("");
    expect(link.onclick?.()).toBe(false);
  });

  it("still routes internal destinations", () => {
    const link = fakeAnchor();
    service.addLinkAttributes(link as unknown as HTMLAnchorElement, "#cite.vaswani2017");
    expect(link.href).toBe("#");
    expect(link.title).toBe("cite.vaswani2017");
  });
});
