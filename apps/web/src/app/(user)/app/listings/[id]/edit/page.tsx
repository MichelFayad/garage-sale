import { EditListing } from './EditListing';

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Edit listing</h1>
      <EditListing id={id} />
    </section>
  );
}
