import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, IconButton, Spinner, Text, TextField, Toast, ToggleButtonGroup, Tooltip } from '@capra/core';
import { Cog, Plus, ReloadOutlined, SearchOutlined } from '@capra/icons';
import { hasApiKey, isMockMode } from './api/kv';
import { AddCardsModal } from './components/AddCardsModal';
import { CardDrawer } from './components/CardDrawer';
import { CardTile } from './components/CardTile';
import { SettingsModal } from './components/SettingsModal';
import { useCollection } from './hooks/useCollection';
import { FAMILIES, FAMILY_LABEL, familyOf, isShiny, type Card, type Family } from './model/card';

type Sort = 'newest' | 'name' | 'rarity';
const RARITY_RANK = { mythic: 0, rare: 1, uncommon: 2, common: 3 } as const;

function App() {
  const col = useCollection();
  const [query, setQuery] = useState('');
  const [families, setFamilies] = useState<Set<Family>>(new Set());
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const [keyReady, setKeyReady] = useState<boolean | null>(null);

  const checkKey = () => {
    if (isMockMode()) {
      setKeyReady(true);
      return;
    }
    hasApiKey().then(setKeyReady).catch(() => setKeyReady(false));
  };
  useEffect(checkKey, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = col.cards.filter((c) => {
      if (families.size && !families.has(familyOf(c))) return false;
      if (!q) return true;
      return [c.name, c.typeLine, c.rulesText, c.setName, c.notes, c.collectorNumber].some((s) => s.toLowerCase().includes(q));
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'rarity') list = [...list].sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name));
    return list;
  }, [col.cards, query, families, sort]);

  const totalCopies = col.cards.reduce((n, c) => n + c.quantity, 0);
  const shiny = col.cards.filter(isShiny).length;
  const familyCounts = useMemo(() => {
    const m = new Map<Family, number>();
    for (const c of col.cards) m.set(familyOf(c), (m.get(familyOf(c)) ?? 0) + 1);
    return m;
  }, [col.cards]);

  // Keep the drawer's card in sync with edits.
  const openCard = open ? (col.cards.find((c) => c.id === open.id) ?? null) : null;

  return (
    <div className="vault">
      <div className="sky" aria-hidden="true">
        <span className="orb orb-u" />
        <span className="orb orb-r" />
        <span className="orb orb-g" />
        <span className="orb orb-w" />
      </div>

      <header className="hero">
        <div className="hero-text">
          <Text as="p" variant="body-xs-semibold" color="accent">
            TELEMETRY GATHERERS · CRIBL EDITION
          </Text>
          <Text as="h1" variant="heading-xl">
            Card Vault
          </Text>
          <Text as="p" color="secondary">
            Photograph your cards. Claude reads them. The vault remembers.
          </Text>
        </div>
        <div className="hero-stats">
          <Stat label="Cards" value={col.cards.length} />
          <Stat label="Copies" value={totalCopies} />
          <Stat label="Rare+" value={shiny} accent />
        </div>
        <div className="hero-actions">
          <Tooltip title="Card reader settings">
            <IconButton icon={Cog} aria-label="Settings" variant="tertiary" onClick={() => setSettings(true)} />
          </Tooltip>
          <Tooltip title="Reload from the vault">
            <IconButton icon={ReloadOutlined} aria-label="Reload" variant="tertiary" pending={col.loading} onClick={() => void col.reload()} />
          </Tooltip>
          <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
            Add cards
          </Button>
        </div>
      </header>

      {keyReady === false && (
        <div className="banner">
          <Alert appearance="warning" title="Card reader needs an API key" action={{ label: 'Open settings', onClick: () => setSettings(true) }}>
            Uploads are read by Claude. Save an Anthropic API key once and everyone who uses this app can add cards.
          </Alert>
        </div>
      )}
      {col.error && (
        <div className="banner">
          <Alert appearance="danger" title="Could not load the vault" action={{ label: 'Retry', onClick: () => void col.reload() }}>
            {col.error}
          </Alert>
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-search">
          <TextField aria-label="Search cards" placeholder="Search name, type, rules…" value={query} onChange={setQuery} leadingSlot={<SearchOutlined />} />
        </div>
        <div className="chips" role="group" aria-label="Filter by color">
          {FAMILIES.filter((f) => familyCounts.has(f)).map((f) => {
            const on = families.has(f);
            return (
              <button
                key={f}
                type="button"
                className={`chip fam-${f}${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  setFamilies((prev) => {
                    const next = new Set(prev);
                    if (next.has(f)) next.delete(f);
                    else next.add(f);
                    return next;
                  })
                }
              >
                <span className="chip-dot" />
                {FAMILY_LABEL[f]}
                <span className="chip-n">{familyCounts.get(f)}</span>
              </button>
            );
          })}
        </div>
        <ToggleButtonGroup
          aria-label="Sort cards"
          size="sm"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[sort]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k) setSort(String(k) as Sort);
          }}
          items={[
            { key: 'newest', text: 'Newest' },
            { key: 'name', text: 'A–Z' },
            { key: 'rarity', text: 'Rarity' },
          ]}
        />
      </div>

      <main className="grid-area">
        {col.loading && col.cards.length === 0 ? (
          <div className="center">
            <Spinner size="lg" title="Opening the vault" />
          </div>
        ) : col.cards.length === 0 ? (
          <div className="center">
            <EmptyState
              size="lg"
              illustration="Sandcastle"
              theme={document.body.classList.contains('dark') ? 'dark' : 'light'}
              title="The vault is empty"
              description="Add your first cards from a photo. A whole spread in one shot is fine."
            >
              <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
                Add cards
              </Button>
            </EmptyState>
          </div>
        ) : visible.length === 0 ? (
          <div className="center">
            <EmptyState title="No cards match" description="Try a different search or clear the color filters.">
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFamilies(new Set());
                }}
              >
                Clear filters
              </Button>
            </EmptyState>
          </div>
        ) : (
          <div className="grid">
            {visible.map((c, i) => (
              <CardTile key={c.id} card={c} index={i} fresh={col.fresh.has(c.id)} onOpen={setOpen} />
            ))}
          </div>
        )}
      </main>

      <CardDrawer card={openCard} onClose={() => setOpen(null)} onUpdate={col.update} onRemove={col.remove} />
      <AddCardsModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        onAdd={async (drafts) => {
          const saved = await col.addDrafts(drafts);
          if (saved.length) {
            Toast.success(`${saved.length} card${saved.length === 1 ? '' : 's'} added to the vault`);
          }
          return saved;
        }}
      />
      <SettingsModal isOpen={settings} onClose={() => setSettings(false)} onChanged={checkKey} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`stat${accent ? ' stat-accent' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default App;
