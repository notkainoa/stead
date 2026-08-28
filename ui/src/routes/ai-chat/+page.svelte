<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		getCurrentTabContext,
		type AgentPermissionMode,
		type BrainTabContext
	} from '$lib/brain/bridge';
	import { motionEase } from '$lib/motion';
	import { getControlConsoleBridge } from '$lib/brain/controlConsole';
	import { getControlState } from '$lib/controlState.svelte';
	import { createChatSession } from '$lib/chatSession.svelte';
	import { loadPermissionMode, loadSharedPermissionMode, savePermissionMode } from '$lib/permission';
	import Conversation from '$lib/components/Conversation.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import QuestionTool from '$lib/components/QuestionTool.svelte';
	import PermissionSelect from '$lib/components/PermissionSelect.svelte';
	import ModelControls from '$lib/components/ModelControls.svelte';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import SessionSelector from '$lib/components/SessionSelector.svelte';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PanelRightIcon from '@lucide/svelte/icons/panel-right';
	import PanelRightCloseIcon from '@lucide/svelte/icons/panel-right-close';
	import Minimize2Icon from '@lucide/svelte/icons/minimize-2';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	// ── layout-local scroll handling ─────────────────────────────────────────
	let scrollEl = $state<HTMLElement | null>(null);
	function pinToBottom() {
		scrollEl?.scrollTo({ top: scrollEl.scrollHeight });
	}

	// model / permission selectors are page-local
	let currentTab = $state<BrainTabContext | null>(null);
	let openTabs = $state<BrainTabContext[]>([]);
	let permission = $state<AgentPermissionMode>(loadPermissionMode());
	let permissionReady = $state(false);
	let provider = $state('anthropic');
	let model = $state('claude-opus-4-6');
	let effort = $state('High');
	let expandedFromSidebar = $state(false);
	const control = getControlState();

	async function refreshOpenTabs() {
		openTabs = await getControlConsoleBridge().getOpenTabContexts();
	}

	function syncSessionUrl(sessionId: string | null) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (sessionId) url.searchParams.set('session', sessionId);
		else url.searchParams.delete('session');
		url.searchParams.delete('prompt');
		window.history.replaceState(
			window.history.state,
			'',
			`${url.pathname}${url.search}${url.hash}`
		);
	}

	// ── the one shared chat engine ───────────────────────────────────────────
	const chat = createChatSession({
		pin: pinToBottom,
		surface: 'chat',
		onModelSelection: (selection) => {
			provider = selection.provider;
			model = selection.model;
		},
		onPermissionMode: (mode) => {
			permission = mode;
			permissionReady = true;
		},
		onSessionChange: syncSessionUrl
	});
	$effect(() => {
		if (permissionReady) savePermissionMode(permission);
	});

	onMount(() => {
		void (async () => {
			permission = await loadSharedPermissionMode();
			permissionReady = true;
			[currentTab, openTabs] = await Promise.all([
				getCurrentTabContext(),
				getControlConsoleBridge().getOpenTabContexts()
			]);
			const params = new URLSearchParams(window.location.search);
			expandedFromSidebar = params.get('source') === 'sidebar';
			const sessionId = params.get('session');
			const prompt = params.get('prompt');
			if (sessionId) await chat.loadSession(sessionId);
			if (prompt?.trim()) {
				chat.handleSend(prompt.trim(), [], { provider, model, effort, permission, tabContext: currentTab });
			}
			if (prompt) syncSessionUrl(chat.sessionId);
		})();
	});

	// Slide the panel open/closed by animating its width (pushes the chat column).
	function panelSlide(node: HTMLElement, { duration = 320 } = {}) {
		const w = node.offsetWidth;
		return {
			duration,
			easing: motionEase,
			css: (t: number) =>
				`width:${t * w}px; min-width:0; overflow:hidden; opacity:${Math.min(1, t * 1.6)};`
		};
	}

	async function sendMessage(text: string, context: Parameters<typeof chat.handleSend>[1]) {
		await control.resolveFromUserMessage(chat.sessionId, text);
		chat.handleSend(text, context, {
			provider,
			model,
			effort,
			permission,
			tabContext: currentTab
		});
	}

	function leaveChat() {
		if (expandedFromSidebar) {
			window.close();
			return;
		}
		if (window.history.length > 1) {
			window.history.back();
			return;
		}
		window.location.href = /^https?:$/.test(window.location.protocol) ? '/new-tab' : 'chrome://newtab/';
	}
