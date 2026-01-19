"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AuthSuccessBanner } from "@/components/auth/AuthSuccessBanner";
import { PasswordField } from "@/components/auth/fields/PasswordField";

type ResetPasswordFormProps = {
    token: string;
};

export function ResetPasswordForm({
    token,
}: ResetPasswordFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function onSubmit(
        e: React.FormEvent<HTMLFormElement>
    ) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);

        try {
            const res = await fetch(
                "/api/auth/password-reset/confirm",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        token,
                        password: formData.get("password"),
                    }),
                }
            );

            if (!res.ok) {
                setError(
                    "Failed to reset password. The link may be invalid or expired."
                );
                return;
            }

            setSuccess(true);
        } catch {
            setError(
                "Network error. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell title="Set new password">
            {success ? (
                <AuthSuccessBanner
                    message="Your password has been updated successfully."
                />
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <PasswordField minLength={8} />

                    {error && (
                        <AuthErrorBanner message={error} />
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full"
                    >
                        {loading
                            ? "Updating..."
                            : "Update password"}
                    </Button>
                </form>
            )}
        </AuthShell>
    );
}