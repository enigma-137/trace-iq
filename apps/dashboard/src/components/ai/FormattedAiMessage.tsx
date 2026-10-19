import React, { useMemo } from 'react';
import Link from 'next/link';

interface FormattedAiMessageProps {
  content: string;
  className?: string;
}

type BlockType =
  | { type: 'heading'; level: number; text: string }
  | { type: 'codeblock'; language?: string; code: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string };

/**
 * Parses and renders markdown text with zero external dependencies.
 * Specially tuned for TraceIQ AI responses (observations, correlations, hypotheses, bullet points, metrics, code).
 */
export function FormattedAiMessage({ content, className = '' }: FormattedAiMessageProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={`space-y-3.5 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 ${className}`}>
      {blocks.map((block, idx) => (
        <React.Fragment key={idx}>{renderBlock(block, idx)}</React.Fragment>
      ))}
    </div>
  );
}

function parseBlocks(raw: string): BlockType[] {
  if (!raw) return [];
  const lines = raw.trim().split(/\r?\n/);
  const blocks: BlockType[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Code block ```
    if (line.trim().startsWith('```')) {
      const language = line.trim().replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: 'codeblock',
        language: language || undefined,
        code: codeLines.join('\n')
      });
      continue;
    }

    // Heading (# ## ###)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      i++;
      continue;
    }

    // Blockquote (> )
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n')
      });
      continue;
    }

    // Unordered List (- or * or •)
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'list',
        ordered: false,
        items
      });
      continue;
    }

    // Ordered List (1. 2.)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'list',
        ordered: true,
        items
      });
      continue;
    }

    // Regular Paragraph (or multi-line paragraph until empty line or special marker)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^(#{1,4})\s+/) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>')
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paraLines.join('\n')
      });
    }
  }

  return blocks;
}

function renderBlock(block: BlockType, key: number) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
      const sizeClasses =
        block.level === 1
          ? 'text-base font-bold text-neutral-900 dark:text-white mt-2'
          : block.level === 2
            ? 'text-sm font-semibold text-neutral-900 dark:text-white mt-1.5'
            : 'text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mt-1';

      return (
        <Tag key={key} className={sizeClasses}>
          {renderInline(block.text)}
        </Tag>
      );
    }

    case 'codeblock':
      return (
        <div key={key} className="my-2 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900 text-xs text-neutral-100 shadow-sm dark:border-neutral-800">
          {block.language ? (
            <div className="border-b border-neutral-800 bg-neutral-950/80 px-3 py-1 font-mono text-[10px] text-neutral-400">
              {block.language}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-3 font-mono leading-relaxed">
            <code>{block.code}</code>
          </pre>
        </div>
      );

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-blue-500 bg-blue-50/50 py-1.5 pl-3 pr-2 text-xs italic text-neutral-700 dark:border-blue-400 dark:bg-blue-950/20 dark:text-neutral-300 rounded-r"
        >
          {renderInline(block.text)}
        </blockquote>
      );

    case 'list': {
      if (block.ordered) {
        return (
          <ol key={key} className="my-1.5 space-y-1.5 pl-5 list-decimal text-neutral-700 dark:text-neutral-300">
            {block.items.map((item, i) => (
              <li key={i} className="pl-1">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }

      return (
        <ul key={key} className="my-1.5 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-neutral-700 dark:text-neutral-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
              <div className="flex-1">{renderInline(item)}</div>
            </li>
          ))}
        </ul>
      );
    }

    case 'paragraph':
    default:
      return (
        <p key={key} className="leading-relaxed">
          {renderInline(block.text)}
        </p>
      );
  }
}

/**
 * Tokenizes and renders bold (**text**), italics (*text*), inline code (`code`),
 * links ([title](url)), and AI badge keywords (OBSERVED, CORRELATED, HYPOTHESIS).
 */
function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Special section highlight tags at start of lines or phrases
  // e.g. **OBSERVED:**, **CORRELATED:**, **HYPOTHESIS:**, **Executive Summary:**
  const parts: React.ReactNode[] = [];

  // Regex to match markdown tokens:
  // 1: `code`
  // 2: **bold** or __bold__
  // 3: *italic* or _italic_
  // 4: [link text](url)
  // Underscore emphasis only counts at word boundaries, so snake_case names
  // like payment_gateway_returned stay intact.
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|(?<![A-Za-z0-9])__[^_]+__(?![A-Za-z0-9])|\*[^*]+\*|(?<![A-Za-z0-9])_[^_]+_(?![A-Za-z0-9])|\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Add preceding plain text
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    // Inline code `...`
    if (token.startsWith('`') && token.endsWith('`')) {
      const code = token.slice(1, -1);
      parts.push(
        <code
          key={match.index}
          className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-blue-700 dark:border-neutral-800 dark:bg-neutral-800 dark:text-blue-300"
        >
          {code}
        </code>
      );
    }
    // Bold **...** or __...__
    else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      const boldText = token.slice(2, -2);

      // Check for specialized section label styling
      if (/^OBSERVED:?$/i.test(boldText.trim())) {
        parts.push(
          <span
            key={match.index}
            className="inline-flex items-center rounded border border-blue-200 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/60 dark:text-blue-300"
          >
            {boldText}
          </span>
        );
      } else if (/^CORRELATED:?$/i.test(boldText.trim())) {
        parts.push(
          <span
            key={match.index}
            className="inline-flex items-center rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/60 dark:text-purple-300"
          >
            {boldText}
          </span>
        );
      } else if (/^HYPOTHESIS:?$/i.test(boldText.trim())) {
        parts.push(
          <span
            key={match.index}
            className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-300"
          >
            {boldText}
          </span>
        );
      } else {
        parts.push(
          <strong key={match.index} className="font-semibold text-neutral-900 dark:text-white">
            {boldText}
          </strong>
        );
      }
    }
    // Italic *...* or _..._
    else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      const italicText = token.slice(1, -1);
      parts.push(
        <em key={match.index} className="italic text-neutral-800 dark:text-neutral-200">
          {italicText}
        </em>
      );
    }
    // Link [text](url)
    else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        // In-app paths (dashboard pages, docs) open in place; others in a new tab.
        if (href.startsWith('/') && !href.startsWith('//')) {
          parts.push(
            <Link
              key={match.index}
              href={href}
              className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {label}
            </Link>
          );
          lastIndex = match.index + token.length;
          continue;
        }
        parts.push(
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {label}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
