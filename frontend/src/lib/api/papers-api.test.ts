import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updatePaper } from "@/lib/api/papers-api";

// Hoisted above the imports by vitest.
vi.mock("@/lib/auth-store", () => ({
  getAccessToken: () => "test-token",
  logoutUser: vi.fn(),
}));

/** Debounce (400 ms) plus the three retry back-offs (400 + 800 + 1600 ms) of a failing save. */
const FAILED_SAVE_MS = 400 + 400 + 800 + 1600 + 100;

function paperResponse(id: string, body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      id,
      name: typeof body.name === "string" ? body.name : "Paper",
      latex: typeof body.latex === "string" ? body.latex : "",
      metadata: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number): Response {
  return new Response(JSON.stringify({ detail: "boom" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBodies(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

/** Track a promise's outcome without leaving a rejection unhandled. */
function settle<T>(promise: Promise<T>) {
  const state: { status: "pending" | "fulfilled" | "rejected"; value?: T; reason?: unknown } = {
    status: "pending",
  };
  promise.then(
    (value) => {
      state.status = "fulfilled";
      state.value = value;
    },
    (reason: unknown) => {
      state.status = "rejected";
      state.reason = reason;
    },
  );
  return state;
}

let seq = 0;
/** Each test uses its own paper id so the module-level queues never leak between tests. */
function nextId() {
  seq += 1;
  return `paper-${seq}`;
}

describe("updatePaper save queue", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces consecutive updates into one PATCH and resolves every caller", async () => {
    const id = nextId();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      paperResponse(id, JSON.parse(String(init.body))),
    );

    const first = settle(updatePaper(id, { name: "Draft" }));
    const second = settle(updatePaper(id, { latex: "\\section{A}" }));
    await vi.advanceTimersByTimeAsync(450);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBodies(fetchMock)[0]).toEqual({ name: "Draft", latex: "\\section{A}" });
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    expect(second.value?.latex).toBe("\\section{A}");
  });

  it("does not settle callers queued while a request is in flight with that request's result", async () => {
    const id = nextId();
    const release: Array<(res: Response) => void> = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => release.push(resolve)));

    const first = settle(updatePaper(id, { latex: "v1" }, { immediate: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = settle(updatePaper(id, { latex: "v2" }, { immediate: true }));
    release[0](paperResponse(id, { latex: "v1" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(first.status).toBe("fulfilled");
    expect(first.value?.latex).toBe("v1");
    // v2 was not part of the first request, so its caller waits for the follow-up request.
    expect(second.status).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBodies(fetchMock)[1]).toEqual({ latex: "v2" });

    release[1](paperResponse(id, { latex: "v2" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.status).toBe("fulfilled");
    expect(second.value?.latex).toBe("v2");
  });

  it("rejects only the callers of a failed follow-up, without unhandled rejections", async () => {
    const id = nextId();
    let releaseFirst: (res: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseFirst = resolve)))
      .mockImplementation(async () => errorResponse(503));

    const first = settle(updatePaper(id, { latex: "v1" }, { immediate: true }));
    await vi.advanceTimersByTimeAsync(0);
    const second = settle(updatePaper(id, { latex: "v2" }, { immediate: true }));

    releaseFirst(paperResponse(id, { latex: "v1" }));
    await vi.advanceTimersByTimeAsync(FAILED_SAVE_MS);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(second.reason).toBeInstanceOf(Error);
    // One successful request, then the follow-up plus its three retries.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("keeps a transiently failed patch and sends it with the next save", async () => {
    const id = nextId();
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    const failed = settle(updatePaper(id, { name: "Renamed", latex: "v1" }));
    await vi.advanceTimersByTimeAsync(FAILED_SAVE_MS);
    expect(failed.status).toBe("rejected");
    const attempts = fetchMock.mock.calls.length;

    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      paperResponse(id, JSON.parse(String(init.body))),
    );
    const next = settle(updatePaper(id, { latex: "v2" }));
    await vi.advanceTimersByTimeAsync(450);

    expect(fetchMock).toHaveBeenCalledTimes(attempts + 1);
    // The newer latex supersedes the failed one; the unsent rename is retried.
    expect(sentBodies(fetchMock).at(-1)).toEqual({ name: "Renamed", latex: "v2" });
    expect(next.status).toBe("fulfilled");
  });

  it("drops a patch the server rejected as invalid instead of resending it", async () => {
    const id = nextId();
    fetchMock.mockImplementation(async () => errorResponse(422));

    const failed = settle(updatePaper(id, { name: "x".repeat(500) }));
    await vi.advanceTimersByTimeAsync(FAILED_SAVE_MS);
    expect(failed.status).toBe("rejected");
    const attempts = fetchMock.mock.calls.length;

    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      paperResponse(id, JSON.parse(String(init.body))),
    );
    const next = settle(updatePaper(id, { latex: "v2" }));
    await vi.advanceTimersByTimeAsync(450);

    expect(sentBodies(fetchMock).slice(attempts)).toEqual([{ latex: "v2" }]);
    expect(next.status).toBe("fulfilled");
  });

  it("sends raw metadata and typed metadata fields together", async () => {
    const id = nextId();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      paperResponse(id, JSON.parse(String(init.body))),
    );

    const a = settle(updatePaper(id, { metadata: { defense_session: null } }));
    const b = settle(updatePaper(id, { compiler: "xelatex" }));
    await vi.advanceTimersByTimeAsync(450);

    expect(sentBodies(fetchMock)).toEqual([
      { metadata: { defense_session: null, compiler: "xelatex" } },
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
  });
});
