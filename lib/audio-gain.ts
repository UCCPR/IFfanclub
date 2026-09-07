const fades = new WeakMap<HTMLMediaElement, number>();

export function cancelAudioFade(media: HTMLMediaElement) {
  const frame = fades.get(media);
  if (frame !== undefined) cancelAnimationFrame(frame);
  fades.delete(media);
}

export function fadeAudio(
  media: HTMLMediaElement,
  target: number,
  duration: number,
  pauseAtEnd = false,
) {
  cancelAudioFade(media);
  const from = media.volume;
  const started = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    media.volume = from + (target - from) * (1 - Math.cos(progress * Math.PI)) / 2;
    if (progress < 1) {
      fades.set(media, requestAnimationFrame(tick));
    } else {
      fades.delete(media);
      if (pauseAtEnd) media.pause();
    }
  };
  fades.set(media, requestAnimationFrame(tick));
}
