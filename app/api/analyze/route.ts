import { NextResponse } from "next/server";
import { saveAnalysisSession } from "@/lib/db";
import { analyzeExpression } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    roughDraft?: string;
    selfNote?: string;
  };

  const roughDraft = body.roughDraft?.trim();

  if (!roughDraft) {
    return NextResponse.json({ error: "表达粗稿不能为空。" }, { status: 400 });
  }

  const analysis = await analyzeExpression({ roughDraft, practiceNote: body.selfNote?.trim() });
  const sessionId = saveAnalysisSession({
    topic: analysis.title || "视频日记练习",
    transcript: roughDraft,
    materialIds: [],
    selfNote: body.selfNote?.trim(),
    analysis
  });

  return NextResponse.json({ sessionId, analysis });
}
