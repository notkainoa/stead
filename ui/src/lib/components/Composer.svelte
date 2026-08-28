<script lang="ts">
	import { tick, untrack, onMount } from 'svelte';
	import { fly, scale, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { motionEase } from '$lib/motion';
	import { faviconUrlForPage, type ContextRef } from '$lib/chat';
	import type { BrainSkillInfo, BrainTabContext } from '$lib/brain/bridge';
	import { Button } from '$lib/components/ui/button/index.js';
	import BorderBeam from './BorderBeam.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';
	import CornerDownRightIcon from '@lucide/svelte/icons/corner-down-right';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import AppWindowIcon from '@lucide/svelte/icons/app-window';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import FileIcon from '@lucide/svelte/icons/file';

	type Kind = 'tab' | 'skill';
	type MentionItem = {
		id: string;
		label: string;
		sublabel?: string;
		favicon?: string;
		kind: Kind;
		tab_id?: number;
		url?: string;
	};
	type MentionGroup = { type: string; icon: typeof AppWindowIcon; items: MentionItem[] };
	type ContextItem = {
		id: string;
		title: string;
		sublabel?: string;
		favicon?: string;
		tab_id?: number;
		url?: string;
		kind: 'tab' | 'file';
	};

	type Props = {
		contextTitle?: string;
		contextUrl?: string;
		contextFavicon?: string;
		currentTab?: BrainTabContext | null;
		openTabs?: BrainTabContext[];
		skills?: BrainSkillInfo[];
		placeholder?: string;
		mentionGroups?: MentionGroup[];
		streaming?: boolean;
		queued?: string[];
		showContext?: boolean;
		onSend?: (value: string, context: ContextRef[]) => void;
		onStop?: () => void;
		onRemoveQueued?: (index: number) => void;
		onMentionOpen?: () => void | Promise<void>;
	};

	let {
		contextTitle = '',
		contextUrl = '',
		contextFavicon = '',
		currentTab = null,
		openTabs = [],
		skills = [],
		placeholder = 'Ask or do anything…',
		mentionGroups = [],
		streaming = false,
		queued = [],
		showContext = true,
		onSend,
		onStop,
		onRemoveQueued,
		onMentionOpen
	}: Props = $props();

	// Mention targets are real data only: the bound tab (from the native tab
	// context), the brain's skill catalog, plus whatever the host surface
	// passes in. No canned samples.
	let allMentionGroups = $derived.by(() => {
		const groups: MentionGroup[] = [];
		const tabItems = [currentTab, ...openTabs]
			.filter((tab): tab is BrainTabContext => tab != null)
			.filter((tab, index, tabs) => tabs.findIndex((other) => other.tab_id === tab.tab_id) === index)
			.map((tab) => ({
				id: `tab-${tab.tab_id}`,
				label: tab.title || (tab.tab_id === currentTab?.tab_id ? 'Current tab' : 'Untitled tab'),
				sublabel: tab.url,
				favicon:
					tab.tab_id === currentTab?.tab_id && contextFavicon
						? contextFavicon
						: faviconUrlForPage(tab.url),
				kind: 'tab' as const,
				tab_id: tab.tab_id,
				url: tab.url
			}));
		if (tabItems.length) {
			groups.push({
				type: 'Tabs',
				icon: AppWindowIcon,
				items: tabItems
			});
		}
		if (skills.length) {
			groups.push({
				type: 'Skills',
				icon: SparklesIcon,
				items: skills.map((skill) => ({
					id: `skill-${skill.name}`,
					label: skill.name,
					sublabel: skill.description,
					kind: 'skill' as const
				}))
			});
		}
		return [...groups, ...mentionGroups];
	});

	let value = $state('');
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let mirror = $state<HTMLDivElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let canSend = $derived(value.trim().length > 0);
	// Stop only shows while streaming with an empty input; typed text always wins → send/queue.
	let showStop = $derived(streaming && !canSend);
	let beamSignal = $state(0);

	function currentTabContextItem(): ContextItem | null {
		if (!showContext) return null;
		if (currentTab) {
			return {
				id: `tab-${currentTab.tab_id}`,
				title: currentTab.title || contextTitle,
				sublabel: currentTab.url || contextUrl,
				favicon: contextFavicon || faviconUrlForPage(currentTab.url),
				tab_id: currentTab.tab_id,
				url: currentTab.url,
				kind: 'tab'
			};
		}
		return null;
	}

	// Context chips — current tab first, then any mentioned tabs / uploaded files.
	let contextItems = $state<ContextItem[]>(
		untrack(() => {
			const item = currentTabContextItem();
			return item ? [item] : [];
		})
	);

	// The current tab keeps the same id when it navigates, so the keyed Composer
	// instance stays mounted. Refresh its existing context card from the live tab
	// metadata without re-adding it after the user explicitly removes it.
	$effect(() => {
		const current = currentTabContextItem();
		if (!current) return;
		untrack(() => {
			const index = contextItems.findIndex((item) => item.id === current.id);
			if (index < 0) return;
			const existing = contextItems[index];
			if (
				existing.title === current.title &&
				existing.sublabel === current.sublabel &&
				existing.favicon === current.favicon &&
				existing.tab_id === current.tab_id &&
				existing.url === current.url
			) return;
			contextItems = contextItems.with(index, current);
		});
	});

	function addContextItem(item: ContextItem) {
		if (!contextItems.some((c) => c.id === item.id)) contextItems = [...contextItems, item];
	}
	async function removeContextItem(id: string) {
		const item = contextItems.find((c) => c.id === id);
		contextItems = contextItems.filter((c) => c.id !== id);
		// Removing a tab card also deletes its inline @mention (but not the reverse).
		if (item?.kind === 'tab') {
			const re = new RegExp(`(^|\\s)@${escapeRe(item.title)}(?=$|\\s|[.,!?;:])\\s?`);
			value = value.replace(re, (_m, p1) => p1);
			await tick();
			autosize();
		}
	}

	function formatSize(n: number) {
		if (n < 1024) return n + ' B';
		if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
		return (n / (1024 * 1024)).toFixed(1) + ' MB';
	}
	function onFilesChosen(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		for (const f of Array.from(input.files ?? [])) {
			addContextItem({
				id: 'file-' + f.name + '-' + f.size,
				title: f.name,
				sublabel: formatSize(f.size),
				kind: 'file'
			});
		}
		input.value = '';
	}

	// --- @ mention autocomplete ---------------------------------------------
	let mentionOpen = $state(false);
	let mentionQuery = $state('');
	let mentionStart = $state(0);
	let activeIndex = $state(0);

	let filteredGroups = $derived(
		allMentionGroups
			.map((g) => ({
				...g,
				items: g.items.filter((it) =>
					it.label.toLowerCase().includes(mentionQuery.toLowerCase())
				)
			}))
			.filter((g) => g.items.length > 0)
	);
	let flatItems = $derived(filteredGroups.flatMap((g) => g.items));
	let rows = $derived.by(() => {
		const out: Array<
			| { kind: 'header'; type: string; first: boolean }
			| { kind: 'item'; item: MentionItem; icon: typeof AppWindowIcon; index: number }
		> = [];
		let i = 0;
		let gi = 0;
		for (const g of filteredGroups) {
			out.push({ kind: 'header', type: g.type, first: gi === 0 });
			for (const it of g.items) out.push({ kind: 'item', item: it, icon: g.icon, index: i++ });
			gi++;
		}
		return out;
	});

	function escapeHtml(s: string) {
		return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
	}
	function escapeRe(s: string) {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function displayMentionLabel(item: MentionItem) {
		if (item.kind !== 'skill') return item.label;
		const label = item.label.replaceAll('-', ' ');
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	// Inline mentions are skills only (tabs/files become chips). Anchor at a word
	// boundary so emails (foo@bar) don't match.
	let mentionRe = $derived.by(() => {
		const labels = allMentionGroups
			.flatMap((g) => g.items)
			.map((i) => i.label)
			.sort((a, b) => b.length - a.length)
			.map(escapeRe);
		if (!labels.length) return null;
		return new RegExp(`(?<=^|\\s)(@(?:${labels.join('|')}))(?=$|\\s|[.,!?;:])`, 'g');
	});

	let highlighted = $derived.by(() => {
		const re = mentionRe;
		if (!re) return escapeHtml(value);
		let html = '';
		let last = 0;
		let m: RegExpExecArray | null;
		re.lastIndex = 0;
		while ((m = re.exec(value)) !== null) {
			html += escapeHtml(value.slice(last, m.index));
			html += `<span class="mention-token">${escapeHtml(m[1])}</span>`;
			last = m.index + m[1].length;
		}
		html += escapeHtml(value.slice(last));
		return html;
	});

	function syncScroll() {
		if (mirror && textarea) mirror.scrollTop = textarea.scrollTop;
	}

	$effect(() => {
		if (!mentionOpen) return;
		const i = activeIndex;
		const el = menuEl?.querySelector(`[data-idx="${i}"]`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	});

	function updateMention() {
		const el = textarea;
		if (!el) return (mentionOpen = false);
		const wasOpen = mentionOpen;
		const caret = el.selectionStart ?? value.length;
		const before = value.slice(0, caret);
		const at = before.lastIndexOf('@');
		if (at === -1) return (mentionOpen = false);
		const startsToken = at === 0 || /\s/.test(before[at - 1] ?? '');
		const token = before.slice(at + 1);
		if (startsToken && !/\s/.test(token)) {
			mentionStart = at;
			mentionQuery = token;
			activeIndex = 0;
			mentionOpen = true;
			if (!wasOpen) void onMentionOpen?.();
		} else {
			mentionOpen = false;
		}
	}

	async function replaceQuery(insert: string) {
		const el = textarea;
		const caret = el?.selectionStart ?? value.length;
		const before = value.slice(0, mentionStart);
		const after = value.slice(caret);
		value = before + insert + after;
		mentionOpen = false;
		await tick();
		const pos = (before + insert).length;
		el?.focus();
		el?.setSelectionRange(pos, pos);
		autosize();
	}

	function selectMention(item: MentionItem) {
		// Tabs are added to the context row up top, AND the @mention stays inline.
		if (item.kind === 'tab') {
			addContextItem({
				id: item.id,
				title: item.label,
				sublabel: item.sublabel,
				favicon: item.favicon,
				tab_id: item.tab_id,
				url: item.url,
				kind: 'tab'
			});
		}
		replaceQuery('@' + item.label + ' ');
	}

	function autosize() {
		if (!textarea) return;
		// Empty input uses the textarea's natural one-row height. Re-measuring an
		// empty textarea can preserve the previous scroll box after a long send.
		if (!value) {
			textarea.style.removeProperty('height');
			return;
		}
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
	}

	async function send() {
		if (!canSend) return;
		const wasStreaming = streaming; // capture before onSend flips streaming on
		const context = contextItems.map((c) => ({
			title: c.title,
			sublabel: c.sublabel,
			favicon: c.favicon,
			tab_id: c.tab_id,
			url: c.url
		}));
		onSend?.(value.trim(), context);
		if (!wasStreaming) beamSignal += 1; // beam a fresh send; queued messages don't beam
		value = '';
		mentionOpen = false;
		await tick();
		autosize();
		textarea?.focus(); // keep focus after sending / queueing
	}

	onMount(() => textarea?.focus());

	function onKeydown(e: KeyboardEvent) {
		if (mentionOpen && flatItems.length) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				activeIndex = (activeIndex + 1) % flatItems.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				activeIndex = (activeIndex - 1 + flatItems.length) % flatItems.length;
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				selectMention(flatItems[activeIndex]);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				mentionOpen = false;
				return;
			}
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="surface-panel relative rounded-[22px] p-2">
	<BorderBeam signal={beamSignal} radius={22} />

	<!-- @ mention autocomplete -->
	{#if mentionOpen}
		<div
			bind:this={menuEl}
			transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: motionEase }}
			class="surface-glass scrollbar-none absolute bottom-[calc(100%+0.45rem)] left-0 z-50 max-h-[min(22rem,50dvh)] w-[min(32rem,100%)] origin-bottom-left overflow-y-auto overscroll-none rounded-[12px] p-1.5"
		>
			{#if flatItems.length}
				{#each rows as row (row.kind === 'header' ? 'h-' + row.type : 'i-' + row.item.id)}
					{#if row.kind === 'header'}
						<div
							class="text-muted-foreground/60 px-2 pb-1 text-[11px] leading-none font-semibold tracking-[0.025em] uppercase {row.first
								? 'pt-1'
								: 'border-border/70 mt-1 border-t pt-2.5'}"
						>
							{row.type}
						</div>
					{:else}
						{@const Icon = row.icon}
						{@const displayLabel = displayMentionLabel(row.item)}
						<button
							type="button"
							data-idx={row.index}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => selectMention(row.item)}
							onmouseenter={() => (activeIndex = row.index)}
							class="flex w-full items-center gap-2 rounded-[7px] px-2 py-[5px] text-left {activeIndex ===
							row.index
								? 'bg-[#0a64d8] text-white'
								: 'text-foreground hover:bg-muted/70'}"
						>
							{#if row.item.kind === 'tab'}
								<span class="grid size-5 shrink-0 place-items-center">
									{#if row.item.favicon}
										<img src={row.item.favicon} alt="" class="size-[18px] rounded-[4px]" />
									{:else}
										<Icon class="size-4 opacity-65" />
									{/if}
								</span>
							{/if}
							<span
								class="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden {row.item.kind ===
								'skill'
									? 'pl-7'
									: ''}"
							>
								<span
									class="shrink-0 truncate text-[14px] leading-[1.25] font-medium {row.item
										.sublabel
										? 'max-w-[52%]'
										: 'max-w-full'}"
								>
									{displayLabel}
								</span>
								{#if row.item.kind === 'skill' && row.item.sublabel}
									<span
										class="min-w-0 flex-1 truncate text-[13px] leading-[1.25] {activeIndex ===
										row.index
											? 'text-white/75'
											: 'text-muted-foreground/70'}"
									>
										{row.item.sublabel}
									</span>
								{/if}
							</span>
						</button>
					{/if}
				{/each}
			{:else}
				<div class="text-muted-foreground px-2 py-2 text-[13px]">No matches</div>
			{/if}
		</div>
	{/if}

	<!-- Context row: cards stay inside the sidebar and clip long page metadata. -->
	{#if contextItems.length}
		<div
			transition:slide={{ duration: 240, easing: motionEase }}
			class="-mx-1 -mt-1 min-w-0 overflow-hidden px-1 pt-1"
		>
			<div class="mb-2 flex min-w-0 flex-row flex-nowrap items-center justify-start gap-1.5 overflow-hidden">
				{#each contextItems as item (item.id)}
				<div
					in:scale={{ duration: 220, start: 0.9, opacity: 0, easing: motionEase }}
					out:scale={{ duration: 220, start: 0.9, opacity: 0, easing: motionEase }}
					animate:flip={{ duration: 300, easing: motionEase }}
					class="group surface-raised flex min-w-0 max-w-[68%] {contextItems.length > 1
						? 'flex-1'
						: 'w-fit'} items-center gap-2.5 overflow-hidden rounded-2xl py-1.5 pr-2 pl-1.5"
				>
					<div class="bg-muted relative grid size-9 shrink-0 place-items-center rounded-lg">
						{#if item.kind === 'file'}
							<FileIcon class="text-muted-foreground size-5" />
						{:else}
							<AppWindowIcon class="text-muted-foreground size-5" />
						{/if}
						{#if item.kind !== 'file' && item.favicon}
							<img
								src={item.favicon}
								alt=""
								class="bg-muted absolute size-5"
								onerror={(event) => ((event.currentTarget as HTMLImageElement).hidden = true)}
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1 overflow-hidden">
						<p class="text-foreground truncate text-[15px] leading-tight font-semibold">
							{item.title}
						</p>
						{#if item.sublabel}
							<p class="text-muted-foreground truncate text-[13px] leading-tight">{item.sublabel}</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => removeContextItem(item.id)}
						aria-label="Remove from context"
						class="text-muted-foreground hover:text-foreground hover:bg-muted ml-1 grid size-5 shrink-0 place-items-center rounded-full opacity-60 transition hover:opacity-100 focus-visible:opacity-100"
					>
						<XIcon class="size-3.5" />
					</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Queued messages (typed while a response is streaming) -->
	{#if queued.length}
		<div class="mb-2 flex flex-col gap-1.5">
			{#each queued as q, i (i)}
				<div
					in:slide={{ duration: 220, easing: motionEase }}
					out:slide={{ duration: 200, easing: motionEase }}
					animate:flip={{ duration: 260, easing: motionEase }}
					class="surface-raised group flex items-center gap-2.5 rounded-xl py-2 pr-1.5 pl-3"
				>
					<CornerDownRightIcon class="text-muted-foreground size-4 shrink-0" />
					<span class="text-foreground min-w-0 flex-1 truncate text-sm">{q}</span>
					<button
						type="button"
						onclick={() => onRemoveQueued?.(i)}
						aria-label="Remove from queue"
						class="text-muted-foreground hover:text-foreground hover:bg-muted grid size-6 shrink-0 place-items-center rounded-md transition-colors"
					>
						<Trash2Icon class="size-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Input row -->
	<div class="flex min-w-0 items-end gap-2 px-1">
		<Button
			variant="ghost"
			size="icon"
			onclick={() => fileInput?.click()}
			class="surface-raised text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-full transition-[filter] hover:brightness-115"
			aria-label="Upload a file"
		>
			<PlusIcon class="size-[18px]" />
		</Button>
		<input bind:this={fileInput} type="file" multiple class="hidden" onchange={onFilesChosen} />

		<div class="relative min-w-0 flex-1 basis-0 self-center overflow-hidden">
			<!-- highlight layer (mirrors the textarea, colors mentions) -->
			<div
				bind:this={mirror}
				aria-hidden="true"
				class="text-foreground scrollbar-none pointer-events-none absolute inset-0 max-h-40 overflow-hidden py-1.5 text-sm leading-snug break-words whitespace-pre-wrap"
			>{@html highlighted}</div>
			<textarea
				bind:this={textarea}
				bind:value
				oninput={() => {
					autosize();
					updateMention();
					syncScroll();
				}}
				onscroll={syncScroll}
				onkeyup={(e) => {
					if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateMention();
				}}
				onkeydown={onKeydown}
				onblur={() => (mentionOpen = false)}
				rows="1"
				cols="1"
				{placeholder}
				class="placeholder:text-muted-foreground scrollbar-none caret-foreground relative block max-h-40 w-full min-w-0 resize-none bg-transparent py-1.5 text-sm leading-snug break-words whitespace-pre-wrap text-transparent outline-none"
			></textarea>
		</div>

		<Button
			onclick={showStop ? onStop : send}
			disabled={!showStop && !canSend}
			size="icon"
			class="size-8 shrink-0 rounded-full transition-[filter,background-color,color] duration-150 disabled:opacity-100 {showStop
				? 'bg-foreground text-background hover:bg-foreground/90'
				: canSend
					? 'surface-raised text-foreground dark:text-white hover:brightness-115'
					: 'surface-raised text-muted-foreground hover:brightness-115'}"
			aria-label={showStop ? 'Stop' : 'Send'}
		>
			{#if showStop}
				<SquareIcon class="size-3.5 fill-current" />
			{:else}
				<ArrowUpIcon class="size-[18px]" />
			{/if}
		</Button>
	</div>
</div>
