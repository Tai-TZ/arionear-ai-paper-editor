import { describe, expect, it } from "vitest";
import { SHARE_WS_SUBPROTOCOL, shareSocketProtocols } from "@/lib/use-yjs-share-sync";

describe("shareSocketProtocols", () => {
  it("offers the share subprotocol plus the bearer token", () => {
    expect(shareSocketProtocols("header.payload.sig")).toEqual([
      SHARE_WS_SUBPROTOCOL,
      "bearer.header.payload.sig",
    ]);
  });

  it("does not open a socket without an access token", () => {
    expect(shareSocketProtocols(null)).toBeNull();
    expect(shareSocketProtocols("")).toBeNull();
  });
});
