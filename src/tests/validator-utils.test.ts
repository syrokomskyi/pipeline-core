import { describe, it, expect } from "vitest";
import { composeValidators, type AsyncValidator } from "../lib/validator-utils.js";

describe("composeValidators", () => {
  it("runs all validators in order", async () => {
    const calls: number[] = [];
    const v1: AsyncValidator<number> = async (n) => {
      calls.push(n);
    };
    const v2: AsyncValidator<number> = async (n) => {
      calls.push(n * 10);
    };
    const composed = composeValidators(v1, v2);
    await composed(5);
    expect(calls).toEqual([5, 50]);
  });

  it("returns void on success", async () => {
    const composed = composeValidators(
      async () => {},
      async () => {},
    );
    await expect(composed({})).resolves.toBeUndefined();
  });

  it("propagates first error and stops", async () => {
    const calls: string[] = [];
    const v1: AsyncValidator<unknown> = async () => {
      calls.push("v1");
      throw new Error("fail in v1");
    };
    const v2: AsyncValidator<unknown> = async () => {
      calls.push("v2");
    };
    const composed = composeValidators(v1, v2);
    await expect(composed({})).rejects.toThrow("fail in v1");
    expect(calls).toEqual(["v1"]);
  });

  it("handles zero validators", async () => {
    const composed = composeValidators();
    await expect(composed({})).resolves.toBeUndefined();
  });

  it("passes options through to validators", async () => {
    const received: unknown[] = [];
    const v: AsyncValidator<{ x: number }> = async (opts) => {
      received.push(opts);
    };
    const composed = composeValidators(v, v);
    await composed({ x: 42 });
    expect(received).toEqual([{ x: 42 }, { x: 42 }]);
  });
});
