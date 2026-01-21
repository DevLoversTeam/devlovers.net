import type { ReactNode } from "react";

type AuthShellProps = {
    title: string;
    children: ReactNode;
    footer?: ReactNode;
};

export function AuthShell({
    title,
    children,
    footer,
}: AuthShellProps) {
    return (
        <div className="mx-auto max-w-sm py-12">
            <h1 className="mb-6 text-2xl font-semibold">
                {title}
            </h1>

            <div className="space-y-6">
                {children}
            </div>

            {footer && (
                <div className="mt-6">
                    {footer}
                </div>
            )}
        </div>
    );
}