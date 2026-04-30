import { serveSignedAudioSource } from "@/lib/agent/audio-source-response";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  return serveSignedAudioSource(request, "GET");
}

export async function HEAD(request: Request) {
  return serveSignedAudioSource(request, "HEAD");
}
