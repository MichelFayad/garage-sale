import { TradeThread } from './TradeThread';

export default async function TradeThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="py-8">
      <TradeThread id={id} />
    </section>
  );
}
