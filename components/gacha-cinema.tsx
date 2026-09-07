import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { CardArt, SealedCard, artAsset, uiAsset } from '@/components/game-card';
import { type Card, type Save, FES } from '@/lib/game';
import { GachaMovie } from '@/components/gacha-movie';
import {
  mediaUrl,
  playOriginalSe,
  syncPlayback,
  introSequence,
  playRevealVoice,
} from '@/lib/gacha-media';
import {
  cardTitle,
  gachaSkipAction,
  cinemaTransitionDuration,
  initialRarity,
  mutationFrame,
  resultRevealProgress,
  type CinemaTransition,
  rarityTone,
  revealCues,
  shotAt,
} from '@/lib/gacha-presentation';
import { cancelAudioFade, fadeAudio } from '@/lib/audio-gain';

type Props = {
  batch: Save;
  concealed: boolean;
  startIndex?: number;
  cards: ReadonlyMap<string, Card>;
  onReveal: (index: number | 'all') => Promise<unknown>;
  onClose: () => void;
  onAgain: () => void;
  /** Development-only, memory-backed reference review. Never reads a save. */
  reviewTime?: number;
  reviewControls?: ReactNode;
};
const styles = (values: Record<string, string | number>) =>
  values as CSSProperties;

function OriginalSparkles() {
  return (
    <div className="cinema-sparkles" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          style={styles({
            '--x': ((i * 37 + 11) % 100) + '%',
            '--y': ((i * 61 + 17) % 100) + '%',
            '--delay': -(i % 9) * 0.43 + 's',
            '--angle': i * 47 + 'deg',
            '--size': 3 + (i % 5) + 'px',
          })}
        >
          <img
            src={uiAsset(
              i % 5 === 0
                ? 'sparkle-gold'
                : i % 2
                  ? 'sparkle-white'
                  : 'sparkle-soft',
            )}
            alt=""
          />
        </span>
      ))}
    </div>
  );
}

function CraftedConfetti() {
  return (
    <div className="cinema-confetti" aria-hidden="true">
      {Array.from({ length: 80 }, (_, i) => (
        <span
          key={i}
          style={styles({
            '--x': ((i * 37 + 11) % 100) + '%',
            '--delay': -(i % 9) * 0.43 + 's',
            '--angle': i * 47 + 'deg',
            '--hue': i * 51,
            '--size': 3 + (i % 5) + 'px',
          })}
        />
      ))}
    </div>
  );
}

const RARE_LINE_BY_CARD: Readonly<Record<string, string>> = {
  '201030006': 'なぁに、ひょっとして私の\n浴衣姿に見惚れているのかしらぁ？',
};

function RarePrelude({ progress, line }: { progress: number; line?: string }) {
  return (
    <div className="rare-asset-prelude shared-rare-prelude" style={styles({ '--prelude': progress })} aria-hidden="true">
      <img className="shared-rare-field" src={uiAsset('rainbow-glow')} alt="" />
      <img className="shared-rare-rays" src={uiAsset('glow')} alt="" />
      <img className="shared-sphere-arrival" src={uiAsset('rainbow-glow')} alt="" />
      <div className="shared-rare-sphere">
        <img className="shared-sphere-color" src={uiAsset('rainbow-glow')} alt="" />
        <img className="shared-sphere-corona" src={uiAsset('glow')} alt="" />
        <img className="shared-sphere-core" src={uiAsset('rainbow-glow')} alt="" />
        {line && <p className="shared-sphere-line">{line}</p>}
      </div>
      {/* Original ef_tex_* textures recovered from the live build (v6.4.0) —
          these are the assets Unity's particle systems sample on the reveal
          frames. The .rare-orig-* CSS classes fade them in only while the
          3★ prelude / flash / reveal shots are active, and respect
          prefers-reduced-motion by clamping to static placements. */}
      <div className="rare-orig-effects" aria-hidden="true">
        <img className="rare-orig-aura" src={uiAsset('ef-tex-aura08')} alt="" />
        <img className="rare-orig-flash" src={uiAsset('ef-tex-flash03')} alt="" />
        <img className="rare-orig-glow" src={uiAsset('ef-tex-squareglow04')} alt="" />
        <img className="rare-orig-beam" src={uiAsset('ef-tex-beam16')} alt="" />
      </div>
      <OriginalSparkles />
    </div>
  );
}

