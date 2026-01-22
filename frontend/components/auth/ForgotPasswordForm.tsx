"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AuthSuccessBanner } from "@/components/auth/AuthSuccessBanner";
import { EmailField } from "@/components/auth/fields/EmailField";

export function ForgotPasswordForm() {
    const t = useTranslations("auth.forgotPassword");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailSent, setEmailSent] = useState(false);
    const [email, setEmail] = useState("");

    async function onSubmit(
        e: React.FormEvent<HTMLFormElement>
    ) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const emailValue = String(formData.get("email") || "");
        setEmail(emailValue);

        try {
            const res = await fetch(
                "/api/auth/password-reset",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email: emailValue }),
                }
            );

            if (!res.ok) {
                setError(t("errors.sendFailed"));
                return;
            }

            setEmailSent(true);
        } catch {
            setError(t("errors.networkError"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell title={t("title")}>
            {emailSent ? (
                <AuthSuccessBanner
                    message={
                        <>
                            <p>
                                {t("emailSent")}{" "}
                                <strong>{email}</strong>.
                            </p>
                            <p className="mt-2">
                                {t("checkInbox")}
                            </p>
                        </>
                    }
                />
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <EmailField onChange={setEmail} />

                    {error && (
                        <AuthErrorBanner message={error} />
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full"
                    >
                        {loading ? t("submitting") : t("submit")}
                    </Button>
                </form>
            )}
        </AuthShell>
    );
}