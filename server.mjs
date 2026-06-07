import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";
import next from "next";
import nextEnv from "@next/env";
import WebSocket, { WebSocketServer } from "ws";

const projectDir = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(projectDir);

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const MessageType = {
  fullClientRequest: 0b0001,
  audioOnlyClientRequest: 0b0010,
  fullServerResponse: 0b1001,
  error: 0b1111
};

const Flags = {
  noSequence: 0b0000,
  positiveSequence: 0b0001,
  lastNoSequence: 0b0010
};

const Serialization = {
  none: 0b0000,
  json: 0b0001
};

const Compression = {
  none: 0b0000,
  gzip: 0b0001
};

function frameHeader(messageType, flags, serialization = Serialization.none, compression = Compression.gzip) {
  return Buffer.from([0x11, (messageType << 4) | flags, (serialization << 4) | compression, 0x00]);
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function fullClientRequest(payload) {
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload)));
  return Buffer.concat([
    frameHeader(MessageType.fullClientRequest, Flags.positiveSequence, Serialization.json, Compression.gzip),
    int32(1),
    uint32(compressed.length),
    compressed
  ]);
}

function audioFrame(audio, isLast = false) {
  const compressed = zlib.gzipSync(audio);
  return Buffer.concat([
    frameHeader(
      MessageType.audioOnlyClientRequest,
      isLast ? Flags.lastNoSequence : Flags.noSequence,
      Serialization.none,
      Compression.gzip
    ),
    uint32(compressed.length),
    compressed
  ]);
}

function parseServerFrame(data) {
  const buffer = Buffer.from(data);
  if (buffer.length < 8) return {};

  const headerSize = (buffer[0] & 0x0f) * 4;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let offset = headerSize;
  let sequence;
  let errorCode;

  if (flags & Flags.positiveSequence) {
    sequence = buffer.readInt32BE(offset);
    offset += 4;
  }

  if (messageType === MessageType.error) {
    errorCode = buffer.readUInt32BE(offset);
    offset += 4;
  }

  if (buffer.length < offset + 4) return { messageType, sequence, errorCode };

  const payloadSize = buffer.readUInt32BE(offset);
  offset += 4;
  let payload = buffer.subarray(offset, offset + payloadSize);

  if (compression === Compression.gzip && payload.length) {
    payload = zlib.gunzipSync(payload);
  }

  if (serialization === Serialization.json && payload.length) {
    return { messageType, sequence, errorCode, payload: JSON.parse(payload.toString("utf8")) };
  }

  return { messageType, sequence, errorCode, payload: payload.toString("utf8") };
}

function extractTranscript(payload) {
  if (!payload || typeof payload !== "object") return "";
  const direct = payload.result?.text || payload.text;
  if (direct) return direct;

  const utterances = payload.result?.utterances || payload.utterances;
  if (Array.isArray(utterances)) {
    return utterances.map((item) => item.text).filter(Boolean).join("");
  }

  return "";
}

function requireAsrEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function createDoubaoSocket(downstream) {
  const appId = requireAsrEnv("DOUBAO_ASR_APP_ID");
  const accessKey = requireAsrEnv("DOUBAO_ASR_ACCESS_KEY");
  const endpoint = process.env.DOUBAO_ASR_STREAM_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
  const resourceId = process.env.DOUBAO_ASR_STREAM_RESOURCE_ID || "volc.bigasr.sauc.duration";

  const upstream = new WebSocket(endpoint, {
    headers: {
      "X-Api-App-Key": appId,
      "X-Api-Access-Key": accessKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Connect-Id": randomUUID()
    }
  });

  upstream.on("open", () => {
    upstream.send(
      fullClientRequest({
        user: { uid: appId },
        audio: {
          format: "pcm",
          codec: "raw",
          rate: 16000,
          bits: 16,
          channel: 1
        },
        request: {
          model_name: "bigmodel",
          result_type: "single",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          show_utterances: true
        }
      })
    );
    downstream.send(JSON.stringify({ type: "ready" }));
  });

  upstream.on("message", (data) => {
    try {
      const frame = parseServerFrame(data);
      if (frame.messageType === MessageType.error) {
        downstream.send(
          JSON.stringify({
            type: "error",
            error: `Doubao stream error ${frame.errorCode}: ${JSON.stringify(frame.payload)}`
          })
        );
        return;
      }

      const text = extractTranscript(frame.payload);
      if (text) {
        downstream.send(
          JSON.stringify({
            type: "result",
            text,
            final: frame.sequence ? frame.sequence < 0 : false
          })
        );
      }

      if (frame.sequence && frame.sequence < 0) {
        downstream.send(JSON.stringify({ type: "done" }));
      }
    } catch (error) {
      downstream.send(
        JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to parse ASR response."
        })
      );
    }
  });

  upstream.on("error", (error) => {
    downstream.send(JSON.stringify({ type: "error", error: error.message }));
  });

  upstream.on("close", () => {
    if (downstream.readyState === WebSocket.OPEN) downstream.send(JSON.stringify({ type: "closed" }));
  });

  return upstream;
}

function setupAsrStream(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname !== "/api/asr/stream") return;

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request);
    });
  });

  wss.on("connection", (client) => {
    let upstream;

    try {
      upstream = createDoubaoSocket(client);
    } catch (error) {
      client.send(
        JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to create ASR stream."
        })
      );
      client.close();
      return;
    }

    client.on("message", (data, isBinary) => {
      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;

      if (isBinary) {
        upstream.send(audioFrame(Buffer.from(data)));
        return;
      }

      try {
        const message = JSON.parse(data.toString());
        if (message.type === "stop") {
          upstream.send(audioFrame(Buffer.alloc(0), true));
        }
      } catch {
        // Ignore malformed control messages.
      }
    });

    client.on("close", () => {
      if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close();
    });
  });
}

await app.prepare();

const server = createServer((request, response) => {
  handle(request, response);
});

setupAsrStream(server);

server.listen(port, hostname, () => {
  console.log(`> Ready on http://localhost:${port}`);
});
