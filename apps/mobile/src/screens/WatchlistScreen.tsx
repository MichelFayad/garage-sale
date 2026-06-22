// Watchlist — listings the trader is following, newest first. Tap to open detail
// (where they can unwatch). Mirrors the web /app/watchlist.

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import { Badge, Card, ErrorText, Loading, colors } from '../components/ui';

type Entry = Awaited<ReturnType<typeof trpc.watchlist.list.query>>[number];

export function WatchlistScreen() {
  const { push } = useNav();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await trpc.watchlist.list.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load watchlist');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!entries) return <Loading />;

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      refreshing={false}
      onRefresh={() => void load()}
      ListEmptyComponent={<Text style={styles.empty}>Nothing watched yet.</Text>}
      renderItem={({ item }) => (
        <Card onPress={() => push({ name: 'listingDetail', id: item.listing.id })}>
          <View style={styles.row}>
            {item.listing.photos[0] ? (
              <Image source={{ uri: item.listing.photos[0].url }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.listing.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.listing.category.name} · {item.listing.condition.replace('_', ' ')}
              </Text>
              <Badge label={item.listing.status} />
            </View>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
