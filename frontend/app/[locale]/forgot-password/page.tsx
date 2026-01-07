"use client";
import { Link } from "@/i18n/routing";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
    const searchParams = useSearchParams();
    const returnTo = searchParams.get("returnTo");

    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const res = await fetch("/api/auth/password-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        setLoading(false);

        if (!res.ok) {
            setError("Something went wrong. Please try again.");
            return;
        }

        setSubmitted(true);
    }

    return (
        <div className="mx-auto max-w-sm py-12">
            <h1 className="mb-6 text-2xl font-semibold">
                Forgot password
            </h1>

            {submitted ? (
                <div className="rounded-md border border-green-400 bg-green-50 p-4 text-sm text-green-800">
                    <p>
                        If an account for{" "}
                        <strong>{email}</strong> exists, we’ve sent a
                        password reset link.
                    </p>

                    <p className="mt-2">
                        Please check your inbox and follow the
                        instructions to reset your password.
                    </p>

                    <Link
                        href={
                            returnTo
                                ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                                : "/login"
                        }
                        className="mt-4 inline-block underline"
                    >
                        Back to login
                    </Link>
                </div>
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Enter your email address and we’ll send
                        you a link to reset your password.
                    </p>

                    <input
                        type="email"
                        required
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                    />

                    {error && (
                        <p className="text-sm text-red-600">
                            {error}
                        </p>
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full"
                    >
                        {loading
                            ? "Sending reset link..."
                            : "Send reset link"}
                    </Button>
                </form>
            )}

            {!submitted && (
                <p className="mt-4 text-sm text-gray-600">
                    Remembered your password?{" "}
                    <Link
                        href={
                            returnTo
                                ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                                : "/login"
                        }
                        className="underline"
                    >
                        Log in
                    </Link>
                </p>
            )}
        </div>
    );
}