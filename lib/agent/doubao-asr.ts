import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";

type DoubaoAsrOptions = {
  audio: Buffer;
  audioFormat: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate?: number;
  channels?: number;
  bits?: number;
  language?: string;
  fileName?: string;
};

type DoubaoFrame =
  | {
      type: "response";
      flags: number;
      payload: Record<string, unknown>;
    }
  | {
      type: "error";
      code: number;
      message: string;
    };

const DOUBAO_DEFAULT_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
const DOUBAO_DEFAULT_RESOURCE_ID = "volc.seedasr.sauc.duration";
const DOUBAO_MODEL_NAME = "doubao-bigasr";
const HEADER_SIZE_BYTES = 4;
const PROTOCOL_VERSION_AND_HEADER_SIZE = 0x11;
const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0x1;
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0x2;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE = 0x9;
const MESSAGE_TYPE_ERROR = 0xf;
const FLAG_NO_SEQUENCE = 0x0;
const FLAG_LAST_PACKET = 0x2;
const FLAG_SERVER_LAST_PACKET_WITH_SEQUENCE = 0x3;
const SERIALIZATION_NONE = 0x0;
const SERIALIZATION_JSON = 0x1;
const COMPRESSION_NONE = 0x0;
const COMPRESSION_GZIP = 0x1;
const DEFAULT_CHUNK_DURATION_MS = 200;
const DEFAULT_CHUNK_INTERVAL_MS = 10;
const DEFAULT_TIMEOUT_MS = Number(
  process.env.DOUBAO_ASR_TIMEOUT_MS ||
    process.env.AI_TRANSCRIPTION_TIMEOUT_MS ||
    process.env.AI_REQUEST_TIMEOUT_MS ||
    120000
);

export function isDoubaoTranscriptionConfigured() {
  return Boolean(process.env.DOUBAO_ASR_API_KEY);
}

export function getDoubaoAsrModelName() {
  return process.env.DOUBAO_ASR_RESOURCE_ID || DOUBAO_DEFAULT_RESOURCE_ID;
}

