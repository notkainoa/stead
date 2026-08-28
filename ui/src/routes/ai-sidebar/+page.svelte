<script lang="ts">
	import { onMount } from 'svelte';
	import { scale, fly } from 'svelte/transition';
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
	import SidebarHeader from '$lib/components/SidebarHeader.svelte';
	import Conversation from '$lib/components/Conversation.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import QuestionTool from '$lib/components/QuestionTool.svelte';
	import ModelBar from '$lib/components/ModelBar.svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let scrollEl = $state<HTMLElement | null>(null);
	let showScrollDown = $state(false);
	let footerH = $state(120); // measured footer height → scroll padding + bottom fade

	function onScroll() {
		if (!scrollEl) return;
		const { scrollTop, clientHeight, scrollHeight } = scrollEl;
		showScrollDown = scrollHeight - (scrollTop + clientHeight) > 48;
	}
	function scrollToBottom(smooth = true) {
		scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}
	let currentTab = $state<BrainTabContext | null>(null);
	let openTabs = $state<BrainTabContext[]>([]);
	let provider = $state('anthropic');
	let model = $state('claude-opus-4-6');
	let effort = $state('High');
	let permission = $state<AgentPermissionMode>(loadPermissionMode());
	let permissionReady = $state(false);
	const control = getControlState();
	let activeRestoreKey = '';
	let restoreVersion = 0;
	const TAB_SESSIONS_KEY = 'stead.sidebar.sessions-by-tab.v1';

	function tabSessions(): Record<string, string> {
		try {
			return JSON.parse(localStorage.getItem(TAB_SESSIONS_KEY) ?? '{}');
		} catch {
			return {};
		}
	}

	function rememberSession(sessionId: string | null) {
		if (currentTab?.tab_id == null) return;
		const sessions = tabSessions();
		if (sessionId) sessions[String(currentTab.tab_id)] = sessionId;
		else delete sessions[String(currentTab.tab_id)];
		localStorage.setItem(TAB_SESSIONS_KEY, JSON.stringify(sessions));
	}
	// ── the one shared chat engine (same code as the full chat) ──────────────
	const chat = createChatSession({
		pin: () => scrollToBottom(false),
		surface: 'sidebar',
			onModelSelection: (selection) => {
				provider = selection.provider;
				model = selection.model;
			},
			onPermissionMode: (mode) => {
				permission = mode;
				permissionReady = true;
			},
			onSessionChange: rememberSession
		});

	$effect(() => {
		if (permissionReady) savePermissionMode(permission);
	});

	async function restoreTab(tab: BrainTabContext | null) {
		const tabId = tab?.tab_id ?? null;
		const sessionId =
			tab?.owner_session_id || (tabId == null ? undefined : tabSessions()[String(tabId)]);
		const restoreKey = `${tabId ?? 'none'}:${sessionId ?? 'none'}:${tab?.agent_owned ? 'owned' : 'normal'}`;
		if (restoreKey === activeRestoreKey && (!sessionId || sessionId === chat.sessionId)) return;
		activeRestoreKey = restoreKey;
		const version = ++restoreVersion;
		if (tab?.owner_session_id && tabId != null) {
			const sessions = tabSessions();
			sessions[String(tabId)] = tab.owner_session_id;
			localStorage.setItem(TAB_SESSIONS_KEY, JSON.stringify(sessions));
		}
		if (sessionId && sessionId === chat.sessionId) return;
		if (chat.streaming) {
			// A tab switch must never cancel a turn. Agent-created tabs share the
			// owner session and return above; unrelated tabs restore after the
			// background turn completes if they are still active.
			while (chat.streaming && version === restoreVersion) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}
		if (version !== restoreVersion) return;
		if (tabId == null) return;
		if (!sessionId) {
			// Ownership and its session id can arrive on adjacent Mojo updates. Never
			// replace a controlled tab's thread with a blank chat during that window.
			if (tab?.agent_owned) return;
			chat.newChat();
			return;
		}
		try {
			await chat.loadSession(sessionId);
		} catch {
			if (version === restoreVersion) {
				activeRestoreKey = '';
				if (tab?.agent_owned) return;
				rememberSession(null);
				chat.newChat();
			}
		}
	}

	function closeSidebar() {
		const chromeApi = (
			globalThis as typeof globalThis & {
				chrome?: { send?: (message: string) => void };
			}
		).chrome;
		chromeApi?.send?.('closeSteadSidebar');
	}

	function openFullChat() {
		const chromeApi = (
			globalThis as typeof globalThis & {
				chrome?: { send?: (message: string, args?: unknown[]) => void };
			}
		).chrome;
		chromeApi?.send?.('openSteadFullChat', chat.sessionId ? [chat.sessionId] : []);
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

	async function refreshOpenTabs() {
		openTabs = await getControlConsoleBridge().getOpenTabContexts();
	}

	onMount(() => {
		void loadSharedPermissionMode().then((mode) => {
			permission = mode;
			permissionReady = true;
		});
		// The sidebar tracks the tab it is bound to. Tab switches don't refocus
		// the side panel's webview, so a light poll backs up the focus events.
		const refresh = () =>
			void Promise.all([
				getCurrentTabContext(),
				getControlConsoleBridge().getOpenTabContexts()
			]).then(([tab, tabs]) => {
					openTabs = tabs;
					if (!tab) return;
					if (
						tab.tab_id !== currentTab?.tab_id ||
						tab.url !== currentTab?.url ||
						tab.title !== currentTab?.title ||
						tab.agent_owned !== currentTab?.agent_owned ||
						tab.owner_session_id !== currentTab?.owner_session_id
					) {
						currentTab = tab;
					}
					void restoreTab(tab);
				});
		refresh();
		const interval = setInterval(refresh, 500);
		window.addEventListener('focus', refresh);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', refresh);
			document.removeEventListener('visibilitychange', refresh);
		};
	});
