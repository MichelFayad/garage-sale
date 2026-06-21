import { ListingDetail } from './ListingDetail';

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="py-8">
      <ListingDetail id={id} />
    </section>
  );
}
