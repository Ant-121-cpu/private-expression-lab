import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt, buildTopicPrompt } from "@/lib/prompts";

describe("prompts", () => {
  it("asks for JSON-only topic output", () => {
    const prompt = buildTopicPrompt([
      {
        id: 1,
        title: "AI 新闻",
        type: "news",
        content: "一个关于 AI 产品的观察。",
        createdAt: "2026-01-01"
      }
    ]);

    expect(prompt).toContain("只输出 JSON");
    expect(prompt).toContain("AI 新闻");
  });

  it("includes the weighted rubric and transcript in analysis prompts", () => {
    const prompt = buildAnalysisPrompt({
      roughDraft: "我主要想说主要以下几点。",
      practiceNote: "想练开场更短"
    });

    expect(prompt).toContain("简洁度 30%");
    expect(prompt).toContain("结构感 25%");
    expect(prompt).toContain("工作记忆负荷");
    expect(prompt).toContain("金字塔表达");
    expect(prompt).toContain("停顿容忍");
    expect(prompt).toContain("我主要想说主要以下几点");
  });
});
