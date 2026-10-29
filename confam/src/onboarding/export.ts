import { redact } from "../web/artifacts.js";

// Best-effort removal before the exact payload is displayed for explicit review.
// Clips are binary and remain unredacted; approving a clip approves its full contents.
export function sanitizeExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeExport);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /(?:authorization|password|secret|api.?key|access.?token|cookie|bearer)/i.test(
          key,
        )
          ? "[redacted]"
          : sanitizeExport(item),
      ]),
    );
  if (typeof value !== "string") return value;
  let text = value;
  const configuredKey = process.env.MODEL_API_KEY;
  if (configuredKey && configuredKey.length >= 12)
    text = text.split(configuredKey).join("[redacted]");
  text = text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[redacted private key]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted token]",
    )
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[redacted key]")
    .replace(
      /((?:[\w]*api[_-]?key|[\w]*access[_-]?token|[\w]*secret|[\w]*password|authorization)\s*[=:]\s*)(["'`])[^"'`\r\n]+\2/gi,
      '$1"[redacted]"',
    )
    .replace(
      /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:)[^\s/@]+(@)/gi,
      "$1[redacted]$2",
    );
  return redact(text) as string;
}
