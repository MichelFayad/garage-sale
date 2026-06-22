// My Listings — the trader's own listings (any status) with edit / mark-traded /
// remove actions, plus a "new listing" entry point. Mirrors the web /app/listings.

import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  PrimaryButton,
  SecondaryButton,
  colors,
} from '../components/ui';

type Listing = Awaited<ReturnType<typeof trpc.listings.mine.query>>[number];

export function MyListingsScreen() {
  const { push } = useNav();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setListings(await trpc.listings.mine.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load listings');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markTraded(id: string) {
    try {
      await trpc.listings.markTraded.mutate({ id });
      await load();
    } catch (err) {
      Alert.alert('Could not mark traded', err instanceof Error ? err.message : 'Try again');
    }
  }

  function confirmRemove(id: string) {
    Alert.alert('Remove listing?', 'This hides it from browse.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await trpc.listings.remove.mutate({ id });
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
  if (!listings) return <Loading />;

  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <PrimaryButton title="+ New listing" onPress={() => push({ name: 'listingForm' })} />
      }
      ListEmptyComponent={<Text style={styles.empty}>No listings yet. Create your first one.</Text>}
      renderItem={({ item }) => (
        <Card onPress={() => push({ name: 'listingDetail', id: item.id })}>
          <View style={styles.row}>
            {item.photos[0] ? (
              <Image source={{ uri: item.photos[0].url }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.badges}>
                <Badge label={item.type} tone="accent" />
                <Badge label={item.status} />
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            {item.status === 'DRAFT' && (
              <SecondaryButton
                title="Publish"
                onPress={() => push({ name: 'publish', listingId: item.id })}
              />
            )}
            {(item.status === 'DRAFT' || item.status === 'ACTIVE') && (
              <SecondaryButton
                title="Edit"
                onPress={() => push({ name: 'listingForm', id: item.id })}
              />
            )}
            {item.status === 'ACTIVE' && (
              <SecondaryButton title="Mark traded" onPress={() => void markTraded(item.id)} />
            )}
            {item.status !== 'LOCKED' && item.status !== 'REMOVED' && (
              <SecondaryButton title="Remove" onPress={() => confirmRemove(item.id)} />
            )}
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  info: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  badges: { flexDirection: 'row', gap: 6 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
