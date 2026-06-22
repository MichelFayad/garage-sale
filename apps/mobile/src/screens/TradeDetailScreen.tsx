// Trade detail / thread — offered + requested items, status-driven actions
// (accept / decline / counter / cancel / confirm / rate), the proposal-scoped
// message thread, plus report and block. Mirrors the web /app/trades/[id].

import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { trpc } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useNav } from '../navigation/NavContext';
import {
  Badge,
  ErrorText,
  Loading,
  PrimaryButton,
  SecondaryButton,
  colors,
} from '../components/ui';

type Proposal = Awaited<ReturnType<typeof trpc.trades.byId.query>>;
type Message = Awaited<ReturnType<typeof trpc.trades.messages.query>>[number];

export function TradeDetailScreen({ id }: { id: string }) {
  const { user } = useAuth();
  const { push } = useNav();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counterpartyId = proposal
    ? proposal.proposerId === user?.id
      ? proposal.ownerId
      : proposal.proposerId
    : null;

  const load = useCallback(async () => {
    try {
      const [p, msgs] = await Promise.all([
        trpc.trades.byId.query({ id }),
        trpc.trades.messages.query({ proposalId: id }),
      ]);
      setProposal(p);
      setMessages(msgs);
      const otherId = p.proposerId === user?.id ? p.ownerId : p.proposerId;
      const status = await trpc.blocks.status.query({ userId: otherId });
      setBlocked(status.blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trade');
    }
  }, [id, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await trpc.trades.sendMessage.mutate({ proposalId: id, body });
      setDraft('');
      setMessages(await trpc.trades.messages.query({ proposalId: id }));
    } catch (err) {
      Alert.alert('Message failed', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  function reportCounterparty() {
    if (!counterpartyId) return;
    Alert.prompt?.('Report trader', 'Describe the issue', (reason) => {
      if (!reason) return;
      void (async () => {
        try {
          await trpc.trades.report.mutate({
            targetType: 'USER',
            targetId: counterpartyId,
            reason,
          });
          Alert.alert('Reported', 'Thanks — our team will review.');
        } catch (err) {
          Alert.alert('Report failed', err instanceof Error ? err.message : 'Try again');
        }
      })();
    });
  }

  async function toggleBlock() {
    if (!counterpartyId) return;
    await act(async () => {
      if (blocked) await trpc.blocks.unblock.mutate({ userId: counterpartyId });
      else await trpc.blocks.block.mutate({ userId: counterpartyId });
    });
  }

  if (error && !proposal) return <ErrorText>{error}</ErrorText>;
  if (!proposal) return <Loading />;

  const iAmOwner = proposal.ownerId === user?.id;
  const iConfirmed = proposal.confirmations.some((c) => c.userId === user?.id);
  const iRated = proposal.ratings.some((r) => r.raterId === user?.id);

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <Text style={styles.h1}>{proposal.listing.title}</Text>
            <Badge label={proposal.status} tone="accent" />
          </View>

          <Text style={styles.sectionLabel}>Offered</Text>
          {proposal.items.map((it) => (
            <Text key={it.id} style={styles.itemLine}>
              • {it.listing.title}
            </Text>
          ))}

          <View style={styles.actions}>
            {proposal.status === 'PROPOSED' && iAmOwner && (
              <>
                <PrimaryButton
                  title="Accept"
                  busy={busy}
                  onPress={() => void act(() => trpc.trades.accept.mutate({ id }))}
                />
                <SecondaryButton
                  title="Decline"
                  onPress={() => void act(() => trpc.trades.decline.mutate({ id }))}
                />
              </>
            )}
            {proposal.status === 'PROPOSED' && (
              <SecondaryButton
                title="Counter"
                onPress={() => push({ name: 'proposeTrade', mode: 'counter', proposalId: id })}
              />
            )}
            {(proposal.status === 'PROPOSED' || proposal.status === 'ACCEPTED') && (
              <SecondaryButton
                title="Cancel trade"
                onPress={() => void act(() => trpc.trades.cancel.mutate({ id }))}
              />
            )}
            {proposal.status === 'ACCEPTED' &&
              (iConfirmed ? (
                <Text style={styles.note}>You confirmed — waiting for the other trader.</Text>
              ) : (
                <PrimaryButton
                  title="Confirm trade"
                  busy={busy}
                  onPress={() => void act(() => trpc.trades.confirm.mutate({ id }))}
                />
              ))}
          </View>

          {proposal.status === 'COMPLETED' && !iRated && (
            <RatePanel proposalId={id} onDone={() => void load()} />
          )}
          {proposal.status === 'COMPLETED' && iRated && (
            <Text style={styles.note}>Thanks for rating this trade.</Text>
          )}

          <View style={styles.utilRow}>
            <SecondaryButton title="Report" onPress={reportCounterparty} />
            <SecondaryButton
              title={blocked ? 'Unblock' : 'Block'}
              onPress={() => void toggleBlock()}
            />
          </View>

          <Text style={styles.sectionLabel}>Messages</Text>
        </View>
      }
      renderItem={({ item }) => {
        const mine = item.senderId === user?.id;
        return (
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={styles.bubbleAuthor}>{mine ? 'You' : item.sender.displayName}</Text>
            <Text style={styles.bubbleBody}>{item.body}</Text>
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.note}>No messages yet.</Text>}
      ListFooterComponent={
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.faint}
            multiline
          />
          <PrimaryButton
            title="Send"
            busy={busy}
            disabled={!draft.trim()}
            onPress={() => void send()}
          />
        </View>
      }
    />
  );
}

function RatePanel({ proposalId, onDone }: { proposalId: string; onDone(): void }) {
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await trpc.trades.rate.mutate({ id: proposalId, stars, review: review.trim() || undefined });
      onDone();
    } catch (err) {
      Alert.alert('Rating failed', err instanceof Error ? err.message : 'Try again');
      setBusy(false);
    }
  }

  return (
    <View style={styles.rate}>
      <Text style={styles.sectionLabel}>Rate this trade</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            onPress={() => setStars(n)}
          >
            <Text style={styles.star}>{n <= stars ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={review}
        onChangeText={setReview}
        placeholder="Optional review"
        placeholderTextColor={colors.faint}
        maxLength={1000}
        multiline
      />
      <PrimaryButton title="Submit rating" busy={busy} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 8 },
  header: { gap: 8, marginBottom: 8 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  h1: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 8 },
  itemLine: { fontSize: 15, color: colors.muted },
  actions: { gap: 8, marginTop: 8 },
  utilRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  note: { fontSize: 14, color: colors.muted, fontStyle: 'italic' },
  rate: { gap: 8, marginTop: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 28, color: colors.accent },
  bubble: { borderRadius: 10, padding: 10, maxWidth: '85%', gap: 2 },
  bubbleMine: { backgroundColor: colors.chip, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: '#f2f2f2', alignSelf: 'flex-start' },
  bubbleAuthor: { fontSize: 11, fontWeight: '600', color: colors.faint },
  bubbleBody: { fontSize: 15, color: colors.text },
  composer: { gap: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    minHeight: 44,
  },
});
