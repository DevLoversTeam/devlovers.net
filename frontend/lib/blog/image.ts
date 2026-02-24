export function isSanityAssetUrl(url?: string | null): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'cdn.sanity.io' &&
      (parsed.pathname.startsWith('/images/') ||
        parsed.pathname.startsWith('/files/'))
    );
  } catch {
    return false;
  }
}

export function shouldBypassImageOptimization(url?: string | null): boolean {
  // Hotfix for Vercel image optimizer failures on some Sanity assets.
  return isSanityAssetUrl(url);
}
