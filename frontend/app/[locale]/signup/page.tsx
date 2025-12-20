"use client";

import { useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPendingQuizResult, clearPendingQuizResult } from "@/lib/guest-quiz";
import { Button } from "@/components/ui/button";

type FormError = string | Record<string, string[]>;

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const locale = useLocale();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Signup failed");
        return;
      }

      const data = await res.json();
      const pendingResult = getPendingQuizResult();

      if (pendingResult && data.userId) {
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
            sessionStorage.setItem('quiz_just_saved', JSON.stringify({
              score: result.score,
              total: result.totalQuestions,
              percentage: result.percentage,
              pointsAwarded: result.pointsAwarded,
              quizSlug: pendingResult.quizSlug,
            }));
          }
        } catch (err) {
          console.error('Failed to save quiz result:', err);
        } finally {
          clearPendingQuizResult();
        }

        window.location.href = `/${locale}/dashboard`;
        return;
      }

      window.location.href = returnTo || `/${locale}/dashboard`;
    } catch (err) {
      console.error('Signup submit error', err);
      setError('Signup failed');
    } finally {
      setLoading(false);
    }

  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          name="name"
          placeholder="Username"
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
          className="w-full rounded border px-3 py-2"
        />

        {error && (
          <p className="text-sm text-red-600">
            {typeof error === "string"
              ? error
              : Object.values(error).flat().join(", ")}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating account..." : "Sign up"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'} className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
