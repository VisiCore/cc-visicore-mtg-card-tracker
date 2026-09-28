import { useEffect, useState } from 'react';
import { Alert, Button, Modal, PasswordField, Text, Toast } from '@capra/core';
import { clearApiKey, hasApiKey, isMockMode, setApiKey } from '../api/kv';
import { MODEL } from '../api/extract';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function SettingsModal({ isOpen, onClose, onChanged }: Props) {
  const [key, setKey] = useState('');
  const [present, setPresent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKey('');
    setPresent(null);
    hasApiKey().then(setPresent).catch(() => setPresent(false));
  }, [isOpen]);

  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await setApiKey(trimmed);
      Toast.success('API key saved to this app\'s KV store');
      setPresent(true);
      setKey('');
      onChanged();
      onClose();
    } catch (e) {
      Toast.error(`Could not save the key. ${e instanceof Error ? e.message : ''}`, { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await clearApiKey();
      Toast.success('API key removed');
      setPresent(false);
      onChanged();
    } catch (e) {
      Toast.error(`Could not remove the key. ${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Card reader settings"
      isDismissible={!busy}
      onClose={() => !busy && onClose()}
      onIsOpenChange={(open) => !open && !busy && onClose()}
      footer={
        <Modal.FooterActions>
          {present && (
            <Button variant="tertiary" appearance="danger" disabled={busy} onClick={() => void remove()}>
              Remove key
            </Button>
          )}
          <Button variant="tertiary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" pending={busy} disabled={!key.trim()} onClick={() => void save()}>
            Save key
          </Button>
        </Modal.FooterActions>
      }
    >
      <div className="stack">
        {isMockMode() ? (
          <Alert appearance="info">Running outside Cribl: the card reader returns sample data and no key is needed.</Alert>
        ) : present === false ? (
          <Alert appearance="warning">No API key saved yet. Photo uploads will fail until one is added.</Alert>
        ) : present ? (
          <Alert appearance="success">An API key is saved. Enter a new one below to replace it.</Alert>
        ) : null}
        <Text>
          Photos are read by Claude ({MODEL}). The key is stored in this app's own KV store and injected by the Cribl platform
          when the request leaves the app. Browsers never see it.
        </Text>
        <PasswordField label="Anthropic API key" value={key} onChange={setKey} placeholder="sk-ant-…" autoComplete="off" />
      </div>
    </Modal>
  );
}
