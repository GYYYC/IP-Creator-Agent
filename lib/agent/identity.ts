import { cookies } from "next/headers";
import { createDefaultProfile } from "@/lib/agent/defaults";
import { getProfileByAnonId, upsertProfile } from "@/lib/agent/store";
import { CreatorProfile } from "@/lib/agent/types";

export const ANON_COOKIE = "ip_creator_anon_id";

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export async function getOrCreateAnonId() {
  const cookieStore = await cookies();
  const current = cookieStore.get(ANON_COOKIE)?.value;

  if (current) {
    return current;
  }

  const anonId = createId("anon");
  cookieStore.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return anonId;
}

export async function getOrCreateProfile(): Promise<CreatorProfile> {
  const anonId = await getOrCreateAnonId();
  const existing = await getProfileByAnonId(anonId);

  if (existing) {
    return existing;
  }

  return upsertProfile(createDefaultProfile(createId("profile"), anonId));
}

export async function getProfileForRead(): Promise<CreatorProfile> {
  const cookieStore = await cookies();
  const anonId = cookieStore.get(ANON_COOKIE)?.value;

  if (!anonId) {
    return createDefaultProfile("profile_preview", "anon_preview");
  }

  const existing = await getProfileByAnonId(anonId);

  return existing ?? createDefaultProfile("profile_preview", anonId);
}

export async function requireProfile(profileId: string) {
  const profile = await getOrCreateProfile();

  if (profile.id !== profileId) {
    throw new Error("Profile does not belong to current anonymous user.");
  }

  return profile;
}
