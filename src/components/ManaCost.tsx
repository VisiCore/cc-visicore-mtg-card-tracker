import { manaSymbols } from '../model/card';

const CLASS: Record<string, string> = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'g', C: 'c', T: 't', X: 'x' };

/** Renders "{2}{U}{U}" as a row of mana pips. */
export function ManaCost({ cost, size = 'md' }: { cost: string; size?: 'sm' | 'md' | 'lg' }) {
  const symbols = manaSymbols(cost);
  if (symbols.length === 0) return null;
  return (
    <span className={`mana mana-${size}`} aria-label={`Mana cost ${symbols.join(' ')}`}>
      {symbols.map((s, i) => {
        const key = s.split('/')[0];
        const cls = CLASS[key] ?? (/^\d+$/.test(key) ? 'n' : 'n');
        return (
          <span key={i} className={`pip pip-${cls}`}>
            {key === 'T' ? '⟳' : key}
          </span>
        );
      })}
    </span>
  );
}

/** Replace {X} tokens inside rules text with inline pips. */
export function RulesText({ text }: { text: string }) {
  const lines = text.split(/\n+/);
  return (
    <div className="rules">
      {lines.map((line, li) => (
        <p key={li}>
          {line.split(/(\{[^}]+\})/g).map((part, i) =>
            /^\{[^}]+\}$/.test(part) ? <ManaCost key={i} cost={part} size="sm" /> : <span key={i}>{part}</span>,
          )}
        </p>
      ))}
    </div>
  );
}
