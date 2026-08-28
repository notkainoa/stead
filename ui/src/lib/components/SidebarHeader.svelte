<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import type { BrainTabContext } from '$lib/brain/bridge';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import XIcon from '@lucide/svelte/icons/x';
	import SessionSelector from './SessionSelector.svelte';

	type Props = {
		title?: string;
		current?: string;
		groups?: Array<{ label: string; sessions: Array<{ id: string; title: string; unread?: boolean }> }>;
		loading?: boolean;
		currentTab?: BrainTabContext | null;
		onClose?: () => void;
		onOpenFull?: () => void;
		onNew?: () => void;
		onSelect?: (id: string) => void;
	};

	let {
		title = 'Ask Stead',
		current = 'New Session',
		groups = [],
		loading = false,
		currentTab = null,
		onClose,
		onOpenFull,
		onNew,
		onSelect
	}: Props = $props();

	function openAiSettings() {
		const chromeApi = (
			globalThis as typeof globalThis & {
				chrome?: { send?: (message: string) => void };
			}
		).chrome;
		if (chromeApi?.send) {
			chromeApi.send('openSteadAiSettings');
			return;
		}
		window.open('/ai-settings', '_blank', 'noopener');
	}
</script>

<header class="flex h-14 items-center justify-between gap-2 px-2.5 select-none">
	<!-- Left: close + title -->
	<div class="flex min-w-0 items-center gap-0.5">
		<Button
			variant="ghost"
			size="icon"
			class="text-muted-foreground hover:text-foreground size-8 shrink-0"
			aria-label="Close"
			onclick={onClose}
		>
			<XIcon class="size-[18px]" />
		</Button>
		<h1 class="truncate text-lg leading-none font-bold tracking-tight">{title}</h1>
	</div>

	<!-- Right: session selector -->
	<div class="flex shrink-0 items-center gap-1">
		<Button
			variant="ghost"
			size="icon"
			class="text-muted-foreground hover:text-foreground size-8 shrink-0"
			aria-label="Open full-screen chat"
			title="Open full-screen chat"
			onclick={onOpenFull}
		>
			<Maximize2Icon class="size-[17px]" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="text-muted-foreground hover:text-foreground size-8 shrink-0"
			aria-label="Stead AI settings"
			title="Stead AI settings"
			onclick={openAiSettings}
		>
			<SettingsIcon class="size-[17px]" />
		</Button>
		<SessionSelector {current} {groups} {loading} {onNew} {onSelect} />
	</div>
</header>
