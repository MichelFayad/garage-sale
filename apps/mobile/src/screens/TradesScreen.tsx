// Trades tab — proposals the trader is involved in (as proposer or owner), newest
// first. Tap to open the thread. Mirrors the web /app/trades list.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useNav } from '../navigation/NavContext';
import { Badge, Card, ErrorText, Loading, colors } from '../components/ui';

type Proposal = Awaited<ReturnType<typeof trpc.trades.mine.query>>[number];

export function TradesScreen() {
  const { user } = useAuth();
  const { push } = useNav();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProposals(await trpc.trades.mine.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trades');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!proposals) return <Loading />;

  return (
    <FlatList
      data={proposals}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshing={false}
      onRefresh={() => void load()}
      ListEmptyComponent={<Text style={styles.empty}>No trades yet.</Text>}
      renderItem={({ item }) => {
        const iAmProposer = item.proposerId === user?.id;
        const counterparty = iAmProposer ? item.owner.displayName : item.proposer.displayName;
        return (
          <Card onPress={() => push({ name: 'tradeDetail', id: item.id })}>
            <View style={styles.headRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.listing.title}
              </Text>
              <Badge label={item.status} tone="accent" />
            </View>
            <Text style={styles.meta}>
              {iAmProposer ? 'You proposed' : 'Proposal received'} · with {counterparty}
            </Text>
            <Text style={styles.meta}>
              {item.items.length} item{item.items.length === 1 ? '' : 's'} offered
            </Text>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  meta: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
