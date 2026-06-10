import { describe, expect, it } from "vitest";
import { calculateWeightedScore, clampScore, SCORE_WEIGHTS } from "@/lib/scoring";

describe("scoring", () => {
  it("uses the clear-expression weighted rubric", () => {
    expect(SCORE_WEIGHTS).toEqual({
      brevity: 0.3,
      structure: 0.25,
      viewpoint: 0.2,
      density: 0.15,
      cameraPresence: 0.1
    });
  });

  it("calculates the weighted total score", () => {
    expect(
      calculateWeightedScore({
        brevity: 80,
        structure: 70,
        viewpoint: 90,
        density: 60,
        cameraPresence: 50
      })
    ).toBe(74);
  });

  it("clamps invalid or out-of-range scores", () => {
    expect(clampScore(120)).toBe(100);
    expect(clampScore(-12)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});
