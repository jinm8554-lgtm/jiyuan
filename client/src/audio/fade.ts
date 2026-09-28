/** 平滑调整单个 HTML 音频元素的音量。 */
export function fade(
  audio: HTMLAudioElement,
  toVolume: number,
  durationMs: number,
  signal?: AbortSignal
): Promise<void> {
  const target = Math.min(1, Math.max(0, toVolume));
  const from = Math.min(1, Math.max(0, audio.volume));
  if (durationMs <= 0 || from === target) {
    audio.volume = target;
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let animationFrame = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(animationFrame);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    if (signal?.aborted) {
      finish();
      return;
    }
    const startedAt = performance.now();
    const frame = (now: number) => {
      if (signal?.aborted) {
        finish();
        return;
      }
      const progress = Math.min(1, (now - startedAt) / durationMs);
      audio.volume = from + (target - from) * progress;
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(frame);
      } else {
        finish();
      }
    };
    signal?.addEventListener("abort", finish, { once: true });
    animationFrame = window.requestAnimationFrame(frame);
  });
}
