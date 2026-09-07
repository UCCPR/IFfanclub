// Vite development entry only. No storage adapter, RNG, imports or exports.
import { useState } from 'react';
import { GachaCinema } from '@/components/gacha-cinema';
import { Button } from '@/components/ui/button';
import { newSave, type Card } from '@/lib/game';
import source from '@/lib/cards.json';
const cards = new Map((source as Card[]).map((card) => [card.id, card]));
const batch = newSave();
batch.results = [
  '203612001',
  '201030006',
  ...['赤', '緑', '黄', '紫', '超青', '超緑', '超黄', '超紫'].map(
    (attribute, i) => {
      const candidates = (source as Card[]).filter(
        (card) => card.attribute === attribute,
      );
      return (
        candidates.find((card) => card.stars === (i % 2 ? 2 : 1)) ||
        candidates[0]
      ).id;
    },
  ),
].map((id, i) => ({
  id,
  revealed: false,
  mystery: false,
  mutation: '',
  isNew: i < 7,
  pity: false,
}));
export function GachaReview() {
  const [sample, setSample] = useState({
    index: 0,
    time: 3000,
    live: false,
    key: 0,
  });
  return (
    <GachaCinema
      key={sample.key}
      batch={batch}
      concealed={sample.index === -2}
      startIndex={sample.index < 0 ? undefined : sample.index}
      cards={cards}
      reviewTime={sample.live ? undefined : sample.time}
      onReveal={async () => {}}
      onClose={() => {}}
      onAgain={() => {}}
      reviewControls={
        <div
          style={{
            background: '#fff',
            padding: 8,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>本地画面对照 · 不读写存档</span>
          {[
            ['初春剪影', 0, 1000],
            ['初春白场', 0, 1750],
            ['初春亮相', 0, 2500],
            ['初春淡回', 0, 3250],
            ['食蜂球体', 1, 4000],
            ['食蜂近景', 1, 9500],
            ['食蜂远侧', 1, 12000],
            ['食蜂全景', 1, 14000],
            ['食蜂亮相', 1, 17000],
            ['图标屏', -1, 0],
            ['追猫过场', -2, 0],
          ].map(([name, index, time]) => (
            <Button
              size="sm"
              key={name}
              onClick={() =>
                setSample({
                  index: Number(index),
                  time: Number(time),
                  live: false,
                  key: sample.key + 1,
                })
              }
            >
              {name}
            </Button>
          ))}
          <Button
            size="sm"
            onClick={() =>
              setSample({ ...sample, live: true, key: sample.key + 1 })
            }
          >
            播放本段
          </Button>
        </div>
      }
    />
  );
}
