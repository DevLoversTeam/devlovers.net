"use client";

import { useLocale } from 'next-intl';
import{ Link } from '@/i18n/routing';
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPendingQuizResult, clearPendingQuizResult } from "@/lib/guest-quiz";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid email or password");
      return;
    }

   const data = await res.json();
   const pendingResult = getPendingQuizResult();
 if (pendingResult && data.userId) {
  try {
    const res = await fetch("/api/quiz/guest-result", {
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
    const result = await res.json();

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
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>

      <form onSubmit={onSubmit} className="space-y-4">
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Don’t have an account?{" "}
<Link href={returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'} className="underline">
  Sign up
</Link>
      </p>
    </div>
  );
}