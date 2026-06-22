// Payment method management — view card-on-file status, add/replace via the Stripe
// PaymentSheet, or remove the saved card. Mirrors the web billing settings.

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useCardSheet } from '../billing/useCardSheet';
import { ErrorText, Loading, PrimaryButton, SecondaryButton, colors } from '../components/ui';

type Status = Awaited<ReturnType<typeof trpc.billing.status.query>>;

export function PaymentMethodScreen() {
  const addCard = useCardSheet();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await trpc.billing.status.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payment method');
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
    await load();
  }

  function confirmRemove() {
    Alert.alert('Remove card?', 'You will need to add one again before publishing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await trpc.billing.removeCard.mutate();
              await load();
            } catch (err) {
              Alert.alert('Could not remove', err instanceof Error ? err.message : 'Try again');
            }
          })();
        },
      },
    ]);
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!status) return <Loading />;

  return (
    <View style={styles.container}>
      <Text style={styles.status}>
        {status.paymentValid
          ? '✓ Card on file'
          : status.hasCard
            ? 'Card pending verification'
            : 'No card on file'}
      </Text>
      <PrimaryButton
        title={status.hasCard ? 'Replace card' : 'Add a card'}
        busy={busy}
        onPress={() => void onAddCard()}
      />
      {status.hasCard && <SecondaryButton title="Remove card" onPress={confirmRemove} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  status: { fontSize: 16, fontWeight: '600', color: colors.text },
});
