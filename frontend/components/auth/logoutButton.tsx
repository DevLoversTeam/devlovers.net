"use client";

import { logout } from "@/lib/logout";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button variant="outline" onClick={logout}>
      Log out
    </Button>
  );
}