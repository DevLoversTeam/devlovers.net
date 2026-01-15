"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    getPendingQuizResult,
    clearPendingQuizResult,
} from "@/lib/quiz/guest-quiz";

export function PostAuthQuizSync() {
    const router = useRouter();

    useEffect(() => {
        if (sessionStorage.getItem("guest_quiz_sync_done") === "1") {
            return;
        }

        queueMicrotask(() => {
            const pendingResult = getPendingQuizResult();
            if (!pendingResult) return;

            sessionStorage.setItem("guest_quiz_sync_done", "1");

            (async () => {
                try {
                    const res = await fetch("/api/quiz/guest-result", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            quizId: pendingResult.quizId,
                            answers: pendingResult.answers,
                            violations: pendingResult.violations,
                            timeSpentSeconds: pendingResult.timeSpentSeconds,
                        }),
                    });

                    if (!res.ok) {
                        throw new Error(`Failed to save quiz result (${res.status})`);
                    }

                    const result = await res.json();

                    if (result?.success) {
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

                        clearPendingQuizResult();

                        router.refresh();
                    } else {
                        sessionStorage.removeItem("guest_quiz_sync_done");
                    }
                } catch (error) {
                    console.error("Failed to sync guest quiz result:", error);
                    sessionStorage.removeItem("guest_quiz_sync_done");
                }
            })();
        });
    }, [router]);

    return null;
}