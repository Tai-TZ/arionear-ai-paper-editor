import { createParser } from "eventsource-parser";

/** One dispatched SSE event: `event` defaults to `"message"` when the block has no `event:` line. */
export type SseEventHandler = (event: string, data: string) => void;

export type SseStreamParser = {
  /** Feed the next slice of the response text; it may end anywhere (mid-line, mid-CRLF). */
  feed: (chunk: string) => void;
  /** Call once when the stream ends: dispatches a last event the server did not close with a blank line. */
  flush: () => void;
};

/**
 * Incremental Server-Sent Events parser for the chat and defense streams (XHR `onprogress` slices
 * or fetch reader chunks). Spec parsing comes from `eventsource-parser`: `\n` / `\r` / `\r\n` line
 * endings, multi-line `data:` joined with `\n`, `:` comment lines (the server's padding and
 * keepalives) and unknown fields are skipped. Events without `data:` lines are not dispatched.
 */
export function createSseStreamParser(onEvent: SseEventHandler): SseStreamParser {
  const parser = createParser({
    onEvent: (message) => onEvent(message.event ?? "message", message.data),
  });
  return {
    feed: (chunk) => parser.feed(chunk),
    // A blank line terminates whatever is pending (a partial last line included), so an event the
    // server ended without "\n\n" is still delivered — as the previous hand-written parser did.
    flush: () => parser.feed("\n\n"),
  };
}
