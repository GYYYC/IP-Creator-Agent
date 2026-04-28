import { jsonError, jsonOk } from "@/lib/agent/http";
import { transcribeAudioFile, transcribeAudioUrl } from "@/lib/agent/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TRANSCRIPTION_BYTES = Number(
  process.env.AI_TRANSCRIPTION_MAX_BYTES || 4 * 1024 * 1024
);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const url = typeof body.url === "string" ? body.url : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "video.mp4";
    const durationSeconds = Number(body.durationSeconds || 0);

    if (!url) {
      return jsonError("URL is required.");
    }

    const result = await transcribeAudioUrl({
      url,
      fileName,
      contentType: typeof body.contentType === "string" ? body.contentType : undefined,
      language: "zh"
    });
    const text = result.text.trim();

    return jsonOk({
      text,
      fileName,
      url,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      estimatedWordCount: estimateWordCount(text),
      model: result.model,
      status: result.status,
      message:
        result.status === "ok"
          ? "已识别口播内容。"
          : "这次没有拿到口播转写，继续按关键画面和你的说明分析。"
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("File is required.");
  }

  const durationSeconds = Number(formData.get("durationSeconds") || 0);

  if (file.size > MAX_TRANSCRIPTION_BYTES) {
    return jsonOk({
      text: "",
      fileName: file.name,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      estimatedWordCount: 0,
      status: "too_large",
      message: "视频文件较大，这次先按关键画面和你的说明分析。"
    });
  }

  const result = await transcribeAudioFile({
    file,
    language: "zh"
  });
  const text = result.text.trim();

  return jsonOk({
    text,
    fileName: file.name,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    estimatedWordCount: estimateWordCount(text),
    model: result.model,
    status: result.status,
    message:
      result.status === "ok"
        ? "已识别口播内容。"
        : "这次没有拿到口播转写，继续按关键画面和你的说明分析。"
  });
}

function estimateWordCount(text: string) {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;

  return cjkCount + latinCount;
}
