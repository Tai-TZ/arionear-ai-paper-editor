import { afterEach, describe, expect, it, vi } from "vitest";
import { createSseStreamParser } from "@/lib/api/sse";
import { streamChat } from "@/lib/api/academic";
import { streamDefense } from "@/lib/api/defense-api";

vi.mock("@/lib/auth-store", () => ({
  getAccessToken: () => "test-token",
  logoutUser: vi.fn(),
}));

type Dispatched = { event: string; data: string };

/** Feed `chunks` in order, flush, and return every dispatched event. */
function parseChunks(chunks: string[]): Dispatched[] {
  const events: Dispatched[] = [];
  const parser = createSseStreamParser((event, data) => events.push({ event, data }));
  for (const chunk of chunks) parser.feed(chunk);
  parser.flush();
  return events;
}

/** Every way of cutting `text` into two pieces, plus one-character-at-a-time. */
function splits(text: string): string[][] {
  const out: string[][] = [[...text]];
  for (let i = 1; i < text.length; i++) out.push([text.slice(0, i), text.slice(i)]);
  return out;
}

/** Mirrors `src/services/sse.py`: one ~2 KB padding comment before the first event. */
const SSE_FLUSH_PAD = `: ${" ".repeat(2048)}\n\n`;

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("createSseStreamParser", () => {
  it("dispatches the same events wherever the chunk boundaries fall (LF and CRLF)", () => {
    const lf = 'event: token\ndata: {"delta":"Hel"}\n\nevent: token\ndata: {"delta":"lo"}\n\n';
    const crlf = lf.replace(/\n/g, "\r\n");
    const expected = [
      { event: "token", data: '{"delta":"Hel"}' },
      { event: "token", data: '{"delta":"lo"}' },
    ];
    for (const stream of [lf, crlf]) {
      for (const chunks of splits(stream)) {
        expect(parseChunks(chunks)).toEqual(expected);
      }
    }
  });

  it("does not treat a CRLF split across chunks as a blank line", () => {
    const events = parseChunks(['data: {"a":1}\r', '\ndata: {"b":2}\r\n', "\r\n"]);
    expect(events).toEqual([{ event: "message", data: '{"a":1}\n{"b":2}' }]);
  });

  it("joins multi-line data with a newline", () => {
    expect(parseChunks(["event: done\ndata: line one\ndata: line two\ndata:\n\n"])).toEqual([
      { event: "done", data: "line one\nline two\n" },
    ]);
  });

  it("defaults the event name to message", () => {
    expect(parseChunks(['data: {"delta":"x"}\n\n'])).toEqual([
      { event: "message", data: '{"delta":"x"}' },
    ]);
  });

  it("ignores the padding comment and keepalive comments", () => {
    const stream =
      SSE_FLUSH_PAD +
      sseEvent("token", { delta: "a" }) +
      ": keepalive\n\n" +
      ":no-space comment\n" +
      sseEvent("token", { delta: "b" });
    // Cut inside the padding, inside a comment and inside a data line.
    const chunks = [stream.slice(0, 700), stream.slice(700, 2070), stream.slice(2070)];
    expect(parseChunks(chunks)).toEqual([
      { event: "token", data: '{"delta":"a"}' },
      { event: "token", data: '{"delta":"b"}' },
    ]);
  });

  it("delivers a last event that has no trailing blank line once flushed", () => {
    for (const tail of [
      'event: done\ndata: {"response":"ok"}',
      'event: done\ndata: {"response":"ok"}\n',
    ]) {
      const events: Dispatched[] = [];
      const parser = createSseStreamParser((event, data) => events.push({ event, data }));
      parser.feed(sseEvent("token", { delta: "a" }) + tail);
      expect(events).toHaveLength(1);
      parser.flush();
      expect(events).toEqual([
        { event: "token", data: '{"delta":"a"}' },
        { event: "done", data: '{"response":"ok"}' },
      ]);
    }
  });

  it("skips unknown fields, id/retry lines and events without data", () => {
    const stream =
      "foo: bar\nid: 7\nretry: 1000\nevent: token\nnot-a-field\ndata: {}\n\n" +
      "event: ping\n\n" +
      "event: activity\ndata: {}\n\n";
    expect(parseChunks([stream])).toEqual([
      { event: "token", data: "{}" },
      { event: "activity", data: "{}" },
    ]);
  });

  it("flush on an already-terminated stream dispatches nothing more", () => {
    expect(parseChunks([sseEvent("done", { response: "" })])).toHaveLength(1);
  });
});

