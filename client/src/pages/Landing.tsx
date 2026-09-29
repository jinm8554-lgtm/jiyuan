/**
 * 根路由登录页：本地账号首次登录会自动创建账号。
 * 视觉来自登录页稿，登录操作仍通过项目现有的服务端认证接口完成。
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useMusicMuted } from "@/audio/musicPreference";
import { trpc } from "@/lib/trpc";

const isLocalAuth = import.meta.env.VITE_LOCAL_AUTH_ENABLED === "true";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading, user } = useAuth();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [isMuted, setIsMuted] = useMusicMuted();
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef<HTMLAudioElement>(null);
  const login = trpc.auth.localLogin.useMutation({
    onSuccess: async (account) => {
      // localLogin 刚写入 Cookie 时，旧的 auth.me 缓存仍可能是 null。
      // 先刷新身份，再进入受保护的游戏路由，避免短暂显示“会话过期”。
      await utils.auth.me.invalidate();
      setLocation(account.role === "admin" ? "/gm" : "/keep");
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLocalAuth) {
      startLogin();
      return;
    }
    login.mutate({ username, password });
  };

  const register = () => {
    if (!isLocalAuth) {
      startLogin();
      return;
    }
    if (!username.trim() || password.length < 4) {
      toast.info("先填写账号和至少 4 位密码；首次登录会自动创建账号。");
      return;
    }
    login.mutate({ username, password });
  };

  useEffect(() => {
    const music = musicRef.current;
    if (!music) return;

    const retryAfterUserGesture = () => {
      if (isMuted) return;
      music.muted = false;
      void music.play()
        .then(() => setIsMusicPlaying(true))
        .catch(() => setIsMusicPlaying(false));
    };

    if (isMuted) {
      music.muted = true;
      music.pause();
      setIsMusicPlaying(false);
      return;
    }

    music.muted = false;
    music.volume = 0.3;
    void music.play()
      .then(() => setIsMusicPlaying(true))
      // 浏览器禁止带声音的自动播放时，保持“音乐开启”偏好；
      // 玩家在登录页第一次点击或按键时自动续播。
      .catch(() => {
        setIsMusicPlaying(false);
        window.addEventListener("pointerdown", retryAfterUserGesture, { once: true });
        window.addEventListener("keydown", retryAfterUserGesture, { once: true });
      });

    return () => {
      window.removeEventListener("pointerdown", retryAfterUserGesture);
      window.removeEventListener("keydown", retryAfterUserGesture);
    };
  }, [isMuted]);

  const toggleMusic = async () => {
    const music = musicRef.current;
    if (!music) return;

    if (isMuted || !isMusicPlaying) {
      setIsMuted(false);
      music.muted = false;
      try {
        await music.play();
        setIsMusicPlaying(true);
      } catch {
        toast.error("浏览器暂时无法播放背景音乐，请检查浏览器的媒体播放权限。");
      }
      return;
    }

    music.muted = true;
    music.pause();
    setIsMusicPlaying(false);
    setIsMuted(true);
  };

  return (
    <main className="af-login">
      <style>{`
        .af-login {
          --af-bg-black: #050812;
          --af-bg-dark-blue: #0a1428;
          --af-text-cream: #d4c4a8;
          --af-text-muted: #a89b7e;
          --af-gold-dark: #8b7332;
          --af-gold-bright: #b8963c;
          --af-gold-highlight: #d4af37;
          --af-input-bg: rgba(10, 15, 21, 0.85);
          --af-button-text: #1a1410;
          min-height: 100svh;
          overflow: hidden;
          position: relative;
          color: var(--af-text-cream);
          font-family: 'Noto Sans SC', sans-serif;
          background: var(--af-bg-black);
        }
        .af-login *, .af-login *::before, .af-login *::after { box-sizing: border-box; }
        .af-login__background {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: var(--af-bg-black);
        }
        .af-login__background picture, .af-login__background img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .af-login__background img {
          object-fit: cover;
          object-position: center;
          background: var(--af-bg-black);
          opacity: 0;
          transition: opacity .45s ease-out;
        }
        .af-login__background--ready img {
          opacity: 1;
        }
        .af-login__background::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, rgba(5, 8, 18, .6) 0%, rgba(5, 8, 18, .3) 50%, rgba(5, 8, 18, .5) 100%);
        }
        .af-login__container {
          position: relative;
          z-index: 1;
          min-height: 100svh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 5vh 8vw;
        }
        .af-login__header { text-align: center; animation: af-fade-down 1s ease-out both; }
        .af-login__title-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          margin-bottom: .5rem;
        }
        .af-login__compass {
          width: 48px;
          height: 48px;
          color: var(--af-gold-bright);
          opacity: .9;
          animation: af-rotate 20s linear infinite;
          transform-origin: center;
        }
        .af-login__title {
          margin: 0;
          font-family: 'Cinzel', serif;
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 700;
          color: var(--af-gold-bright);
          letter-spacing: .1em;
          text-shadow: 0 2px 8px rgba(0, 0, 0, .8);
        }
        .af-login__subtitle {
          margin: 0;
          font-family: 'Cinzel', serif;
          font-size: clamp(.9rem, 1.5vw, 1.2rem);
          color: var(--af-text-cream);
          letter-spacing: .3em;
          opacity: .85;
          text-shadow: 0 1px 4px rgba(0, 0, 0, .8);
        }
        .af-login__divider {
          width: 200px;
          height: 4px;
          margin: 1rem auto 0;
          opacity: .6;
        }
        .af-login__divider img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .af-login__content {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: space-between;
          gap: 4rem;
          padding: 2rem 0;
        }
        .af-login__story { flex: 1; max-width: 45%; animation: af-fade-left 1.2s ease-out .3s both; }
        .af-login__story p { margin: 0 0 2rem; line-height: 1.8; text-shadow: 2px 2px 4px rgba(0, 0, 0, .9); }
        .af-login__story-main { font-size: clamp(1.5rem, 2.5vw, 2.2rem); font-weight: 700; color: var(--af-text-cream); }
        .af-login__story-secondary { font-size: clamp(1rem, 1.8vw, 1.4rem); color: var(--af-text-muted); opacity: .85; }
        .af-login__story-highlight { font-size: clamp(1.1rem, 2vw, 1.6rem); font-weight: 700; color: var(--af-gold-bright); animation: af-glow 1s ease-out 1.5s both; }
        .af-login__card {
          width: clamp(320px, 28vw, 420px);
          padding: 2.5rem;
          border: 2px solid var(--af-gold-dark);
          border-radius: 12px;
          background: var(--af-input-bg);
          box-shadow: 0 0 40px rgba(139, 115, 50, .3), inset 0 0 20px rgba(0, 0, 0, .5);
          backdrop-filter: blur(5px);
          animation: af-fade-right 1s ease-out .5s both;
        }
        .af-login__field { margin-bottom: 1.5rem; }
        .af-login__label { display: block; margin-bottom: .5rem; font-size: 1rem; font-weight: 600; color: var(--af-text-cream); }
        .af-login__input {
          width: 100%;
          height: 45px;
          border: 1px solid var(--af-gold-dark);
          border-radius: 6px;
          padding: 0 1rem;
          color: var(--af-text-cream);
          font: inherit;
          background: rgba(0, 0, 0, .6);
          transition: all .3s ease;
        }
        .af-login__input::placeholder { color: #7a7a7a; }
        .af-login__input:focus { outline: none; border-color: var(--af-gold-highlight); box-shadow: 0 0 0 3px rgba(212, 175, 55, .24), 0 0 24px rgba(212, 175, 55, .7); background: rgba(0, 0, 0, .75); }
        .af-login__actions { display: flex; gap: 4%; margin-top: 2rem; }
        .af-login__button {
          position: relative;
          display: inline-flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: .5rem;
          height: 50px;
          overflow: hidden;
          border: 2px solid var(--af-gold-highlight);
          border-radius: 8px;
          color: var(--af-button-text);
          font: 700 1rem 'Noto Sans SC', sans-serif;
          cursor: pointer;
          background: linear-gradient(180deg, var(--af-gold-bright) 0%, var(--af-gold-dark) 100%);
          transition: all .3s ease;
        }
        .af-login__button::before { content: ''; position: absolute; width: 0; height: 0; border-radius: 50%; background: rgba(255, 255, 255, .2); transition: width .6s, height .6s; }
        .af-login__button:hover::before { width: 300px; height: 300px; }
        .af-login__button:hover { transform: scale(1.03); box-shadow: 0 0 20px rgba(212, 175, 55, .6); filter: brightness(1.2); }
        .af-login__button:active { transform: scale(.98); }
        .af-login__button > * { position: relative; z-index: 1; }
        .af-login__button-diamond { width: 16px; height: 16px; transition: filter .3s ease, transform .3s ease; }
        .af-login__button:hover .af-login__button-diamond { filter: drop-shadow(0 0 5px rgba(255, 239, 166, .95)); transform: scale(1.14); }
        .af-login__button:disabled { cursor: wait; opacity: .75; }
        .af-login__message { min-height: 1.2rem; margin-top: .8rem; color: #e0763c; font-size: .85rem; text-align: center; }
        .af-login__forgot { width: 100%; margin-top: 1rem; border: 0; color: #b8963c; font: inherit; font-size: .85rem; cursor: pointer; background: transparent; transition: color .3s ease; }
        .af-login__forgot:hover { color: #d4af37; }
        .af-login__welcome { text-align: center; }
        .af-login__welcome p { margin: 0 0 1.5rem; color: var(--af-text-muted); line-height: 1.7; }
        .af-login__footer { text-align: center; color: #666; font-size: .8rem; opacity: .5; animation: af-fade 1s ease-out 2s both; }
        .af-login__music-toggle {
          position: fixed;
          right: max(1.25rem, env(safe-area-inset-right));
          bottom: max(1.25rem, env(safe-area-inset-bottom));
          z-index: 2;
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border: 1px solid rgba(184, 150, 60, .72);
          border-radius: 50%;
          color: var(--af-gold-bright);
          cursor: pointer;
          background: rgba(5, 8, 18, .76);
          box-shadow: 0 0 14px rgba(0, 0, 0, .45);
          backdrop-filter: blur(6px);
          transition: color .25s ease, border-color .25s ease, box-shadow .25s ease, transform .25s ease;
        }
        .af-login__music-toggle:hover { color: #f1d777; border-color: var(--af-gold-highlight); box-shadow: 0 0 16px rgba(212, 175, 55, .48); transform: scale(1.07); }
        @keyframes af-rotate { to { transform: rotate(360deg); } }
        @keyframes af-fade-down { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes af-fade-left { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes af-fade-right { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes af-glow { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); text-shadow: 0 0 15px rgba(184, 150, 60, .5); } }
        @keyframes af-fade { from { opacity: 0; } to { opacity: .5; } }
        @media (max-width: 1200px) {
          .af-login__content { flex-direction: column; justify-content: center; gap: 2rem; }
          .af-login__story { max-width: 100%; text-align: center; }
          .af-login__card { width: 90%; max-width: 420px; }
        }
        @media (max-width: 768px) {
          .af-login { overflow: auto; }
          .af-login__container { min-height: 100svh; padding: 3vh 5vw; }
          .af-login__title-row { gap: 1rem; }
          .af-login__compass { width: 32px; height: 32px; }
          .af-login__story p { margin-bottom: 1rem; }
          .af-login__card { width: 95vw; max-width: 380px; padding: 1.5rem; }
          .af-login__actions { flex-direction: column; gap: 1rem; }
        }
      `}</style>

      <audio ref={musicRef} autoPlay loop preload="metadata">
        <source src="/aetherfall-assets/login-theme.mp3" type="audio/mpeg" />
      </audio>

      <div className={`af-login__background${backgroundLoaded ? " af-login__background--ready" : ""}`} aria-hidden="true">
        <picture>
          <source srcSet="/aetherfall-assets/bg-login.webp" type="image/webp" />
          <img src="/aetherfall-assets/bg-login.jpg" width="1920" height="1080" alt="" decoding="async" fetchPriority="high" onLoad={() => setBackgroundLoaded(true)} />
        </picture>
      </div>

      <div className="af-login__container">
        <header className="af-login__header">
          <div className="af-login__title-row">
            <img className="af-login__compass" src="/aetherfall-assets/compass-rose.svg" width="48" height="48" alt="" />
            <h1 className="af-login__title">裂隙纪元</h1>
            <img className="af-login__compass" src="/aetherfall-assets/compass-rose.svg" width="48" height="48" alt="" />
          </div>
          <p className="af-login__subtitle">AETHERFALL CHRONICLE</p>
          <div className="af-login__divider" aria-hidden="true"><img src="/aetherfall-assets/ornamental-divider.svg" width="200" height="4" alt="" /></div>
        </header>

        <div className="af-login__content">
          <section className="af-login__story" aria-label="世界引言">
            <p className="af-login__story-main">
              当天空裂开的那一刻，<br />
              你听到的不是雷鸣。<br />
              而是无数遗忘的人声。
            </p>
            <p className="af-login__story-secondary">
              七年了。那道裂隙仍在。边境的灯火仍在。<br />
              你选择留下。
            </p>
            <p className="af-login__story-highlight">现在，轮到你决定这个世界将成为什么。</p>
          </section>

          <section className="af-login__card" aria-label="账号登录">
            {loading ? (
              <div className="af-login__welcome"><Loader2 className="mx-auto animate-spin text-[#b8963c]" /><p className="mt-3">正在确认领主档案……</p></div>
            ) : isAuthenticated ? (
              <div className="af-login__welcome">
                <Sparkles className="mx-auto mb-3 text-[#b8963c]" />
                <p>欢迎归来，{user?.name ?? "领主"}。<br />灰隼堡仍在等候你的命令。</p>
                <button type="button" className="af-login__button" onClick={() => setLocation(user?.role === "admin" ? "/gm" : "/keep")}>
                  <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />
                  <span>进入领地</span>
                  <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="af-login__field">
                  <label className="af-login__label" htmlFor="landing-username">账号</label>
                  <input id="landing-username" className="af-login__input" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入账号" required />
                </div>
                <div className="af-login__field">
                  <label className="af-login__label" htmlFor="landing-password">密码</label>
                  <input id="landing-password" className="af-login__input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 4 位密码" required minLength={4} />
                </div>
                <div className="af-login__actions">
                  <button type="submit" className="af-login__button" disabled={login.isPending}>
                    <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />
                    <span>{login.isPending ? "验证中…" : "登录"}</span>
                    {login.isPending ? <Loader2 className="animate-spin" size={16} /> : <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />}
                  </button>
                  <button type="button" className="af-login__button" disabled={login.isPending} onClick={register}>
                    <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />
                    <span>注册</span>
                    <img className="af-login__button-diamond" src="/aetherfall-assets/button-diamond.svg" width="16" height="16" alt="" />
                  </button>
                </div>
                <div className="af-login__message" role="alert">{login.error?.message ?? ""}</div>
                <button type="button" className="af-login__forgot" onClick={() => toast.info("本地账号的首次登录即为注册；若忘记密码，请联系管理员重置。")}>忘记密码？</button>
              </form>
            )}
          </section>
        </div>

        <footer className="af-login__footer">v1.0 测试版 | 正式上线敬请期待</footer>
      </div>

      <button
        type="button"
        className="af-login__music-toggle"
        aria-label={isMusicPlaying && !isMuted ? "静音背景音乐" : !isMuted ? "音乐已开启，首次交互后自动播放" : "开启背景音乐"}
        aria-pressed={!isMuted}
        title={isMusicPlaying && !isMuted ? "静音背景音乐" : !isMuted ? "音乐已开启，首次交互后自动播放" : "开启背景音乐"}
        onClick={() => void toggleMusic()}
      >
        {!isMuted ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
      </button>
    </main>
  );
}
