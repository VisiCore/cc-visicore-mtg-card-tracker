import { useRef, type CSSProperties, type MouseEvent } from 'react';
import { familyOf, isShiny, type Card } from '../model/card';
import { ManaCost } from './ManaCost';

interface Props {
  card: Card;
  index: number;
  fresh?: boolean;
  onOpen: (card: Card) => void;
}

/** A card in the vault. Tilts toward the cursor, glows in its mana color, shimmers when rare. */
export function CardTile({ card, index, fresh, onOpen }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const family = familyOf(card);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - py) * 18).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((px - 0.5) * 22).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
  };

  return (
    <div className={`tile-wrap${fresh ? ' tile-fresh' : ''}`} style={{ '--i': index } as CSSProperties}>
      <button
        ref={ref}
        type="button"
        className={`tile fam-${family}${isShiny(card) ? ' shiny' : ''}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={() => onOpen(card)}
        aria-label={`${card.name}, ${card.typeLine}`}
      >
        <span className="tile-face">
          <img src={card.image} alt="" draggable={false} />
          <span className="tile-glare" />
          {isShiny(card) && <span className="tile-holo" />}
        </span>
        {card.quantity > 1 && <span className="tile-qty">×{card.quantity}</span>}
        <span className={`tile-rarity rarity-${card.rarity}`} title={card.rarity} />
      </button>
      <div className="tile-meta">
        <span className="tile-name">{card.name}</span>
        <ManaCost cost={card.manaCost} size="sm" />
      </div>
    </div>
  );
}