/**
 * A fetch Response whose body yields `text` as UTF-8 in `byteSize`-byte reads (node has no
 * XMLHttpRequest, so the clients take their fetch path), splitting lines and multi-byte characters.
 */
function streamResponse(text: string, byteSize: number): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += byteSize) {
        controller.enqueue(bytes.slice(i, i + byteSize));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** Cut `text` into `size`-character pieces, like the server's `chunk_text`. */
function chunked(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

describe("stream clients over the shared parser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streamChat reassembles 48-char token events behind the padding comment", async () => {
    const reply = "Kết quả: mô hình đạt F1 = 0.91 trên tập kiểm thử, cao hơn baseline 4 điểm.";
    const pieces = chunked(reply, 48);
    const stream =
      SSE_FLUSH_PAD +
      sseEvent("state", { step_id: "draft", status: "active", label: "Drafting" }) +
      pieces.map((delta) => sseEvent("token", { delta })).join("") +
      sseEvent("done", { response: reply });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(stream, 37)),
    );

    const tokens: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    const onState = vi.fn();
    await streamChat(
      "hi",
      { sessionId: "s1", latexContent: "" },
      { onActivity: vi.fn(), onState, onToken: (d) => tokens.push(d), onDone, onError },
    );

    expect(tokens.join("")).toBe(reply);
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ step_id: "draft" }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ response: reply }));
    expect(onError).not.toHaveBeenCalled();
  });

  it("streamChat reports an interrupted stream when no done/error event arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(SSE_FLUSH_PAD + sseEvent("token", { delta: "x" }), 512)),
    );
    const onError = vi.fn();
    await streamChat(
      "hi",
      { sessionId: "s1", latexContent: "" },
      { onActivity: vi.fn(), onToken: vi.fn(), onDone: vi.fn(), onError },
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("streamDefense infers event types for unnamed events and handles a done without blank line", async () => {
    const stream =
      SSE_FLUSH_PAD +
      'data: {"text":"Reading the paper"}\r\n\r\n' +
      'data: {"delta":"Why "}\r\n\r\n' +
      sseEvent("token", { delta: "this method?" }) +
      'event: done\ndata: {"response":"Why this method?"}';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(stream, 5)),
    );

    const onActivity = vi.fn();
    const tokens: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    await streamDefense(
      { latex_content: "", conversation_history: [], mode: "proactive" },
      { onActivity, onToken: (d) => tokens.push(d), onDone, onError },
    );

    expect(onActivity).toHaveBeenCalledWith("Reading the paper");
    expect(tokens.join("")).toBe("Why this method?");
    expect(onDone).toHaveBeenCalledWith("Why this method?");
    expect(onError).not.toHaveBeenCalled();
  });

  it("streamChat over XHR feeds only the new slice of responseText on each progress event", async () => {
    const stream =
      SSE_FLUSH_PAD +
      sseEvent("token", { delta: "Hello, " }) +
      sseEvent("token", { delta: "world" }) +
      'event: done\ndata: {"response":"Hello, world"}';

    /** Grows `responseText` in 9-character steps, firing `onprogress` each time, then `onload`. */
    class FakeXhr {
      static readonly HEADERS_RECEIVED = 2;
      readyState = 0;
      status = 200;
      statusText = "OK";
      responseText = "";
      onreadystatechange: (() => void) | null = null;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() {}
      send() {
        queueMicrotask(() => {
          this.readyState = FakeXhr.HEADERS_RECEIVED;
          this.onreadystatechange?.();
          for (let i = 9; i < stream.length + 9; i += 9) {
            this.responseText = stream.slice(0, i);
            this.onprogress?.();
          }
          this.onload?.();
        });
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const tokens: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    await streamChat(
      "hi",
      { sessionId: "s1", latexContent: "" },
      { onActivity: vi.fn(), onToken: (d) => tokens.push(d), onDone, onError },
    );

    expect(tokens).toEqual(["Hello, ", "world"]);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ response: "Hello, world" }));
    expect(onError).not.toHaveBeenCalled();
  });
});
