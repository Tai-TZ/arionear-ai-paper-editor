import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiBase } from "@/lib/api/base-url";

describe("resolveApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses VITE_API_URL when it is set at build time", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/api/v1");
    expect(resolveApiBase()).toBe("https://api.example.com/api/v1");
  });

  it("uses the same-origin path in development (Vite proxy)", () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("DEV", true);
    vi.stubEnv("PROD", false);
    expect(resolveApiBase()).toBe("/api/v1");
  });

  it("falls back to the same-origin path, not localhost, in a production build", () => {
    vi.stubEnv("VITE_API_URL", undefined);
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    expect(resolveApiBase()).toBe("/api/v1");
  });

  it("ignores a blank VITE_API_URL", () => {
    vi.stubEnv("VITE_API_URL", "   ");
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    expect(resolveApiBase()).toBe("/api/v1");
  });
});
