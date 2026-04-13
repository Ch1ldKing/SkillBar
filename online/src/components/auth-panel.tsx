"use client";

import Image from "next/image";
import { startTransition, useState } from "react";
import { GitBranch, LockKeyhole, Mail, UserRound } from "lucide-react";

import linuxDoLogo from "@/assets/linuxdo.webp";
import { authClient } from "@/lib/auth-client";
import type { AuthProviderFlags } from "@/lib/skillbar-types";

type AuthPanelProps = {
  providers: AuthProviderFlags;
};

type AuthMode = "signin" | "signup";

export function AuthPanel({ providers }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await authClient.signUp.email({
          callbackURL: "/",
          email,
          name: name.trim(),
          password,
        });

        if (signUpError) {
          throw new Error(signUpError.message ?? "注册失败。");
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          callbackURL: "/",
          email,
          password,
          rememberMe: true,
        });

        if (signInError) {
          throw new Error(signInError.message ?? "登录失败。");
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "认证失败。");
    } finally {
      startTransition(() => {
        setIsPending(false);
      });
    }
  }

  async function handleGithubLogin() {
    setError(null);
    const { error: signInError } = await authClient.signIn.social({
      callbackURL: "/",
      provider: "github",
    });

    if (signInError) {
      setError(signInError.message ?? "GitHub 登录失败。");
    }
  }

  async function handleLinuxDoLogin() {
    setError(null);
    const { error: signInError } = await authClient.signIn.oauth2({
      callbackURL: "/",
      providerId: "linuxdo",
    });

    if (signInError) {
      setError(signInError.message ?? "LinuxDO 登录失败。");
    }
  }

  const socialProviderCount = Number(providers.github) + Number(providers.linuxdo);

  return (
    <div className="flex flex-col">
      {providers.email ? (
        <div className="mb-5 flex justify-center">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <button
              className={`rounded-lg px-4 py-2 transition ${
                mode === "signin"
                  ? "bg-[#3390ec] text-white"
                  : "text-slate-500 hover:bg-white"
              }`}
              onClick={() => setMode("signin")}
              type="button"
            >
              登录
            </button>
            <button
              className={`rounded-lg px-4 py-2 transition ${
                mode === "signup"
                  ? "bg-[#3390ec] text-white"
                  : "text-slate-500 hover:bg-white"
              }`}
              onClick={() => setMode("signup")}
              type="button"
            >
              注册
            </button>
          </div>
        </div>
      ) : null}

      {socialProviderCount > 0 ? (
        <div className="space-y-3">
          {providers.github ? (
            <button
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#24292e] px-4 py-3 text-[15px] font-medium text-white transition-all hover:bg-[#2f363d]"
              onClick={handleGithubLogin}
              type="button"
            >
              <GitBranch className="h-5 w-5" />
              使用 GitHub 登录
            </button>
          ) : null}

          {providers.linuxdo ? (
            <button
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-medium text-slate-900 transition-all hover:bg-slate-50"
              onClick={handleLinuxDoLogin}
              type="button"
            >
              <Image
                alt="LinuxDO"
                className="h-5 w-5 rounded-sm object-cover"
                height={20}
                src={linuxDoLogo}
                width={20}
              />
              使用 LinuxDO 登录
            </button>
          ) : null}
        </div>
      ) : null}

      {providers.email ? (
        <>
          {socialProviderCount > 0 ? (
            <div className="my-7 flex items-center">
              <div className="flex-1 border-t border-slate-100" />
              <span className="px-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                or
              </span>
              <div className="flex-1 border-t border-slate-100" />
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            {mode === "signup" ? (
              <label className="block">
                <span className="sr-only">昵称</span>
                <div className="flex items-center gap-3 rounded-xl border border-transparent bg-slate-50 px-4 py-3.5 transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="昵称"
                    required
                    value={name}
                  />
                </div>
              </label>
            ) : null}

            <label className="block">
              <span className="sr-only">邮箱</span>
              <div className="flex items-center gap-3 rounded-xl border border-transparent bg-slate-50 px-4 py-3.5 transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                <Mail className="h-4 w-4 text-slate-400" />
                <input
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <label className="block">
              <span className="sr-only">密码</span>
              <div className="flex items-center gap-3 rounded-xl border border-transparent bg-slate-50 px-4 py-3.5 transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                <LockKeyhole className="h-4 w-4 text-slate-400" />
                <input
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                  type="password"
                  value={password}
                />
              </div>
            </label>

            <button
              className="w-full rounded-xl bg-blue-500 px-4 py-3.5 text-[15px] font-medium text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending
                ? "处理中..."
                : mode === "signin"
                  ? "使用邮箱登录"
                  : "使用邮箱注册"}
            </button>
          </form>
        </>
      ) : null}

      {!providers.email && socialProviderCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
          当前站点没有开启可用的登录方式。
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
