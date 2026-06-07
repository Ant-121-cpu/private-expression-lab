import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { calculateWeightedScore } from "@/lib/scoring";
import { createMaterial, getHistory, listMaterials, resetDbForTests, saveAnalysisSession } from "@/lib/db";
import type { AnalysisResult } from "@/lib/types";

beforeEach(() => {
  resetDbForTests();
  process.env.EXPRESSION_DB_PATH = path.join(os.tmpdir(), `expression-coach-${crypto.randomUUID()}.sqlite`);
});

describe("db", () => {
  it("persists materials and analysis sessions", () => {
    createMaterial({
      title: "一次观察",
      type: "idea",
      content: "我发现自己经常用主要这个词。"
    });

    const materials = listMaterials();
    expect(materials).toHaveLength(1);

    const breakdown = {
      brevity: 70,
      structure: 80,
      viewpoint: 75,
      density: 72,
      cameraPresence: 68
    };
    const analysis: AnalysisResult = {
      title: "如何减少主要",
      coreMessage: "先说结论能减少填充词。",
      draftDiagnosis: {
        logicSummary: "观点出现偏晚。",
        currentStructure: ["铺垫", "问题", "目标"],
        mainProblems: [
          {
            problem: "核心判断晚",
            evidence: "先说主要以下几点",
            reason: "边想边说",
            mechanism: "工作记忆负荷",
            fix: "第一句说结论"
          }
        ],
        redundantExpressions: [
          {
            text: "主要",
            type: "口头填充词",
            impact: "推迟观点",
            mechanism: "停顿容忍不足",
            suggestedReplacement: "停顿后直接说判断"
          }
        ]
      },
      score: {
        total: calculateWeightedScore(breakdown),
        breakdown,
        comment: "继续练习简洁。"
      },
      rewriteStrategy: {
        before: "铺垫多。",
        after: "先结论后支撑。",
        oneThingToPractice: "第一句话说核心观点。"
      },
      videoDiaryScript: {
        openingHook: "今天聊一个表达习惯。",
        coreStatement: "我要少说主要。",
        partOne: "先说触发点。",
        partTwo: "再说观察。",
        partThree: "最后说行动。",
        personalReflection: "我需要允许停顿。",
        closing: "下次先说结论。"
      },
      teleprompterVersion: "今天聊一个表达习惯。我要少说主要。",
      practiceAdvice: ["先写观点句"]
    };

    saveAnalysisSession({
      topic: "如何减少主要",
      transcript: "主要我想说，主要以下几点。",
      materialIds: [materials[0].id],
      analysis
    });

    const history = getHistory();
    expect(history.sessions).toHaveLength(1);
    expect(history.topRedundantWords[0]).toEqual({ word: "主要", count: 1 });
    expect(history.averageScore).toBe(74);
  });
});
