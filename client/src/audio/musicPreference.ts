import { useCallback, useEffect, useState } from "react";

/** 所有游戏页面共用的背景音乐偏好，按浏览器缓存保存。 */
export const GAME_MUSIC_MUTED_STORAGE_KEY = "aetherfall:music-muted";
export const GAME_MUSIC_DEFAULT_VOLUME = 0.2;
const MUSIC_PREFERENCE_EVENT = "aetherfall:music-preference";

// 旧版本把每个区域的开关分别保存在本地。首次读取全局设置时，将任何已静音的旧区域迁移为全局静音。
const LEGACY_MUSIC_KEYS = [
  "aetherfall:keep-music-muted",
  "aetherfall:roster-music-muted",
  "aetherfall:recruit-music-muted",
  "aetherfall:world-music-muted",
  "aetherfall:battle-music-muted",
  "aetherfall:council-music-muted",
  "aetherfall:chronicle-music-muted",
] as const;

export function isMusicMuted() {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(GAME_MUSIC_MUTED_STORAGE_KEY);
    if (saved !== null) return saved === "true";
    const legacyMuted = LEGACY_MUSIC_KEYS.some((key) => window.localStorage.getItem(key) === "true");
    if (legacyMuted) window.localStorage.setItem(GAME_MUSIC_MUTED_STORAGE_KEY, "true");
    return legacyMuted;
  } catch {
    return false;
  }
}

export function setMusicMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GAME_MUSIC_MUTED_STORAGE_KEY, String(muted));
  } catch {
    // 本地存储不可用时，仍通知当前页面的音乐实例立即同步。
  }
  window.dispatchEvent(new CustomEvent<boolean>(MUSIC_PREFERENCE_EVENT, { detail: muted }));
}

/** 同步同一页面和其他浏览器标签中的全局音乐偏好。 */
export function useMusicMuted() {
  const [muted, setMuted] = useState(isMusicMuted);

  useEffect(() => {
    const updateFromCustomEvent = (event: Event) => setMuted(Boolean((event as CustomEvent<boolean>).detail));
    const updateFromStorage = (event: StorageEvent) => {
      if (event.key === GAME_MUSIC_MUTED_STORAGE_KEY) setMuted(event.newValue === "true");
    };
    window.addEventListener(MUSIC_PREFERENCE_EVENT, updateFromCustomEvent);
    window.addEventListener("storage", updateFromStorage);
    return () => {
      window.removeEventListener(MUSIC_PREFERENCE_EVENT, updateFromCustomEvent);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  const updateMuted = useCallback((nextMuted: boolean) => setMusicMuted(nextMuted), []);
  return [muted, updateMuted] as const;
}
