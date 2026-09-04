// Command palette bridge. The browser hosts /command-palette in a WebUI bubble
// (SteadCommandPaletteUI) and exposes chrome.send() messages for search and
// actions; results arrive on window.steadPaletteResults. Under `bun dev` there
// is no native side, so the palette falls back to sample data.

export type PaletteResultKind = 'tab' | 'bookmark' | 'history' | 'search' | 'url' | 'ask';

export type PaletteResult = {
	kind: PaletteResultKind;
	title: string;
	url: string;
	/** Present for open tabs; pass back to switch to the tab. */
	tab_id?: number;
	/** True for the active tab of the window that opened the palette. */
	active?: boolean;
};

type ChromeSend = { send?: (message: string, args?: unknown[]) => void };

declare global {
	interface Window {
		steadPaletteResults?: (requestId: number, results: PaletteResult[]) => void;
	}
}

function chromeSend(): ChromeSend['send'] {
	return (globalThis as typeof globalThis & { chrome?: ChromeSend }).chrome?.send;
}

export function hasNativePalette(): boolean {
	return typeof chromeSend() === 'function';
}

let nextRequestId = 1;
let latestRequestId = 0;
let deliver: ((requestId: number, results: PaletteResult[]) => void) | null = null;

if (typeof window !== 'undefined') {
	window.steadPaletteResults = (requestId, results) => deliver?.(requestId, results);
}

/**
 * Ask the browser for results matching `query`. `onResults` is called once for
 * the newest outstanding request only; stale responses are dropped.
 */
export function requestResults(
	query: string,
	onResults: (results: PaletteResult[]) => void
): void {
	const requestId = nextRequestId++;
	latestRequestId = requestId;
	deliver = (id, results) => {
		if (id === latestRequestId) onResults(results);
	};
	const send = chromeSend();
	if (send) {
		send('steadPaletteSearch', [requestId, query]);
		return;
	}
	onResults(devResults(query));
}

export function openResult(result: PaletteResult): void {
	const send = chromeSend();
	if (send) {
		send('steadPaletteOpen', [result.kind, result.url, result.tab_id ?? -1]);
		return;
	}
	if (result.kind === 'ask') {
		window.location.href = result.url;
		return;
	}
	window.open(result.url, '_blank', 'noopener');
}

export function closePalette(): void {
	chromeSend()?.('steadPaletteClose');
}

export function readyToShow(): void {
	chromeSend()?.('steadPaletteReady');
}

const DEV_TABS: PaletteResult[] = [
	{ kind: 'tab', title: 'Stead — New Tab', url: 'stead://newtab', tab_id: 1, active: true },
	{ kind: 'tab', title: 'GitHub', url: 'https://github.com', tab_id: 2 },
	{ kind: 'tab', title: 'Chromium Code Search', url: 'https://source.chromium.org', tab_id: 3 }
];
const DEV_BOOKMARKS: PaletteResult[] = [
	{ kind: 'bookmark', title: 'Svelte docs', url: 'https://svelte.dev/docs' },
	{ kind: 'bookmark', title: 'Hacker News', url: 'https://news.ycombinator.com' }
];
const DEV_HISTORY: PaletteResult[] = [
	{ kind: 'history', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
	{ kind: 'history', title: 'Rust Programming Language', url: 'https://www.rust-lang.org' }
];

function devResults(query: string): PaletteResult[] {
	const q = query.trim().toLowerCase();
	const match = (r: PaletteResult) =>
		!q || r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q);
	const results = [...DEV_TABS, ...DEV_BOOKMARKS, ...DEV_HISTORY].filter(match);
	if (q) {
		results.push({
			kind: 'search',
			title: query.trim(),
			url: `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`
		});
		results.push({ kind: 'ask', title: query.trim(), url: '/ai-chat?prompt=' + encodeURIComponent(query.trim()) });
	}
	return results;
}
