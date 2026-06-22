import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { serverApi } from '../../../lib/server';
import { Markdown } from '../../../lib/markdown';

// Public renderer for CMS pages (marketing + legal). Slug resolves to a PUBLISHED
// ContentPage; drafts and unknown slugs 404. Body is authored Markdown.
type Params = { params: Promise<{ slug: string }> };

async function getPage(slug: string) {
  try {
    const api = await serverApi();
    return await api.content.bySlug({ slug });
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description ?? undefined,
    alternates: { canonical: `/${slug}` },
  };
}

export default async function ContentPageRoute({ params }: Params) {
  const { slug } = await params;
  const page = await getPage(slug);
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
