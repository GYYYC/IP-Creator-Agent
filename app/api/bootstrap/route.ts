import { getOrCreateProfile } from "@/lib/agent/identity";
import { jsonOk } from "@/lib/agent/http";
import { loadBrain } from "@/lib/agent/brain";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getOrCreateProfile();
  const brain = await loadBrain(profile);

  return jsonOk({
    profile,
    brain: brain.snapshot
  });
}
