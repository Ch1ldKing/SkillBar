"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
          router.refresh();
        },
      },
    });
    setIsPending(false);
  }

  return (
    <button
      className={className ?? "rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"}
      disabled={isPending}
      onClick={handleSignOut}
      type="button"
    >
      {isPending ? "退出中..." : "退出登录"}
    </button>
  );
}
