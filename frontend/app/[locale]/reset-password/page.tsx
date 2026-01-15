"use client";

export const dynamic = "force-dynamic";


import { Link } from "@/i18n/routing";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!token) {
            setError("Invalid or missing reset token.");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(
                "/api/auth/password-reset/confirm",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token,
                        password,
                    }),
                }
            );

            if (!res.ok) {
                setError("Invalid or expired reset link.");
                return;
            }

            setConfirmed(true);
        } catch {
            setError("Network error, please try again.");
        } finally {
            setLoading(false);
        }
    }

    if (!token) {
        return (
            <div className="mx-auto max-w-sm py-12">
                <div className="rounded-md border border-red-400 bg-red-50 p-4 text-sm text-red-800">
                    Invalid or missing reset token.
                </div>

                <Link
                    href="/login"
                    className="mt-4 inline-block underline"
                >
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-sm py-12">
            <h1 className="mb-6 text-2xl font-semibold">
                Reset password
            </h1>

            {confirmed ? (
                <div className="rounded-md border border-green-400 bg-green-50 p-4 text-sm text-green-800">
                    <p>Your password has been reset successfully.</p>

                    <Link
                        href="/login"
                        className="mt-4 inline-block underline"
                    >
                        Go to login
                    </Link>
                </div>
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Enter a new password for your account.
                    </p>

                    <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="New password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
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
                            ? "Resetting password..."
                            : "Reset password"}
                    </Button>
                </form>
            )}
        </div>
    );
}