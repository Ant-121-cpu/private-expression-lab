import { NextResponse } from "next/server";
import { convertAudioToWav, transcribeWithDoubao } from "@/lib/doubaoAsr";

export const runtime = "nodejs";

function extensionFromFile(file: File) {
  const nameMatch = file.name.match(/\.([a-z0-9]+)$/i);
  if (nameMatch) return nameMatch[1].toLowerCase();

  const mimeType = file.type;
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("aiff")) return "aiff";
  return "webm";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("audio");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请先录制一段音频。" }, { status: 400 });
  }

  try {
    const inputAudio = Buffer.from(await file.arrayBuffer());
    const wavAudio = await convertAudioToWav(inputAudio, extensionFromFile(file));
    const text = await transcribeWithDoubao(wavAudio);
    return NextResponse.json({ text });
  } catch (caught) {
    const rawMessage = caught instanceof Error ? caught.message : "语音转写失败。";
    const message = rawMessage.includes("requested resource not granted")
      ? "豆包语音资源未开通：当前凭据不能使用录音极速转写资源 volc.bigasr.auc_turbo。"
      : rawMessage;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
