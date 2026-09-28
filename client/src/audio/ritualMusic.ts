export const KEEP_MUSIC_STORAGE_KEY = "aetherfall:keep-music-muted";
export const KEEP_MUSIC_VOLUME = 0.2;
export const RITUAL_AUDIO_EVENT = "aetherfall:ritual-audio";

export type RitualAudioDetail = {
  active: boolean;
  handoff?: boolean;
};

export function isKeepMusicMuted() {
  try {
    return window.localStorage.getItem(KEEP_MUSIC_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function publishRitualAudio(detail: RitualAudioDetail) {
  window.dispatchEvent(
    new CustomEvent<RitualAudioDetail>(RITUAL_AUDIO_EVENT, { detail })
  );
}
