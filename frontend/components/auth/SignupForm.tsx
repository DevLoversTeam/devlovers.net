"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthProvidersBlock } from "@/components/auth/AuthProvidersBlock";
import { EmailField } from "@/components/auth/fields/EmailField";
import { PasswordField } from "@/components/auth/fields/PasswordField";
import { NameField } from "@/components/auth/fields/NameField";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AuthSuccessBanner } from "@/components/auth/AuthSuccessBanner";

type SignupFormProps = {
    locale: string;
    returnTo: string;
};

export function SignupForm({
    locale,
    returnTo,
}: SignupFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] =
        useState<string | null>(null);
    const [verificationRequired, setVerificationRequired] =
        useState(false);
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
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.get("name"),
                    email: emailValue,
                    password: formData.get("password"),
                }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError(
                    data?.error ??
                    "Failed to sign up. Please try again."
                );
                return;
            }

            if (data?.verificationRequired) {
                setVerificationRequired(true);
                return;
            }

            window.location.href =
                returnTo || `/${locale}/dashboard`;
        } catch {
            setError(
                "Network error. Please check your connection and try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell
            title="Sign up"
            footer={
                !verificationRequired && (
                    <p className="text-sm text-gray-600">
                        Already have an account?{" "}
                        <Link
                            href={
                                returnTo
                                    ? `/login?returnTo=${encodeURIComponent(
                                        returnTo
                                    )}`
                                    : "/login"
                            }
                            className="underline"
                        >
                            Log in
                        </Link>
                    </p>
                )
            }
        >
            {!verificationRequired && (
                <AuthProvidersBlock />
            )}

            {verificationRequired ? (
                <AuthSuccessBanner
                    message={
                        <>
                            <p>
                                We’ve sent a verification email to{" "}
                                <strong>{email}</strong>.
                            </p>

                            <p className="mt-2">
                                Please check your inbox and click the
                                verification link to activate your account.
                            </p>
                        </>
                    }
                    footer={
                        <Link
                            href={
                                returnTo
                                    ? `/login?returnTo=${encodeURIComponent(
                                        returnTo
                                    )}`
                                    : "/login"
                            }
                            className="inline-block underline"
                        >
                            Go to login
                        </Link>
                    }
                />
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <NameField />

                    <EmailField />

                    <PasswordField minLength={8} />

                    {error && (
                        <AuthErrorBanner message={error} />
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full"
                    >
                        {loading ? "Signing up..." : "Sign up"}
                    </Button>
                </form>
            )}
        </AuthShell>
    );
}