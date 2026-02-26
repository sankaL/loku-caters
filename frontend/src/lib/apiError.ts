function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;

  const parts = loc
    .filter((p) => typeof p === "string" || typeof p === "number")
    .map((p) => String(p));
  if (parts.length === 0) return null;

  const trimmed = ["body", "query", "path", "header"].includes(parts[0])
    ? parts.slice(1)
    : parts;

  return trimmed.length > 0 ? trimmed.join(".") : null;
}

function formatValidationDetail(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;

  const parts: string[] = [];
  for (const item of detail) {
    if (!isRecord(item)) continue;
    const msg = typeof item.msg === "string" ? item.msg : null;
    if (!msg) continue;

    const loc = formatLoc(item.loc);
    parts.push(loc ? `${loc}: ${msg}` : msg);
  }

  return parts.length > 0 ? parts.join("; ") : null;
}

export async function getApiErrorMessage(res: Response, fallback: string): Promise<string> {
  let data: unknown = null;
  try {
    data = await res.clone().json();
  } catch {
    // ignore
  }

  if (isRecord(data)) {
    const detail = data.detail;

    if (res.status === 422) {
      const formatted = formatValidationDetail(detail);
      if (formatted) return formatted;
    }

    if (typeof detail === "string" && detail.trim()) return detail;
  } else if (typeof data === "string" && data.trim()) {
    return data;
  }

  try {
    const text = (await res.clone().text()).trim();
    if (text) return text;
  } catch {
    // ignore
  }

  return fallback;
}
