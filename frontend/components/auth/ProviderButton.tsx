"use client";

import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

type ProviderButtonProps = {
    provider: "google" | "github";
    label: string;
    icon: ReactNode;
};

export function ProviderButton({
    provider,
    label,
    icon,
}: ProviderButtonProps) {
    function oauthLogin() {
        window.location.href = `/api/auth/${provider}`;
    }

    return (
        <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={oauthLogin}
        >
            {icon}
            <span>{label}</span>
        </Button>
    );
}