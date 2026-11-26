const categoryKeys = ['tech', 'career', 'insights', 'news', 'growth'] as const;
type CategoryTranslator = (
  key: `categories.${(typeof categoryKeys)[number]}`
) => string;

export function getBlogCategoryDisplayName(name: string): string {
  return name === 'Growth' ? 'Career' : name;
}

export function getBlogCategoryLabel(
  name: string,
  translate: CategoryTranslator,
  view: 'listing' | 'detail' = 'listing'
): string {
  const displayName =
    view === 'listing' ? getBlogCategoryDisplayName(name) : name;
  const normalized = displayName.toLowerCase();
  const key = categoryKeys.find(candidate => candidate === normalized);
  if (!key) return displayName;

  const translationKey = view === 'detail' && key === 'growth' ? 'career' : key;
  const label = translate(`categories.${translationKey}`);
  return view === 'listing' ? label || displayName : label;
}
