/** ISR revalidation for static content pages (blog, categories).
 *  Admin mutations call revalidatePath() for instant updates —
 *  this TTL is only a safety-net fallback. */
export const STATIC_PAGE_REVALIDATE = 604800; // 7 days
