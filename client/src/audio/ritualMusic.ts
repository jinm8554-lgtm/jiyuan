export const RITUAL_AUDIO_EVENT = "aetherfall:ritual-audio";

export type RitualAudioDetail = {
  active: boolean;
  handoff?: boolean;
};

export function publishRitualAudio(detail: RitualAudioDetail) {
  window.dispatchEvent(
    new CustomEvent<RitualAudioDetail>(RITUAL_AUDIO_EVENT, { detail })
  );
}
