import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type DoubaoResponse = {
  code?: number;
  message?: string;
  text?: string;
  result?: {
    text?: string;
    utterances?: Array<{ text?: string }>;
  };
  utterances?: Array<{ text?: string }>;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function extractText(json: DoubaoResponse) {
  const text =
    json.result?.text ||
    json.text ||
    json.result?.utterances?.map((item) => item.text).filter(Boolean).join("") ||
    json.utterances?.map((item) => item.text).filter(Boolean).join("");

  if (!text) {
    throw new Error(`Doubao ASR returned no text: ${JSON.stringify(json).slice(0, 500)}`);
  }

  return text;
}

export async function convertAudioToWav(input: Buffer, extension = "webm") {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "expression-asr-"));
  const inputPath = path.join(tmpDir, `input.${extension}`);
  const outputPath = path.join(tmpDir, "output.wav");
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

  try {
    await fs.writeFile(inputPath, input);
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-acodec",
      "pcm_s16le",
      outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function transcribeWithDoubao(wavAudio: Buffer) {
  const appId = requireEnv("DOUBAO_ASR_APP_ID");
  const accessKey = requireEnv("DOUBAO_ASR_ACCESS_KEY");
  const resourceId = process.env.DOUBAO_ASR_RESOURCE_ID || "volc.bigasr.auc_turbo";
  const endpoint =
    process.env.DOUBAO_ASR_ENDPOINT || "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Key": appId,
      "X-Api-Access-Key": accessKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": randomUUID(),
      "X-Api-Sequence": "-1"
    },
    body: JSON.stringify({
      user: {
        uid: appId
      },
      audio: {
        data: wavAudio.toString("base64"),
        format: "wav",
        codec: "raw",
        rate: 16000,
        bits: 16,
        channel: 1
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        enable_ddc: true
      }
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Doubao ASR failed: ${response.status} ${body}`);
  }

  const json = JSON.parse(body) as DoubaoResponse;
  if (json.code && json.code !== 1000) {
    throw new Error(`Doubao ASR failed: ${json.code} ${json.message || body}`);
  }

  return extractText(json);
}
