const normalizeBase = (base: string | undefined | null) => {
  if (!base) return "";
  const trimmed = base.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const apiBase = normalizeBase(process.env.NEXT_PUBLIC_API_BASE_URL);

export const buildApiUrl = (path: string) => {
  if (!apiBase) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
};
