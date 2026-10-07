import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import { refreshSession, signOut } from "@/lib/auth-store";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

const USER = { id: "u1", name: "Ada", email: "ada@example.com" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth session storage", () => {
  const fetchMock = vi.fn();
  let local: MemoryStorage;
  let session: MemoryStorage;

  beforeEach(() => {
    local = new MemoryStorage();
    session = new MemoryStorage();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    invalidateFetchKey("auth:me");
    local.setItem("edico-access-token", "token-abc");
    local.setItem("edico-session", JSON.stringify(USER));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["a server error", () => Promise.resolve(jsonResponse(503, { detail: "Database busy" }))],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("keeps the session after %s", async (_label, respond) => {
    fetchMock.mockImplementation(respond);

    await expect(refreshSession()).resolves.toBeNull();

    expect(local.getItem("edico-access-token")).toBe("token-abc");
    expect(local.getItem("edico-session")).toBe(JSON.stringify(USER));
  });

  it("clears the session when the server rejects the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Invalid or expired session." }));

    await expect(refreshSession()).resolves.toBeNull();

    expect(local.getItem("edico-access-token")).toBeNull();
    expect(local.getItem("edico-session")).toBeNull();
  });

  it("refreshes the cached user when the token is valid", async () => {
    const updated = { ...USER, name: "Ada Lovelace" };
    fetchMock.mockResolvedValue(jsonResponse(200, updated));

    await expect(refreshSession()).resolves.toEqual(updated);

    expect(JSON.parse(local.getItem("edico-session") ?? "null")).toEqual(updated);
  });

  it("signs out without wiping device preferences", () => {
    local.setItem("edico-locale", "vi");
    local.setItem("edico-theme", "dark");
    local.setItem("edico-researcher-profile", "{}");
    session.setItem("defense_session_p1", "{}");

    signOut();

    expect(local.getItem("edico-access-token")).toBeNull();
    expect(local.getItem("edico-session")).toBeNull();
    expect(local.getItem("edico-researcher-profile")).toBeNull();
    expect(session.length).toBe(0);
    expect(local.getItem("edico-locale")).toBe("vi");
    expect(local.getItem("edico-theme")).toBe("dark");
  });
});
