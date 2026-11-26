export function hexToRgba(hex: string, alpha: number): string {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-f]{6}$/i.test(digits)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
