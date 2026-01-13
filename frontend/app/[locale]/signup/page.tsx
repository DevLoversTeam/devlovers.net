"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function SignupPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [verificationRequired, setVerificationRequired] =
    useState(false);
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const emailValue = String(formData.get("email") || "");
    setEmail(emailValue);

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
    setLoading(false);

    if (!res.ok) {
      setError(data?.error ?? "Failed to sign up");
      return;
    }

    if (data?.verificationRequired) {
      setVerificationRequired(true);
      return;
    }

    window.location.href =
      returnTo || `/${locale}/dashboard`;
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">
        Sign up
      </h1>

      <OAuthButtons />

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {verificationRequired ? (
        <div className="rounded-md border border-green-400 bg-green-50 p-4 text-sm text-green-800">
          <p>
            We’ve sent a verification email to{" "}
            <strong>{email}</strong>.
          </p>

          <p className="mt-2">
            Please check your inbox and click the
            verification link to activate your account.
          </p>

          <Link
            href={
              returnTo
                ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                : "/login"
            }
            className="mt-4 inline-block underline"
          >
            Go to login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            name="name"
            type="text"
            placeholder="Name"
            required
            className="w-full rounded border px-3 py-2"
          />

          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded border px-3 py-2"
          />

          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              required
              minLength={8}
              className="w-full rounded border px-3 py-2 pr-10"
            />

            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(v => !v)}
              className="absolute inset-y-0 right-2 flex items-center text-sm text-gray-500"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

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
            {loading ? "Signing up..." : "Sign up"}
          </Button>
        </form>
      )}

      {!verificationRequired && (
        <p className="mt-4 text-sm text-gray-600">
          Already have an account?{" "}
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