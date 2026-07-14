import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../core/api_exception.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';
import '../listings/providers.dart';

class ListingFormScreen extends ConsumerStatefulWidget {
  const ListingFormScreen({super.key, this.existing});
  final Listing? existing;

  @override
  ConsumerState<ListingFormScreen> createState() => _ListingFormScreenState();
}

class _ListingFormScreenState extends ConsumerState<ListingFormScreen> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _cityController;
  late ListingType _type;
  late Condition _condition;
  String? _categoryId;
  final List<TextEditingController> _photoControllers = [];
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _titleController = TextEditingController(text: existing?.title ?? '');
    _descriptionController = TextEditingController(text: existing?.description ?? '');
    _cityController = TextEditingController(text: existing?.city ?? '');
    _type = existing?.type ?? ListingType.have;
    _condition = existing?.condition ?? Condition.good;
    _categoryId = existing?.categoryId;
    for (final photo in existing?.photos ?? const <ListingPhoto>[]) {
      _photoControllers.add(TextEditingController(text: photo.url));
    }
  }

  Future<void> _submit() async {
    if (_categoryId == null) {
      setState(() => _error = 'Choose a category');
      return;
    }
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final token = await ref.read(tokenStorageProvider).getAccessToken();
      if (token == null) {
        throw const ApiException(401, 'Not authenticated');
      }
      final input = ListingInput(
        type: _type,
        title: _titleController.text,
        description: _descriptionController.text,
        condition: _condition,
        categoryId: _categoryId!,
        city: _cityController.text.isEmpty ? null : _cityController.text,
        photos: _photoControllers
            .map((c) => c.text)
            .where((url) => url.isNotEmpty)
            .toList(),
      );
      final repo = ref.read(listingsRepositoryProvider);
      if (widget.existing == null) {
        await repo.create(input, token);
      } else {
        await repo.update(widget.existing!.id, input, token);
      }
      ref.invalidate(myListingsControllerProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Failed to save listing. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _addPhotoField() {
    setState(() => _photoControllers.add(TextEditingController()));
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? 'New Listing' : 'Edit Listing'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButton<ListingType>(
              key: const Key('type_dropdown'),
              value: _type,
              items: ListingType.values
                  .map((t) => DropdownMenuItem(value: t, child: Text(t.name)))
                  .toList(),
              onChanged: (value) => setState(() => _type = value ?? _type),
            ),
            TextField(
              key: const Key('title_field'),
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            TextField(
              key: const Key('description_field'),
              controller: _descriptionController,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLines: 3,
            ),
            DropdownButton<Condition>(
              key: const Key('condition_dropdown'),
              value: _condition,
              items: Condition.values
                  .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                  .toList(),
              onChanged: (value) => setState(() => _condition = value ?? _condition),
            ),
            categoriesAsync.when(
              loading: () => const CircularProgressIndicator(),
              error: (error, _) => const Text('Failed to load categories'),
              data: (categories) => DropdownButton<String>(
                key: const Key('category_dropdown'),
                value: _categoryId,
                hint: const Text('Choose a category'),
                items: categories
                    .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                    .toList(),
                onChanged: (value) => setState(() => _categoryId = value),
              ),
            ),
            TextField(
              key: const Key('city_field'),
              controller: _cityController,
              decoration: const InputDecoration(labelText: 'City (optional)'),
            ),
            const SizedBox(height: 8),
            const Text('Photo URLs'),
            for (var i = 0; i < _photoControllers.length; i++)
              TextField(
                key: Key('photo_field_$i'),
                controller: _photoControllers[i],
                decoration: const InputDecoration(labelText: 'Photo URL'),
              ),
            TextButton(
              key: const Key('add_photo_button'),
              onPressed: _addPhotoField,
              child: const Text('Add photo'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('save_listing_button'),
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