</script>

<svelte:head>
	<title>{chat.title}</title>
</svelte:head>

<div
	class="bg-background text-foreground flex h-dvh w-full flex-col overflow-hidden overscroll-none antialiased"
>
	<!-- Top bar -->
	<header class="flex h-12 shrink-0 items-center gap-2 px-3">
		<button
			type="button"
			onclick={leaveChat}
			aria-label={expandedFromSidebar ? 'Return to sidebar' : 'Back'}
			title={expandedFromSidebar ? 'Return to sidebar' : 'Back'}
			class="text-muted-foreground hover:text-foreground hover:bg-muted/50 grid size-8 place-items-center rounded-lg transition-colors"
		>
			{#if expandedFromSidebar}
				<Minimize2Icon class="size-[18px]" />
			{:else}
				<ArrowLeftIcon class="size-[18px]" />
			{/if}
		</button>
		<button
			type="button"
			onclick={chat.newChat}
			aria-label="New chat"
			class="text-muted-foreground hover:text-foreground hover:bg-muted/50 grid size-8 place-items-center rounded-lg transition-colors"
		>
			<SquarePenIcon class="size-[18px]" />
		</button>
		<SessionSelector
			current={chat.title}
			groups={chat.sessionGroups}
			loading={chat.sessionsLoading}
			onNew={chat.newChat}
			onSelect={chat.loadSession}
		/>
		<button
			type="button"
			aria-label="More"
			class="text-muted-foreground hover:text-foreground hover:bg-muted/50 grid size-7 place-items-center rounded-lg transition-colors"
		>
			<EllipsisIcon class="size-[18px]" />
		</button>
		<div class="flex-1"></div>
		{#if chat.hasPanelContent}
			<button
				type="button"
				onclick={chat.togglePanel}
				aria-label="Toggle panel"
				class="hover:bg-muted/50 grid size-8 place-items-center rounded-lg transition-colors {chat.showPanel
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				{#if chat.showPanel}
					<PanelRightCloseIcon class="size-[18px]" />
				{:else}
					<PanelRightIcon class="size-[18px]" />
				{/if}
			</button>
		{/if}
	</header>

	<!-- Main: chat column + optional agent tab panel -->
	<div class="flex min-h-0 flex-1">
		<section class="flex min-w-0 flex-1 flex-col">
			<main
				bind:this={scrollEl}
				class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-none"
			>
				<div class="mx-auto w-full px-4" style="max-width: 720px;">
					<Conversation messages={chat.messages} />
				</div>
			</main>
			<!-- The question tool REPLACES the reply bar while it's active -->
			<div class="mx-auto w-full px-4 pb-1" style="max-width: 720px;">
				{#if chat.questionActive}
					<div transition:fly={{ y: 12, duration: 260, easing: motionEase }}>
						<QuestionTool
							questions={chat.pendingQuestion?.questions}
							onCancel={chat.cancelQuestion}
							onComplete={chat.completeQuestion}
						/>
					</div>
				{:else}
					{#key currentTab?.tab_id ?? 'no-tab'}
						<Composer
							placeholder="Reply, @ for context"
							showContext={false}
							currentTab={currentTab}
							{openTabs}
							skills={chat.skills}
							onMentionOpen={refreshOpenTabs}
							streaming={chat.streaming}
							onSend={sendMessage}
							onStop={chat.stopStreaming}
							queued={chat.queue.map((q) => q.text)}
							onRemoveQueued={chat.removeQueued}
						/>
					{/key}
				{/if}
			</div>
			<!-- Bottom bar — lives in the chat column so it always follows the composer box -->
			<div
				class="mx-auto flex h-10 w-full shrink-0 items-center justify-between px-3 pb-1"
				style="max-width: 688px;"
			>
				<PermissionSelect bind:permission showLabel />
				<ModelControls bind:provider bind:model bind:effort />
			</div>
		</section>

		{#if chat.showPanel}
			<aside
				transition:panelSlide
				class="shrink-0 py-2 pr-2"
				style="width: 380px; max-width: 38vw;"
			>
				<SidePanel
					artifacts={chat.artifacts}
					agentTabs={chat.agentTabs}
					onOpenArtifact={chat.revealArtifact}
				/>
			</aside>
		{/if}
	</div>
</div>
