"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type PasswordFieldProps = {
    name?: string;
    minLength?: number;
};

export function PasswordField({
    name = "password",
    minLength,
}: PasswordFieldProps) {
    const t = useTranslations("auth.fields");
    const [visible, setVisible] = useState(false);

    const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
        const input = e.target;
        if (input.validity.valueMissing) {
            input.setCustomValidity(t("validation.required"));
        } else if (input.validity.tooShort && minLength) {
            input.setCustomValidity(
                t("validation.passwordTooShort", { minLength })
            );
        }
    };

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity("");
    };

    return (
        <div className="relative">
            <input
                name={name}
                type={visible ? "text" : "password"}
                placeholder={t("password")}
                required
                minLength={minLength}
                className="w-full rounded border px-3 py-2 pr-10"
                onInvalid={handleInvalid}
                onInput={handleInput}
            />

            <button
                type="button"
                aria-label={visible ? t("hidePassword") : t("showPassword")}
                onClick={() => setVisible(v => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-sm text-gray-500"
            >
                {visible ? t("hide") : t("show")}
            </button>
        </div>
    );
}