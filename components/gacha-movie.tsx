import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { uiAsset } from '@/components/game-card';
import { mediaUrl, syncPlayback } from '@/lib/gacha-media';

type Props = {
  /** Ordered list of media URLs to play in sequence. */
  sequence: string[];
  paused: boolean;
  muted: boolean;
  speed: number;
  onComplete: () => void;
  onPlaying: (playing: boolean) => void;
  onTime: (time: number) => void;
};

export function GachaMovie({
  sequence,
  paused,
  muted,
  speed,
  onComplete,
  onPlaying,
  onTime,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const [idx, setIdx] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [slow, setSlow] = useState(false);
  const playRequest = useRef(0);
  const startedSource = useRef('');

  const syncIntroBgm = useCallback(async (playing: boolean) => {
    const bgm = bgmRef.current;
    if (!bgm) return true;
    return syncPlayback(bgm, {
      paused: !playing || paused,
      muted,
      speed,
      volume: 0.52,
    });
  }, [muted, paused, speed]);

  const current = sequence[idx] ?? sequence[0];
  const poster =
    idx > 0 && /gacha_001_0[123]\.mp4$/.test(current)
      ? current.replace(/\.mp4$/, '.jpg')
      : uiAsset('black-frame');

  const startPlayback = useCallback(async (media: HTMLVideoElement) => {
    if (startedSource.current === current && !media.paused) return;
    const request = ++playRequest.current;
    startedSource.current = current;
    media.muted = muted;
    media.volume = 0.8;
    media.playbackRate = speed === 2 ? 2 : 1;
    if (paused) {
      media.pause();
      return;
    }
    try {
      await media.play();
      if (request === playRequest.current) setBlocked(false);
    } catch (error) {
      if (request !== playRequest.current) return;
      startedSource.current = '';
      // AbortError is produced when the keyed element/source changes. It must
      // not trigger a second, muted play request against the outgoing clip.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setBlocked(true);
      }
    }
  }, [current, muted, paused, speed]);
  const startPlaybackRef = useRef(startPlayback);
  startPlaybackRef.current = startPlayback;

  useEffect(() => {
    const media = ref.current;
    if (!media || !current) return;
    playRequest.current += 1;
    startedSource.current = '';
    setFailed(false);
    setWaiting(true);
    setSlow(false);
    media.pause();
    media.currentTime = 0;
    // Explicit load is required for a cached URL to emit a fresh readiness
    // cycle on every new draw, especially under React StrictMode.
    media.load();
    // Calling play also initiates fetching in browsers that ignore preload for
    // off-screen or recently inserted media. Waiting only for `canplay` can
    // otherwise deadlock at readyState 0.
    void startPlaybackRef.current(media);
    return () => {
      playRequest.current += 1;
      startedSource.current = '';
      media.pause();
    };
  }, [current]);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    bgm.pause();
    bgm.currentTime = 0;
    bgm.load();
    return () => {
      bgm.pause();
      bgm.currentTime = 0;
    };
  }, [sequence]);

  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    media.muted = muted;
    media.volume = 0.8;
    media.playbackRate = speed === 2 ? 2 : 1;
    if (paused) media.pause();
    else if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      void startPlayback(media);
  }, [paused, muted, speed, current, startPlayback]);

  useEffect(() => {
    if (!waiting || paused) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [waiting, paused]);

  function advance() {
    startedSource.current = '';
    if (idx + 1 >= sequence.length) {
      const bgm = bgmRef.current;
      if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
      }
    }
    if (idx + 1 < sequence.length) {
      setIdx(idx + 1);
      setWaiting(true);
      setSlow(false);
      return;
    }
    onComplete();
  }

  async function start() {
    const media = ref.current;
    if (!media) return;
    const [, bgmStarted] = await Promise.all([
      startPlayback(media),
      syncIntroBgm(true),
    ]);
    if (bgmStarted) setBlocked(false);
  }

  return (
    <div className="original-movie">
      {/* One continuous BGM spans the complete segmented intro. Video clips
          retain their embedded effects; the pool and reveal tracks stay off. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bgmRef} src={mediaUrl('introBgm')} preload="auto" loop />
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        key={current}
        ref={ref}
        src={current}
        poster={poster}
        preload="auto"
        playsInline
        aria-label="原版招募过场"
        aria-describedby="chase-description"
        onEnded={advance}
        onCanPlay={(event) => void startPlayback(event.currentTarget)}
        onPlaying={() => {
          setWaiting(false);
          setSlow(false);
          void syncIntroBgm(true).then((ok) => {
            if (!ok) setBlocked(true);
          });
          onPlaying(true);
        }}
        onPause={() => {
          void syncIntroBgm(false);
          onPlaying(false);
        }}
        onWaiting={() => {
          void syncIntroBgm(false);
          setWaiting(true);
          onPlaying(false);
        }}
        onTimeUpdate={(event) => onTime(event.currentTarget.currentTime)}
        onError={() => {
          void syncIntroBgm(false);
          setFailed(true);
          setWaiting(false);
          onPlaying(false);
        }}
      />
      <p id="chase-description" className="sr-only">
        招募过场动画。这段过场可跳过，不影响招募结果。
      </p>
      {(blocked || failed || slow) && (
        <output className="movie-message">
          <p>
            {failed
              ? '動画を再生できませんでした。'
              : blocked
                ? '点击播放原版过场（含声音）'
                : '视频加载较慢，可以跳过过场。'}
          </p>
          {blocked && !paused && !failed && (
            <Button onClick={() => void start()}>播放</Button>
          )}
          {(failed || slow || blocked) && (
            <Button variant="outline" onClick={onComplete}>
              跳过过场
            </Button>
          )}
        </output>
      )}
    </div>
  );
}
