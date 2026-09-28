import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Alert, Button, Modal, NumberField, SelectField, Text, TextArea, TextField, Toast } from '@capra/core';
import { CameraOutlined, Image, Upload } from '@capra/icons';
import { ExtractError, extractCards } from '../api/extract';
import { fileToDataUrl } from '../api/image';
import { RARITIES, type DraftCard, type Rarity } from '../model/card';
import { ManaCost } from './ManaCost';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (drafts: DraftCard[]) => Promise<unknown>;
}

/** A draft plus which photo it came from, for the review screen. */
type Reviewed = DraftCard & { photoIndex: number };

type Step =
  | { kind: 'pick' }
  | { kind: 'scan'; photos: string[]; current: number; done: number[]; phase: string }
  | { kind: 'review'; photos: string[]; drafts: Reviewed[]; failures: string[] }
  | { kind: 'error'; photos: string[]; message: string };

const SAMPLE = `${import.meta.env.BASE_URL}seed/telemetry-gatherers.jpg`.replace(/\/\//g, '/');
const MAX_PHOTOS = 12;

export function AddCardsModal({ isOpen, onClose, onAdd }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [drag, setDrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (isOpen) setStep({ kind: 'pick' });
    return () => {
      alive.current = false;
    };
  }, [isOpen]);

  /** Read every photo in order, collecting cards from each. One bad photo does not sink the batch. */
  const scan = useCallback(async (photos: string[]) => {
    setStep({ kind: 'scan', photos, current: 0, done: [], phase: 'Preparing photo' });
    const drafts: Reviewed[] = [];
    const failures: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      if (!alive.current) return;
      setStep((s) => (s.kind === 'scan' ? { ...s, current: i, phase: 'Preparing photo' } : s));
      try {
        const { drafts: found } = await extractCards(photos[i], (phase) => {
          if (alive.current) setStep((s) => (s.kind === 'scan' ? { ...s, phase } : s));
        });
        drafts.push(...found.map((d) => ({ ...d, photoIndex: i })));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // An auth or platform problem will fail every photo the same way: stop early.
        if (e instanceof ExtractError && e.status && [401, 403, 404, 429].includes(e.status)) {
          if (alive.current) setStep({ kind: 'error', photos, message });
          return;
        }
        failures.push(`Photo ${i + 1}: ${message}`);
      }
      setStep((s) => (s.kind === 'scan' ? { ...s, done: [...s.done, i] } : s));
    }
    if (!alive.current) return;
    if (drafts.length === 0) {
      setStep({ kind: 'error', photos, message: failures[0] ?? 'No cards were found in those photos.' });
      return;
    }
    setStep({ kind: 'review', photos, drafts, failures });
  }, []);

  const onFiles = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) {
      Toast.warning('Drop photos (JPEG or PNG). HEIC from an iPhone should be exported as JPEG first.');
      return;
    }
    if (list.length > MAX_PHOTOS) Toast.info(`Reading the first ${MAX_PHOTOS} photos. Add the rest in another batch.`);
    try {
      const photos = await Promise.all(list.slice(0, MAX_PHOTOS).map(fileToDataUrl));
      await scan(photos);
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    void onFiles(e.dataTransfer.files);
  };

  const loadSample = async () => {
    try {
      const res = await fetch(SAMPLE);
      const blob = await res.blob();
      await scan([await fileToDataUrl(new File([blob], 'sample.jpg', { type: blob.type || 'image/jpeg' }))]);
    } catch (e) {
      Toast.error(`Could not load the sample photo. ${e instanceof Error ? e.message : ''}`);
    }
  };

  const patch = (i: number, p: Partial<DraftCard>) =>
    setStep((s) => (s.kind === 'review' ? { ...s, drafts: s.drafts.map((d, j) => (j === i ? { ...d, ...p } : d)) } : s));
  const drop = (i: number) => setStep((s) => (s.kind === 'review' ? { ...s, drafts: s.drafts.filter((_, j) => j !== i) } : s));

  const save = async () => {
    if (step.kind !== 'review' || step.drafts.length === 0) return;
    setSaving(true);
    try {
      await onAdd(step.drafts.map(({ photoIndex: _photoIndex, ...d }) => d));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const busy = step.kind === 'scan' || saving;
  const count = step.kind === 'review' ? step.drafts.length : 0;
  const copies = step.kind === 'review' ? step.drafts.reduce((n, d) => n + Math.max(1, d.quantity), 0) : 0;
  const multi = step.kind !== 'pick' && step.photos.length > 1;

  return (
    <Modal
      isOpen={isOpen}
      size="lg"
      title={
        step.kind === 'review'
          ? `Found ${count} card${count === 1 ? '' : 's'}${multi ? ` in ${step.photos.length} photos` : ''}`
          : step.kind === 'scan' && multi
            ? `Reading ${step.photos.length} photos`
            : 'Add cards from photos'
      }
      isDismissible={!busy}
      onClose={() => !busy && onClose()}
      onIsOpenChange={(open) => !open && !busy && onClose()}
      footer={
        step.kind === 'review' ? (
          <Modal.FooterActions>
            <Button variant="tertiary" disabled={saving} onClick={() => setStep({ kind: 'pick' })}>
              Start over
            </Button>
            <Button variant="primary" pending={saving} disabled={count === 0} onClick={() => void save()}>
              {count === 0 ? 'Nothing to add' : copies > count ? `Add ${count} cards (${copies} copies)` : `Add ${count} to vault`}
            </Button>
          </Modal.FooterActions>
        ) : step.kind === 'error' ? (
          <Modal.FooterActions>
            <Button variant="tertiary" onClick={() => setStep({ kind: 'pick' })}>
              Choose other photos
            </Button>
            <Button variant="primary" onClick={() => void scan(step.photos)}>
              Try again
            </Button>
          </Modal.FooterActions>
        ) : null
      }
    >
      {step.kind === 'pick' && (
        <div className="stack">
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          >
            <span className="dropzone-orb" />
            <Upload size="lg" />
            <Text as="div" variant="heading-sm">
              Drop photos of your cards
            </Text>
            <Text as="div" color="subtle">
              One card, a whole spread, or several photos at once. Claude reads every card it can see.
            </Text>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
          </div>
          <div className="pick-actions">
            <Button variant="secondary" leadingIcon={CameraOutlined} onClick={() => fileRef.current?.click()}>
              Choose photos
            </Button>
            <Button variant="tertiary" leadingIcon={Image} onClick={() => void loadSample()}>
              Use the sample spread
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'scan' && (
        <div className="scan">
          {multi && <span className="scan-count">{`Photo ${step.current + 1} of ${step.photos.length}`}</span>}
          <div className="scan-frame">
            <img src={step.photos[step.current]} alt="Photo being read" />
            <span className="scan-beam" />
            <span className="scan-grid" />
          </div>
          <div className="scan-status">
            <span className="scan-dot" />
            <Text variant="body-md-semibold">{step.phase}…</Text>
          </div>
          {multi && (
            <div className="scan-thumbs" aria-hidden="true">
              {step.photos.map((p, i) => (
                <span key={i} className={`scan-thumb${i === step.current ? ' active' : ''}${step.done.includes(i) ? ' done' : ''}`}>
                  <img src={p} alt="" />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {step.kind === 'error' && (
        <div className="stack">
          <Alert appearance="danger" title="Could not read those photos">
            {step.message}
          </Alert>
          <div className="scan-frame small">
            <img src={step.photos[0]} alt="" />
          </div>
        </div>
      )}

      {step.kind === 'review' && (
        <div className="review">
          {step.failures.length > 0 && (
            <Alert appearance="warning" title={`${step.failures.length} photo${step.failures.length === 1 ? '' : 's'} could not be read`}>
              {step.failures.join(' ')}
            </Alert>
          )}
          {step.drafts.length === 0 && <Alert appearance="warning">You removed every card. Start over to pick different photos.</Alert>}
          {step.drafts.map((d, i) => (
            <div className="review-card" key={i} style={{ animationDelay: `${Math.min(i, 8) * 90}ms` }}>
              <div>
                <div className="review-img">
                  <img src={d.image} alt={d.name} />
                </div>
                {multi && <div className="review-photo">{`Photo ${d.photoIndex + 1}`}</div>}
              </div>
              <div className="review-fields">
                <div className="review-head">
                  <TextField label="Name" value={d.name} onChange={(v) => patch(i, { name: v })} />
                  <TextField label="Mana cost" value={d.manaCost} onChange={(v) => patch(i, { manaCost: v })} placeholder="{2}{U}" />
                  <div className="review-mana">
                    <ManaCost cost={d.manaCost} />
                  </div>
                </div>
                <div className="review-grid">
                  <TextField label="Type" value={d.typeLine} onChange={(v) => patch(i, { typeLine: v })} />
                  <SelectField
                    label="Rarity"
                    items={RARITIES.map((r) => ({ id: r, label: r[0].toUpperCase() + r.slice(1) }))}
                    value={d.rarity}
                    onChange={(v) => v && patch(i, { rarity: String(v) as Rarity })}
                  />
                  <TextField label="Number" value={d.collectorNumber} onChange={(v) => patch(i, { collectorNumber: v })} />
                  <TextField label="Set" value={d.setName} onChange={(v) => patch(i, { setName: v })} />
                </div>
                <TextArea label="Rules text" value={d.rulesText} onChange={(v) => patch(i, { rulesText: v })} autoSize={{ minRows: 2, maxRows: 5 }} />
                <div className="review-foot">
                  <div className="review-qty">
                    <NumberField label="Copies" value={d.quantity} min={1} max={99} step={1} onChange={(v) => patch(i, { quantity: Number.isFinite(v) ? Math.max(1, Math.round(v)) : 1 })} />
                  </div>
                  <Button variant="tertiary" appearance="danger" size="sm" onClick={() => drop(i)}>
                    Not a card, skip it
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
