import { OAuthButtons } from "@/components/auth/OAuthButtons";

export function AuthProvidersBlock() {
    return (
        <>
            <OAuthButtons />

            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-500">
                    or
                </span>
                <div className="h-px flex-1 bg-gray-200" />
            </div>
        </>
    );
}