import { describe, it, expect } from "vitest";
import { createJsonLogger, type LogSink } from "../lib/json-logger.js";

function makeSink(): { sink: LogSink; lines: { out: string[]; err: string[] } } {
  const out: string[] = [];
  const err: string[] = [];
  const sink: LogSink = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { sink, lines: { out, err } };
}

describe("createJsonLogger", () => {
  it("emits info to out sink", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({ app: "test" }, sink);
    log.info("hello");
    expect(lines.out).toHaveLength(1);
    expect(lines.err).toHaveLength(0);
    const record = JSON.parse(lines.out[0]!);
    expect(record.level).toBe("info");
    expect(record.msg).toBe("hello");
    expect(record.app).toBe("test");
    expect(record.ts).toBeDefined();
  });

  it("emits error to err sink", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({ app: "test" }, sink);
    log.error("boom");
    expect(lines.err).toHaveLength(1);
    expect(lines.out).toHaveLength(0);
    const record = JSON.parse(lines.err[0]!);
    expect(record.level).toBe("error");
  });

  it("emits warn and debug to out sink", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.warn("warning");
    log.debug("debug-msg");
    expect(lines.out).toHaveLength(2);
    expect(JSON.parse(lines.out[0]!).level).toBe("warn");
    expect(JSON.parse(lines.out[1]!).level).toBe("debug");
  });

  it("supports 2-arg form (gogolId, msg)", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.info("gogol-x", "doing work");
    const record = JSON.parse(lines.out[0]!);
    expect(record.gogol).toBe("gogol-x");
    expect(record.msg).toBe("doing work");
  });

  it("supports 3-arg form (gogolId, msg, ctx)", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.info("gogol-x", "loaded", { count: 42 });
    const record = JSON.parse(lines.out[0]!);
    expect(record.gogol).toBe("gogol-x");
    expect(record.msg).toBe("loaded");
    expect(record.count).toBe(42);
  });

  it("supports 2-arg form (msg, ctx)", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.info("loaded", { count: 42 });
    const record = JSON.parse(lines.out[0]!);
    expect(record.msg).toBe("loaded");
    expect(record.count).toBe(42);
    expect(record.gogol).toBeUndefined();
  });

  it("withContext merges and returns new logger", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({ app: "a", pipeline: "p" }, sink);
    const glog = log.withContext({ gogol: "g1" });
    glog.info("msg");
    const record = JSON.parse(lines.out[0]!);
    expect(record.app).toBe("a");
    expect(record.pipeline).toBe("p");
    expect(record.gogol).toBe("g1");
  });

  it("withContext does not mutate original logger", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({ app: "a" }, sink);
    const glog = log.withContext({ gogol: "g1" });
    log.info("orig");
    glog.info("child");
    const r1 = JSON.parse(lines.out[0]!);
    const r2 = JSON.parse(lines.out[1]!);
    expect(r1.gogol).toBeUndefined();
    expect(r2.gogol).toBe("g1");
  });

  it("serializes bigint as string", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.info("big", { value: 42n });
    const record = JSON.parse(lines.out[0]!);
    expect(record.value).toBe("42");
  });

  it("serializes Error objects", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    log.error("failed", { err: new Error("boom") });
    const record = JSON.parse(lines.err[0]!);
    expect(record.err.name).toBe("Error");
    expect(record.err.message).toBe("boom");
  });

  it("handles circular references without throwing", () => {
    const { sink, lines } = makeSink();
    const log = createJsonLogger({}, sink);
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    log.info("circular", { obj });
    expect(lines.out).toHaveLength(1);
    const record = JSON.parse(lines.out[0]!);
    expect(record.msg).toBe("circular");
  });
});
