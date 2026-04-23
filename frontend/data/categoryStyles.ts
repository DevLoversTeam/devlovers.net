import type { CategorySlug } from '@/components/q&a/types';
import { categoryRegistry } from '@/data/categoryRegistry';

export type CategoryTabStyle = {
  icon: string;
  color: string;
  glow: string;
  accent: string;
  iconClassName?: string;
};

export const defaultCategoryTabStyle: CategoryTabStyle = {
  icon: '/icons/code.svg',
  color:
    'group-hover:border-[#A1A1AA]/50 group-hover:bg-[#A1A1AA]/10 data-[state=active]:border-[#A1A1AA]/50 data-[state=active]:bg-[#A1A1AA]/10',
  glow: 'bg-[#A1A1AA]',
  accent: '#A1A1AA',
};

export const categoryTabStyles = Object.fromEntries(
  categoryRegistry.map(item => [
    item.slug,
    {
      icon: item.icon,
      color: item.colorClassName,
      glow: item.glowClassName,
      accent: item.accent,
      iconClassName: item.iconClassName,
    } satisfies CategoryTabStyle,
  ])
) as Partial<Record<CategorySlug, CategoryTabStyle>>;

export function getCategoryTabStyle(slug: string): CategoryTabStyle {
  return (
    (categoryTabStyles as Record<string, CategoryTabStyle>)[slug] ??
    defaultCategoryTabStyle
  );
}
