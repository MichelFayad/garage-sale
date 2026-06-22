// Blocked traders — list + unblock. Blocking happens from a trade thread; this is
// the management surface. Mirrors the web /app/blocks.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { Card, ErrorText, Loading, SecondaryButton, colors } from '../components/ui';

type Block = Awaited<ReturnType<typeof trpc.blocks.list.query>>[number];

export function BlocksScreen() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocks(await trpc.blocks.list.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load blocks');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(userId: string) {
    try {
      await trpc.blocks.unblock.mutate({ userId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock');
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!blocks) return <Loading />;

  return (
    <FlatList
      data={blocks}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>You have not blocked anyone.</Text>}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.blocked.displayName}</Text>
              {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
            </View>
            <SecondaryButton title="Unblock" onPress={() => void unblock(item.blocked.id)} />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  reason: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
