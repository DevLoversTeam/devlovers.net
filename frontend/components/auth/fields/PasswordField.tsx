"use client";

import { useState } from "react";

type PasswordFieldProps = {
    name?: string;
    placeholder?: string;
    minLength?: number;
};

export function PasswordField({
    name = "password",
    placeholder = "Password",
    minLength,
}: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input
                name={name}
                type={visible ? "text" : "password"}
                placeholder={placeholder}
                required
                minLength={minLength}
                className="w-full rounded border px-3 py-2 pr-10"
            />

            <button
                type="button"
                aria-label={
                    visible
                        ? "Hide password"
                        : "Show password"
                }
                onClick={() => setVisible(v => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-sm text-gray-500"
            >
                {visible ? "Hide" : "Show"}
            </button>
        </div>
    );
}