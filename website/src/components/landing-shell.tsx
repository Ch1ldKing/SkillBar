import { AuthPanel } from "@/components/auth-panel";
import type { AuthProviderFlags } from "@/lib/skillbar-types";

type LandingShellProps = {
  providers: AuthProviderFlags;
};

export function LandingShell({ providers }: LandingShellProps) {
  return (
    <main className="min-h-screen bg-[#f5f5f7] p-4 selection:bg-blue-100">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <section className="w-full rounded-[24px] border border-slate-100/50 bg-white px-8 py-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              👋 Hi，欢迎来到 SkillBar
            </h1>
            <p className="mt-1.5 text-[15px] text-slate-500">
              请登录以开始使用
            </p>
          </div>

          <AuthPanel providers={providers} />
        </section>
      </div>
    </main>
  );
}
