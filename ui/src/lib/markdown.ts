// Streaming-friendly markdown → Block[] parser for assistant replies.
//
// Renders through the existing Run/Token component pipeline (no {@html}, no
// innerHTML), so it stays compatible with chrome:// Trusted Types. The parser
// is tolerant of mid-stream input: an unclosed ``` fence or **marker renders
// as literal text until its closer arrives, then upgrades in place.

import type { Block, Run } from './chat';

type InlineFlags = { b?: boolean; i?: boolean };

// Inline spans: `code`, **bold**, *italic* / _italic_, [text](url).
export function inlineRuns(text: string, flags: InlineFlags = {}): Run[] {
	const runs: Run[] = [];
	let plain = '';
	let i = 0;
	const flush = () => {
		if (plain) {
			runs.push({ text: plain, ...flags });
			plain = '';
		}
	};
	while (i < text.length) {
		const rest = text.slice(i);
		let m: RegExpExecArray | null;

		if ((m = /^`([^`]+)`/.exec(rest))) {
			flush();
			runs.push({ text: m[1], c: true });
			i += m[0].length;
			continue;
		}
		if (!flags.b && (m = /^\*\*([^\s*](?:.*?[^\s*])?)\*\*/.exec(rest))) {
			flush();
			runs.push(...inlineRuns(m[1], { ...flags, b: true }));
			i += m[0].length;
			continue;
		}
		if (!flags.i && (m = /^\*([^\s*](?:[^*]*[^\s*])?)\*/.exec(rest))) {
			flush();
			runs.push(...inlineRuns(m[1], { ...flags, i: true }));
			i += m[0].length;
			continue;
		}
		if (!flags.i && (m = /^_([^\s_](?:[^_]*[^\s_])?)_(?![a-zA-Z0-9])/.exec(rest))) {
			// word-boundary guard so snake_case identifiers survive
			const prev = i > 0 ? text[i - 1] : ' ';
			if (/[\s([{'"]/.test(prev)) {
				flush();
				runs.push(...inlineRuns(m[1], { ...flags, i: true }));
				i += m[0].length;
				continue;
			}
		}
		if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
			flush();
			runs.push({ text: m[1], href: m[2], ...flags });
			i += m[0].length;
			continue;
		}
		plain += text[i];
		i += 1;
	}
	flush();
	return runs;
}

export function blocksFromMarkdown(text: string): Block[] {
	const blocks: Block[] = [];
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	let paragraph: string[] = [];
	let quote: string[] = [];
	let code: string[] | null = null;

	const flushParagraph = () => {
		if (paragraph.length) {
			blocks.push({ kind: 'p', runs: inlineRuns(paragraph.join(' ')) });
			paragraph = [];
		}
	};
	const flushQuote = () => {
		if (quote.length) {
			blocks.push({ kind: 'quote', runs: inlineRuns(quote.join(' ')) });
			quote = [];
		}
	};
	const flushAll = () => {
		flushParagraph();
		flushQuote();
	};

	for (const line of lines) {
		if (code !== null) {
			if (/^\s*(```|~~~)\s*$/.test(line)) {
				blocks.push({ kind: 'code', runs: [{ text: code.join('\n') }] });
				code = null;
			} else {
				code.push(line);
			}
			continue;
		}
		if (/^\s*(```|~~~)/.test(line)) {
			flushAll();
			code = [];
			continue;
		}
		if (!line.trim()) {
			flushAll();
			continue;
		}
		let m: RegExpExecArray | null;
		if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
			flushAll();
			blocks.push({ kind: 'h', level: m[1].length, runs: inlineRuns(m[2]) });
			continue;
		}
		if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
			flushAll();
			continue; // horizontal rule → paragraph break
		}
		if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
			flushAll();
			blocks.push({ kind: 'li', runs: inlineRuns(m[1]) });
			continue;
		}
		if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
			flushAll();
			blocks.push({ kind: 'li', ordinal: Number(m[1]), runs: inlineRuns(m[2]) });
			continue;
		}
		if ((m = /^\s*>\s?(.*)$/.exec(line))) {
			flushParagraph();
			quote.push(m[1]);
			continue;
		}
		flushQuote();
		paragraph.push(line);
	}
	// A still-open fence at stream end renders as code so the block doesn't
	// flicker between text and code while tokens arrive.
	if (code !== null) blocks.push({ kind: 'code', runs: [{ text: code.join('\n') }] });
	flushAll();
	return blocks;
}
