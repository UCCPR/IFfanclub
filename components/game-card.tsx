import { useState } from 'react';
import type { Card, Result } from '@/lib/game';
import { initialRarity, rarityTone } from '@/lib/gacha-presentation';

const publicAsset = (path: string) =>
  (import.meta.env?.BASE_URL || './') + path;

export const uiAsset = (name: string) => publicAsset('gacha/' + name + '.webp');
export const artAsset = (card: Card, large = false) =>
  card.sourceImage
    ? publicAsset(
        (large ? 'art/' : 'cards/') + card.sourceImage.replace('.png', '.webp'),
      )
    : '';

export function CardArt({
  card,
  resultCard = false,
}: {
  card: Card;
  resultCard?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const tone = rarityTone(card.stars);
  return (
    <div
      className={
        'card-art original-card rarity-' +
        card.stars +
        (resultCard ? ' result-card' : '')
      }
    >
      <img className="native-layer" src={uiAsset(tone + '-bg')} alt="" />
      {card.sourceImage && !failed ? (
        <span className="native-portrait-window">
          <img
            className="native-portrait"
            src={artAsset(card)}
            alt={card.name}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </span>
      ) : (
        <span className="image-fallback">
          IF
          <br />
          <small>暂无立绘</small>
        </span>
      )}
      <img className="native-layer" src={uiAsset(tone + '-frame')} alt="" />
      {resultCard && card.stars >= 3 && (
        <span className="native-result-sparkles" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <img key={i} src={uiAsset(i % 2 ? 'sparkle-white' : 'sparkle-gold')} alt="" />
          ))}
        </span>
      )}
      {resultCard && (
        <img
          className="native-element"
          src={uiAsset(
            'element-' +
              (card.attribute.startsWith('超') ? 'super-' : '') +
              ({
                赤: 'red',
                青: 'blue',
                緑: 'green',
                黄: 'yellow',
                紫: 'purple',
              }[card.attribute.replace('超', '')] || 'blue'),
          )}
          alt={card.attribute + '属性'}
        />
      )}
      <span className="native-stars" aria-label={card.stars + '星'}>
        {Array.from({ length: card.stars }, (_, i) => (
          <img src={uiAsset('star')} alt="" key={i} />
        ))}
      </span>
      <img
        className="native-type"
        src={uiAsset('type-' + card.type)}
        alt={card.type === 'battle' ? '战斗' : '辅助'}
      />
    </div>
  );
}

export function SealedCard({
  result,
  card,
  presentation = false,
  forcedTone,
}: {
  result: Result;
  card: Card;
  presentation?: boolean;
  forcedTone?: 'silver' | 'gold' | 'rainbow' | 'black';
}) {
  // In the recorded result monitor every unopened slot uses the same silver
  // Gekota tile. Rarity must not leak before the player taps it.
  const tone =
    forcedTone ||
    (presentation
      ? 'silver'
      : result.mystery
        ? 'black'
        : rarityTone(initialRarity(result, card)));
  return (
    <span className={'gekota-card tone-' + tone} aria-hidden="true">
      <img src={uiAsset(tone + '-bg')} alt="" />
      <img className="gekota-face" src={uiAsset(tone + '-frog')} alt="" />
      <img src={uiAsset(tone + '-frame')} alt="" />
      {!presentation && tone !== 'black' && <span className="gekota-sheen" />}
    </span>
  );
}