</script>

<svelte:head>
	<title>Ask Stead</title>
</svelte:head>

<div class="bg-background text-foreground relative h-dvh w-full overflow-hidden antialiased">
	<!-- Conversation scrolls full-height, under the transparent header & footer -->
	<main
		bind:this={scrollEl}
		onscroll={onScroll}
		class="scrollbar-none absolute inset-0 overflow-y-auto overscroll-none"
		style="padding-top: 3.5rem; padding-bottom: {footerH}px;"
	>
		<Conversation messages={chat.messages} />
	</main>

	<!-- top: progressive fade/blur, then header content on top -->
	<div class="scroll-fade scroll-fade-top pointer-events-none absolute inset-x-0 top-0 z-10 h-24"></div>
	<div class="absolute inset-x-0 top-0 z-20">
		<SidebarHeader
			current={chat.title}
			groups={chat.sessionGroups}
			loading={chat.sessionsLoading}
			{currentTab}
			onClose={closeSidebar}
			onOpenFull={openFullChat}
			onNew={chat.newChat}
			onSelect={chat.loadSession}
		/>
	</div>

	<!-- bottom: progressive fade/blur, then footer content on top -->
	<div
		class="scroll-fade scroll-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10"
		style="height: {footerH + 44}px;"
	></div>
	<footer
		bind:clientHeight={footerH}
		class="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 px-3 pt-2 pb-3"
	>
		{#if showScrollDown && !chat.questionActive}
			<button
				type="button"
				onclick={() => scrollToBottom()}
				transition:scale={{ duration: 160, start: 0.8, easing: motionEase }}
				aria-label="Scroll to latest"
				class="surface-raised text-muted-foreground hover:text-foreground absolute -top-11 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full transition-[filter] hover:brightness-115"
			>
				<ChevronDownIcon class="size-4" />
			</button>
		{/if}

		<!-- The question tool REPLACES the reply bar while it's active -->
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
					currentTab={currentTab}
					{openTabs}
					skills={chat.skills}
					onMentionOpen={refreshOpenTabs}
					onSend={sendMessage}
					onStop={chat.stopStreaming}
					streaming={chat.streaming}
					queued={chat.queue.map((q) => q.text)}
					onRemoveQueued={chat.removeQueued}
				/>
			{/key}
		{/if}
		<ModelBar bind:provider bind:model bind:effort bind:permission />
	</footer>
</div>
