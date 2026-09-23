const DEFAULT_MAX_LENGTH = 256;
const DEFAULT_ELLIPSIS = "...";

export function truncateMiddle(
  text: string,
  maxLength = DEFAULT_MAX_LENGTH,
  ellipsis = DEFAULT_ELLIPSIS,
): string {
  if (maxLength <= 0) return "";

  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;

  if (maxLength <= ellipsis.length) {
    return ellipsis.slice(0, maxLength);
  }

  const available = maxLength - ellipsis.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = available - headLength;

  const head = chars.slice(0, headLength).join("");
  const tail =
    tailLength > 0 ? chars.slice(chars.length - tailLength).join("") : "";

  return `${head}${ellipsis}${tail}`;
}
