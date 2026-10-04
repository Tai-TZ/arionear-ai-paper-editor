import { describe, expect, it } from "vitest";
import {
  isPersistableDefenseSession,
  mergeDefenseSessions,
  parseDefenseSession,
  stripDefenseMessagesForStorage,
  trimDefenseSessionForStorage,
} from "@/lib/defense-session-storage";

describe("defense-session-storage", () => {
  it("parses server metadata shape", () => {
    const parsed = parseDefenseSession({
      hasStarted: true,
      updatedAt: 100,
      messages: [
        { role: "assistant", content: "Question one?" },
        { role: "user", content: "Answer." },
      ],
    });
    expect(parsed?.messages).toHaveLength(2);
    expect(parsed?.hasStarted).toBe(true);
  });

  it("prefers newer session by updatedAt", () => {
    const server = {
      hasStarted: true,
      updatedAt: 200,
      messages: [{ role: "assistant" as const, content: "Server" }],
    };
    const local = {
      hasStarted: true,
      updatedAt: 100,
      messages: [{ role: "assistant" as const, content: "Local" }],
    };
    expect(mergeDefenseSessions(server, local)?.messages[0]?.content).toBe("Server");
    expect(mergeDefenseSessions(server, local)?.messages[0]?.content).toBe("Server");
    expect(mergeDefenseSessions({ ...local, updatedAt: 300 }, server)?.messages[0]?.content).toBe(
      "Local",
    );
  });

  it("strips streaming messages before persist", () => {
    const clean = stripDefenseMessagesForStorage([
      { role: "assistant", content: "Done", isStreaming: false },
      { role: "assistant", content: "", isStreaming: true },
    ]);
    expect(clean).toHaveLength(1);
  });

  it("detects persistable council turns", () => {
    expect(
      isPersistableDefenseSession({
        hasStarted: true,
        messages: [{ role: "assistant", content: "Q?", isStreaming: true }],
      }),
    ).toBe(false);
    expect(
      isPersistableDefenseSession({
        hasStarted: true,
        messages: [{ role: "assistant", content: "Q?" }],
      }),
    ).toBe(true);
  });

  it("trims long sessions for server persist", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
      content: `Turn ${i}`,
    }));
    const trimmed = trimDefenseSessionForStorage({ hasStarted: true, messages });
    expect(trimmed.messages).toHaveLength(48);
    expect(trimmed.messages[0]?.content).toBe("Turn 12");
  });
});

describe("defense conversation history", () => {
  it("excludes error turns from quota count and API history", async () => {
    const { countCompletedCouncilTurns, buildDefenseConversationHistory } =
      await import("@/lib/defense-conversation");
    const messages = [
      { role: "assistant" as const, content: "Q1?" },
      { role: "user" as const, content: "A1" },
      { role: "assistant" as const, content: "Network error", isError: true },
    ];
    expect(countCompletedCouncilTurns(messages)).toBe(1);
    expect(buildDefenseConversationHistory(messages)).toEqual([
      { role: "assistant", content: "Q1?" },
      { role: "user", content: "A1" },
    ]);
  });
});
