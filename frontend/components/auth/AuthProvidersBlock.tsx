"use client";

import { useTranslations } from "next-intl";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export function AuthProvidersBlock() {
    const t = useTranslations("auth");

    return (
        <>
            <OAuthButtons />

            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-500">
                    {t("divider")}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
            </div>
        </>
    );
}