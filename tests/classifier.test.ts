import { describe, expect, it } from "vitest";
import { classifyMotion, summarizeMotion } from "../src/classifier";
import type { MotionSample } from "../src/types";

function samples(
  count: number,
  x: number,
  y: number,
  z: number
): MotionSample[] {
  return Array.from({ length: count }, (_, i) => ({
    x,
    y,
    z,
    timestamp: i * 100
  }));
}

describe("summarizeMotion", () => {
  it("removes constant gravity from acceleration variation", () => {
    const result = summarizeMotion(samples(10, 0, 0, 1), samples(10, 0, 0, 0));

    expect(result.accelerometerRms).toBeCloseTo(0);
    expect(result.gyroscopeRms).toBeCloseTo(0);
  });

  it("detects changing acceleration", () => {
    const acceleration = Array.from({ length: 10 }, (_, i) => ({
      x: i % 2 === 0 ? -0.2 : 0.2,
      y: 0,
      z: 1,
      timestamp: i * 100
    }));

    const result = summarizeMotion(acceleration, samples(10, 0, 0, 0));

    expect(result.accelerometerRms).toBeGreaterThan(0.035);
  });
});

describe("classifyMotion", () => {
  it("returns inconclusive for too few samples", () => {
    const result = classifyMotion({
      accelerometerRms: 0.2,
      gyroscopeRms: 0.3,
      samples: 2
    });

    expect(result.status).toBe("inconclusive");
    expect(result.verified).toBe(false);
  });

  it("recognizes motion above the heuristic threshold", () => {
    const result = classifyMotion({
      accelerometerRms: 0.08,
      gyroscopeRms: 0.01,
      samples: 10
    });

    expect(result.status).toBe("likely_handled");
    expect(result.verified).toBe(true);
  });

  it("does not reject a stationary phone as definitely not held", () => {
    const result = classifyMotion({
      accelerometerRms: 0.001,
      gyroscopeRms: 0.001,
      samples: 10
    });

    expect(result.status).toBe("inconclusive");
    expect(result.verified).toBe(false);
  });
});
