"use client";

import { useState } from "react";


import { Button } from "@/components/ui/button";

export default function LoginPage() {
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

    window.location.href = "/";
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
        <a href="/signup" className="underline">
          Sign up
        </a>
      </p>
    </div>
  );
}