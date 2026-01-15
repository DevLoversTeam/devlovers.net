export function resolveBaseUrl(options: {
    origin?: string | null;
    host?: string | null;
}): string {
    const base =
        options.origin ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        (options.host ? `http://${options.host}` : null);

    if (!base) {
        throw new Error("Unable to determine base URL");
    }

    return base.replace(/\/$/, "");
}