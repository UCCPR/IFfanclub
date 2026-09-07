'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Sparkles,
  Library,
  Users,
  HardDrive,
  Diamond,
  Gift,
  Download,
  Upload,
  RefreshCw,
  Search,
  PackageOpen,
  Check,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import rawCards from '@/lib/cards.json';
import { CardArt, SealedCard, uiAsset, artAsset } from '@/components/game-card';
import './pool-stage.css';
import { GachaCinema } from '@/components/gacha-cinema';
import { mediaUrl, playSfx } from '@/lib/gacha-media';
import { POOLS, getPool, nextPool, prevPool } from '@/lib/pools';
import { assertBatch, batchKey } from '@/lib/gacha-presentation';
import {
  COST,
  FES,
  PERIOD,
  MAX_SAVE_BYTES,
  SAVE_KEY,
  checkIn,
  draw,
  localDay,
  newSave,
  parseSave,
  reveal,
  supply,
  toggleTeam,
  type Card,
  type Save,
} from '@/lib/game';
import { useGame } from '@/hooks/use-game';
import { registerGameTools, type Context } from '@/lib/webmcp';

const POOL_WIDTH = 960;

function FixedPoolStage({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () => setScale(node.clientWidth / POOL_WIDTH);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="pool-fixed-viewport" ref={viewport}>
      <div className="pool-fixed-canvas" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

const cards = rawCards as Card[];
const byId = new Map(cards.map((c) => [c.id, c]));
const typeName = (card: Card) => (card.type === 'battle' ? '战斗' : '辅助');
const limitName = (card: Card) =>
  card.limit === FES
    ? 'FES 限定'
    : card.limit === PERIOD
      ? '期间限定'
      : card.limit === '恒常'
        ? '常驻'
        : '其他限定';
const nf = (n: number) => n.toLocaleString('zh-CN');
type View = 'recruit' | 'collection' | 'team' | 'save';
const menus = [
  { id: 'recruit' as View, name: '角色招募', icon: Sparkles },
  { id: 'collection' as View, name: '我的卡册', icon: Library },
  { id: 'team' as View, name: '队伍编成', icon: Users },
  { id: 'save' as View, name: '本地存档', icon: HardDrive },
];
const headings = {
  recruit: [
    'CHARACTER RECRUITMENT',
    '让可能性，在此交汇。',
    '收集熟悉的身影，开始你的幻想之旅。',
  ],
  collection: [
    'CHARACTER ARCHIVE',
    '每次相遇，都有迹可循。',
    '浏览全部卡池，寻找你收集的角色。',
  ],
  team: [
    'TEAM FORMATION',
    '属于你的，最强阵容。',
    '6 位战斗角色，6 位辅助角色，自由编成。',
  ],
  save: [
    'LOCAL MEMORY',
    '把这段旅程，好好保存。',
    '存档只在当前浏览器，不会上传到服务器。',
  ],
};

function CardTile({
  card,
  count,
  onClick,
  children,
}: {
  card: Card;
  count?: number;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <article className={'card-tile ' + (count === 0 ? 'unowned' : '')}>
      <button
        className="card-inspect"
        onClick={onClick}
        aria-label={'查看 ' + card.name}
      >
        <CardArt card={card} />
        <div className="card-copy">
          <span className={card.limit === FES ? 'fes-label' : 'card-label'}>
            {limitName(card)} · {card.attribute}
          </span>
          <h3>{card.name}</h3>
        </div>
      </button>
      <div className="card-bottom">
        <span>
          {count === undefined
            ? typeName(card)
            : count
              ? '持有 ×' + count
              : '尚未获得'}
        </span>
        {children}
      </div>
    </article>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Sparkles />
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function OriginalDrawButton({
  tone = 'blue',
  count,
  label = 'ガチャる',
  cost,
  disabled,
  onClick,
}: {
  tone?: 'blue' | 'pink';
  count: number;
  label?: string;
  cost: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={'original-draw-button ' + tone}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${count} 次招募，消耗 ${nf(cost)} 呱太`}
    >
      <img src={uiAsset(tone === 'pink' ? 'draw-pink' : 'draw-blue')} alt="" />
      <img className="draw-overlay" src={uiAsset('draw-overlay')} alt="" />
      <span className="draw-count">{count}回</span>
      <span className="draw-label">{label}</span>
      <span className="draw-cost">
        <img src={uiAsset(tone === 'pink' ? 'silver-frog' : 'ticket')} alt="" />
        {nf(cost)}
      </span>
    </button>
  );
}
function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const { save, ready, problem, busy, commit } = useGame(cards);
  const [view, setView] = useState<View>('recruit');
  const [poolId, setPoolId] = useState(POOLS[0].id);
  const currentPool = getPool(poolId);
  const [lineupOpen, setLineupOpen] = useState(false);
  const poolCards = useMemo(() => cards.filter((card) =>
    poolId === 'period-pickup' ? card.limit === PERIOD :
    poolId === 'fes-festival' ? card.limit === FES : card.stars === 3
  ), [poolId]);
  const featuredCards = useMemo(
    () =>
      currentPool.featured
        ?.map((id) => byId.get(id))
        .filter((card): card is Card => !!card) ?? poolCards.slice(0, 1),
    [currentPool.featured, poolCards],
  );
  const poolGesture = useRef<number | null>(null);
  const poolAudioRef = useRef<HTMLAudioElement>(null);
  const [poolMediaReady, setPoolMediaReady] = useState(false);
  const mode = currentPool.mode;
  const [notice, setNotice] = useState('');
  const [details, setDetails] = useState<Card | null>(null);
  const [rules, setRules] = useState(false);
  const [cinema, setCinema] = useState<{
    batch: Save;
    concealed: boolean;
    startIndex?: number;
  } | null>(null);
  const [recruitLoading, setRecruitLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('all');
  const [kind, setKind] = useState('all');
  const [ownership, setOwnership] = useState('owned');
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<{
    stage?: 'pick' | 'confirm';
    count?: 1 | 10;
    cost?: number;
    drawMode?: 'normal' | 'box';
    title: string;
    body: string;
    action: () => Promise<void>;
  } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stateRef = useRef(save);
  useEffect(() => {
    stateRef.current = save;
  }, [save]);
  const disabled = !ready || !!problem || busy;
  useEffect(() => {
    const revealMedia = () => setPoolMediaReady(true);
    if (document.readyState === 'complete') {
      const timer = window.setTimeout(revealMedia, 250);
      return () => window.clearTimeout(timer);
    }
    window.addEventListener('load', revealMedia, { once: true });
    return () => window.removeEventListener('load', revealMedia);
  }, []);
  useEffect(() => {
    const audio = poolAudioRef.current;
    if (!audio) return;
    const active = poolMediaReady && view === 'recruit' && !cinema;
    if (!active) {
      audio.pause();
      return;
    }
    audio.volume = 0.22;
    const play = () => void audio.play().catch(() => {});
    play();
    window.addEventListener('pointerdown', play, { once: true });
    return () => window.removeEventListener('pointerdown', play);
  }, [view, cinema, poolMediaReady]);
  const originalNav = [
    { label: '首页', target: 'recruit' as View },
    { label: '角色', target: 'collection' as View },
    { label: '任务', target: 'team' as View },
    { label: '卡池', target: 'recruit' as View },
    { label: '商店', target: 'save' as View },
    { label: '菜单', target: null },
  ];
  const unopened = save.results.filter((r) => !r.revealed).length;
  const unique = Object.keys(save.collection).length;
  const threes = cards.reduce(
    (n, c) => n + (c.stars === 3 ? save.collection[c.id] || 0 : 0),
    0,
  );
  const filtered = useMemo(
    () =>
      cards
        .filter(
          (c) =>
            (view === 'team' || ownership === 'owned'
              ? !!save.collection[c.id]
              : true) &&
            (rarity === 'all' || c.stars === Number(rarity)) &&
            (kind === 'all' || c.type === kind) &&
            (c.name
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()) ||
              c.id.includes(query.trim())),
        )
        .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id)),
    [view, ownership, rarity, kind, query, save.collection],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pageCount);
  const visibleCards = filtered.slice((currentPage - 1) * 24, currentPage * 24);

  async function run(action: (s: Save) => Save, message = '') {
    try {
      const next = await commit(action);
      stateRef.current = next;
      setNotice(message);
      return next;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : '保存失败，请检查浏览器存储权限或空间',
      );
      throw error;
    }
  }
  function act(action: (s: Save) => Save, message = '') {
    void run(action, message).catch(() => {});
  }
  function navigate(next: View) {
    setView(next);
    setPage(1);
    setNotice('');
  }
  function recruit(count: number, drawMode: 'normal' | 'box') {
    return run(
      (s) => draw(s, count, drawMode, cards, currentPool),
      '',
    ).then((next) => {
      // The native recording cuts directly into the full-screen presentation.
      // A web status toast over the movie breaks both framing and timing.
      setNotice('');
      setRecruitLoading(true);
      setTimeout(() => {
        setRecruitLoading(false);
        setCinema({ batch: next, concealed: true });
      }, 650);
      return next;
    });
  }
  function requestRecruit(count: 1 | 10, drawMode: 'normal' | 'box') {
    const cost = COST * count;
    setConfirmation({
      stage: 'pick',
      count,
      cost,
      drawMode,
      title:
        drawMode === 'box' ? `${currentPool.name}ガチャ` : `${currentPool.name}ガチャ 第1弾`,
      body: `${nf(cost)} 呱太を使用します。所持数：${nf(save.balance)}`,
      action: async () => {
        await recruit(count, drawMode);
      },
    });
  }

  async function openBox(index: number) {
    const expected = batchKey(save);
    playSfx('open');
    try {
      const next = await run((s) => {
        assertBatch(s, expected);
        return reveal(s, index);
      });
      setCinema({ batch: next, concealed: false, startIndex: index });
    } catch {
      /* run already reports a readable storage error. */
    }
  }

  const actionsRef = useRef({
    read: () => save,
    draw: recruit,
    reveal: () => run((s) => reveal(s, 'all')),
  });
  useEffect(() => {
    actionsRef.current = {
      read: () => stateRef.current,
      draw: async (count, nextMode) => {
        setView('recruit');
        setPoolId(nextMode === 'box' ? 'mystery-box' : 'fes-festival');
        return recruit(count, nextMode);
      },
      reveal: async () => {
        setCinema(null);
        setView('recruit');
        return run((s) => reveal(s, 'all'), '全部盲盒已开启。');
      },
    };
  });
  useEffect(() => {
    if (!ready || problem) return;
    return registerGameTools(
      (document as Document & { modelContext?: Context }).modelContext,
      {
        read: () => actionsRef.current.read(),
        draw: (count, nextMode) => actionsRef.current.draw(count, nextMode),
        reveal: () => actionsRef.current.reveal(),
      },
    );
  }, [ready, problem]);

  async function requestImport(file: File) {
    setReadingFile(true);
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('存档过大（最多 2 MB）');
      const imported = parseSave(await file.text(), cards);
      const expected = localStorage.getItem(SAVE_KEY);
      setConfirmation({
        title: '导入并替换当前存档？',
        body:
          '该存档有 ' +
          nf(imported.draws) +
          ' 次招募、' +
          Object.keys(imported.collection).length +
          ' 张已收集卡牌。当前进度会被替换，建议先导出备份。',
        action: async () => {
          const next = await commit(() => imported, { expected });
          stateRef.current = next;
          setNotice('存档导入成功。');
        },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取存档文件');
    } finally {
      setReadingFile(false);
    }
  }
  function requestReset() {
    try {
      const expected = localStorage.getItem(SAVE_KEY);
      setConfirmation({
        title: '开始一段全新的旅程？',
        body: '将清空当前浏览器中的试玩卡册、队伍和招募记录，并恢复初始 30,000 呱太。此操作不会影响 QQ 机器人存档，清空后仅能从导出的备份恢复。',
        action: async () => {
          const next = await commit(newSave, { expected });
          stateRef.current = next;
          setNotice('已重置试玩存档。');
        },
      });
    } catch {
      setNotice('无法访问浏览器存储，请允许本地存储后重试。');
    }
  }
  function exportSave(raw = false) {
    try {
      const text = raw
        ? localStorage.getItem(SAVE_KEY)
        : JSON.stringify(save, null, 2);
      if (text === null) throw new Error('没有可导出的原始存档');
      download(
        text,
        'ifbot-pages-' + (raw ? 'recovery-' : '') + localDay() + '.json',
      );
      setNotice('已生成存档下载，请保管好文件。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '存档导出失败');
    }
  }

  return (
    <div className={'app-shell ' + (view === 'recruit' ? 'gacha-home' : '')}>
      {/* Background music has no spoken content that requires captions. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={poolAudioRef} src={mediaUrl('originalBgm')} preload="none" loop />
      <header className="topbar">
        {view === 'recruit' ? (
          // The original top status bar now lives inside `.original-pool`
          // so it can be positioned against the 16:9 stage instead of the
          // page-level flex header. The page-level bar is intentionally
          // empty in this view.
          <span className="sr-only">原版顶部状态栏由卡池舞台承载</span>
        ) : (
          <>
            <button
              className="brand"
              onClick={() => navigate('recruit')}
              aria-label="回到角色招募"
            >
              <span className="brand-mark">IF</span>
              <span>
                TOARU<span className="brand-sub">幻想收束 · 单机试玩</span>
              </span>
            </button>
            <span className="local-tag">
              <i /> LOCAL PLAY
            </span>
          </>
        )}
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">ACADEMY CITY / 01</div>
          <nav aria-label="游戏导航">
            {view === 'recruit' ? (
              <div className="original-global-nav">
                {originalNav.map(({ label, target }, index) => {
                  const active = index === 3;
                  return (
                    <div className="original-global-cell" key={label}>
                      {index > 0 && (
                        <img className="global-entry-separator" src={uiAsset('global-separator')} alt="" />
                      )}
                    <button
                      className={'original-global-entry ' + (active ? 'active' : '')}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        playSfx('click');
                        if (target) navigate(target);
                        else setNotice('菜单功能将在后续版本开放。');
                      }}
                    >
                      <img
                        className="global-entry-base"
                        src={uiAsset('global-base')}
                        alt=""
                      />
                      <img
                        className="global-entry-icon"
                        src={uiAsset(
                          'global-icon-' + index + '-' + (active ? 'on' : 'off'),
                        )}
                        alt=""
                      />
                      <img
                        className="global-entry-label"
                        src={uiAsset('global-label-' + index)}
                        alt=""
                      />
                      {active && (
                        <img
                          className="global-entry-badge"
                          src={uiAsset('global-badge')}
                          alt="イベント開催中"
                        />
                      )}
                    </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              menus.map(({ id, name, icon: Icon }) => (
                <Button
                  key={id}
                  variant="ghost"
                  className={'nav-item ' + (view === id ? 'active' : '')}
                  aria-current={view === id ? 'page' : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon /> {name}
                </Button>
              ))
            )}
          </nav>
          <p className="sidebar-note">
            一个人的学园都市。
            <br />
            你的每次相遇，都留在这里。
            <br />
            <a
              href="https://github.com/UCCPR/IFfanclub"
              target="_blank"
              rel="noreferrer"
            >
              项目源码 ↗
            </a>
          </p>
        </aside>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{headings[view][0]}</p>
              <h1>{headings[view][1]}</h1>
              <p className="muted">{headings[view][2]}</p>
            </div>
            <div className="wallet">
              <Diamond />
              <span>
                <small>持有呱太</small>
                <strong>{ready ? nf(save.balance) : '—'}</strong>
              </span>
            </div>
          </div>
          {problem && (
            <div className="error-banner" role="alert">
              {problem}
              <Button variant="outline" onClick={() => navigate('save')}>
                恢复存档
              </Button>
            </div>
          )}
          {notice && (
            <output className="notice">
              <span>{notice}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="关闭提示"
                onClick={() => setNotice('')}
              >
                <X />
              </Button>
            </output>
          )}
          {!ready && <output>正在读取本地存档…</output>}

          {view === 'recruit' && (
            <>
              <FixedPoolStage>
              <section className={'original-pool mode-' + mode + ' accent-' + currentPool.accent}
                style={{ '--pool-backdrop': `url(${uiAsset('backdrop')})`, '--pool-badge': `url(${uiAsset('badge-pill')})`, '--pool-badge-large': `url(${uiAsset('badge-pill-large')})` } as React.CSSProperties}
                onPointerDown={(event) => { poolGesture.current = event.clientX; }}
                onPointerUp={(event) => {
                  const start = poolGesture.current;
                  poolGesture.current = null;
                  if (start !== null && Math.abs(event.clientX - start) > 80) {
                    setPoolId(event.clientX < start ? nextPool(poolId).id : prevPool(poolId).id);
                  }
                }}
                onPointerCancel={() => { poolGesture.current = null; }}
              >
                <div className="pool-stage-top" aria-label="原版顶部状态栏">
                  <button
                    type="button"
                    className="pool-stage-back"
                    onClick={() => {
                      playSfx('click');
                      navigate('recruit');
                    }}
                    aria-label="返回主页"
                  >
                    <img src={uiAsset('header-back')} alt="" />
                  </button>
                  <div className="pool-stage-title">
                    <span className="pool-stage-title-text">ガチャ</span>
                    <button
                      type="button"
                      className="pool-stage-help"
                      onClick={() => {
                        playSfx('click');
                        setRules(true);
                      }}
                      aria-label="帮助"
                    >
                      <img src={uiAsset('header-help')} alt="?" />
                    </button>
                  </div>
                  <div className="pool-stage-plv">
                    <img
                      className="pool-stage-plv-base"
                      src={uiAsset('header-base')}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="pool-stage-plv-text">
                      <img src={uiAsset('header-plv')} alt="PLv." />005
                    </span>
                  </div>
                  <div className="pool-stage-gauge stamina">
                    <img className="pool-stage-gauge-base" src={uiAsset('header-gauge-base')} alt="" aria-hidden="true" />
                    <img
                      className="pool-stage-gauge-fill"
                      src={uiAsset('header-gauge-fill-orange')}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="pool-stage-gauge-label">AP</span>
                    <span className="pool-stage-gauge-value">984/157</span>
                    <button
                      type="button"
                      className="pool-stage-gauge-add"
                      onClick={() => {
                        playSfx('click');
                        act(supply, '已领取 30,000 呱太试玩补给。');
                      }}
                      aria-label="补充 AP"
                    >
                      <img src={uiAsset('header-add')} alt="" />
                    </button>
                  </div>
                  <div className="pool-stage-gauge coins">
                    <img className="pool-stage-gauge-base" src={uiAsset('header-gauge-base')} alt="" aria-hidden="true" />
                    <img
                      className="pool-stage-gauge-fill"
                      src={uiAsset('header-gauge-fill-orange')}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="pool-stage-gauge-label">G</span>
                    <span className="pool-stage-gauge-value">999999999</span>
                  </div>
                  <div className="pool-stage-gauge gems">
                    <img className="pool-stage-gauge-base" src={uiAsset('header-gauge-base')} alt="" aria-hidden="true" />
                    <img
                      className="pool-stage-gauge-fill"
                      src={uiAsset('header-gauge-fill-orange')}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="pool-stage-gauge-label">◆</span>
                    <span className="pool-stage-gauge-value">
                      {ready ? nf(save.balance) : '—'}
                    </span>
                    <button
                      type="button"
                      className="pool-stage-gauge-add"
                      onClick={() => {
                        playSfx('click');
                        act(supply, '已领取 30,000 呱太试玩补给。');
                      }}
                      aria-label="领取 30,000 呱太试玩补给"
                    >
                      <img src={uiAsset('header-add')} alt="" />
                    </button>
                  </div>
                  <div className="pool-stage-battery" aria-hidden="true">
                    <img
                      className="pool-stage-battery-base"
                      src={uiAsset('header-battery-base')}
                      alt=""
                    />
                    <img
                      className="pool-stage-battery-fill"
                      src={uiAsset('header-battery-fill-3')}
                      alt=""
                    />
                    <span className="pool-stage-battery-text">85%</span>
                  </div>
                </div>
                <div className="pool-stage-art">
                  <span className="sr-only">幻想祭宴卡池演出</span>
                  {/* The recovered pool movie supplies the original animated
                      UP-character half. Its embedded audio stays muted because
                      the pool page owns the original looping BGM separately. */}
                  {poolMediaReady && (
                    <video
                      className="pool-stage-motion"
                      src={mediaUrl('poolLoop')}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      aria-label="UP角色动态主视觉"
                    />
                  )}
                  <div className="pool-featured-art" key={poolId}>
                    {featuredCards.map((card, index) => (
                      <img key={card.id} src={artAsset(card, true)} alt={card.name}
                        fetchPriority={index === 0 ? 'high' : 'auto'}
                        className={'pool-featured-character character-' + index} />
                    ))}
                  </div>
                  <img
                    className="pool-stage-deco pool-stage-deco-tall"
                    src={uiAsset('deco-tall')}
                    alt=""
                    aria-hidden="true"
                  />
                  <img
                    className="pool-stage-deco pool-stage-deco-short"
                    src={uiAsset('deco-short')}
                    alt=""
                    aria-hidden="true"
                  />
                  <img
                    className="pool-stage-hige"
                    src={uiAsset('effect-hige')}
                    alt=""
                    aria-hidden="true"
                  />
                  <img
                    className="pool-original-logo"
                    src={uiAsset('pool-logo')}
                    alt=""
                  />
                  <img
                    className="pool-original-promotion"
                    src={uiAsset('pool-promotion')}
                    alt=""
                  />
                  <div className="pool-vertical-copy">
                    {currentPool.accent === 'fes'
                      ? '「最強と最弱」一方通行＆上条当麻'
                      : currentPool.accent === 'box'
                        ? '謎めく出会い 未知の驚き'
                        : '期間限定キャラクター登場'}
                    <b>
                      {currentPool.accent === 'fes'
                        ? '確率 UP!'
                        : currentPool.accent === 'box'
                          ? 'シークレットBOX'
                          : 'Pick Up!'}
                    </b>
                  </div>
                </div>
                <button
                  className="pool-arrow previous"
                  onClick={() => {
                    playSfx('switch');
                    setPoolId(prevPool(poolId).id);
                  }}
                  aria-label="上一卡池"
                >
                  <img
                    className="pool-arrow-base"
                    src={uiAsset('pool-arrow-left')}
                    alt=""
                  />
                  <img
                    className="pool-arrow-on"
                    src={uiAsset('pool-arrow-left-on')}
                    alt=""
                  />
                </button>
                <button
                  className="pool-arrow next"
                  onClick={() => {
                    playSfx('switch');
                    setPoolId(nextPool(poolId).id);
                  }}
                  aria-label="下一卡池"
                >
                  <img
                    className="pool-arrow-base"
                    src={uiAsset('pool-arrow-right')}
                    alt=""
                  />
                  <img
                    className="pool-arrow-on"
                    src={uiAsset('pool-arrow-right-on')}
                    alt=""
                  />
                </button>
                <div className="pool-interface">
                  <div className="pool-logo">
                    <small>{currentPool.accent === 'fes' ? '大感谢' : currentPool.accent === 'box' ? '特别企划' : '期间限定'}</small>
                    <strong>
                      {currentPool.name}
                    </strong>
                    <span>{currentPool.subtitle}</span>
                  </div>
                  <p
                    className="pool-period"
                    style={{
                      backgroundImage: `url(${uiAsset('period-bg')})`,
                      backgroundSize: '100% 100%',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    <span className="pool-period-text">
                      {currentPool.period}
                    </span>
                  </p>
                  <button
                    className="pool-details"
                    onClick={() => {
                      playSfx('click');
                      setRules(true);
                    }}
                    style={{
                      backgroundImage: `url(${uiAsset('info-btn-base')})`,
                      backgroundSize: '100% 100%',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    <img
                      className="pool-details-icon"
                      src={uiAsset('info-btn-line')}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="pool-details-text">
                      ガチャ詳細 / 提供割合
                    </span>
                  </button>
                  <div className="pool-draw-actions">
                    <div className="pool-draw-slot daily-draw">
                      <span className="pool-balloon bonus">
                        <img
                          className="pool-balloon-bonus"
                          src={uiAsset('badge-bonus-text')}
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="pool-balloon-text">
                          毎日4時にリセット
                        </span>
                      </span>
                      <OriginalDrawButton
                        tone="pink"
                        count={1}
                        label="有償限定"
                        cost={110}
                        disabled
                        onClick={() => {
                          playSfx('confirm');
                          requestRecruit(1, mode);
                        }}
                      />
                      <em>本日限定　残り0回</em>
                    </div>
                    <div className="pool-draw-slot">
                      <span className="pool-balloon">
                        <span className="pool-balloon-text">
                          無償 {nf(COST)}
                        </span>
                      </span>
                      <OriginalDrawButton
                        count={1}
                        cost={COST}
                        disabled={disabled || unopened > 0 || save.balance < COST}
                        onClick={() => {
                          playSfx('confirm');
                          requestRecruit(1, mode);
                        }}
                      />
                      <em>1回招募</em>
                    </div>
                    <div className="pool-draw-slot ten-draw">
                      <span className="pool-balloon large">
                        <img
                          className="pool-balloon-tail"
                          src={uiAsset('badge-pill-tail')}
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="pool-balloon-text">
                          10回ガチャ
                        </span>
                      </span>
                      <OriginalDrawButton
                        count={10}
                        cost={COST * 10}
                        disabled={
                          disabled || unopened > 0 || save.balance < COST * 10
                        }
                        onClick={() => {
                          playSfx('confirm');
                          requestRecruit(10, mode);
                        }}
                      />
                      <em>10回招募</em>
                    </div>
                  </div>
                  <div className="pool-wallet-strip">
                    <span>
                      無償 <b>{nf(save.balance)}</b>
                    </span>
                    <span>
                      有償 <b>0</b>
                    </span>
                    <span>
                      所持券 <b>0</b>
                    </span>
                  </div>
                  <div className="pool-pity">
                    <span>FES 保底</span>
                    <Progress
                      value={(save.pity / 150) * 100}
                      aria-label="FES 保底进度"
                    />
                    <b>{save.pity} / 150</b>
                  </div>
                  <button
                    className="pool-lineup"
                    onClick={() => {
                      playSfx('click');
                      setLineupOpen(true);
                    }}
                  >
                    <img src={uiAsset('lineup-base')} alt="" />
                    <img src={uiAsset('lineup-overlay')} alt="" />
                    <i aria-hidden="true">!</i>
                    <span>Lineup</span>
                  </button>
                  <button
                    className="pool-character-detail"
                    onClick={() => {
                      playSfx('click');
                      setDetails(poolCards[0] ?? null);
                    }}
                  >
                    <img src={uiAsset('lineup-base')} alt="" />
                    <img src={uiAsset('lineup-overlay')} alt="" />
                    <span>キャラ詳細</span>
                  </button>
                </div>
                <div className="pool-support">
                  <button
                    disabled={disabled}
                    onClick={() => {
                      playSfx('click');
                      act(supply, '已领取 30,000 呱太试玩补给。');
                    }}
                  >
                    <Gift /> 试玩补给
                  </button>
                  <button
                    disabled={disabled || save.lastDaily >= localDay()}
                    onClick={() => {
                      playSfx('confirm');
                      act((s) => checkIn(s), '签到成功，获得 30,000 呱太。');
                    }}
                  >
                    <Check />
                    {save.lastDaily >= localDay() ? '今日已签到' : '每日签到'}
                  </button>
                </div>
              </section>
              </FixedPoolStage>
              <Dialog open={lineupOpen} onOpenChange={setLineupOpen}>
                <DialogContent className="pool-lineup-dialog">
                  <DialogTitle>{currentPool.name} · Lineup</DialogTitle>
                  <DialogDescription>展示本分类角色；完整招募规则请查看卡池详情。</DialogDescription>
                  <div className="pool-lineup-grid">
                    {poolCards.map(card => (
                      <button key={card.id} onClick={() => { setLineupOpen(false); setDetails(card); }}>
                        <CardArt card={card} resultCard />
                        <span>{card.name}</span>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <section className="results-section">
                <div className="section-heading">
                  <h2>
                    本次相遇{' '}
                    <small>
                      {save.results.length
                        ? save.results.length + ' 位角色'
                        : ''}
                    </small>
                  </h2>
                  {save.results.length > 0 && (
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        setCinema({ batch: save, concealed: unopened === 0 })
                      }
                    >
                      <Sparkles /> {unopened ? '继续演出' : '重播演出'}
                    </Button>
                  )}
                  {unopened > 0 ? (
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        act((s) => reveal(s, 'all'), '全部盲盒已开启。')
                      }
                    >
                      <PackageOpen /> 全部开启 ({unopened})
                    </Button>
                  ) : (
                    <span className="muted">
                      累计招募 {nf(save.draws)} 次 · 三星 {nf(threes)} 张
                    </span>
                  )}
                </div>
                {save.results.length ? (
                  <div className="cards-grid results-grid">
                    {save.results.map((result, index) => {
                      const card = byId.get(result.id)!;
                      return result.revealed ? (
                        <div
                          className="result-wrapper"
                          key={index + '-' + result.id}
                        >
                          <CardTile
                            card={card}
                            onClick={() => setDetails(card)}
                          >
                            <span className={result.isNew ? 'new-label' : ''}>
                              {result.isNew ? 'NEW' : '重复'}
                            </span>
                          </CardTile>
                          {(result.pity || result.mutation) && (
                            <span className="result-note">
                              {result.pity
                                ? 'FES 保底'
                                : '突变 ' + result.mutation}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Button
                          key={'box-' + index}
                          variant="outline"
                          className={
                            'sealed-box ' +
                            (result.mystery ? 'mystery-box' : '')
                          }
                          disabled={disabled}
                          onClick={() => void openBox(index)}
                          aria-label={
                            '开启第 ' +
                            (index + 1) +
                            ' 个' +
                            (result.mystery ? '黑色' : '') +
                            '盲盒'
                          }
                        >
                          <SealedCard result={result} card={card} />
                          <strong>
                            {result.mystery ? '黑色盲盒' : '未知的相遇'}
                          </strong>
                          <span>
                            点击开启 · {String(index + 1).padStart(2, '0')}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty title="你的第一位伙伴，正在等待。">
                    <p>点击招募，开启学园都市的第一段故事。</p>
                  </Empty>
                )}
                {unopened > 0 && (
                  <p className="muted result-hint">
                    请先开启全部盲盒再进行下一轮。结果已经保存，刷新不会丢失或重新抽取。
                  </p>
                )}
              </section>
            </>
          )}

          {(view === 'collection' || view === 'team') && (
            <>
              {view === 'team' && (
                <section className="team-board">
                  {(['battle', 'assist'] as const).map((t) => (
                    <div className="team-row" key={t}>
                      <div className="section-heading">
                        <h2>
                          {t === 'battle' ? '战斗角色' : '辅助角色'}{' '}
                          <small>{save.team[t].length} / 6</small>
                        </h2>
                        <span className="muted">点击已编入角色可移除</span>
                      </div>
                      <div className="team-slots">
                        {Array.from({ length: 6 }, (_, i) => {
                          const id = save.team[t][i],
                            card = byId.get(id);
                          return card ? (
                            <button
                              className="filled-slot"
                              key={id}
                              disabled={disabled}
                              onClick={() =>
                                act(
                                  (s) => toggleTeam(s, id, cards),
                                  '已移出队伍。',
                                )
                              }
                              aria-label={'移除 ' + card.name}
                            >
                              <CardArt card={card} />
                              <span>{card.name}</span>
                              <X size={14} className="slot-remove" />
                            </button>
                          ) : (
                            <div key={'empty-' + i} className="empty-slot">
                              <Plus size={20} />
                              <small>SLOT {i + 1}</small>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="muted">
                    第一版支持队伍保存与编成，暂未移植战斗引擎；此处不会进行战斗或计算战力。
                  </p>
                </section>
              )}
              <div className="section-heading">
                <h2>
                  {view === 'team' ? '选择已持有角色' : '角色档案'}{' '}
                  <small>
                    {unique} / {cards.length}
                  </small>
                </h2>
                <span className="muted">
                  收集率 {((unique / cards.length) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="filters">
                <div className="search-input">
                  <Search size={17} />
                  <Input
                    aria-label="搜索角色名或卡牌 ID"
                    placeholder="搜索角色名或卡牌 ID…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                {view === 'collection' && (
                  <NativeSelect
                    aria-label="持有状态"
                    value={ownership}
                    onChange={(e) => {
                      setOwnership(e.target.value);
                      setPage(1);
                    }}
                  >
                    <NativeSelectOption value="owned">
                      已持有
                    </NativeSelectOption>
                    <NativeSelectOption value="all">
                      全部卡池
                    </NativeSelectOption>
                  </NativeSelect>
                )}
                <NativeSelect
                  aria-label="筛选星级"
                  value={rarity}
                  onChange={(e) => {
                    setRarity(e.target.value);
                    setPage(1);
                  }}
                >
                  <NativeSelectOption value="all">全部星级</NativeSelectOption>
                  {[3, 2, 1].map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n} 星
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="筛选类型"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setPage(1);
                  }}
                >
                  <NativeSelectOption value="all">全部类型</NativeSelectOption>
                  <NativeSelectOption value="battle">
                    战斗角色
                  </NativeSelectOption>
                  <NativeSelectOption value="assist">
                    辅助角色
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              {visibleCards.length ? (
                <>
                  <div className="cards-grid">
                    {visibleCards.map((card) => {
                      const inTeam = save.team[card.type].includes(card.id);
                      return (
                        <CardTile
                          key={card.id}
                          card={card}
                          count={save.collection[card.id] || 0}
                          onClick={() => setDetails(card)}
                        >
                          {save.collection[card.id] > 0 && (
                            <Button
                              variant={inTeam ? 'secondary' : 'ghost'}
                              size="xs"
                              disabled={disabled}
                              onClick={() =>
                                act(
                                  (s) => toggleTeam(s, card.id, cards),
                                  inTeam ? '已移出队伍。' : '已编入队伍。',
                                )
                              }
                            >
                              {inTeam ? <Check /> : <Plus />}
                              {inTeam ? '已编入' : '编入'}
                            </Button>
                          )}
                        </CardTile>
                      );
                    })}
                  </div>
                  <div className="pagination">
                    <span>共 {filtered.length} 张</span>
                    <Button
                      variant="outline"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                      aria-label="上一页"
                    >
                      <ChevronLeft />
                    </Button>
                    <span>
                      {currentPage} / {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage(currentPage + 1)}
                      aria-label="下一页"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </>
              ) : (
                <Empty
                  title={
                    query || rarity !== 'all' || kind !== 'all'
                      ? '没有找到符合条件的角色'
                      : '卡册还是空的'
                  }
                >
                  <p>调整筛选条件，或先去招募你的第一位伙伴。</p>
                  <Button variant="link" onClick={() => navigate('recruit')}>
                    前往角色招募 →
                  </Button>
                </Empty>
              )}
            </>
          )}

          {view === 'save' && (
            <div className="save-page">
              <section className="save-summary">
                <div>
                  <small>累计招募</small>
                  <strong>{nf(save.draws)}</strong>
                </div>
                <div>
                  <small>已收集角色</small>
                  <strong>
                    {unique}
                    <small> / {cards.length}</small>
                  </strong>
                </div>
                <div>
                  <small>三星角色总数</small>
                  <strong>{nf(threes)}</strong>
                </div>
              </section>
              <section className="save-panel">
                <HardDrive />
                <div>
                  <h2>自动保存，在你的浏览器里</h2>
                  <p>
                    抽卡、开箱和编队后会立即保存。刷新或关闭页面后可继续游玩。清除网站数据、更换浏览器或设备会失去本地进度，请定期导出备份。
                  </p>
                  <p>
                    试玩存档与 QQ
                    机器人相互独立，不支持云同步或机器人存档直接导入。多标签页会同步已保存状态；不支持
                    Web Locks 的旧浏览器请只开一个游戏标签页。
                  </p>
                </div>
              </section>
              <div className="save-actions">
                <section className="save-panel">
                  <Download />
                  <div>
                    <h2>导出这段旅程</h2>
                    <p>下载 JSON 存档，在另一台设备导入即可继续。</p>
                    <Button
                      disabled={!ready || !!problem || busy}
                      onClick={() => exportSave()}
                    >
                      <Download /> 导出存档
                    </Button>
                    {problem && (
                      <Button
                        variant="outline"
                        onClick={() => exportSave(true)}
                      >
                        下载原始存档以恢复
                      </Button>
                    )}
                  </div>
                </section>
                <section className="save-panel">
                  <Upload />
                  <div>
                    <h2>继续已有的故事</h2>
                    <p>仅接受本试玩版存档。确认导入前不会覆盖当前数据。</p>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      aria-label="选择试玩存档"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void requestImport(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={!ready || busy || readingFile}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload /> {readingFile ? '正在校验…' : '导入存档'}
                    </Button>
                  </div>
                </section>
              </div>
              <section className="save-panel reset-panel">
                <RefreshCw />
                <div>
                  <h2>重新开始</h2>
                  <p>重置本试玩版的所有本地进度。请先导出备份。</p>
                  <Button
                    variant="destructive"
                    disabled={!ready || busy}
                    onClick={requestReset}
                  >
                    重置试玩存档
                  </Button>
                </div>
              </section>
            </div>
          )}
          <footer>
            FAN-MADE EXPERIENCE{' '}
            <span>
              {busy ? '正在保存…' : '纯浏览器运行 · 无账号 · 本地存档'}
            </span>
          </footer>
        </main>
      </div>

      {cinema && !problem && batchKey(cinema.batch) === batchKey(save) && (
        <GachaCinema
          key={batchKey(cinema.batch)}
          batch={cinema.batch}
          concealed={cinema.concealed}
          startIndex={cinema.startIndex}
          cards={byId}
          onClose={() => setCinema(null)}
          onAgain={() => requestRecruit(cinema.batch.results.length === 1 ? 1 : 10, mode)}
          onReveal={(index) =>
            run((s) => {
              assertBatch(s, batchKey(cinema.batch));
              return reveal(s, index);
            })
          }
        />
      )}
      {recruitLoading && (
        <div className="gacha-loading-screen" aria-label="Now Loading">
          <div className="gacha-loading-mark">
            <span className="gacha-loading-icon" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((frame) => (
                <img
                  key={frame}
                  src={uiAsset(`loading-icon-0${frame}`)}
                  alt=""
                  style={{ '--loading-frame': frame } as React.CSSProperties}
                />
              ))}
            </span>
            <img className="gacha-loading-text" src={uiAsset('loading-text')} alt="Now Loading" />
          </div>
        </div>
      )}
      <Dialog
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="card-dialog">
          {details && (
            <>
              <DialogTitle>{details.name}</DialogTitle>
              <DialogDescription>
                {details.stars} 星 · {typeName(details)}角色 ·{' '}
                {limitName(details)}
              </DialogDescription>
              <CardArt card={details} />
              <dl className="card-facts">
                <div>
                  <dt>属性</dt>
                  <dd>{details.attribute}</dd>
                </div>
                <div>
                  <dt>持有数量</dt>
                  <dd>{save.collection[details.id] || 0}</dd>
                </div>
                <div>
                  <dt>卡牌 ID</dt>
                  <dd>{details.id}</dd>
                </div>
              </dl>
              <Button
                disabled={disabled || !save.collection[details.id]}
                onClick={() =>
                  act((s) => toggleTeam(s, details.id, cards), '队伍已更新。')
                }
              >
                {save.team[details.type].includes(details.id)
                  ? '移出队伍'
                  : '编入队伍'}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="rules-dialog">
          <DialogTitle>招募规则 · 单机试玩版</DialogTitle>
          <DialogDescription>
            采用公开默认配置；并非线上运营卡池，也不读取私有 config.py。
          </DialogDescription>
          <div className="rules-copy">
            <h3>常规招募</h3>
            <p>
              1 / 2 / 3 星权重为 72 : 23 : 3，归一化后约 73.47% / 23.47% /
              3.06%。十连不额外保证二星。
            </p>
            <p>
              常规三星中，FES / 期间限定 / 其他三星的权重为 25% / 35% /
              40%；每组内等概率。
            </p>
            <h3>FES 保底</h3>
            <p>
              每次未获得 FES 三星，计数增加 1；第 150 抽必得 FES 三星。获得 FES
              三星立即归零。两种模式共享进度。
            </p>
            <h3>盲盒招募</h3>
            <p>
              非保底时有 2% 概率出现黑色盲盒（2 / 3 星为 65% /
              35%）。普通盲盒沿用常规权重，并有突变：1→2 星 8%、1→3 星 2%、2→3
              星 5%。黑盒与突变结果在对应星级的全池中等概率抽取。
            </p>
            <p>
              盲盒创建时就确定并保存结果，揭晓不再扣费。开完本轮后才能继续招募。
            </p>
            <h3>试玩约定</h3>
            <p>
              单抽 300、十连 3,000 呱太；初始赠送
              30,000。试玩补给可重复领取；每日签到按设备本地日期赠送
              30,000。这里只记录个人进度，无充值、排行榜或多人对战。
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent className="pool-confirm-dialog">
          {confirmation?.stage && (
            <span className="pool-confirm-kicker" aria-hidden="true">
              GACHA
            </span>
          )}
          <DialogTitle className="pool-confirm-title">
            {confirmation?.title}
          </DialogTitle>
          {!confirmation?.stage ? (
            <>
              <DialogDescription>{confirmation?.body}</DialogDescription>
              <div className="confirm-buttons">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    playSfx('cancel');
                    setConfirmation(null);
                  }}
                >
                  取消
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (!confirmation) return;
                    playSfx('confirm');
                    void confirmation
                      .action()
                      .then(() => setConfirmation(null))
                      .catch((error) => {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : '存档保存失败',
                        );
                        setConfirmation(null);
                      });
                  }}
                >
                  确认{busy ? ' · 保存中…' : ''}
                </Button>
              </div>
            </>
          ) : confirmation.stage === 'pick' ? (
            <>
              <DialogDescription className="pool-confirm-instruction">
                使用するゲコ太と回数を確認して下さい
              </DialogDescription>
              <div className="pool-ticket-list">
                <div className="pool-ticket-row selected">
                  <span className="pool-ticket-icon" aria-hidden="true">
                    <img src={uiAsset('silver-frog')} alt="" />
                  </span>
                  <span className="pool-ticket-copy">
                    <strong>無償ゲコ太</strong>
                    <em>
                      {confirmation.count}回ガチャに{nf(confirmation.cost!)}ゲコ太を使用します
                    </em>
                    <small>所持数</small>
                    <b>{nf(save.balance)}</b>
                  </span>
                  <span className="pool-ticket-stepper">
                    <Button
                      aria-label="使用数を減らす"
                      disabled={busy || confirmation.count === 1}
                      onClick={() => {
                        playSfx('switch');
                        setConfirmation({
                          ...confirmation,
                          count: 1,
                          cost: COST,
                        });
                      }}
                    >
                      −
                    </Button>
                    <Button
                      disabled={busy || save.balance < confirmation.cost!}
                      onClick={() => {
                        playSfx('click');
                        setConfirmation({
                          ...confirmation,
                          stage: 'confirm',
                          body: '',
                          action: async () => {
                            await recruit(
                              confirmation.count!,
                              confirmation.drawMode!,
                            );
                          },
                        });
                      }}
                    >
                      {confirmation.count}回分を選択
                    </Button>
                      <Button
                        aria-label="使用数を増やす"
                        disabled={busy || confirmation.count === 10}
                        onClick={() => {
                          playSfx('switch');
                          setConfirmation({
                            ...confirmation,
                            count: 10,
                            cost: COST * 10,
                          });
                        }}
                      >
                        +
                      </Button>
                  </span>
                </div>
                <div className="pool-ticket-row unavailable" aria-disabled="true">
                  <span className="pool-ticket-icon empty" aria-hidden="true">
                    <img src={uiAsset('ticket')} alt="" />
                  </span>
                  <span className="pool-ticket-copy">
                    <strong>10回ガチャチケット</strong>
                    <em>10回ガチャを1回引けるチケットです</em>
                    <small>所持数</small>
                    <b>0</b>
                  </span>
                  <Button disabled>1枚使用</Button>
                </div>
              </div>
              <Button
                className="pool-dialog-cancel"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  playSfx('cancel');
                  setConfirmation(null);
                }}
              >
                キャンセル
              </Button>
            </>
          ) : (
            <>
              <DialogDescription className="pool-final-question">
                無償ゲコ太を消費して
                <strong>{confirmation?.count}回ガチャを1回</strong>
                引きますか？
              </DialogDescription>
              <div className="pool-cost-line">
                <span>所持数（使用後）</span>
                <b>
                  {nf(save.balance)} → {nf(save.balance - confirmation!.cost!)}
                </b>
              </div>
              <div className="pool-end-time">
                終了時刻：2099/01/01 07:59まで
              </div>
              <div className="confirm-buttons pool-final-buttons">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    playSfx('cancel');
                    setConfirmation((current) =>
                      current ? { ...current, stage: 'pick' } : null,
                    );
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  className="pool-confirm-ok"
                  disabled={busy}
                  onClick={() => {
                    if (!confirmation) return;
                    playSfx('confirm');
                    void confirmation
                      .action()
                      .then(() => setConfirmation(null))
                      .catch((error) => {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : '存档保存失败',
                        );
                        setConfirmation(null);
                      });
                  }}
                >
                  <span>◆ {nf(confirmation?.cost ?? 0)}</span>
                  OK{busy ? ' · 保存中…' : ''}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
