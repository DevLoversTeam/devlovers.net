"use client";

import { useTranslations } from "next-intl";

type NameFieldProps = {
    name?: string;
};

export function NameField({
    name = "name",
}: NameFieldProps) {
    const t = useTranslations("auth.fields");

    const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        if (input.validity.valueMissing) {
            input.setCustomValidity(t("validation.required"));
        }
    };

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity("");
    };

    return (
        <input
            name={name}
            type="text"
            placeholder={t("name")}
            required
            className="w-full rounded border px-3 py-2"
            onInvalid={handleInvalid}
            onInput={handleInput}
        />
    );
}
