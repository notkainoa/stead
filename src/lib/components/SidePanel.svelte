<script lang="ts">
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { motionEase } from '$lib/motion';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	export type Artifact = { name: string; kind?: 'code' | 'doc' };
	export type AgentTab = {
		id: string;
		tabId?: number;
		title: string;
		url: string;
		favicon?: string;
		status?: 'opening' | 'open';
	};

	type Props = {
		artifacts?: Artifact[];
		agentTabs?: AgentTab[];
		onOpenArtifact?: (artifact: Artifact) => void;
	};

	let { artifacts = [], agentTabs = [], onOpenArtifact }: Props = $props();
	let tabScroller = $state<HTMLElement | null>(null);
	let showTabFade = $state(false);

	function updateTabFade() {
		if (!tabScroller) {
			showTabFade = false;
			return;
		}
		showTabFade =
			tabScroller.scrollHeight > tabScroller.clientHeight + 1 &&
			tabScroller.scrollTop + tabScroller.clientHeight < tabScroller.scrollHeight - 2;
	}

	$effect(() => {
		agentTabs.length;
		void tick().then(updateTabFade);
	});
</script>

<svelte:window onresize={updateTabFade} />

<div
	class="scrollbar-none flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-1 pb-4 overscroll-none"
>
	{#if agentTabs.length}
		<section
			transition:slide={{ duration: 240, easing: motionEase }}
			class="surface-panel overflow-hidden rounded-2xl p-1.5"
		>
			<header class="flex h-8 items-center justify-between px-2">
				<span class="text-muted-foreground text-xs font-medium">Agent tabs</span>
				<span class="text-muted-foreground/60 text-[11px] tabular-nums">{agentTabs.length}</span>
			</header>
			<div class="relative">
				<div
					bind:this={tabScroller}
					onscroll={updateTabFade}
					class="scrollbar-none flex max-h-[min(52dvh,30rem)] flex-col gap-px overflow-y-auto overscroll-none"
				>
					{#each agentTabs as tab (tab.id)}
					<div
						in:slide={{ duration: 200, easing: motionEase }}
						out:slide={{ duration: 160, easing: motionEase }}
						animate:flip={{ duration: 220, easing: motionEase }}
						class="hover:bg-muted/45 flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 transition-colors"
					>
						{#if tab.favicon}
							<img src={tab.favicon} alt="" class="size-4 shrink-0 rounded-[3px]" />
						{:else}
							<GlobeIcon class="text-muted-foreground/70 size-4 shrink-0" />
						{/if}
						<div class="min-w-0 flex-1 leading-tight">
							<div class="text-foreground truncate text-[13px] font-medium">{tab.title}</div>
							<div class="text-muted-foreground/65 mt-0.5 truncate text-[11px]">{tab.url}</div>
						</div>
						{#if tab.status === 'opening'}
							<span class="bg-primary/80 size-1.5 shrink-0 animate-pulse rounded-full"></span>
						{/if}
					</div>
					{/each}
				</div>
				{#if showTabFade}
					<div
						aria-hidden="true"
						class="scroll-fade pointer-events-none absolute inset-x-0 bottom-0 h-12"
						style="background:linear-gradient(to top,var(--surface-panel-bottom) 0%,color-mix(in oklab,var(--surface-panel-bottom) 76%,transparent) 48%,transparent 100%);-webkit-mask-image:linear-gradient(to top,black 0%,black 50%,transparent 100%);mask-image:linear-gradient(to top,black 0%,black 50%,transparent 100%);"
					></div>
				{/if}
			</div>
		</section>
	{/if}

	{#if artifacts.length}
		<section
			transition:slide={{ duration: 240, easing: motionEase }}
			class="surface-panel overflow-hidden rounded-2xl p-1.5"
		>
			<header class="flex h-8 items-center justify-between px-2">
				<span class="text-muted-foreground text-xs font-medium">Artifacts</span>
				<span class="text-muted-foreground/60 text-[11px] tabular-nums">{artifacts.length}</span>
			</header>
			<div class="flex flex-col gap-px">
				{#each artifacts as artifact (artifact.name)}
					<button
						type="button"
						in:slide={{ duration: 200, easing: motionEase }}
						out:slide={{ duration: 160, easing: motionEase }}
						animate:flip={{ duration: 220, easing: motionEase }}
						onclick={() => onOpenArtifact?.(artifact)}
						class="hover:bg-muted/45 flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors"
					>
						{#if artifact.kind === 'doc'}
							<FileTextIcon class="text-muted-foreground/75 size-4 shrink-0" />
						{:else}
							<FileCodeIcon class="text-muted-foreground/75 size-4 shrink-0" />
						{/if}
						<span class="text-foreground min-w-0 flex-1 truncate text-[13px]">{artifact.name}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>
