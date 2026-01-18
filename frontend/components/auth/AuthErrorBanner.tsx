// import type { ReactNode } from "react";

type AuthErrorBannerProps = {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
};

export function AuthErrorBanner({
    message,
    actionLabel,
    onAction,
}: AuthErrorBannerProps) {
    return (
        <div className="rounded-md border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800">
            <p>{message}</p>

            {actionLabel && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    className="mt-2 underline"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
}