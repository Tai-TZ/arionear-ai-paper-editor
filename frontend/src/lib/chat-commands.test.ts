import { describe, expect, it } from "vitest";

import { inferManuscriptEditTask, parseChatSlashCommand } from "@/lib/chat-commands";

describe("parseChatSlashCommand", () => {
  it("uses custom text after /edit instead of the default placeholder", () => {
    const custom = "Đề xuất sửa mục bibliography cho \\cite{r4} — bổ sung metadata/DOI nếu thiếu";
    const parsed = parseChatSlashCommand(`/edit ${custom}`, "vi");
    expect(parsed.task).toBe("edit");
    expect(parsed.message).toBe(custom);
    expect(parsed.message).not.toContain("Bạn muốn sửa phần nào");
  });

  it("infers edit task for natural-language shorten requests", () => {
    expect(
      inferManuscriptEditTask("giúp tôi rút gọn phần introduction nhé, trông nó khá dài"),
    ).toBe("edit");
    expect(inferManuscriptEditTask("help me shorten the introduction")).toBe("edit");
    expect(inferManuscriptEditTask("introduction là gì?")).toBeNull();
    expect(inferManuscriptEditTask("chào bạn")).toBeNull();
  });

  it("parses /logic full as full-manuscript scope", () => {
    const parsed = parseChatSlashCommand("/logic full", "vi");
    expect(parsed.task).toBe("logic");
    expect(parsed.logicAuditScope).toBe("full");
  });

  it("falls back to default when slash command has no trailing text", () => {
    const parsed = parseChatSlashCommand("/edit", "vi");
    expect(parsed.task).toBe("edit");
    expect(parsed.message).toBe("Bạn muốn sửa phần nào? (abstract, introduction, tiêu đề, …)");
  });
});
