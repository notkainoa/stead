<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { getBrainBridge, type BrainSessionInfo } from '$lib/brain/bridge';
	import BorderBeam from '$lib/components/BorderBeam.svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let query = $state('');
	let mode = $state<'search' | 'ask'>('search');
	let beamSignal = $state(0);
	let sessions = $state<BrainSessionInfo[]>([]);
	let loadingSessions = $state(false);

	const brain = getBrainBridge();
	const recentChats = $derived(sessions.slice(0, 3));

	function chatBaseUrl() {
		if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
			return '/ai-chat';
		}
		return 'chrome://chat/ai-chat';
	}

	function chatUrl(params: Record<string, string> = {}) {
		const search = new URLSearchParams(params);
		const queryString = search.toString();
		return queryString ? `${chatBaseUrl()}?${queryString}` : chatBaseUrl();
	}

	function searchUrl(value: string) {
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
		if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
		return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
	}

	onMount(() => {
		void (async () => {
			loadingSessions = true;
			try {
				await brain.initialize();
				sessions = await brain.listSessions();
			} finally {
				loadingSessions = false;
			}
		})();
	});

	function submit() {
		const q = query.trim();
		if (!q) return;
		if (mode === 'search') {
			window.location.href = searchUrl(q);
			return;
		}
		beamSignal += 1;
		window.location.href = chatUrl({ prompt: q });
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			mode = mode === 'search' ? 'ask' : 'search';
		} else if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		}
	}
</script>

<svelte:head><title>Stead — New Tab</title></svelte:head>

<div
	class="bg-background text-foreground relative flex min-h-dvh w-full flex-col items-center overflow-hidden px-6 antialiased"
>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
		style="background: radial-gradient(60% 100% at 50% -5%, rgba(168,170,255,0.12), rgba(168,170,255,0.04) 40%, transparent 72%);"
	></div>

	<div class="relative z-10 flex w-full max-w-xl flex-1 flex-col items-center">
		<!-- Original Stead command bar -->
		<div class="relative mt-[22vh] w-full">
			<BorderBeam signal={beamSignal} radius={20} />
			<div class="surface-raised flex items-center gap-3 rounded-[20px] py-2.5 pr-2.5 pl-5">
				<input
					bind:value={query}
					onkeydown={onKeydown}
					placeholder={mode === 'ask' ? 'Ask Stead anything…' : 'Search or type a URL'}
					class="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[15px] outline-none"
				/>
				<div
					class="bg-muted relative grid shrink-0 grid-cols-2 rounded-full p-0.5 text-[13px] font-medium"
				>
					<span
						class="surface-raised pointer-events-none absolute top-0.5 bottom-0.5 rounded-full transition-transform duration-300"
						style="left: 2px; width: calc(50% - 2px); transform: translateX({mode === 'ask'
							? '100%'
							: '0'});"
					></span>
					<button
						type="button"
						onclick={() => (mode = 'search')}
						class="relative z-10 px-3.5 py-1 transition-colors {mode === 'search'
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}">Search</button
					>
					<button
						type="button"
						onclick={() => (mode = 'ask')}
						class="relative z-10 px-3.5 py-1 transition-colors {mode === 'ask'
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}">Ask Stead</button
					>
				</div>
			</div>
		</div>

		<!-- Continue cards, with only the requested subtle fill added -->
		<div class="mt-10 w-full" in:fade={{ duration: 220 }}>
			<div class="mb-2 flex items-center justify-between px-1">
				<span class="text-muted-foreground text-xs font-medium">Continue</span>
				<button
					type="button"
					onclick={() => (window.location.href = chatUrl())}
					class="text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1 py-1 text-xs font-medium transition-colors"
				>
					All chats <ChevronRightIcon class="size-3.5" />
				</button>
			</div>
			{#if loadingSessions && !recentChats.length}
				<div class="text-muted-foreground px-3 py-2.5 text-sm">Loading sessions</div>
			{/if}
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
				{#each recentChats as chat (chat.id)}
					<button
						type="button"
						onclick={() => (window.location.href = chatUrl({ session: chat.id }))}
						class="bg-muted/35 text-foreground/75 hover:bg-muted/60 hover:text-foreground min-w-0 truncate rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors"
					>
						{chat.title}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