export async function transcribeWithDoubaoAsr(params: DoubaoAsrOptions) {
  const apiKey = process.env.DOUBAO_ASR_API_KEY || "";
  const endpoint = process.env.DOUBAO_ASR_ENDPOINT || DOUBAO_DEFAULT_ENDPOINT;
  const resourceId = getDoubaoAsrModelName();
  const sampleRate = params.sampleRate || 16000;
  const bits = params.bits || 16;
  const channels = params.channels || 1;

  if (!apiKey) {
    console.warn("[Doubao ASR] skipped: missing DOUBAO_ASR_API_KEY.");
    return {
      text: "",
      model: resourceId,
      status: "missing_api_key"
    };
  }

  if (!params.audio.length) {
    return {
      text: "",
      model: resourceId,
      status: "empty_audio"
    };
  }

  try {
    const requestId = randomUUID();
    const connectId = randomUUID();
    const chunkBytes = resolveAudioChunkBytes(params.audioFormat, sampleRate, bits, channels);
    const chunkIntervalMs = Number(process.env.DOUBAO_ASR_CHUNK_INTERVAL_MS || DEFAULT_CHUNK_INTERVAL_MS);
    const finalText = await runDoubaoWebSocket({
      endpoint,
      apiKey,
      resourceId,
      requestId,
      connectId,
      audio: params.audio,
      audioFormat: params.audioFormat,
      sampleRate,
      bits,
      channels,
      language: normalizeDoubaoLanguage(params.language),
      chunkBytes,
      chunkIntervalMs
    });

    return {
      text: finalText.trim(),
      model: resourceId || DOUBAO_MODEL_NAME,
      status: finalText.trim() ? "ok" : "empty_response"
    };
  } catch (error) {
    console.warn(
      `[Doubao ASR] request error: file=${params.fileName ?? "unknown"} ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );

    return {
      text: "",
      model: resourceId || DOUBAO_MODEL_NAME,
      status: "request_error"
    };
  }
}

async function runDoubaoWebSocket(params: {
  endpoint: string;
  apiKey: string;
  resourceId: string;
  requestId: string;
  connectId: string;
  audio: Buffer;
  audioFormat: "pcm" | "wav" | "mp3" | "ogg";
  sampleRate: number;
  bits: number;
  channels: number;
  language: string;
  chunkBytes: number;
  chunkIntervalMs: number;
}) {
  return new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(params.endpoint, {
      headers: {
        "X-Api-Key": params.apiKey,
        "X-Api-Resource-Id": params.resourceId,
        "X-Api-Request-Id": params.requestId,
        "X-Api-Sequence": "-1",
        "X-Api-Connect-Id": params.connectId
      }
    });
    let resolved = false;
    let sentFinalPacket = false;
    let latestText = "";
    let logId = "";
    const timeout = setTimeout(() => {
      finishWithError(new Error("豆包 ASR 请求超时。"));
    }, DEFAULT_TIMEOUT_MS);

    function finish(text: string) {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);
      socket.close();
      resolve(text);
    }

    function finishWithError(error: Error) {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);
      socket.close();
      reject(error);
    }

    socket.on("upgrade", (response) => {
      const value = response.headers["x-tt-logid"];
      logId = Array.isArray(value) ? value[0] : value ?? "";
    });

    socket.on("open", () => {
      console.info(
        `[Doubao ASR] connected: resource=${params.resourceId} requestId=${params.requestId}`
      );
      void sendDoubaoAudio(socket, params)
        .then(() => {
          sentFinalPacket = true;
        })
        .catch((error) => {
          finishWithError(error instanceof Error ? error : new Error("豆包 ASR 音频发送失败。"));
        });
    });

    socket.on("message", (data) => {
      try {
        const frame = parseDoubaoFrame(toBuffer(data));

        if (frame.type === "error") {
          finishWithError(new Error(`豆包 ASR 错误 ${frame.code}: ${frame.message}`));
          return;
        }

        const text = extractDoubaoText(frame.payload);
        if (text) {
          latestText = text;
        }

        if (frame.flags === FLAG_LAST_PACKET || frame.flags === FLAG_SERVER_LAST_PACKET_WITH_SEQUENCE) {
          console.info(
            `[Doubao ASR] completed: requestId=${params.requestId} logId=${logId || "unknown"} chars=${latestText.length}`
          );
          finish(latestText);
        }
      } catch (error) {
        finishWithError(error instanceof Error ? error : new Error("豆包 ASR 响应解析失败。"));
      }
    });

    socket.on("error", (error) => {
      finishWithError(error);
    });

    socket.on("close", () => {
      if (!resolved && sentFinalPacket && latestText) {
        finish(latestText);
      } else if (!resolved) {
        finishWithError(new Error("豆包 ASR 连接提前关闭。"));
      }
    });
  });
}

async function sendDoubaoAudio(
  socket: WebSocket,
  params: {
    audio: Buffer;
    audioFormat: "pcm" | "wav" | "mp3" | "ogg";
    sampleRate: number;
    bits: number;
    channels: number;
    language: string;
    chunkBytes: number;
    chunkIntervalMs: number;
  }
) {
  const clientRequest = {
    user: {
      uid: "ip-creator-agent"
    },
    audio: {
      format: params.audioFormat,
      codec: params.audioFormat === "ogg" ? "opus" : "raw",
      rate: params.sampleRate,
      bits: params.bits,
      channel: params.channels,
      language: params.language
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      result_type: "full"
    }
  };

  await sendFrame(
    socket,
    buildClientFrame({
      messageType: MESSAGE_TYPE_FULL_CLIENT_REQUEST,
      flags: FLAG_NO_SEQUENCE,
      serialization: SERIALIZATION_JSON,
      compression: COMPRESSION_GZIP,
      payload: Buffer.from(JSON.stringify(clientRequest), "utf8")
    })
  );

  for (let offset = 0; offset < params.audio.length; offset += params.chunkBytes) {
    const end = Math.min(params.audio.length, offset + params.chunkBytes);
    const isLast = end >= params.audio.length;
    await sendFrame(
      socket,
      buildClientFrame({
        messageType: MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
        flags: isLast ? FLAG_LAST_PACKET : FLAG_NO_SEQUENCE,
        serialization: SERIALIZATION_NONE,
        compression: COMPRESSION_GZIP,
        payload: params.audio.subarray(offset, end)
      })
    );

    if (!isLast && params.chunkIntervalMs > 0) {
      await wait(params.chunkIntervalMs);
    }
  }
}

function buildClientFrame(params: {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  payload: Buffer;
}) {
  const payload = params.compression === COMPRESSION_GZIP ? gzipSync(params.payload) : params.payload;
  const frame = Buffer.alloc(HEADER_SIZE_BYTES + 4 + payload.length);
  frame[0] = PROTOCOL_VERSION_AND_HEADER_SIZE;
  frame[1] = (params.messageType << 4) | params.flags;
  frame[2] = (params.serialization << 4) | params.compression;
  frame[3] = 0x00;
  frame.writeUInt32BE(payload.length, HEADER_SIZE_BYTES);
  payload.copy(frame, HEADER_SIZE_BYTES + 4);

  return frame;
}

function parseDoubaoFrame(buffer: Buffer): DoubaoFrame {
  if (buffer.length < HEADER_SIZE_BYTES) {
    throw new Error("豆包 ASR 响应帧过短。");
  }

  const headerSize = (buffer[0] & 0x0f) * 4;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let offset = headerSize;

  if (messageType === MESSAGE_TYPE_ERROR) {
    ensureReadable(buffer, offset, 8);
    const code = buffer.readUInt32BE(offset);
    offset += 4;
    const messageSize = buffer.readUInt32BE(offset);
    offset += 4;
    ensureReadable(buffer, offset, messageSize);

    return {
      type: "error",
      code,
      message: buffer.subarray(offset, offset + messageSize).toString("utf8")
    };
  }

  if (messageType !== MESSAGE_TYPE_FULL_SERVER_RESPONSE) {
    return {
      type: "response",
      flags,
      payload: {}
    };
  }

  if (flags === 0x1 || flags === FLAG_SERVER_LAST_PACKET_WITH_SEQUENCE) {
    ensureReadable(buffer, offset, 4);
    offset += 4;
  }

  ensureReadable(buffer, offset, 4);
  const payloadSize = buffer.readUInt32BE(offset);
  offset += 4;
  ensureReadable(buffer, offset, payloadSize);
  let payload = buffer.subarray(offset, offset + payloadSize);

  if (compression === COMPRESSION_GZIP) {
    payload = gunzipSync(payload);
  }

  if (serialization !== SERIALIZATION_JSON) {
    return {
      type: "response",
      flags,
      payload: {}
    };
  }

  return {
    type: "response",
    flags,
    payload: JSON.parse(payload.toString("utf8")) as Record<string, unknown>
  };
}

function extractDoubaoText(payload: Record<string, unknown>) {
  const result = payload.result;

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const text = (result as Record<string, unknown>).text;
    return typeof text === "string" ? text : "";
  }

  if (Array.isArray(result)) {
    return result
      .map((item) =>
        item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string"
          ? ((item as Record<string, unknown>).text as string)
          : ""
      )
      .join("")
      .trim();
  }

  return "";
}

function resolveAudioChunkBytes(
  audioFormat: "pcm" | "wav" | "mp3" | "ogg",
  sampleRate: number,
  bits: number,
  channels: number
) {
  if (audioFormat !== "pcm") {
    return Number(process.env.DOUBAO_ASR_CHUNK_BYTES || 64 * 1024);
  }

  const bytesPerSecond = sampleRate * channels * Math.max(1, bits / 8);
  const chunkBytes = Math.max(1, Math.round((bytesPerSecond * DEFAULT_CHUNK_DURATION_MS) / 1000));

  return Number(process.env.DOUBAO_ASR_CHUNK_BYTES || chunkBytes);
}

function normalizeDoubaoLanguage(language?: string) {
  if (!language || language === "zh") {
    return "zh-CN";
  }

  return language;
}

function ensureReadable(buffer: Buffer, offset: number, bytes: number) {
  if (offset + bytes > buffer.length) {
    throw new Error("豆包 ASR 响应帧不完整。");
  }
}

function sendFrame(socket: WebSocket, frame: Buffer) {
  return new Promise<void>((resolve, reject) => {
    socket.send(frame, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBuffer(data: WebSocket.RawData) {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  return Buffer.from(data);
}
