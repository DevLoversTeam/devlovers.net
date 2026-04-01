export type PublicCatalogQuery = {
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  sort?: string;
  page?: string;
  limit?: string;
  filter?: string;
};

export function canonicalizePublicCatalogQuery(raw: PublicCatalogQuery) {
  const params = new URLSearchParams();
  const hasLegacyNewestFilter = raw.filter === 'new';
  const hasLegacyNewArrivalsCategory = raw.category === 'new-arrivals';
  const needsCanonical = hasLegacyNewestFilter || hasLegacyNewArrivalsCategory;

  for (const [key, value] of Object.entries(raw)) {
    if (!value) continue;
    if (key === 'filter') continue;
    if (key === 'category' && value === 'new-arrivals') continue;
    params.set(key, value);
  }

  if (hasLegacyNewArrivalsCategory || (hasLegacyNewestFilter && !raw.sort)) {
    params.set('sort', 'newest');
  }

  return {
    needsCanonical,
    params,
    normalized: Object.fromEntries(params.entries()) as Record<string, string>,
  };
}