function MutationTile({
  result,
  card,
  progress,
}: {
  result: Save['results'][number];
  card: Card;
  progress: number;
}) {
  const step = mutationFrame(result, card, progress);
  const initial = result.mystery ? initialRarity(result, card) : step.target - 1;
  const initialTone = rarityTone(initial);
  const finalTone = result.mystery ? 'black' : rarityTone(step.target);
  return (
    <span
      style={styles({ '--progress': step.progress })}
      className={
        'mutation-tile mutation-' +
        initial +
        '-' +
        step.target +
        (result.mystery ? ' is-black-frog' : '')
      }
    >
      <span className="mutation-before">
        <SealedCard result={result} card={card} forcedTone={initialTone} />
      </span>
      <span className="mutation-after">
        <SealedCard result={result} card={card} forcedTone={finalTone} />
      </span>
      <img className="mutation-rainbow" src={uiAsset('rainbow-glow')} alt="" />
      <img className="mutation-burst" src={uiAsset('glow')} alt="" />
      <OriginalSparkles />
    </span>
  );
}

export function GachaCinema({
  batch,
  concealed,
  startIndex,
  cards,
  onReveal,
  onClose,
  onAgain,
  reviewTime,
  reviewControls,
}: Props) {
  // The presentation is the product: OS motion preferences must not silently
  // remove the recorded movie chain. Users can still opt into the explicit
  // in-game "简化演出" control.
  const reducedOS = false;
  const [simple, setSimple] = useState(false);
  const reduced = reducedOS || simple;
  const [intro, setIntro] = useState(concealed && startIndex === undefined);
  const introVisible = intro && !reduced;
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [, setIntroPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sfxAudioRef = useRef<HTMLAudioElement>(null);
  const sfxStarted = useRef('');
  const introTime = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [seen, setSeen] = useState(() =>
    batch.results.map((r) => !concealed && r.revealed),
  );
  const [active, setActive] = useState<number | null>(startIndex ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [handoff, setHandoff] = useState<CinemaTransition | null>(null);
  const [handoffElapsed, setHandoffElapsed] = useState(0);
  const [unveiling, setUnveiling] = useState<number[]>([]);
  const [opening, setOpening] = useState<number | null>(null);
  const fesPreludeStarted = useRef('');
  const transitionLock = useRef(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const clock = useRef({ speed, paused });
  clock.current = { speed, paused };
  const result = active === null ? null : batch.results[active];
  const card = result ? cards.get(result.id)! : null;
  const movieSequence = useMemo(() => {
    let variant: 'normal' | 'rare' | 'fes' = 'normal';
    for (const r of batch.results) {
      if (r.mutation) continue; // mutations don't count
      const c = cards.get(r.id);
      if (!c || c.stars < 3) continue;
      if (c.limit === FES) {
        variant = 'fes';
        break;
      }
      variant = 'rare';
    }
    const sequence = introSequence(variant).map((k) =>
      mediaUrl(k as 'gacha00101'),
    );
    if (batch.results.some((r) => r.mystery)) {
      sequence.splice(1, 0, mediaUrl('blackGekota'));
    }
    return sequence;
  }, [batch.results, cards]);
  const cues = useMemo(
    () => (result && card ? revealCues(result, card, reduced) : []),
    [result, card, reduced],
  );
  const inspection = import.meta.env.DEV && reviewTime !== undefined;
  const frame = shotAt(cues, inspection ? reviewTime : elapsed);
  const shot = introVisible ? 'intro' : active === null ? 'board' : frame.shot;
  const rarePreludeVisible =
    active !== null &&
    card?.stars !== undefined &&
    card.stars >= 3 &&
    (shot === 'summon' || shot === 'tunnel' || shot === 'flash');
  const tone = card ? rarityTone(card.stars) : 'silver';
  const mutation = card && result && shot === 'charge' && !result.mystery
    ? mutationFrame(result, card, frame.progress) : null;
  const title = card ? cardTitle(card.name) : { name: '', title: '' };
  const remaining = seen.filter((value) => !value).length;
  const skipAction = gachaSkipAction(introVisible, active, remaining);
  const skipLabel =
    skipAction === 'intro'
      ? '跳过过场，返回图标页'
      : skipAction === 'card'
        ? '跳过当前角色演出，返回图标页'
        : '全部揭晓剩余角色';

  useEffect(() => {
    alive.current = true;
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    const audio = sfxAudioRef.current;
    if (!audio || !card || active === null || inspection) return;
    const startsNow =
      !!mutation ||
      (card.stars < 3 && shot === 'silhouette') ||
      (card.stars >= 3 && shot === 'summon');
    const key = active + ':' + (mutation ? 'mutation-' + mutation.index : card.stars >= 3 ? 'rare' : 'standard');
    if (!startsNow || sfxStarted.current === key) return;
    sfxStarted.current = key;
    audio.currentTime = 0;
    void syncPlayback(audio, {
      paused: muted || paused || hidden,
      muted,
      speed,
      volume: 0.82,
    }).then((ok) => {
      if (alive.current) setSoundBlocked(!ok);
    });
  }, [active, card, hidden, inspection, muted, paused, shot, speed, mutation]);

  useEffect(() => {
    if (muted || paused || hidden || inspection || active === null || card?.limit !== FES || shot !== 'summon') return;
    const key = String(active);
    if (fesPreludeStarted.current === key) return;
    fesPreludeStarted.current = key;
    playOriginalSe('originalSe0071', 0.78);
  }, [active, card, hidden, inspection, muted, paused, shot]);

  useEffect(() => {
    const audio = sfxAudioRef.current;
    if (!audio || !sfxStarted.current) return;
    if (muted || paused || hidden) {
      audio.pause();
    } else if (!audio.ended) {
      void audio.play().catch(() => {});
    }
  }, [muted, paused, hidden, speed]);

  useEffect(() => {
    if (active === null || inspection || handoff) return;
    let raf = 0,
      last = performance.now(),
      time = 0,
      published = -100;
    const total = cues.reduce((sum, cue) => sum + cue.duration, 0);
    function tick(now: number) {
      if (!clock.current.paused && !document.hidden)
        time += Math.min(now - last, 100) * clock.current.speed;
      last = now;
      if (time - published >= 30 || time >= total) {
        setElapsed(time);
        published = time;
      }
      if (time >= total && shotAt(cues, time).shot === 'complete') {
        setSeen((old) => old.map((value, i) => value || i === active));
        setActive(null);
      } else if (time < total) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, cues, inspection, handoff]);

  useEffect(() => {
    if (!handoff) return;
    let raf = 0,
      last = performance.now(),
      time = 0;
    const duration = cinemaTransitionDuration(handoff, unveiling.length);
    function tick(now: number) {
      if (reduced) time = duration;
      else if (!clock.current.paused && !document.hidden)
        time += Math.min(now - last, 100) * clock.current.speed;
      last = now;
      setHandoffElapsed(Math.min(time, duration));
      if (time >= duration) {
        if (handoff === 'intro') {
          setIntro(false);
          setIntroPlaying(false);
          introTime.current = 0;
        }
        if (handoff === 'card') setActive(null);
        transitionLock.current = false;
        setHandoff(null);
        setUnveiling([]);
      } else raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [handoff, reduced, unveiling.length]);

  useEffect(() => {
    if (reduced) setIntro(false);
  }, [reduced]);

  useEffect(() => {
    if (active === null) sfxStarted.current = '';
  }, [active]);

  // 3★ reveal voice — only triggers when the captured per-card voice matches.
  // Voice file is cached by GACHA_MEDIA, so subsequent reveals reuse the same
  // element. Mute / pause / hidden suppress playback.
  const voicePlayedFor = useRef('');
  useEffect(() => {
    if (!card || active === null || reduced || muted || paused || hidden) return;
    if (shot !== 'reveal') return;
    if (card.stars < 3) return;
    const tag = active + ':' + card.id;
    if (voicePlayedFor.current === tag) return;
    if (!playRevealVoice(card.id)) return;
    voicePlayedFor.current = tag;
  }, [shot, card, active, reduced, muted, paused, hidden]);
  useEffect(() => {
    if (active === null) voicePlayedFor.current = '';
  }, [active]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const shouldPause = muted || paused || hidden || introVisible;
    audio.muted = muted;
    audio.playbackRate = speed;
    if (shouldPause) {
      fadeAudio(audio, 0, 320, true);
      return;
    }
    if (audio.paused) audio.volume = 0;
    void audio.play().then(() => {
      setSoundBlocked(false);
      fadeAudio(audio, 0.24, 520);
    }).catch(() => setSoundBlocked(true));
  }, [introVisible, muted, paused, hidden, speed]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) return;
      cancelAudioFade(audio);
      audio.pause();
    };
  }, []);

  function syncIntroSound(time: number) {
    introTime.current = time;
  }

  function finishIntro() {
    if (transitionLock.current) return;
    setPaused(false);
    if (!reduced) {
      transitionLock.current = true;
      setHandoffElapsed(0);
      setHandoff('intro');
      return;
    }
    setIntro(false);
    setIntroPlaying(false);
    introTime.current = 0;
  }

  function toggleSound() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    setSoundBlocked(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = nextMuted;
    if (nextMuted) fadeAudio(audio, 0, 220, true);
    else if (!introVisible) {
      audio.volume = 0;
      void audio.play().then(() => fadeAudio(audio, 0.24, 420)).catch(() => setSoundBlocked(true));
    }
  }

  // Only prefetch this batch; never load the entire high-resolution card library.
  useEffect(() => {
    for (const r of batch.results) {
      const c = cards.get(r.id);
      if (c?.sourceImage) {
        const image = new Image();
        image.src = artAsset(c, true);
      }
    }
  }, [batch, cards]);

  async function openCard(index: number) {
    if (inFlight.current || transitionLock.current) return;
    if (!muted) playOriginalSe('originalSe0780', 0.82);
    setOpening(index);
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onReveal(index);
      if (!alive.current) return;
      await new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : 220));
      setElapsed(0);
      setPaused(false);
      setActive(index);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : '无法保存本次揭晓，请重试。');
    } finally {
      inFlight.current = false;
      if (alive.current) setOpening(null);
      if (alive.current) setPending(false);
    }
  }

  function finishCard() {
    if (active === null || transitionLock.current) return;
    setPaused(false);
    setSeen((old) => old.map((value, i) => value || i === active));
    if (reduced) setActive(null);
    else {
      transitionLock.current = true;
      setHandoffElapsed(0);
      setHandoff('card');
    }
  }

  function skipCurrentStage() {
    if (inFlight.current || transitionLock.current) return;
    if (skipAction === 'intro') finishIntro();
    else if (skipAction === 'card') finishCard();
    else if (skipAction === 'all') void skipAll();
  }

  async function skipAll() {
    if (inFlight.current || transitionLock.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onReveal('all');
      if (!alive.current) return;
      if (!reduced) {
        transitionLock.current = true;
        setUnveiling(seen.flatMap((value, i) => (value ? [] : [i])));
        setHandoffElapsed(0);
        setHandoff('all');
      }
      setSeen(batch.results.map(() => true));
      setActive(null);
      setPaused(false);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : '无法保存，请重试。');
    } finally {
      inFlight.current = false;
      if (alive.current) setPending(false);
    }
  }

  const plate =
    { 赤: 'red', 青: 'blue', 緑: 'green', 黄: 'yellow', 紫: 'purple' }[
      card?.attribute.replace('超', '') || ''
    ] || 'blue';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gacha-dialog" showCloseButton={false}>
        {import.meta.env.DEV && reviewControls}
        <header className="cinema-toolbar">
          <div>
            <DialogTitle>幻想收束 · 招募演出</DialogTitle>
          </div>
          <div className="cinema-options">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={!muted}
              disabled
              onClick={toggleSound}
            >
              {muted ? '声音：关' : '声音：开'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={simple || reducedOS}
              disabled
              onClick={() => setSimple((value) => !value)}
            >
              {reducedOS ? '系统减少动画' : simple ? '简化演出' : '完整演出'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              onClick={() => setSpeed((value) => (value === 1 ? 2 : 1))}
              aria-label={'演出速度 ' + speed + ' 倍，点击切换'}
            >
              {speed}×
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={paused}
              disabled
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? '继续' : '暂停'}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
        </header>
        <div
          className={
            'cinema-stage shot-' +
            shot +
            ' tone-' +
            tone +
            (reduced ? ' is-reduced' : '') +
            (handoff ? ' transition-' + handoff : '') +
            (inspection ? ' is-inspection' : '') +
            (card?.limit === FES ? ' is-fes' : '') +
            (rarePreludeVisible ? ' rare-preroll-active' : '')
          }
          style={styles({
            '--progress': frame.progress,
            '--play': paused || hidden ? 'paused' : 'running',
            '--rate': speed,
            '--handoff': handoff
              ? handoffElapsed /
                cinemaTransitionDuration(handoff, unveiling.length)
              : 1,
          })}
        >
          <img className="cinema-monitor" src={uiAsset('monitor')} alt="" />
          <div
            className="monitor-display"
            style={{ backgroundImage: `url(${uiAsset('screen-blue')})` }}
          >
            <div
              className="monitor-tap"
              hidden={
                !handoff &&
                shot !== 'board' &&
                shot !== 'charge' &&
                shot !== 'return'
              }
            >
              アイコンをTAP!
              <span className="monitor-tap-hand" aria-hidden="true">
                <img src={uiAsset('tap-hand')} alt="" />
                <img src={uiAsset('tap-hand-pressed')} alt="" />
              </span>
            </div>
          </div>
          {(!introVisible || handoff === 'intro') && (
            <div
              className={
                'cinema-board' +
                (batch.results.length === 1 ? ' single' : '') +
                (active !== null &&
                !handoff &&
                shot !== 'charge' &&
                shot !== 'return'
                  ? ' obscured'
                  : '')
              }
              aria-hidden={active !== null}
            >
              {batch.results.map((r, i) => (
                <Button
                  key={i}
                  className={
                    'cinema-slot' +
                    (opening === i ? ' opening-slot' : '') +
                    (active === i && shot === 'charge' ? ' charging-slot' : '')
                  }
                  variant="ghost"
                  disabled={
                    pending || active !== null || !!handoff || introVisible
                  }
                  style={styles({
                    '--entry-delay': i * 0.16 + 0.12 + 's',
                    '--result-mix':
                      handoff === 'all' && unveiling.includes(i)
                        ? resultRevealProgress(
                            handoffElapsed,
                            unveiling.indexOf(i),
                          )
                        : 1,
                  })}
                  onClick={() => void openCard(i)}
                  aria-label={
                    seen[i]
                      ? '重看 ' + cards.get(r.id)!.name
                      : '揭晓第 ' + (i + 1) + ' 位角色'
                  }
                >
                  {seen[i] || (active === i && shot === 'return') ? (
                    <>
                      {handoff === 'all' && unveiling.includes(i) && (
                        <div className="cinema-result-underlay">
                          <SealedCard
                            result={r}
                            card={cards.get(r.id)!}
                            presentation
                          />
                        </div>
                      )}
                      <div className="cinema-result">
                        <CardArt card={cards.get(r.id)!} resultCard />
                        {r.isNew && (
                          <img
                            className="cinema-new"
                            src={uiAsset('new')}
                            alt="NEW"
                          />
                        )}
                      </div>
                    </>
                  ) : active === i && shot === 'charge' ? (
                    <MutationTile result={r} card={cards.get(r.id)!} progress={frame.progress} />
                  ) : (
                    <SealedCard
                      result={r}
                      card={cards.get(r.id)!}
                      presentation
                    />
                  )}
                </Button>
              ))}
            </div>
          )}
          {introVisible && (
            <GachaMovie
              sequence={movieSequence}
              paused={paused || hidden}
              muted={muted}
              speed={speed}
              onComplete={finishIntro}
              onPlaying={setIntroPlaying}
              onTime={syncIntroSound}
            />
          )}
          {active !== null && result && card && (
            <div className="cinema-shot" key={active}>
              {rarePreludeVisible && (
                <RarePrelude
                  progress={shot === 'summon' ? frame.progress * 250 / 8250 : shot === 'tunnel' ? (250 + frame.progress * 8000) / 8250 : 1}
                  line={RARE_LINE_BY_CARD[card.id]}
                />
              )}
              {(shot === 'silhouette' ||
                shot === 'pan-near' ||
                shot === 'pan-far' ||
                shot === 'pan-wide' ||
                shot === 'return' ||
                shot === 'reveal' ||
                shot === 'flash') && (
                <div
                  className={
                    'character-scene ' +
                    (card.stars >= 3 ? 'rare-scene' : 'standard-scene')
                  }
                >
                  {card.stars >= 3 ? (
                    <>
                      <div className="rare-cameras" aria-label={card.name}>
                        <img
                          className="rare-scene-backdrop"
                          src={artAsset(card, true)}
                          alt=""
                        />
                        {['near', 'far', 'wide'].map((camera) => (
                          <div
                            key={camera}
                            className={'rare-camera camera-' + camera}
                          >
                            <img
                              className="rare-camera-art"
                              src={artAsset(card, true)}
                              alt=""
                            />
                          </div>
                        ))}
                        <img
                          className="rare-cutin-ribbon"
                          src={uiAsset('cutin-rainbow')}
                          alt=""
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="character-screen"
                        style={{
                          backgroundImage: `url(${uiAsset(card.stars === 2 ? 'screen-gold' : 'screen-gray')})`,
                        }}
                      />
                      <div className="character-ribbon-layers" aria-hidden="true">
                        <img
                          className="character-ribbon"
                          src={uiAsset(card.stars === 2 ? 'cutin-gold' : 'cutin-silver')}
                          alt=""
                        />
                      </div>
                      <img
                        className="character-portrait"
                        src={artAsset(card, true)}
                        alt={shot === 'reveal' ? card.name : ''}
                        onError={(event) => {
                          const img = event.currentTarget;
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = 'true';
                            img.src = artAsset(card);
                          }
                        }}
                      />
                      <div
                        className="character-ribbon-caption"
                        aria-hidden="true"
                      >
                        NEW CHARACTER! NEW CHARACTER! NEW CHARACTER! NEW
                        CHARACTER!
                      </div>
                    </>
                  )}
                  <div className="character-nameplate">
                    <img
                      className="character-type"
                      src={uiAsset('label-' + card.type)}
                      alt={card.type === 'battle' ? '战斗角色' : '辅助角色'}
                    />
                    <img
                      className="character-plate"
                      src={uiAsset('plate-' + plate)}
                      alt=""
                    />
                    <div className="character-name">
                      <small>{title.title}</small>
                      <strong>{title.name}</strong>
                    </div>
                    <div
                      className="character-stars"
                      aria-label={card.stars + '星'}
                    >
                      {Array.from({ length: card.stars }, (_, i) => (
                        <img
                          key={i}
                          src={uiAsset('star')}
                          alt=""
                          style={styles({
                            '--star-start':
                              (0.3 + i * 0.18) /
                              (card.stars >= 3 ? 4.2 : 1.8),
                            '--star-span':
                              0.38 / (card.stars >= 3 ? 4.2 : 1.8),
                          })}
                        />
                      ))}
                    </div>
                    {card.stars >= 3 && (
                      <img
                        className="character-rainbow"
                        src={uiAsset('cutin-rainbow')}
                        alt=""
                      />
                    )}
                  </div>
                  {card.stars >= 3 && <OriginalSparkles />}
                </div>
              )}
              {(shot === 'flash' || shot === 'summon') && (
                <div className="cinema-whiteout" aria-hidden="true" />
              )}
            </div>
          )}
          {!introVisible &&
            (active === null || card?.stars !== 3 || shot === 'charge') && (
              <CraftedConfetti />
            )}
          {mutation && (
            <div className={'mutation-screen target-' + mutation.target} style={styles({ '--phase': mutation.progress })} aria-hidden="true">
              <img className="mutation-screen-stars" src={uiAsset('ef-tex-aura15')} alt="" />
              <img className="mutation-screen-frame" src={uiAsset('ef-tex-squareglow04')} alt="" />
              <img className="mutation-screen-beam beam-a" src={uiAsset('ef-tex-beam16')} alt="" />
              <img className="mutation-screen-beam beam-b" src={uiAsset('ef-tex-beam16')} alt="" />
              <img className="mutation-screen-flash" src={uiAsset('ef-tex-flash03')} alt="" />
            </div>
          )}
          {skipAction && (
            <Button
              className="cinema-skip"
              variant="ghost"
              onClick={skipCurrentStage}
              disabled={pending || !!handoff}
              aria-label={skipLabel}
            >
              <img
                className="cinema-skip-base"
                src={uiAsset('skip-base')}
                alt=""
              />
              <img
                className="cinema-skip-label"
                src={uiAsset('skip-label')}
                alt=""
              />
            </Button>
          )}
          {!introVisible && active === null && (
            <div
              className="cinema-native-actions"
              style={styles({
                '--native-button': `url(${uiAsset('button-medium-blue')})`,
              })}
            >
              {remaining > 0 ? (
                <Button
                  disabled={pending || !!handoff}
                  onClick={() => void skipAll()}
                >
                  すべて開く
                </Button>
              ) : (
                <>
                  <Button
                    className="cinema-result-close"
                    style={styles({ '--native-button': `url(${uiAsset('button-medium-white')})` })}
                    disabled={!!handoff}
                    onClick={onClose}
                  >
                    閉じる
                  </Button>
                  <Button className="cinema-result-again" disabled={!!handoff} onClick={onAgain}>
                    もう一回引く
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {/* Reveal BGM begins only after the movie sequence. The movie keeps its
            own AAC track and must never be doubled by the result/reveal BGM. */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          key="reveal"
          ref={audioRef}
          src={mediaUrl('revealBgm')}
          preload="auto"
          loop
          muted={muted}
          onError={() => setSoundBlocked(true)}
        />
        {/* Original mixed reveal effects recovered from the supplied recording. */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          key={active === null ? 'none' : mutation ? 'mutation-' + mutation.index : 'reveal-sfx'}
          ref={sfxAudioRef}
          src={
            active === null
              ? undefined
              : mutation ? mediaUrl(mutation.target === 3 ? 'mutationGold' : 'mutation')
                : card && card.stars < 3 ? mediaUrl('originalSe0130') : mediaUrl('originalSe0135')
          }
          preload="auto"
          muted={muted}
          onError={() => setSoundBlocked(true)}
        />
        {soundBlocked && !muted && (
          <output className="cinema-error">
            音频未能播放，可关闭后重新开启声音；无声状态下仍可继续演出。
          </output>
        )}
        {error && (
          <p role="alert" className="cinema-error">
            {error}
          </p>
        )}
        <footer className="cinema-footer">
          <p aria-live="polite">
            {handoff
              ? '画面切り替え中…'
              : pending
                ? '処理中…'
                : introVisible
                  ? 'ガチャ演出中'
                  : active === null
                    ? remaining
                      ? 'アイコンをタップしてください　あと' + remaining + '人'
                      : 'すべてのキャラクターを獲得しました'
                    : shot === 'reveal'
                      ? card?.name
                      : 'キャラクター演出中'}
          </p>
          <div>
            {introVisible && (
              <Button
                variant="outline"
                disabled={!!handoff}
                onClick={finishIntro}
              >
                スキップ
              </Button>
            )}
            {active !== null && (
              <Button
                variant="outline"
                disabled={!!handoff}
                onClick={finishCard}
              >
                アイコン一覧へ
              </Button>
            )}
            {active !== null && shot !== 'reveal' && (
              <Button
                disabled={!!handoff}
                onClick={() => {
                  finishCard();
                }}
              >
                スキップ
              </Button>
            )}

            {!introVisible && active === null && remaining > 0 && (
              <Button
                disabled={pending || !!handoff}
                onClick={() => void skipAll()}
              >
                すべて開く
              </Button>
            )}
            {remaining === 0 && active === null && (
              <Button disabled={!!handoff} onClick={onClose}>
                閉じる
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
