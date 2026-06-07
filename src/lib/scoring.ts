import type { ScoreBreakdown } from "./types";

export const SCORE_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  brevity: 0.3,
  structure: 0.25,
  viewpoint: 0.2,
  density: 0.15,
  cameraPresence: 0.1
};

export const SCORE_LABELS: Record<keyof ScoreBreakdown, string> = {
  brevity: "简洁度",
  structure: "结构感",
  viewpoint: "观点清晰度",
  density: "信息密度",
  cameraPresence: "镜头感"
};

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateWeightedScore(breakdown: ScoreBreakdown) {
  const total = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + clampScore(breakdown[key as keyof ScoreBreakdown]) * weight;
  }, 0);

  return clampScore(total);
}
