import { useCallback, useEffect, useState } from 'react';
import { Toast } from '@capra/core';
import { currentUser, deleteCard as kvDeleteCard, loadCards, saveCard } from '../api/kv';
import { newId, type Card, type DraftCard } from '../model/card';

export interface Collection {
  cards: Card[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addDrafts: (drafts: DraftCard[]) => Promise<Card[]>;
  update: (card: Card) => Promise<void>;
  remove: (card: Card) => Promise<void>;
  /** Ids of cards added in this session, for the entrance animation. */
  fresh: Set<string>;
}

export function useCollection(): Collection {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCards(await loadCards());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addDrafts = useCallback(async (drafts: DraftCard[]) => {
    const who = await currentUser();
    const now = Date.now();
    const created: Card[] = drafts.map((d, i) => ({
      ...d,
      id: newId(),
      addedAt: new Date(now + i).toISOString(),
      addedBy: who,
    }));
    const results = await Promise.allSettled(created.map((c) => saveCard(c)));
    const saved = created.filter((_, i) => results[i].status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      const reason = failed[0].status === 'rejected' ? String(failed[0].reason?.message ?? failed[0].reason) : '';
      Toast.error(`${failed.length} card${failed.length > 1 ? 's' : ''} could not be saved. ${reason}`, { duration: 10_000 });
    }
    setFresh((prev) => new Set([...prev, ...saved.map((c) => c.id)]));
    setCards((prev) => [...saved.slice().reverse(), ...prev]);
    return saved;
  }, []);

  const update = useCallback(async (card: Card) => {
    await saveCard(card);
    setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
  }, []);

  const remove = useCallback(async (card: Card) => {
    await kvDeleteCard(card.id);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  return { cards, loading, error, reload, addDrafts, update, remove, fresh };
}
