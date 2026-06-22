// Propose / counter a trade — pick one or more of your ACTIVE listings to offer.
// `new` proposes against a target listing; `counter` replies to an open proposal.
// Mirrors the web propose + counter flows (trades.propose / trades.counter).

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import { ErrorText, Loading, PrimaryButton, colors } from '../components/ui';
import type { Route } from '../navigation/routes';

type Listing = Awaited<ReturnType<typeof trpc.listings.mine.query>>[number];
type Props = Extract<Route, { name: 'proposeTrade' }>;

export function ProposeTradeScreen(props: Props) {
  const { pop, push } = useNav();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const mine = await trpc.listings.mine.query();
      setListings(mine.filter((l) => l.status === 'ACTIVE'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your listings');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    const offeredListingIds = [...selected];
    if (offeredListingIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (props.mode === 'new') {
        const created = await trpc.trades.propose.mutate({
          listingId: props.listingId,
          offeredListingIds,
        });
        pop();
        push({ name: 'tradeDetail', id: created.id });
      } else {
        const created = await trpc.trades.counter.mutate({
          id: props.proposalId,
          offeredListingIds,
        });
        pop();
        push({ name: 'tradeDetail', id: created.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
      setBusy(false);
    }
  }

  if (error && !listings) return <ErrorText>{error}</ErrorText>;
  if (!listings) return <Loading />;

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Choose what to offer</Text>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>You have no active listings to offer. Publish one first.</Text>
        }
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(item.id)}
              style={[styles.item, on && styles.itemOn]}
            >
              <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>{item.category.name}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <View style={styles.footer}>
        <PrimaryButton
          title={props.mode === 'new' ? 'Send proposal' : 'Send counter'}
          busy={busy}
          disabled={selected.size === 0}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: { fontSize: 16, fontWeight: '600', color: colors.text, padding: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 12, gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  itemOn: { borderColor: colors.accent, backgroundColor: colors.chip },
  check: { fontSize: 20, color: colors.accent },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
