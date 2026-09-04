<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		closePalette,
		hasNativePalette,
		openResult,
		readyToShow,
		requestResults,
		type PaletteResult,
		type PaletteResultKind
	} from '$lib/palette';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';

	let query = $state('');
	let results = $state<PaletteResult[]>([]);
	let selected = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLElement | null>(null);

	const native = hasNativePalette();

	const SECTION_LABELS: Partial<Record<PaletteResultKind, string>> = {
		tab: 'Open tabs',
		bookmark: 'Bookmarks',
		history: 'Recently visited'
	};

	function sectionLabel(index: number): string | null {
		const kind = results[index].kind;
		const label = SECTION_LABELS[kind];
		if (!label) return null;
		return index === 0 || results[index - 1].kind !== kind ? label : null;
	}

	function hint(result: PaletteResult): string {
		switch (result.kind) {
			case 'tab':
				return result.active ? 'Current tab' : 'Switch to tab';
			case 'search':
				return 'Search';
			case 'url':
				return 'Open';
			case 'ask':
				return 'Ask Stead';
			default:
				return displayUrl(result.url);
		}
	}

	function displayUrl(url: string): string {
		try {
			const parsed = new URL(url);
			const path = parsed.pathname === '/' ? '' : parsed.pathname;
			return `${parsed.host}${path}`;
		} catch {
			return url;
		}
	}

	function favicon(url: string): string {
		return `chrome://favicon2/?size=16&scaleFactor=2x&pageUrl=${encodeURIComponent(url)}`;
	}

	function refresh() {
		requestResults(query, (next) => {
			results = next;
			selected = 0;
		});
	}

	function reset() {
		query = '';
		refresh();
		void tick().then(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	}

	onMount(() => {
		// The native host re-shows a cached bubble; it calls this to clear state.
		(globalThis as typeof globalThis & { steadPaletteReset?: () => void }).steadPaletteReset =
			reset;
		refresh();
		inputEl?.focus();
		// The bubble stays hidden until the page can paint real content.
		readyToShow();
	});

	$effect(() => {
		const item = listEl?.querySelector(`[data-index="${selected}"]`);
		item?.scrollIntoView({ block: 'nearest' });
	});

	function open(result: PaletteResult | undefined) {
		if (!result) return;
		openResult(result);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
			e.preventDefault();
			if (results.length) selected = (selected + 1) % results.length;
		} else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
			e.preventDefault();
			if (results.length) selected = (selected - 1 + results.length) % results.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			open(results[selected]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closePalette();
		}
	}
</script>

<svelte:head><title>Stead — Command palette</title></svelte:head>

<div class="bg-background text-foreground w-[640px] antialiased select-none">
	<div class="flex items-center gap-3 px-4 pt-3.5 pb-3">
		<SearchIcon class="text-muted-foreground size-[18px] shrink-0" />
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={refresh}
			onkeydown={onKeydown}
			placeholder="Search tabs, bookmarks, history, or type a URL"
			autocomplete="off"
			spellcheck="false"
			class="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[17px] leading-7 outline-none"
		/>
		<kbd
			class="text-muted-foreground bg-muted/60 hidden rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline"
			>esc</kbd
		>
	</div>

	{#if results.length}
		<div class="bg-border/70 mx-3 h-px"></div>
		<div bind:this={listEl} class="scrollbar-none max-h-[420px] overflow-y-auto px-2 py-2">
			{#each results as result, index (result.kind + result.url + (result.tab_id ?? ''))}
				{@const label = sectionLabel(index)}
				{#if label}
					<div
						class="text-muted-foreground px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase {index ===
						0
							? ''
							: 'mt-1'}"
					>
						{label}
					</div>
				{/if}
				<button
					type="button"
					data-index={index}
					onmouseenter={() => (selected = index)}
					onclick={() => open(result)}
					class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 {selected ===
					index
						? 'bg-accent text-accent-foreground'
						: 'text-foreground/85'}"
				>
					<span
						class="bg-muted/50 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
					>
						{#if result.kind === 'search'}
							<SearchIcon class="size-4" />
						{:else if result.kind === 'ask'}
							<SparklesIcon class="size-4" />
						{:else if result.kind === 'bookmark' && !native}
							<BookmarkIcon class="size-4" />
						{:else if result.kind === 'history' && !native}
							<HistoryIcon class="size-4" />
						{:else if native && result.kind !== 'url'}
							<img src={favicon(result.url)} alt="" class="size-4" />
						{:else}
							<GlobeIcon class="size-4" />
						{/if}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[14px] leading-5">
							{#if result.kind === 'search'}
								Search for “{result.title}”
							{:else if result.kind === 'ask'}
								Ask Stead “{result.title}”
							{:else}
								{result.title || displayUrl(result.url)}
							{/if}
						</span>
					</span>
					<span class="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[12px]">
						<span class="max-w-[200px] truncate">{hint(result)}</span>
						{#if selected === index}
							<CornerDownLeftIcon class="size-3.5" />
						{/if}
					</span>
				</button>
			{/each}
		</div>
	{:else}
		<div class="text-muted-foreground px-4 pb-4 text-[13px]">No matches</div>
	{/if}
</div>
