export const UUID_V1_V5_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV1toV5(value: unknown): value is string {
  return typeof value === 'string' && UUID_V1_V5_RE.test(value);
}
