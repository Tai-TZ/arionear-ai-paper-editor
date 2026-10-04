import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSmoothStream, revealStep } from "./smooth-stream";

describe("revealStep", () => {
  it("keeps the gentle typewriter steps for short backlogs", () => {
    expect(revealStep(1)).toBe(1);
    expect(revealStep(16)).toBe(1);
    expect(revealStep(17)).toBe(2);
    expect(revealStep(60)).toBe(2);
    expect(revealStep(61)).toBe(3);
    expect(revealStep(160)).toBe(3);
    expect(revealStep(161)).toBe(6);
  });

  it("scales with the backlog instead of capping at 5 chars per frame", () => {
    expect(revealStep(320)).toBe(10);
    expect(revealStep(3200)).toBe(100);
  });

  it("never shrinks as the backlog grows", () => {
    let previous = 0;
    for (let backlog = 1; backlog <= 10_000; backlog += 1) {
      const step = revealStep(backlog);
      expect(step).toBeGreaterThanOrEqual(previous);
      expect(step).toBeLessThanOrEqual(backlog);
      previous = step;
    }
  });
});

describe("createSmoothStream", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;

  const runFrame = () => {
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback(performance.now());
  };

  beforeEach(() => {
    frames = new Map();
    nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reveals a short answer one character per frame", () => {
    const shown: string[] = [];
    const stream = createSmoothStream((text) => shown.push(text));
    stream.push("Hello");
    for (let i = 0; i < 10; i += 1) runFrame();
    expect(shown).toEqual(["H", "He", "Hel", "Hell", "Hello"]);
    expect(frames.size).toBe(0);
  });

  it("drains a large burst in a few seconds instead of tens of seconds", () => {
    let shown = "";
    const stream = createSmoothStream((text) => {
      shown = text;
    });
    const answer = "x".repeat(6000);
    stream.push(answer);
    let framesUsed = 0;
    while (shown.length < answer.length && framesUsed < 1000) {
      runFrame();
      framesUsed += 1;
    }
    expect(shown).toBe(answer);
    // The old fixed 5 chars/frame cap needed ~1200 frames (~20 s at 60 fps) for this burst; the
    // proportional step drains it in ~180 frames (~3 s), the last second being the gentle tail.
    expect(framesUsed).toBeLessThan(200);
  });

  it("flush shows everything immediately and stops the loop", () => {
    let shown = "";
    const stream = createSmoothStream((text) => {
      shown = text;
    });
    stream.push("partial answer");
    runFrame();
    stream.flush();
    expect(shown).toBe("partial answer");
    expect(frames.size).toBe(0);
  });

  it("dispose cancels the pending frame", () => {
    const onDisplay = vi.fn();
    const stream = createSmoothStream(onDisplay);
    stream.push("abc");
    stream.dispose();
    runFrame();
    expect(onDisplay).not.toHaveBeenCalled();
  });
});
