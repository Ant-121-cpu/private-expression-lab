import { calculateWeightedScore } from "./scoring";
import { buildAnalysisPrompt, buildTopicPrompt } from "./prompts";
import { mockAnalysis, mockTopic } from "./mock";
import type { AnalysisResult, Material, ScoreBreakdown } from "./types";

type DeepSeekMessage = {
  role: "system" | "user";
  content: string;
};

const defaultBaseUrl = "https://api.deepseek.com";

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response did not contain JSON.");
  return match[0];
}

async function callDeepSeek(messages: DeepSeekMessage[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.DEEPSEEK_BASE_URL || defaultBaseUrl;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content || "";
}

function normalizeAnalysis(raw: AnalysisResult): AnalysisResult {
  const normalizeScore = (value: number) => {
    const numeric = Number(value || 0);
    if (numeric > 0 && numeric <= 10) return numeric * 10;
    return numeric;
  };

  const breakdown: ScoreBreakdown = {
    brevity: normalizeScore(raw.score?.breakdown?.brevity || 0),
    structure: normalizeScore(raw.score?.breakdown?.structure || 0),
    viewpoint: normalizeScore(raw.score?.breakdown?.viewpoint || 0),
    density: normalizeScore(raw.score?.breakdown?.density || 0),
    cameraPresence: normalizeScore(raw.score?.breakdown?.cameraPresence || 0)
  };

  return {
    title: String(raw.title || ""),
    coreMessage: String(raw.coreMessage || ""),
    draftDiagnosis: {
      logicSummary: String(raw.draftDiagnosis?.logicSummary || ""),
      currentStructure: Array.isArray(raw.draftDiagnosis?.currentStructure)
        ? raw.draftDiagnosis.currentStructure.map(String)
        : [],
      mainProblems: Array.isArray(raw.draftDiagnosis?.mainProblems) ? raw.draftDiagnosis.mainProblems : [],
      redundantExpressions: Array.isArray(raw.draftDiagnosis?.redundantExpressions)
        ? raw.draftDiagnosis.redundantExpressions
        : []
    },
    score: {
      total: calculateWeightedScore(breakdown),
      breakdown,
      comment: String(raw.score?.comment || "")
    },
    rewriteStrategy: {
      before: String(raw.rewriteStrategy?.before || ""),
      after: String(raw.rewriteStrategy?.after || ""),
      oneThingToPractice: String(raw.rewriteStrategy?.oneThingToPractice || "")
    },
    videoDiaryScript: {
      openingHook: String(raw.videoDiaryScript?.openingHook || ""),
      coreStatement: String(raw.videoDiaryScript?.coreStatement || ""),
      partOne: String(raw.videoDiaryScript?.partOne || ""),
      partTwo: String(raw.videoDiaryScript?.partTwo || ""),
      partThree: String(raw.videoDiaryScript?.partThree || ""),
      personalReflection: String(raw.videoDiaryScript?.personalReflection || ""),
      closing: String(raw.videoDiaryScript?.closing || "")
    },
    teleprompterVersion: String(raw.teleprompterVersion || ""),
    practiceAdvice: Array.isArray(raw.practiceAdvice) ? raw.practiceAdvice.map(String) : []
  };
}

export async function generateTopic(materials: Material[]) {
  const content = await callDeepSeek([
    { role: "system", content: "你是中文表达训练教练，只输出 JSON。" },
    { role: "user", content: buildTopicPrompt(materials) }
  ]);

  if (!content) return mockTopic(materials);
  return JSON.parse(extractJson(content)) as ReturnType<typeof mockTopic>;
}

export async function analyzeExpression(input: {
  roughDraft: string;
  practiceNote?: string;
}) {
  const content = await callDeepSeek([
    { role: "system", content: "你是中文表达训练教练，只输出 JSON。" },
    { role: "user", content: buildAnalysisPrompt(input) }
  ]);

  if (!content) return mockAnalysis(input.roughDraft);
  return normalizeAnalysis(JSON.parse(extractJson(content)) as AnalysisResult);
}
