"use client";

import { useTranslations } from "next-intl";

type EmailFieldProps = {
    onChange?: (value: string) => void;
};

export function EmailField({
    onChange,
}: EmailFieldProps) {
    const t = useTranslations("auth.fields");

    return (
        <input
            name="email"
            type="email"
            placeholder={t("email")}
            required
            className="w-full rounded border px-3 py-2"
            onChange={
                onChange
                    ? e => onChange(e.target.value)
                    : undefined
            }
        />
    );
}