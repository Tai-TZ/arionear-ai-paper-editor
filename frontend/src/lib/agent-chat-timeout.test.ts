import { describe, expect, it } from "vitest";

import { agentChatStreamTimeoutMs } from "./agent-chat-timeout";

describe("agentChatStreamTimeoutMs", () => {
  it("gives edit tasks more time than chat", () => {
    expect(agentChatStreamTimeoutMs("edit", undefined)).toBeGreaterThan(
      agentChatStreamTimeoutMs("chat", undefined),
    );
  });

  it("adds client buffer over backend base", () => {
    expect(agentChatStreamTimeoutMs("edit", undefined)).toBe(135_000);
  });
});
