import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedPage } from '../../../lib/server';
import { Markdown } from '../../../lib/markdown';

// Public renderer for CMS pages (marketing + legal). Slug resolves to a PUBLISHED
// ContentPage; drafts and unknown slugs 404. Body is authored Markdown.
// Static + ISR — revalidated hourly so published edits show without a redeploy.
export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description ?? undefined,
    alternates: { canonical: `/${slug}` },
  };
}

export default async function ContentPageRoute({ params }: Params) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) notFound();
  return (
    <article className="py-12">
      <h1 className="text-3xl font-bold">{page.title}</h1>
      <div className="mt-8">
        <Markdown source={page.body} />
      </div>
    </article>
  );
}
