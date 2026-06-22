// Listing detail — full record with a photo carousel, owner, and a watchlist
// toggle. Trade proposal + block actions land in the trades stage of P12.

import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { trpc } from '../api/client';
import {
  Badge,
  Loading,
  ErrorText,
  PrimaryButton,
  SecondaryButton,
  colors,
} from '../components/ui';

type Listing = Awaited<ReturnType<typeof trpc.listings.byId.query>>;

export function ListingDetailScreen({ id }: { id: string }) {
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [l, watch] = await Promise.all([
          trpc.listings.byId.query({ id }),
          trpc.watchlist.list.query(),
        ]);
        if (!active) return;
        setListing(l);
        setWatched(watch.some((w) => w.listingId === id));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load listing');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function toggleWatch() {
    setBusy(true);
    try {
      if (watched) {
        await trpc.watchlist.remove.mutate({ listingId: id });
        setWatched(false);
      } else {
        await trpc.watchlist.add.mutate({ listingId: id });
        setWatched(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update watchlist');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!listing) return <Loading />;

  const photoSize = width;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {listing.photos.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {listing.photos.map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.url }}
              style={{ width: photoSize, height: photoSize }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.noPhoto, { height: photoSize * 0.6 }]}>
          <Text style={styles.noPhotoText}>No photos</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.badges}>
          <Badge label={listing.type} tone="accent" />
          <Badge label={listing.condition.replace('_', ' ')} />
          <Badge label={listing.category.name} />
        </View>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.desc}>{listing.description}</Text>

        {listing.type === 'HAVE' && listing.wantedDescription ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Wants in return</Text>
            <Text style={styles.desc}>{listing.wantedDescription}</Text>
          </View>
        ) : null}

        {(listing.city || listing.neighbourhood) && (
          <Text style={styles.meta}>
            {[listing.neighbourhood, listing.city].filter(Boolean).join(', ')}
          </Text>
        )}
        <Text style={styles.meta}>Posted by {listing.owner.displayName}</Text>

        <View style={styles.actions}>
          <PrimaryButton
            title={watched ? '★ Watching' : '☆ Add to watchlist'}
            tone={watched ? 'neutral' : 'accent'}
            busy={busy}
            onPress={() => void toggleWatch()}
          />
          <SecondaryButton title="Propose trade (coming soon)" disabled onPress={() => {}} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f2f2' },
  noPhotoText: { color: colors.faint },
  body: { padding: 16, gap: 10 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  desc: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  section: { gap: 4, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.faint },
  actions: { gap: 10, marginTop: 12 },
});
