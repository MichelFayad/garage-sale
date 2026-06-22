// Listing create / edit form (native mirror of the web ListingForm). Saves a
// DRAFT (create) or edits a DRAFT/ACTIVE listing — publishing/charge is separate.
// Photos are URLs for now; camera/library upload lands in a later P12 stage.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { trpc } from '../api/client';
import { useNav } from '../navigation/NavContext';
import {
  ErrorText,
  Field,
  Loading,
  PrimaryButton,
  SecondaryButton,
  colors,
} from '../components/ui';

const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'] as const;
const TYPES = ['HAVE', 'WANT'] as const;

type Values = {
  type: (typeof TYPES)[number];
  title: string;
  description: string;
  condition: (typeof CONDITIONS)[number];
  categoryId: string;
  city: string;
  neighbourhood: string;
  wantedDescription: string;
  photos: string[];
};

const EMPTY: Values = {
  type: 'HAVE',
  title: '',
  description: '',
  condition: 'GOOD',
  categoryId: '',
  city: '',
  neighbourhood: '',
  wantedDescription: '',
  photos: [],
};

export function ListingFormScreen({ id }: { id?: string }) {
  const { pop } = useNav();
  const [values, setValues] = useState<Values>(EMPTY);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const cats = await trpc.listings.categories.query();
      setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
      if (id) {
        try {
          const l = await trpc.listings.byId.query({ id });
          setValues({
            type: l.type as Values['type'],
            title: l.title,
            description: l.description,
            condition: l.condition as Values['condition'],
            categoryId: l.categoryId,
            city: l.city ?? '',
            neighbourhood: l.neighbourhood ?? '',
            wantedDescription: l.wantedDescription ?? '',
            photos: l.photos.map((p) => p.url),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load listing');
        } finally {
          setLoading(false);
        }
      } else {
        setValues((v) => ({ ...v, categoryId: cats[0]?.id ?? '' }));
      }
    })();
  }, [id]);

  function set<K extends keyof Values>(key: K, val: Values[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = {
      type: values.type,
      title: values.title,
      description: values.description,
      condition: values.condition,
      categoryId: values.categoryId,
      city: values.city || undefined,
      neighbourhood: values.neighbourhood || undefined,
      wantedDescription: values.wantedDescription || undefined,
      photos: values.photos.map((p) => p.trim()).filter(Boolean),
    };
    try {
      if (id) {
        await trpc.listings.update.mutate({ id, ...payload });
      } else {
        await trpc.listings.create.mutate(payload);
      }
      pop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save listing');
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <ChipPicker
        label="Type"
        options={TYPES.map((t) => ({ value: t, label: t }))}
        selected={values.type}
        onSelect={(v) => set('type', v as Values['type'])}
      />
      <Field
        label="Title"
        value={values.title}
        onChangeText={(t) => set('title', t)}
        maxLength={120}
      />
      <Field
        label="Description"
        value={values.description}
        onChangeText={(t) => set('description', t)}
        maxLength={2000}
        multiline
      />
      <ChipPicker
        label="Condition"
        options={CONDITIONS.map((c) => ({ value: c, label: c.replace('_', ' ') }))}
        selected={values.condition}
        onSelect={(v) => set('condition', v as Values['condition'])}
      />
      <ChipPicker
        label="Category"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        selected={values.categoryId}
        onSelect={(v) => set('categoryId', v)}
      />
      <Field label="City" value={values.city} onChangeText={(t) => set('city', t)} />
      <Field
        label="Neighbourhood"
        value={values.neighbourhood}
        onChangeText={(t) => set('neighbourhood', t)}
      />
      {values.type === 'HAVE' && (
        <Field
          label="What you want in return"
          value={values.wantedDescription}
          onChangeText={(t) => set('wantedDescription', t)}
          maxLength={2000}
          multiline
        />
      )}

      <View style={styles.photos}>
        <Text style={styles.photosLabel}>Photo URLs (max 10)</Text>
        {values.photos.map((url, i) => (
          <View key={i} style={styles.photoRow}>
            <TextInput
              style={styles.photoInput}
              value={url}
              placeholder="https://…"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              onChangeText={(t) =>
                set(
                  'photos',
                  values.photos.map((p, idx) => (idx === i ? t : p)),
                )
              }
            />
            <Pressable
              accessibilityLabel={`Remove photo ${i + 1}`}
              onPress={() =>
                set(
                  'photos',
                  values.photos.filter((_, idx) => idx !== i),
                )
              }
              style={styles.photoRemove}
            >
              <Text aria-hidden style={styles.photoRemoveText}>
                ✕
              </Text>
            </Pressable>
          </View>
        ))}
        {values.photos.length < 10 && (
          <SecondaryButton
            title="+ Add photo"
            onPress={() => set('photos', [...values.photos, ''])}
          />
        )}
      </View>

      {error && <ErrorText>{error}</ErrorText>}
      <PrimaryButton
        title={id ? 'Save changes' : 'Create draft'}
        busy={busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

function ChipPicker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect(value: string): void;
}) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = selected === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              onPress={() => onSelect(o.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 14 },
  picker: { gap: 6 },
  pickerLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, color: colors.muted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  photos: { gap: 8 },
  photosLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  photoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  photoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  photoRemove: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 },
  photoRemoveText: { color: colors.muted, fontSize: 14 },
});
