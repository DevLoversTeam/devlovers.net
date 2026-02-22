export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
