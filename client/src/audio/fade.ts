/** 平滑调整单个 HTML 音频元素的音量。 */
export function fade(
  audio: HTMLAudioElement,
  toVolume: number,
  durationMs: number
): Promise<void> {
  const target = Math.min(1, Math.max(0, toVolume));
  const from = Math.min(1, Math.max(0, audio.volume));
  if (durationMs <= 0 || from === target) {
    audio.volume = target;
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const startedAt = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      audio.volume = from + (target - from) * progress;
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };
    window.requestAnimationFrame(frame);
  });
}
