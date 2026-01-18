"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthProvidersBlock } from "@/components/auth/AuthProvidersBlock";
import { EmailField } from "@/components/auth/fields/EmailField";
import { PasswordField } from "@/components/auth/fields/PasswordField";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AuthSuccessBanner } from "@/components/auth/AuthSuccessBanner";


type LoginFormProps = {
    locale: string;
    returnTo: string;
};

export function LoginForm({
    locale,
    returnTo,
}: LoginFormProps) {
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] =
        useState<string | null>(null);
    const [errorCode, setErrorCode] =
        useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [verificationSent, setVerificationSent] =
        useState(false);

    async function onSubmit(
        e: React.FormEvent<HTMLFormElement>
    ) {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        setErrorCode(null);
        setVerificationSent(false);

        const formData = new FormData(e.currentTarget);
        const emailValue = String(formData.get("email") || "");
        setEmail(emailValue);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: emailValue,
                    password: formData.get("password"),
                }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setErrorCode(data?.code ?? null);

                if (data?.code === "EMAIL_NOT_VERIFIED") {
                    setErrorMessage(
                        "Your email address is not verified. Please check your inbox."
                    );
                } else {
                    setErrorMessage("Invalid email or password");
                }
                return;
            }

            window.location.href =
                returnTo || `/${locale}/dashboard`;
        } catch (err) {
            console.error("Login request failed:", err);
            setErrorMessage(
                "Network error. Please check your connection and try again."
            );
            setErrorCode(null);
        } finally {
            setLoading(false);
        }
    }

    async function resendVerification() {
        if (!email) return;

        await fetch("/api/auth/resend-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        setVerificationSent(true);
        setErrorCode(null);
        setErrorMessage(null);
    }

    return (
        <AuthShell
            title="Log in"
            footer={
                <p className="text-sm text-gray-600">
                    Don’t have an account?{" "}
                    <Link
                        href={
                            returnTo
                                ? `/signup?returnTo=${encodeURIComponent(
                                    returnTo
                                )}`
                                : "/signup"
                        }
                        className="underline"
                    >
                        Sign up
                    </Link>
                </p>
            }
        >
            <AuthProvidersBlock />

            <form onSubmit={onSubmit} className="space-y-4">
                <EmailField onChange={setEmail} />

                <PasswordField />

                <div className="text-right">
                    <Link
                        href={
                            returnTo
                                ? `/forgot-password?returnTo=${encodeURIComponent(
                                    returnTo
                                )}`
                                : "/forgot-password"
                        }
                        className="text-sm underline text-gray-600"
                    >
                        Forgot password?
                    </Link>
                </div>

                {errorMessage && !verificationSent && (
                    <AuthErrorBanner
                        message={errorMessage}
                        actionLabel={
                            errorCode === "EMAIL_NOT_VERIFIED"
                                ? "Resend verification email"
                                : undefined
                        }
                        onAction={
                            errorCode === "EMAIL_NOT_VERIFIED"
                                ? resendVerification
                                : undefined
                        }
                    />
                )}

                {verificationSent && (
                    <AuthSuccessBanner
                        message={
                            <>
                                Verification successfully sent to{" "}
                                <strong>{email}</strong>
                            </>
                        }
                    />
                )}

                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full"
                >
                    {loading ? "Logging in..." : "Log in"}
                </Button>
            </form>
        </AuthShell>
    );
}