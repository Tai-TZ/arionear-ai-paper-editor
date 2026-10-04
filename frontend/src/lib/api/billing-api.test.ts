import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_DISABLED_CODE, createCheckout } from "@/lib/api/billing-api";

// Hoisted above the imports by vitest.
vi.mock("@/lib/auth-store", () => ({
  getAccessToken: () => "test-token",
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createCheckout", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the QR checkout on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        checkout_id: "abc",
        confirm_url: "http://localhost:8080/billing/confirm/abc",
        qr_png_b64: "iVBOR",
        expires_in_minutes: 15,
      }),
    );

    const result = await createCheckout();

    expect(result).toEqual({
      ok: true,
      checkoutId: "abc",
      confirmUrl: "http://localhost:8080/billing/confirm/abc",
      qrPngB64: "iVBOR",
      expiresInMinutes: 15,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("flags a disabled demo checkout (503) so the UI can explain it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, {
        detail: { code: CHECKOUT_DISABLED_CODE, message: "Online payment is not configured yet." },
      }),
    );

    const result = await createCheckout();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("checkout_disabled");
  });

  it("keeps other failures as plain errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { detail: "Your account is already on the Pro plan." }),
    );

    const result = await createCheckout();

    expect(result).toEqual({ ok: false, error: "Your account is already on the Pro plan." });
  });
});
