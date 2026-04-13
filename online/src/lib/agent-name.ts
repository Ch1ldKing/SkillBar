const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;

export function normalizeAgentName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, "");
}
