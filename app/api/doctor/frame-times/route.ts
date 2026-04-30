import { jsonOk, readJson } from "@/lib/agent/http";
import { callJsonModel } from "@/lib/agent/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FRAME_TIMES = Number(process.env.DOCTOR_FRAME_TIME_LIMIT || 6);

type RetentionImageInput = {
  fileName: string;
  dataUrl: string;
};

export async function POST(request: Request) {
  const body = await readJson(request);
  const duration = normalizeDuration(body.duration);
  const notes = typeof body.notes === "string" ? body.notes : "";
  const stats = typeof body.stats === "string" ? body.stats : "";
  const images = normalizeImages(body.images);

  if (!images.length || duration <= 0) {
    return jsonOk({ times: [], reason: "" });
  }

  const fallback = { times: [], reason: "" };
  const result = await callJsonModel({
    system: `你是短视频留存曲线读图助手。只输出 JSON，不要 markdown。
任务：从用户上传的留存曲线截图中找出最值得回看视频画面的时间点。
规则：
1. 只提取图中能看清楚或可以较可靠推断的时间点。
2. 优先选择明显掉点、突然回升、平台期结束、结尾流失的时间点。
3. 返回 1 到 4 个核心时间点，单位是秒。
4. 如果图里没有清楚时间轴、没有可读掉点，返回空数组。
5. 不要解释看不清，不要编造精确数字。`,
    user: {
      duration,
      notes,
      stats,
      imageLabels: images.map((image) => image.fileName),
      expectedJson: {
        times: [15, 22],
        reason: "一句话说明为什么取这些时间点"
      }
    },
    images: images.map((image) => ({
      dataUrl: image.dataUrl,
      label: image.fileName
    })),
    fallback
  });

  return jsonOk({
    times: normalizeTimes(result.times, duration),
    reason: typeof result.reason === "string" ? result.reason : ""
  });
}

function normalizeDuration(value: unknown) {
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function normalizeImages(value: unknown): RetentionImageInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";

      if (!dataUrl.startsWith("data:image/")) {
        return null;
      }

      return {
        fileName: typeof record.fileName === "string" ? record.fileName : "留存图",
        dataUrl
      };
    })
    .filter((item): item is RetentionImageInput => Boolean(item))
    .slice(0, 3);
}

function normalizeTimes(value: unknown, duration: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "number" ? item : Number(item)))
        .filter((item) => Number.isFinite(item))
        .flatMap((time) => [time - 2, time, time + 2])
        .map((time) => Math.min(duration, Math.max(0, Math.round(time * 10) / 10)))
    )
  )
    .sort((a, b) => a - b)
    .slice(0, MAX_FRAME_TIMES);
}
