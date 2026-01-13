"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPendingQuizResult, clearPendingQuizResult } from "@/lib/quiz/guest-quiz";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const locale = useLocale();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setErrorCode(null);
    setVerificationSent(false);

    const formData = new FormData(e.currentTarget);
    const emailValue = String(formData.get("email") || "");
    setEmail(emailValue);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailValue,
        password: formData.get("password"),
      }),
    });

    const data = await res.json().catch(() => null);
    setLoading(false);

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

    const pendingResult = getPendingQuizResult();

    if (pendingResult && data?.userId) {
      try {
        const quizRes = await fetch("/api/quiz/guest-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.userId,
            quizId: pendingResult.quizId,
            answers: pendingResult.answers,
            violations: pendingResult.violations,
            timeSpentSeconds: pendingResult.timeSpentSeconds,
          }),
        });

        if (!quizRes.ok) {
          throw new Error(`Failed to save quiz result: ${quizRes.status}`);
        }

        const result = await quizRes.json();

        if (result.success) {
          sessionStorage.setItem(
            "quiz_just_saved",
            JSON.stringify({
              score: result.score,
              total: result.totalQuestions,
              percentage: result.percentage,
              pointsAwarded: result.pointsAwarded,
              quizSlug: pendingResult.quizSlug,
            })
          );
        }
      } catch (err) {
        console.error("Failed to save quiz result:", err);
      } finally {
        clearPendingQuizResult();
      }

      window.location.href = `/${locale}/dashboard`;
      return;
    }

    window.location.href = returnTo || `/${locale}/dashboard`;
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
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>

      <OAuthButtons />

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border px-3 py-2"
          onChange={e => setEmail(e.target.value)}
        />

        <div className="relative">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            required
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

        <div className="text-right">
          <Link
            href={
              returnTo
                ? `/forgot-password?returnTo=${encodeURIComponent(returnTo)}`
                : "/forgot-password"
            }
            className="text-sm underline text-gray-600"
          >
            Forgot password?
          </Link>
        </div>

        {errorMessage && !verificationSent && (
          <div className="rounded-md border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800">
            <p>{errorMessage}</p>

            {errorCode === "EMAIL_NOT_VERIFIED" && (
              <button
                type="button"
                onClick={resendVerification}
                className="mt-2 underline"
              >
                Resend verification email
              </button>
            )}
          </div>
        )}

        {verificationSent && (
          <div className="rounded-md border border-green-400 bg-green-50 p-3 text-sm text-green-800">
            Verification successfully sent to <strong>{email}</strong>
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Don’t have an account?{" "}
        <Link
          href={
            returnTo
              ? `/signup?returnTo=${encodeURIComponent(returnTo)}`
              : "/signup"
          }
          className="underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}