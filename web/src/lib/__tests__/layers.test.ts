import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER_STATE, toggleLayer } from "../layers";

describe("DEFAULT_LAYER_STATE", () => {
  it("starts with cone/models/windProb/graphs on, rain/radar off", () => {
    expect(DEFAULT_LAYER_STATE).toEqual({
      cone: true,
      models: true,
      windProb: true,
      rain: false,
      radar: false,
      graphs: true,
    });
  });
});

describe("toggleLayer", () => {
  it("flips exactly the named key", () => {
    const next = toggleLayer(DEFAULT_LAYER_STATE, "radar");
    expect(next.radar).toBe(true);
    expect(next).not.toBe(DEFAULT_LAYER_STATE); // new object, no mutation
  });

  it("toggleLayer('windProb') flips just that key", () => {
    const next = toggleLayer(DEFAULT_LAYER_STATE, "windProb");
    expect(next.windProb).toBe(false);
    expect(next.cone).toBe(DEFAULT_LAYER_STATE.cone);
  });

  it("does not mutate the input state", () => {
    const before = { ...DEFAULT_LAYER_STATE };
    toggleLayer(DEFAULT_LAYER_STATE, "models");
    expect(DEFAULT_LAYER_STATE).toEqual(before);
  });

  it("toggling twice returns to the original value", () => {
    const once = toggleLayer(DEFAULT_LAYER_STATE, "graphs");
    const twice = toggleLayer(once, "graphs");
    expect(twice.graphs).toBe(DEFAULT_LAYER_STATE.graphs);
  });
});
