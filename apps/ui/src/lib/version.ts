export const APP_VERSION =
  process.env.NEXT_PUBLIC_FROGX_VERSION?.trim().toLowerCase() ?? "v2";

export const isV1 = APP_VERSION === "v1";
export const isV2 = !isV1;
