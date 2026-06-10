import { NextResponse } from "next/server";
import { getMaterialsByIds } from "@/lib/db";
import { generateTopic } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { materialIds?: number[] };
  const materialIds = Array.isArray(body.materialIds) ? body.materialIds.map(Number).filter(Boolean) : [];
  const materials = getMaterialsByIds(materialIds);
  const topic = await generateTopic(materials);

  return NextResponse.json(topic);
}
