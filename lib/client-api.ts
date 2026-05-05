export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: false,
      error: `接口返回了空响应（HTTP ${response.status}）。请查看 Vercel 对应请求日志。`
    };
  }

  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return {
      ok: false,
      error: `接口返回的不是有效 JSON（HTTP ${response.status}）。请查看 Vercel 对应请求日志。`
    };
  }
}

export async function postJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

export async function patchJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}

export async function fetchJson<T>(url: string) {
  const response = await fetch(url);
  const payload = await readApiResponse<T>(response);

  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.data;
}
