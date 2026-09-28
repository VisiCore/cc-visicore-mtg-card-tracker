import { useEffect, useState } from 'react';
import { Button, Drawer, IconButton, Modal, Tag, Text, TextArea, Toast } from '@capra/core';
import { DeleteOutlined, Minus, Plus } from '@capra/icons';
import { FAMILY_LABEL, familyOf, isShiny, type Card } from '../model/card';
import { ManaCost, RulesText } from './ManaCost';

interface Props {
  card: Card | null;
  onClose: () => void;
  onUpdate: (card: Card) => Promise<void>;
  onRemove: (card: Card) => Promise<void>;
}

const CARD_BACK = `${import.meta.env.BASE_URL}card-back.jpg`.replace(/\/\//g, '/');

const RARITY_TAG: Record<Card['rarity'], 'default' | 'info' | 'gold' | 'crimson'> = {
  common: 'default',
  uncommon: 'info',
  rare: 'gold',
  mythic: 'crimson',
};

export function CardDrawer({ card, onClose, onUpdate, onRemove }: Props) {
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setNotes(card?.notes ?? '');
    setFlipped(false);
    setConfirm(false);
  }, [card?.id, card?.notes]);

  const setQty = async (delta: number) => {
    if (!card) return;
    const quantity = Math.max(1, card.quantity + delta);
    if (quantity === card.quantity) return;
    try {
      await onUpdate({ ...card, quantity });
    } catch (e) {
      Toast.error(`Could not update quantity. ${e instanceof Error ? e.message : ''}`);
    }
  };

  const saveNotes = async () => {
    if (!card || notes === card.notes) return;
    try {
      await onUpdate({ ...card, notes });
      Toast.success('Notes saved');
    } catch (e) {
      Toast.error(`Could not save notes. ${e instanceof Error ? e.message : ''}`);
    }
  };

  const remove = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await onRemove(card);
      Toast.success(`${card.name} removed from the vault`);
      setConfirm(false);
      onClose();
    } catch (e) {
      Toast.error(`Could not remove ${card.name}. ${e instanceof Error ? e.message : ''}`, { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  const family = card ? familyOf(card) : 'colorless';

  return (
    <>
      <Drawer
        isOpen={!!card}
        onClose={onClose}
        placement="right"
        width={760}
        title={card?.name ?? ''}
        footer={
          card && (
            <div className="drawer-footer">
              <Button variant="tertiary" appearance="danger" leadingIcon={DeleteOutlined} onClick={() => setConfirm(true)}>
                Remove from vault
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          )
        }
      >
        {card && (
          <div className={`detail fam-${family}`}>
            <div className="detail-stage">
              <button
                type="button"
                className={`detail-card${flipped ? ' flipped' : ''}${isShiny(card) ? ' shiny' : ''}`}
                onClick={() => setFlipped((f) => !f)}
                aria-label="Flip card"
              >
                <span className="detail-front">
                  <img src={card.image} alt={card.name} draggable={false} />
                  {isShiny(card) && <span className="tile-holo" />}
                </span>
                <span className="detail-back">
                  <img src={CARD_BACK} alt="Telemetry Gatherers card back" draggable={false} />
                  <span className="tile-holo" />
                </span>
              </button>
              <Text variant="body-xs-normal" color="subtle">
                Click the card to flip it
              </Text>
            </div>

            <div className="detail-info">
              <div className="detail-row">
                <ManaCost cost={card.manaCost} size="lg" />
                <div className="tags">
                  <Tag color={RARITY_TAG[card.rarity]}>{card.rarity}</Tag>
                  <Tag>{FAMILY_LABEL[family]}</Tag>
                  {card.collectorNumber && <Tag color="default">{`#${card.collectorNumber}`}</Tag>}
                </div>
              </div>
              <Text as="div" variant="body-md-semibold">
                {card.typeLine}
              </Text>
              {card.rulesText ? <RulesText text={card.rulesText} /> : <Text color="subtle">No rules text.</Text>}

              <div className="qty">
                <Text variant="body-sm-semibold">In vault</Text>
                <div className="qty-ctl">
                  <IconButton icon={Minus} aria-label="Remove one copy" size="sm" disabled={card.quantity <= 1} onClick={() => void setQty(-1)} />
                  <span className="qty-num">{card.quantity}</span>
                  <IconButton icon={Plus} aria-label="Add one copy" size="sm" onClick={() => void setQty(1)} />
                </div>
              </div>

              <TextArea
                label="Notes"
                value={notes}
                onChange={setNotes}
                onBlur={() => void saveNotes()}
                autoSize={{ minRows: 2, maxRows: 6 }}
                placeholder="Condition, deck, where you got it…"
              />

              <Text variant="body-xs-normal" color="subtle">
                {`${card.setName} · added by ${card.addedBy} on ${new Date(card.addedAt).toLocaleDateString()}`}
              </Text>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        isOpen={confirm}
        title={`Remove ${card?.name ?? 'card'}?`}
        isDismissible={!busy}
        onClose={() => !busy && setConfirm(false)}
        onIsOpenChange={(open) => !open && !busy && setConfirm(false)}
        footer={
          <Modal.FooterActions>
            <Button variant="tertiary" disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" appearance="danger" pending={busy} onClick={() => void remove()}>
              Remove card
            </Button>
          </Modal.FooterActions>
        }
      >
        <p>
          This deletes <strong>{card?.name}</strong>
          {card && card.quantity > 1 ? ` (all ${card.quantity} copies)` : ''} and its photo from the shared vault. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
