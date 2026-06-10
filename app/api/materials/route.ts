import { NextResponse } from "next/server";
import { createMaterial, listMaterials } from "@/lib/db";
import type { MaterialType } from "@/lib/types";

export const runtime = "nodejs";

const materialTypes: MaterialType[] = ["news", "idea", "note"];

export async function GET() {
  return NextResponse.json({ materials: listMaterials() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    type?: MaterialType;
    content?: string;
    sourceUrl?: string;
  };

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: "标题和内容不能为空。" }, { status: 400 });
  }

  if (!body.type || !materialTypes.includes(body.type)) {
    return NextResponse.json({ error: "素材类型不合法。" }, { status: 400 });
  }

  createMaterial({
    title: body.title.trim(),
    type: body.type,
    content: body.content.trim(),
    sourceUrl: body.sourceUrl?.trim()
  });

  return NextResponse.json({ materials: listMaterials() }, { status: 201 });
}
