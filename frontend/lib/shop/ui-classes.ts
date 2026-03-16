export const SHOP_FOCUS = `
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-[color:var(--color-ring)]
  focus-visible:ring-offset-2
  focus-visible:ring-offset-background
`;

export const SHOP_CTA_BASE = `
  group relative inline-flex items-center overflow-hidden rounded-2xl
  text-xs md:text-sm font-semibold tracking-[0.25em] uppercase
  active:scale-95 active:brightness-110
  transition-shadow duration-700 ease-out
`;

export const SHOP_CTA_WAVE = `
  absolute inset-0 opacity-0
  group-hover:opacity-100 group-active:opacity-100
  group-hover:animate-wave-slide-up
`;

export const SHOP_CTA_INSET = `
  pointer-events-none absolute inset-[2px] rounded-2xl
  bg-gradient-to-r from-white/20 via-white/5 to-white/20
  opacity-40 supports-[hover:hover]:group-hover:opacity-60 transition-opacity
`;

export const SHOP_CHIP_INTERACTIVE =
  'transition-[box-shadow,border-color,color,background-color,filter] duration-500 ease-out hover:brightness-110';

export const SHOP_CHIP_LIFT =
  'transition-transform duration-500 ease-out hover:-translate-y-0.5';

export const SHOP_CHIP_HOVER =
  'hover:shadow-[var(--shop-chip-shadow-hover)] hover:border-accent/60';

export const SHOP_CHIP_SELECTED =
  'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background shadow-[var(--shop-chip-shadow-selected)]';

export const SHOP_SWATCH_BASE =
  'group relative h-9 w-9 rounded-full border border-border shadow-none';

export const SHOP_SIZE_CHIP_BASE =
  'group rounded-md border px-4 py-2 text-sm font-medium';

export const SHOP_STEPPER_BUTTON_BASE =
  'flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground bg-transparent';

export const SHOP_FILTER_ITEM_BASE =
  'inline-flex text-sm font-medium transition-[color,transform] duration-300 ease-out hover:-translate-y-[1px]';

export const SHOP_CHIP_BORDER_HOVER = 'hover:border-foreground/60';

export const SHOP_DISABLED = 'disabled:pointer-events-none disabled:opacity-60';

export const SHOP_CHIP_SHADOW_HOVER =
  'hover:shadow-[var(--shop-chip-shadow-hover)]';

export const SHOP_LINK_BASE =
  'inline-flex font-medium text-foreground underline underline-offset-4 decoration-2 decoration-foreground/30 ' +
  'transition-[color,transform,text-decoration-color] duration-300 ease-out ' +
  'hover:-translate-y-[1px] hover:text-accent hover:decoration-[color:var(--accent-primary)]';

export const SHOP_LINK_MD = 'text-[15px]';
export const SHOP_LINK_XS = 'text-xs';

export const SHOP_CTA_INTERACTIVE =
  'transition-[transform,filter,box-shadow] duration-700 ease-out';

export const SHOP_OUTLINE_BTN_BASE =
  'inline-flex items-center justify-center rounded-xl border px-4 py-2 ' +
  'text-sm font-semibold uppercase tracking-[0.25em] ' +
  'border-border text-foreground bg-transparent';

export const SHOP_OUTLINE_BTN_INTERACTIVE =
  'transition-[transform,box-shadow,border-color,color,background-color,filter] duration-500 ease-out ' +
  'hover:-translate-y-[1px] hover:shadow-[var(--shop-chip-shadow-hover)] hover:brightness-110 ' +
  'hover:border-[color:var(--accent-primary)] hover:text-[color:var(--accent-primary)]';

export const SHOP_NAV_LINK_BASE =
  'inline-flex font-medium underline underline-offset-4 decoration-2 ' +
  'text-muted-foreground decoration-foreground/30 ' +
  'transition-[color,transform,text-decoration-color] duration-300 ease-out ' +
  'hover:-translate-y-[1px] hover:text-accent hover:decoration-[color:var(--accent-primary)]';

export const SHOP_SELECT_BASE =
  'peer h-10 w-full appearance-none rounded-xl border border-border bg-background pl-3 pr-11 text-sm font-medium';

export const SHOP_SELECT_INTERACTIVE =
  'transition-[transform,box-shadow,border-color,color,background-color,filter] duration-500 ease-out ' +
  'hover:-translate-y-[1px] hover:shadow-[var(--shop-chip-shadow-hover)] hover:border-foreground/40 hover:brightness-110';

export function shopCtaGradient(baseVar: string, hoverVar: string) {
  return {
    background: `linear-gradient(90deg, var(${baseVar}) 0%, var(${hoverVar}) 100%)`,
  } as const;
}

export const SHOP_CART_HERO_CTA = `
  ${SHOP_CTA_BASE}
  ${SHOP_CTA_INTERACTIVE}
  ${SHOP_FOCUS}
  ${SHOP_DISABLED}
  w-full justify-center gap-2 px-6 py-3.5 text-sm text-white
  shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]
`;

export const SHOP_CART_CARD =
  'border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export const SHOP_CART_SECTION_HEADER =
  'border-border bg-muted/30 flex items-center gap-3 border-b px-5 py-4';

export const SHOP_CART_FIELD = `
  ${SHOP_FOCUS}
  border-border bg-background placeholder:text-muted-foreground/60
  w-full rounded-xl border px-3 py-2.5 text-sm transition-colors
  hover:border-foreground/40 focus:border-foreground
`;

export const SHOP_CART_ORDERS_LINK = `
  ${SHOP_LINK_BASE}
  ${SHOP_LINK_MD}
  ${SHOP_FOCUS}
`;

export const SHOP_CART_ORDERS_COUNT_BADGE =
  'border-border bg-muted/40 text-foreground inline-flex min-w-8 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums';

export const SHOP_CART_SELECTABLE_CARD = `
  ${SHOP_FOCUS}
  ${SHOP_DISABLED}
  relative flex h-full w-full flex-col justify-start rounded-xl border p-4 pr-12 text-left transition-all duration-200
`;

export const SHOP_CART_SELECTABLE_CARD_TALL = 'min-h-34';
export const SHOP_CART_SELECTABLE_CARD_COMPACT = 'min-h-10';
export const SHOP_CART_SELECTABLE_CARD_SELECTED =
  'border-foreground bg-muted ring-foreground ring-offset-background ring-2 ring-offset-2';

export const SHOP_CART_SELECTABLE_CARD_IDLE =
  'border-border hover:border-foreground/40 hover:bg-muted/50';

export const SHOP_CART_SELECTABLE_CARD_CHECK =
  'bg-foreground pointer-events-none absolute top-4 right-4 flex h-5 w-5 items-center justify-center rounded-full';

export const SHOP_CART_METHOD_CARD_TITLE =
  'text-foreground block min-h-10 pr-2 text-sm leading-5 font-semibold';

export const SHOP_CART_METHOD_CARD_DESCRIPTION =
  'text-muted-foreground mt-1 block min-h-15 pr-2 text-xs leading-5';
