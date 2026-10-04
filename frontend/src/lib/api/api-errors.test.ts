import { afterEach, describe, expect, it, vi } from "vitest";
import { networkErrorMsg, unreachableServerMessage } from "@/lib/api/api-errors";

describe("unreachableServerMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows only the localized network message in production builds", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    expect(unreachableServerMessage("run uvicorn on port 8000", "vi")).toBe(networkErrorMsg("vi"));
    expect(unreachableServerMessage("run uvicorn on port 8000", "en")).toBe(networkErrorMsg("en"));
  });

  it("appends the developer hint in development builds", () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("PROD", false);
    const message = unreachableServerMessage("run uvicorn on port 8000", "en");
    expect(message.startsWith(networkErrorMsg("en"))).toBe(true);
    expect(message).toContain("run uvicorn on port 8000");
  });
});
