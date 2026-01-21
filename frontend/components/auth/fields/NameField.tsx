"use client";

import { useTranslations } from "next-intl";

type NameFieldProps = {
    name?: string;
};

export function NameField({
    name = "name",
}: NameFieldProps) {
    const t = useTranslations("auth.fields");

    return (
        <input
            name={name}
            type="text"
            placeholder={t("name")}
            required
            className="w-full rounded border px-3 py-2"
        />
    );
}