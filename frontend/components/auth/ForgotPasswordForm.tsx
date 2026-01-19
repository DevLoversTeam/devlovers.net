"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AuthSuccessBanner } from "@/components/auth/AuthSuccessBanner";
import { EmailField } from "@/components/auth/fields/EmailField";

export function ForgotPasswordForm() {
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
                setError(
                    "Failed to send reset email. Please try again."
                );
                return;
            }

            setEmailSent(true);
        } catch {
            setError(
                "Network error. Please check your connection."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell title="Reset password">
            {emailSent ? (
                <AuthSuccessBanner
                    message={
                        <>
                            <p>
                                We’ve sent a password reset link to{" "}
                                <strong>{email}</strong>.
                            </p>
                            <p className="mt-2">
                                Please check your inbox.
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
                        {loading
                            ? "Sending..."
                            : "Send reset link"}
                    </Button>
                </form>
            )}
        </AuthShell>
    );
}