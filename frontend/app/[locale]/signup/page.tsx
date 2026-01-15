"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

/**
 * Prevent open redirect vulnerabilities.
 * Allows only safe relative internal paths.
 */
function isSafeRedirectUrl(url: string): boolean {
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.includes("://")) return false;
  return true;
}

export default function SignupPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();

  const returnToParam = searchParams.get("returnTo");
  const returnTo = returnToParam ?? "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    let res: Response | undefined;

    try {
      res = await fetch("/api/auth/signup", {
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

      const redirectTarget =
        returnTo && isSafeRedirectUrl(returnTo)
          ? returnTo
          : `/${locale}/dashboard`;

      window.location.href = redirectTarget;
    } catch {
      setError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">
        Sign up
      </h1>

      {!verificationRequired && (
        <>
          <OAuthButtons />

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-500">
              or
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

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
                ? `/login?returnTo=${encodeURIComponent(
                  returnTo
                )}`
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

          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
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
              ? "Signing up..."
              : "Sign up"}
          </Button>
        </form>
      )}

      {!verificationRequired && (
        <p className="mt-4 text-sm text-gray-600">
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
      )}
    </div>
  );
}