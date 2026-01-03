const DEFAULT_AA_MIRRORS = [
  "https://annas-archive.se",
  "https://annas-archive.li",
];

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseMirrorEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeBaseUrl);
}

export function getAaBaseUrls(): string[] {
  const envBaseUrl = process.env.AA_BASE_URL || "https://annas-archive.org";
  const baseUrls = [normalizeBaseUrl(envBaseUrl)];
  const envMirrors = parseMirrorEnv(process.env.AA_MIRROR_URLS);

  for (const mirror of [...envMirrors, ...DEFAULT_AA_MIRRORS]) {
    if (!baseUrls.includes(mirror)) {
      baseUrls.push(mirror);
    }
  }

  return baseUrls;
}
