"use client";

import { useTranslations } from "next-intl";

type EmailFieldProps = {
    onChange?: (value: string) => void;
};

export function EmailField({
    onChange,
}: EmailFieldProps) {
    const t = useTranslations("auth.fields");

    const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
        const input = e.target;
        if (input.validity.valueMissing) {
            input.setCustomValidity(t("validation.required"));
        } else if (input.validity.typeMismatch) {
            input.setCustomValidity(t("validation.invalidEmail"));
        }
    };

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity("");
    };

    return (
        <input
            name="email"
            type="email"
            placeholder={t("email")}
            required
            className="w-full rounded border px-3 py-2"
            onInvalid={handleInvalid}
            onInput={handleInput}
            onChange={
                onChange
                    ? e => onChange(e.target.value)
                    : undefined
            }
        />
    );
}