import type { ReactNode } from 'react';

/**
 * Renders a policy body.
 *
 * The legal documents are written by an Admin as plain markdown and then shown to
 * every account, so the input is trusted prose but still text that has passed
 * through a database. Rather than add a parser and an innerHTML surface for the
 * one place in the portal that needs prose, only the documented subset is
 * rendered - headings, paragraphs, bullet and numbered lists, **bold** and
 * `code` - and it is built from React elements, so nothing is ever injected.
 *
 * Anything outside the subset shows as literal text instead of breaking, which is
 * the right failure for a legal notice: readable, never silently dropped.
 */

const HEADING = /^(#{1,4})\s+(.+)$/;
const BULLET = /^[-*]\s+(.+)$/;
const NUMBERED = /^\d+[.)]\s+(.+)$/;

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let numbered = false;

  function pushParagraph(key: string) {
    if (paragraph.length === 0) return;
    blocks.push(<p key={key}>{inline(paragraph.join(' '), key)}</p>);
    paragraph = [];
  }

  function pushList(key: string) {
    if (items.length === 0) return;
    const children = items.map((item, i) => <li key={`${key}-li${i}`}>{inline(item, `${key}-li${i}`)}</li>);
    blocks.push(
      numbered ? (
        <ol key={key}>
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      ),
    );
    items = [];
  }

  let blockIndex = 0;
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();

    if (line === '') {
      pushParagraph(`b${blockIndex}`);
      pushList(`b${blockIndex}`);
      blockIndex += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      pushParagraph(`b${blockIndex}`);
      pushList(`b${blockIndex}`);
      const level = heading[1].length;
      const text = inline(heading[2], `b${blockIndex}h`);
      blocks.push(
        level <= 2 ? (
          <h2 key={`b${blockIndex}h`}>{text}</h2>
        ) : level === 3 ? (
          <h3 key={`b${blockIndex}h`}>{text}</h3>
        ) : (
          <h4 key={`b${blockIndex}h`}>{text}</h4>
        ),
      );
      blockIndex += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numeric = NUMBERED.exec(line);
    if (bullet || numeric) {
      pushParagraph(`b${blockIndex}`);
      const isNumbered = Boolean(numeric);
      // A change of list style starts a new list; items of one style group together.
      if (items.length > 0 && numbered !== isNumbered) {
        pushList(`b${blockIndex}`);
        blockIndex += 1;
      }
      numbered = isNumbered;
      items.push((bullet ?? numeric)![1]);
      continue;
    }

    pushList(`b${blockIndex}`);
    paragraph.push(line);
  }

  pushParagraph(`b${blockIndex}`);
  pushList(`b${blockIndex}`);

  return <div className={`prose ${className}`.trim()}>{blocks}</div>;
}

/** Bold and inline code only. No links, no HTML: a policy notice does not need either. */
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let step = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <b key={`${keyBase}-${step}`} style={{ fontWeight: 500, color: 'var(--ink)' }}>
          {match[1]}
        </b>,
      );
    } else {
      nodes.push(
        <code key={`${keyBase}-${step}`} className="mono">
          {match[2]}
        </code>,
      );
    }
    cursor = match.index + match[0].length;
    step += 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * The first meaningful line of a body, used where a list needs a summary instead
 * of the whole document. Skips headings so the summary is the sentence, not the title.
 */
export function markdownSummary(source: string, maxChars = 180): string {
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line)) continue;
    const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
    return clean.length > maxChars ? `${clean.slice(0, maxChars).trimEnd()}…` : clean;
  }
  return 'No body text has been written for this version.';
}
