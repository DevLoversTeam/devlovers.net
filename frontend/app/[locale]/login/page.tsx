"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSafeRedirect } from "@/lib/auth/safe-redirect";

export default function LoginPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();

  const returnTo = getSafeRedirect(
    searchParams.get("returnTo")
  );

  return (
    <LoginForm
      locale={locale}
      returnTo={returnTo}
    />
  );
}