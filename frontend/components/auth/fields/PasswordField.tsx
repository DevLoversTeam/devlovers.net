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

    return (
        <div className="relative">
            <input
                name={name}
                type={visible ? "text" : "password"}
                placeholder={t("password")}
                required
                minLength={minLength}
                className="w-full rounded border px-3 py-2 pr-10"
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