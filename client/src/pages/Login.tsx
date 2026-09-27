import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { FalconCrest } from "@/components/game/GameIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.auth.localLogin.useMutation({
    onSuccess: async (user) => {
      // 登录响应会设置 Cookie；先同步 auth.me 缓存再切到受保护页面。
      await utils.auth.me.invalidate();
      setLocation(user.role === "admin" ? "/gm" : "/keep");
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <main className="min-h-screen bg-grain px-4 py-10 text-[color:var(--parchment)]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
        <section className="panel panel-gold w-full p-6 sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-500)]">
              <FalconCrest size={24} />
            </span>
            <div>
              <div className="text-display text-base">裂隙纪元</div>
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-[color:var(--parchment-muted)]">Aetherfall Chronicle</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-caption mb-1">Local Access</div>
            <h1 className="text-display text-2xl text-[color:var(--parchment)]">进入你的领地</h1>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--parchment-dim)]">输入账号即可登录；首次使用的账号会自动建立。</p>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[color:var(--parchment-dim)]">账号</Label>
              <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入账号名" required className="border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/60 text-[color:var(--parchment)]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[color:var(--parchment-dim)]">密码</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" required className="border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/60 pr-10 text-[color:var(--parchment)]" />
                <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[color:var(--parchment-muted)] hover:text-[color:var(--gold-300)]" onClick={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {login.error ? <p className="text-sm text-[color:var(--ember-400)]">{login.error.message}</p> : null}

            <Button type="submit" disabled={login.isPending} className="btn-gold w-full border-transparent text-[color:var(--ink-950)]">
              {login.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ArrowRight size={16} className="mr-2" />}
              进入领地
            </Button>
          </form>

          <button type="button" className="mt-5 w-full text-center text-xs text-[color:var(--parchment-muted)] hover:text-[color:var(--gold-300)]" onClick={() => setLocation("/")}>返回首页</button>
        </section>
      </div>
    </main>
  );
}
