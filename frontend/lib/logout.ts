"use client";

export async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });

}  