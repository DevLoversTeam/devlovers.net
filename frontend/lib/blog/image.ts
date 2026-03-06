// Images are now on Cloudinary — Next.js Image optimizer handles them natively.
// This function is kept temporarily during migration; callers will be cleaned up.
export function shouldBypassImageOptimization(_url?: string | null): boolean {
  return false;
}
