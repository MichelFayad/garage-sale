// Publish a draft listing — collects a card on file if needed, then charges the
// non-refundable per-post fee (billing.publishListing). Mirrors the web publish gate.

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import { useCardSheet } from '../billing/useCardSheet';
import { ErrorText, Loading, PrimaryButton, SecondaryButton, colors } from '../components/ui';

type Status = Awaited<ReturnType<typeof trpc.billing.status.query>>;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PublishScreen({ listingId }: { listingId: string }) {
  const { pop } = useNav();
  const addCard = useCardSheet();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await trpc.billing.status.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load billing status');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAddCard() {
    setBusy(true);
    const res = await addCard();
    setBusy(false);
    if (res.cancelled) return;
    if (!res.ok) {
      Alert.alert('Card setup failed', res.error ?? 'Try again');
      return;
    }
    Alert.alert('Card saved', 'It may take a moment to verify before you can publish.');
    await load();
  }

  async function publish() {
    setBusy(true);
    try {
      await trpc.billing.publishListing.mutate({ listingId });
      Alert.alert('Published', 'Your listing is now live.');
      pop();
    } catch (err) {
      Alert.alert('Publish failed', err instanceof Error ? err.message : 'Try again');
      setBusy(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!status) return <Loading />;

  return (
    <View style={styles.container}>
      <Text style={styles.fee}>Per-post fee: {money(status.feeCents)}</Text>
      <Text style={styles.note}>
        The fee is charged when your listing goes live and is non-refundable. Editing a live listing
        is free.
      </Text>

      {status.paymentValid ? (
        <>
          <Text style={styles.cardLine}>✓ Card on file</Text>
          <PrimaryButton
            title={`Publish — ${money(status.feeCents)}`}
            busy={busy}
            onPress={() => void publish()}
          />
          <SecondaryButton title="Replace card" onPress={() => void onAddCard()} />
        </>
      ) : (
        <>
          <Text style={styles.note}>
            {status.hasCard
              ? 'Your card is being verified. Add it again if publishing stays blocked.'
              : 'Add a card to publish your listing.'}
          </Text>
          <PrimaryButton title="Add a card" busy={busy} onPress={() => void onAddCard()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  fee: { fontSize: 18, fontWeight: '700', color: colors.text },
  note: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  cardLine: { fontSize: 15, color: colors.success, fontWeight: '600' },
});
