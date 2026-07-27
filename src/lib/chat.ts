// Chat message model shared by the sidebar / full chat / new-tab surfaces.

import { blocksFromMarkdown } from './markdown';

export type Run = { text: string; b?: boolean; c?: boolean; i?: boolean; href?: string };
export type Block = {
	kind: 'p' | 'li' | 'h' | 'code' | 'quote';
	runs: Run[];
	/** heading depth for kind 'h' (1–6) */
	level?: number;
	/** ordered-list number for kind 'li'; bullet when absent */
	ordinal?: number;
};
export type Token = {
	gi: number;
	blockIdx: number;
	word: string;
	b?: boolean;
	c?: boolean;
	i?: boolean;
	href?: string;
};

export type StepKind = 'thought' | 'tab' | 'memory';
export type Step = { kind: StepKind; label: string; id?: string };
export type ContextRef = {
	title: string;
	sublabel?: string;
	favicon?: string;
	tab_id?: number;
	url?: string;
};

export type UserMessage = { role: 'user'; text: string; context: ContextRef[] };
export type ChatError = {
	kind: 'auth' | 'model' | 'network' | 'generic';
	title: string;
	detail: string;
};
export type AssistantMessage = {
	role: 'assistant';
	steps: Step[];
	phase: 'thinking' | 'answering' | 'done';
	thoughtSeconds: number;
	thoughtStartedAt: number;
	collapsed: boolean;
	blocks: Block[];
	tokens: Token[];
	revealed: number;
	error?: ChatError;
	artifacts?: Array<{ name: string; kind?: 'code' | 'doc' }>;
};
export type Message = UserMessage | AssistantMessage;

export function faviconUrlForPage(url: string) {
	if (!url) return '';
	return `chrome://favicon2/?size=32&scaleFactor=1x&pageUrl=${encodeURIComponent(url)}`;
}

// Assistant text is markdown (the brain streams plain markdown).
export function blocksFromText(text: string): Block[] {
	const trimmed = text.trimEnd();
	if (!trimmed) return [];
	return blocksFromMarkdown(trimmed);
}

export function buildTokens(blocks: Block[]): Token[] {
	const tokens: Token[] = [];
	let gi = 0;
	blocks.forEach((block, blockIdx) => {
		if (block.kind === 'code') {
			// A code block reveals as one unit; splitting it word-by-word would
			// mangle indentation mid-stream.
			for (const run of block.runs) {
				tokens.push({ gi: gi++, blockIdx, word: run.text });
			}
			return;
		}
		for (const run of block.runs) {
			if (run.c || run.href) {
				tokens.push({
					gi: gi++,
					blockIdx,
					word: run.text,
					c: run.c,
					b: run.b,
					i: run.i,
					href: run.href
				});
				continue;
			}
			// keep whitespace so spacing/punctuation survive; render tokens concatenated
			for (const piece of run.text.split(/(\s+)/)) {
				if (piece === '') continue;
				tokens.push({ gi: gi++, blockIdx, word: piece, b: run.b, i: run.i });
			}
		}
	});
	return tokens;
}
