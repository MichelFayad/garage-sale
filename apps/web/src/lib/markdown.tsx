// Minimal, safe Markdown renderer for CMS pages. Renders to React elements (never
// dangerouslySetInnerHTML) so untrusted authored content can't inject markup.
// Supported subset — enough for marketing + legal prose:
//   # / ## / ###  headings
//   - …          unordered lists
//   blank line    paragraph break
//   **bold**      inline bold
//   [text](url)   links (http/https/relative only; others render as plain text)
import { Fragment, type ReactNode } from 'react';

const SAFE_HREF = /^(https?:\/\/|\/)/i;

// Split a line into React nodes, resolving **bold** and [text](url).
function renderInline(text: string, keyBase: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((tok, i) => {
    const key = `${keyBase}-${i}`;
    const bold = /^\*\*([^*]+)\*\*$/.exec(tok);
    if (bold) return <strong key={key}>{bold[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
    if (link) {
      const label = link[1] ?? '';
      const href = link[2] ?? '';
      if (SAFE_HREF.test(href)) {
        const external = href.startsWith('http');
        return (
          <a
            key={key}
            href={href}
            className="text-gray-900 underline"
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {label}
          </a>
        );
      }
      return <Fragment key={key}>{label}</Fragment>; // unsafe scheme → plain text
    }
    return <Fragment key={key}>{tok}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const key = `p-${blocks.length}`;
      blocks.push(
        <p key={key} className="text-gray-700">
          {renderInline(para.join(' '), key)}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const key = `ul-${blocks.length}`;
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-6 text-gray-700">
          {list.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = (heading[1] ?? '').length;
      const key = `h-${blocks.length}`;
      const cls =
        level === 1
          ? 'text-3xl font-bold'
          : level === 2
            ? 'mt-8 text-2xl font-semibold'
            : 'mt-6 text-xl font-semibold';
      const content = renderInline(heading[2] ?? '', key);
      if (level === 1)
        blocks.push(
          <h1 key={key} className={cls}>
            {content}
          </h1>,
        );
      else if (level === 2)
        blocks.push(
          <h2 key={key} className={cls}>
            {content}
          </h2>,
        );
      else
        blocks.push(
          <h3 key={key} className={cls}>
            {content}
          </h3>,
        );
    } else if (item) {
      flushPara();
      list.push(item[1] ?? '');
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-4">{blocks}</div>;
}
