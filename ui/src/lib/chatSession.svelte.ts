import { tick } from 'svelte';
import {
	blocksFromText,
	buildTokens,
	faviconUrlForPage,
	type AssistantMessage,
	type ChatError,
	type ContextRef,
	type Message,
	type Step
} from './chat';
import {
	getBrainBridge,
	type AgentPermissionMode,
	type BrainArtifactInfo,
	type BrainConsoleEvent,
	type BrainModelSelection,
	type ReasoningEffort,
	type BrainSessionMessage,
	type BrainSessionInfo,
	type BrainSkillInfo,
	type BrainTabContext
} from './brain/bridge';
import { getControlConsoleBridge } from './brain/controlConsole';
import type { AgentTab, Artifact } from './components/SidePanel.svelte';

type SendOptions = {
	provider?: string;
	model?: string;
	effort?: string;
	permission?: AgentPermissionMode;
	tabContext?: BrainTabContext | null;
};

type QueuedTurn = {
	text: string;
	context: ContextRef[];
	options?: SendOptions;
};

type LiveTurnSnapshot = {
	sessionId: string;
	title: string;
	messages: Message[];
	activeText: string;
	updatedAt: number;
};

const LIVE_TURN_KEY_PREFIX = 'stead:live-turn:v1:';

function liveTurnStorageKey(sessionId: string) {
	return `${LIVE_TURN_KEY_PREFIX}${sessionId}`;
}

function readLiveTurn(sessionId: string): LiveTurnSnapshot | null {
	try {
		const raw = globalThis.localStorage?.getItem(liveTurnStorageKey(sessionId));
		if (!raw) return null;
		const snapshot = JSON.parse(raw) as LiveTurnSnapshot;
		if (
			snapshot.sessionId !== sessionId ||
			!Array.isArray(snapshot.messages) ||
			Date.now() - snapshot.updatedAt > 24 * 60 * 60 * 1000
		) {
			globalThis.localStorage?.removeItem(liveTurnStorageKey(sessionId));
			return null;
		}
		return snapshot;
	} catch {
		return null;
	}
}

function removeLiveTurn(sessionId: string | null) {
	if (!sessionId) return;
	try {
		globalThis.localStorage?.removeItem(liveTurnStorageKey(sessionId));
	} catch {
		// Ignore unavailable storage in non-WebUI previews.
	}
}

type QuestionOption = { label: string; info: string };
type QuestionPrompt = {
	id: string;
	category: string;
	title: string;
	options: QuestionOption[];
	single?: boolean;
};
type PendingQuestionPrompt = {
	sessionId: string;
	toolCallId: string;
	prompt: string;
	questions: QuestionPrompt[];
};

const brain = getBrainBridge();

export type SessionGroup = {
	label: string;
	sessions: Array<{ id: string; title: string; unread?: boolean }>;
};

function modelSelection(options?: SendOptions): BrainModelSelection | null {
	if (!options?.provider || !options.model) return null;
	return { provider: options.provider, model: options.model };
}

function reasoningEffort(options?: SendOptions): ReasoningEffort {
	const normalized = options?.effort?.toLowerCase();
	if (
		normalized === 'minimal' ||
		normalized === 'low' ||
		normalized === 'medium' ||
		normalized === 'xhigh'
	) {
		return normalized;
	}
	return 'high';
}

function contextToTabContexts(
	context: ContextRef[],
	fallback?: BrainTabContext | null
): BrainTabContext[] {
	const tabs = context
		.filter((item): item is ContextRef & { tab_id: number } => typeof item.tab_id === 'number')
		.map((item) => ({
			tab_id: item.tab_id,
			url: item.url ?? item.sublabel ?? '',
			title: item.title
		}));
	if (fallback && !tabs.some((tab) => tab.tab_id === fallback.tab_id)) {
		tabs.unshift(fallback);
	}
	return tabs;
}

function sameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function groupSessions(sessions: BrainSessionInfo[]): SessionGroup[] {
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const buckets: Record<string, SessionGroup> = {};
	const ensure = (label: string) => (buckets[label] ??= { label, sessions: [] });
	for (const session of sessions) {
		const updated = new Date(session.updated_at);
		const label = sameDay(updated, now)
			? 'Today'
			: sameDay(updated, yesterday)
				? 'Yesterday'
				: now.getTime() - updated.getTime() < 7 * 24 * 60 * 60 * 1000
					? 'Previous 7 days'
					: 'Older';
		ensure(label).sessions.push({ id: session.id, title: session.title });
	}
	return ['Today', 'Yesterday', 'Previous 7 days', 'Older']
		.map((label) => buckets[label])
		.filter((group): group is SessionGroup => !!group && group.sessions.length > 0);
}

function createAssistant(label: string): AssistantMessage {
	return {
		role: 'assistant',
		steps: [{ kind: 'thought', label }],
		phase: 'thinking',
		thoughtSeconds: 0,
		thoughtStartedAt: Date.now(),
		collapsed: true,
		blocks: [],
		tokens: [],
		revealed: 0
	};
}

const TOOL_ACTIVITY: Record<string, { running: string; done: string; failed?: string }> = {
	browser_exec: {
		running: 'Working in the browser',
		done: 'Worked in the browser',
		failed: 'Browser work stopped'
	},
	'browser.list_tabs': {
		running: 'Checking your open tabs',
		done: 'Checked your open tabs'
	},
	browser_list_tabs: {
		running: 'Checking your open tabs',
		done: 'Checked your open tabs'
	},
	'browser.snapshot': {
		running: 'Reading the current page',
		done: 'Read the current page'
	},
	browser_snapshot: {
		running: 'Reading the current page',
		done: 'Read the current page'
	},
	'browser.navigate': {
		running: 'Opening the requested page',
		done: 'Opened the requested page'
	},
	browser_navigate: {
		running: 'Opening the requested page',
		done: 'Opened the requested page'
	},
	'browser.open_tab': {
		running: 'Opening a new tab',
		done: 'Opened a new tab'
	},
	browser_open_tab: { running: 'Opening a new tab', done: 'Opened a new tab' },
	'browser.click': {
		running: 'Selecting an item on the page',
		done: 'Selected an item on the page'
	},
	browser_click: {
		running: 'Selecting an item on the page',
		done: 'Selected an item on the page'
	},
	'browser.fill': {
		running: 'Entering information',
		done: 'Entered information'
	},
	browser_fill: {
		running: 'Entering information',
		done: 'Entered information'
	},
	'browser.scroll': {
		running: 'Trying to scroll the page',
		done: 'Scrolled the page',
		failed: 'Couldn’t scroll the page'
	},
	browser_scroll: {
		running: 'Trying to scroll the page',
		done: 'Scrolled the page',
		failed: 'Couldn’t scroll the page'
	},
	'browser.scroll_into_view': {
		running: 'Bringing the target into view',
		done: 'Brought the target into view'
	},
	browser_scroll_into_view: {
		running: 'Bringing the target into view',
		done: 'Brought the target into view'
	},
	'browser.screenshot': {
		running: 'Inspecting the page visually',
		done: 'Inspected the page visually'
	},
	browser_screenshot: {
		running: 'Inspecting the page visually',
		done: 'Inspected the page visually'
	},
	'browser.key': {
		running: 'Trying a keyboard action',
		done: 'Used the keyboard',
		failed: 'Keyboard action failed'
	},
	browser_key: {
		running: 'Trying a keyboard action',
		done: 'Used the keyboard',
		failed: 'Keyboard action failed'
	},
	'browser.focus': {
		running: 'Focusing the requested control',
		done: 'Focused the requested control'
	},
	browser_focus: {
		running: 'Focusing the requested control',
		done: 'Focused the requested control'
	},
	'browser.close_tab': { running: 'Closing a tab', done: 'Closed a tab' },
	browser_close_tab: { running: 'Closing a tab', done: 'Closed a tab' },
	'browser.probe_node': {
		running: 'Inspecting a page element',
		done: 'Inspected a page element'
	},
	browser_probe_node: {
		running: 'Inspecting a page element',
		done: 'Inspected a page element'
	},
	'browser.eval': {
		running: 'Inspecting page data',
		done: 'Inspected page data'
	},
	browser_eval: {
		running: 'Inspecting page data',
		done: 'Inspected page data'
	},
	'browser.mouse_click': {
		running: 'Clicking the page',
		done: 'Clicked the page'
	},
	browser_mouse_click: {
		running: 'Clicking the page',
		done: 'Clicked the page'
	},
	'browser.mouse_drag': {
		running: 'Dragging on the page',
		done: 'Dragged on the page'
	},
	browser_mouse_drag: {
		running: 'Dragging on the page',
		done: 'Dragged on the page'
	},
	'files.read': {
		running: 'Reading a session file',
		done: 'Read a session file'
	},
	files_read: {
		running: 'Reading a session file',
		done: 'Read a session file'
	},
	'files.write': {
		running: 'Creating a session file',
		done: 'Created a session file'
	},
	files_write: {
		running: 'Creating a session file',
		done: 'Created a session file'
	}
};

function toolActivity(payload: unknown) {
	const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	const id = typeof record.tool_call_id === 'string' ? record.tool_call_id : undefined;
	// browser_exec lowers each Playwright operation through the native broker so
	// policy and auditing still happen per action. Those nested calls are an
	// implementation trace, not separate user-facing work items; the parent
	// browser_exec row communicates progress without recreating the old noisy
	// "read/click/read" timeline.
	if (id?.includes(':steadwright:')) return null;
	const name =
		typeof record.name === 'string'
			? record.name
			: typeof record.message === 'string'
				? record.message
				: '';
	const status = typeof record.status === 'string' ? record.status : '';
	const labels = TOOL_ACTIVITY[name];
	if (labels) {
		return {
			id,
			status,
			name,
			label:
				status === 'completed'
					? labels.done
					: status === 'failed'
						? (labels.failed ?? 'Action failed')
						: labels.running
		};
	}
	const readable = name
		.replace(/^browser[._]/, '')
		.replace(/^files[._]/, '')
		.replaceAll('_', ' ')
		.replaceAll('.', ' ')
		.trim();
	if (!readable || readable === 'completed') return null;
	return {
		id,
		status,
		name,
		label: `${status === 'completed' ? 'Finished' : status === 'failed' ? 'Failed' : 'Using'} ${readable}`
	};
}

const PERCEPTION_ACTIVITY = new Set([
	'browser.snapshot',
	'browser_snapshot',
	'browser.screenshot',
	'browser_screenshot',
	'browser.probe_node',
	'browser_probe_node',
	'browser.eval',
	'browser_eval'
]);

function addActivityStep(
	steps: Step[],
	activity: NonNullable<ReturnType<typeof toolActivity>>
) {
	// Low-level read retries are one user-visible observation, not a transcript
	// of the agent's internal perception loop.
	if (PERCEPTION_ACTIVITY.has(activity.name)) {
		steps = steps.filter(
			(step) =>
				step.kind !== 'tab' ||
				![
					'Reading the current page',
					'Read the current page',
					'Inspecting the page visually',
					'Inspected the page visually',
					'Inspecting a page element',
					'Inspected a page element',
					'Inspecting page data',
					'Inspected page data'
				].includes(step.label)
		);
	}
	steps.push({ kind: 'tab', label: activity.label, id: activity.id });
	return steps;
}

function structuredError(payload: unknown): ChatError {
	const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	let code = typeof record.code === 'string' ? record.code : '';
	let raw =
		typeof record.message === 'string'
			? record.message
			: payload instanceof Error
				? payload.message
				: 'The agent could not complete this turn.';
	const prefixed = raw.match(/^([a-z_]+):\s*(.*)$/s);
	if (prefixed) {
		code ||= prefixed[1];
		raw = prefixed[2];
	}
	const normalized = `${code} ${raw}`.toLowerCase();
	if (
		code === 'provider_auth_failed' ||
		normalized.includes('authentication') ||
		normalized.includes('credential') ||
		normalized.includes('auth missing') ||
		normalized.includes('no auth')
	) {
		return {
			kind: 'auth',
			title: 'Reconnect Codex to continue',
			detail:
				'Your Codex connection is missing or expired. Reconnect it from the model menu, then retry.'
		};
	}
	if (code === 'model_not_configured' || code === 'model_not_found') {
		return {
			kind: 'model',
			title: 'Choose an available model',
			detail: 'The selected model is no longer available. Choose another model, then retry.'
		};
	}
	if (raw.includes('No tool call found for function call output')) {
		return {
			kind: 'generic',
			title: 'This turn needs to be retried',
			detail:
				'Stead repaired an invalid saved tool result. Your next attempt will use the repaired history.'
		};
	}
	if (raw.includes('400 Bad Request')) {
		return {
			kind: 'generic',
			title: 'The model rejected this turn',
			detail: 'Please retry. Technical details were retained for diagnostics.'
		};
	}
	if (normalized.includes('timed out') || normalized.includes('idle for too long')) {
		return {
			kind: 'network',
			title: 'The model stopped responding',
			detail: 'The stalled turn was cancelled. Check your connection and retry.'
		};
	}
	return {
		kind: 'generic',
		title: 'Stead couldn’t finish this turn',
		detail: raw
	};
}

function turnControlStatus(event: BrainConsoleEvent, payload: unknown) {
	if (event.type !== 'tool_status' || !payload || typeof payload !== 'object') return false;
	const record = payload as Record<string, unknown>;
	return record.tool_call_id === 'turn';
}

function cancelledTurnDone(event: BrainConsoleEvent, payload: unknown) {
	if (event.type !== 'assistant_done' || !payload || typeof payload !== 'object') return false;
	return (payload as Record<string, unknown>).stop_reason === 'cancelled';
}

function setAssistantText(message: AssistantMessage, text: string) {
	message.blocks = blocksFromText(text);
	message.tokens = buildTokens(message.blocks);
	message.revealed = message.tokens.length;
}

function restoredContext(message: BrainSessionMessage): ContextRef[] {
	const multiple = message.metadata.tab_contexts;
	const rawTabs = Array.isArray(multiple)
		? multiple
		: message.metadata.tab_context && typeof message.metadata.tab_context === 'object'
			? [message.metadata.tab_context]
			: [];
	return rawTabs.flatMap((raw) => {
		if (!raw || typeof raw !== 'object') return [];
		const tab = raw as Record<string, unknown>;
		const tabId = typeof tab.tab_id === 'number' ? tab.tab_id : undefined;
		const url = typeof tab.url === 'string' ? tab.url : '';
		const title = typeof tab.title === 'string' && tab.title ? tab.title : url;
		if (tabId === undefined || !title) return [];
		return [
			{
				title,
				sublabel: url,
				favicon: faviconUrlForPage(url),
				tab_id: tabId,
				url
			}
		];
	});
}

type StoredToolCall = {
	id?: string;
	name: string;
	arguments: Record<string, unknown>;
};

function storedToolCalls(message: BrainSessionMessage): StoredToolCall[] {
	const blocks = Array.isArray(message.metadata.content_blocks)
		? message.metadata.content_blocks
		: [];
	const calls = blocks.flatMap((candidate): StoredToolCall[] => {
		if (!candidate || typeof candidate !== 'object') return [];
		const block = candidate as Record<string, unknown>;
		if (block.type !== 'toolCall' || typeof block.name !== 'string') return [];
		return [
			{
				id: typeof block.id === 'string' ? block.id : undefined,
				name: block.name,
				arguments:
					block.arguments && typeof block.arguments === 'object'
						? (block.arguments as Record<string, unknown>)
						: {}
			}
		];
	});
	if (calls.length) return calls;

	const fallback: StoredToolCall[] = [];
	const pattern = /^\[tool_call:([^\s\]]+)\s*([^\]]*)\]$/gm;
	for (const match of message.content.matchAll(pattern)) {
		let args: Record<string, unknown> = {};
		try {
			const parsed = JSON.parse(match[2] || '{}');
			if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
		} catch {
			// Keep the call visible even when legacy argument text is malformed.
		}
		fallback.push({ name: match[1], arguments: args });
	}
	return fallback;
}

function normalizedToolName(name: string) {
	return name.replaceAll('.', '_');
}

function titleForUrl(url: string) {
	try {
		const parsed = new URL(url);
		const segment = parsed.pathname.split('/').filter(Boolean).at(-1);
		if (segment) {
			return segment
				.split(/[-_]/)
				.filter(Boolean)
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ');
		}
		return parsed.hostname || url;
	} catch {
		return url;
	}
}

function artifactFromPath(path: string): Artifact | null {
	if (!path.startsWith('artifacts/')) return null;
	const name = path.slice('artifacts/'.length);
	if (!name) return null;
	return {
		name,
		kind: /\.(md|txt|rtf|doc|docx|pdf)$/i.test(name) ? 'doc' : 'code'
	};
}

function artifactsFromBrain(items: BrainArtifactInfo[]): Artifact[] {
	return items.flatMap((item) => {
		const artifact = artifactFromPath(item.path);
		return artifact ? [artifact] : [];
	});
}

function restoreArtifacts(stored: BrainSessionMessage[]) {
	let artifacts: Artifact[] = [];

	for (const message of stored) {
		if (message.role !== 'assistant') continue;
		for (const call of storedToolCalls(message)) {
			if (normalizedToolName(call.name) !== 'files_write') continue;
			const path = typeof call.arguments.path === 'string' ? call.arguments.path : '';
			const artifact = artifactFromPath(path);
			if (artifact && !artifacts.some((item) => item.name === artifact.name)) {
				artifacts.push(artifact);
			}
		}
	}

	return artifacts;
}

function restoreMessages(stored: BrainSessionMessage[]): Message[] {
	const restored: Message[] = [];
	let assistant: AssistantMessage | null = null;
	let turnStartedAt = 0;
	let turnUpdatedAt = 0;

	function currentAssistant() {
		if (assistant) return assistant;
		assistant = createAssistant('');
		assistant.steps = [];
		assistant.phase = 'done';
		assistant.thoughtStartedAt = turnStartedAt;
		restored.push(assistant);
		return assistant;
	}

	function finishTurn() {
		if (!assistant) return;
		assistant.thoughtSeconds =
			turnStartedAt && turnUpdatedAt
				? Math.max(1, Math.round((turnUpdatedAt - turnStartedAt) / 1000))
				: 0;
		assistant = null;
		turnStartedAt = 0;
		turnUpdatedAt = 0;
	}

	function hasLaterTool(index: number) {
		for (let next = index + 1; next < stored.length; next += 1) {
			if (stored[next].role === 'user') return false;
			if (stored[next].role === 'tool' || storedToolCalls(stored[next]).length) return true;
		}
		return false;
	}

	for (const [index, message] of stored.entries()) {
		if (message.role === 'user') {
			finishTurn();
			restored.push({
				role: 'user',
				text: message.content,
				context: restoredContext(message)
			});
			turnStartedAt = Date.parse(message.created_at) || 0;
			continue;
		}
		turnUpdatedAt = Date.parse(message.created_at) || turnUpdatedAt;
		if (message.role === 'tool') {
			const toolName =
				typeof message.metadata.tool_name === 'string' ? message.metadata.tool_name : '';
			const toolId =
				typeof message.metadata.tool_call_id === 'string'
					? message.metadata.tool_call_id
					: undefined;
			const failed = message.metadata.is_error === true;
			const activity = toolActivity({
				name: toolName,
				tool_call_id: toolId,
				status: failed ? 'failed' : 'completed'
			});
			if (!activity) continue;
			const target = currentAssistant();
			if (failed) {
				target.steps = target.steps.filter((step) => step.id !== activity.id);
				continue;
			}
			const existing = activity.id
				? target.steps.find((step) => step.id === activity.id)
				: undefined;
			if (existing) existing.label = activity.label;
			else target.steps = addActivityStep(target.steps, activity);
			continue;
		}
		if (message.role !== 'assistant') continue;
		const calls = storedToolCalls(message);
		if (calls.length) {
			for (const call of calls) {
				const activity = toolActivity({
					name: call.name,
					tool_call_id: call.id,
					status: 'running'
				});
				if (activity) {
					const target = currentAssistant();
					target.steps = addActivityStep(target.steps, activity);
				}
			}
			continue;
		}
		const visibleText = message.content
			.split('\n')
			.filter((line) => !line.trimStart().startsWith('[tool_call:'))
			.join('\n')
			.trim();
		if (!visibleText) continue;
		const target = currentAssistant();
		if (hasLaterTool(index)) {
			target.steps.push({ kind: 'thought', label: visibleText });
		} else {
			setAssistantText(target, visibleText);
		}
	}
	finishTurn();
	return restored;
}

function eventMessage(event: BrainConsoleEvent, payload: unknown) {
	const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	if (typeof record.message === 'string') return record.message;
	if (typeof record.body === 'string')
		return record.title ? `${record.title}: ${record.body}` : record.body;
	if (typeof record.status === 'string') return record.status;
	if (typeof record.name === 'string') return record.name;
	return event.type.replaceAll('_', ' ');
}

function parseAskUserPrompt(
	event: BrainConsoleEvent,
	payload: unknown
): PendingQuestionPrompt | null {
	const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	if (record.name !== 'ask_user') return null;
	const sessionId = event.session_id;
	const toolCallId = typeof record.tool_call_id === 'string' ? record.tool_call_id : '';
	if (!sessionId || !toolCallId) return null;
	const args =
		record.arguments && typeof record.arguments === 'object'
			? (record.arguments as Record<string, unknown>)
			: {};
	const prompt =
		typeof args.prompt === 'string' && args.prompt.trim()
			? args.prompt.trim()
			: 'Answer the question to continue.';
	const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
	const questions = rawQuestions
		.map((raw, index): QuestionPrompt | null => {
			if (!raw || typeof raw !== 'object') return null;
			const item = raw as Record<string, unknown>;
			const title =
				typeof item.question === 'string' && item.question.trim() ? item.question.trim() : prompt;
			const options = Array.isArray(item.options)
				? item.options
						.map((rawOption): QuestionOption | null => {
							if (!rawOption || typeof rawOption !== 'object') return null;
							const option = rawOption as Record<string, unknown>;
							const label =
								typeof option.label === 'string' && option.label.trim() ? option.label.trim() : '';
							if (!label) return null;
							return {
								label,
								info:
									typeof option.description === 'string'
										? option.description
										: typeof option.info === 'string'
											? option.info
											: ''
							};
						})
						.filter((option): option is QuestionOption => option !== null)
				: [];
			return {
				id:
					typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `question_${index + 1}`,
				category:
					typeof item.header === 'string' && item.header.trim() ? item.header.trim() : 'Question',
				title,
				options,
				single: item.multiple === true ? false : true
			};
		})
		.filter((question): question is QuestionPrompt => question !== null);
	if (!questions.length) {
		questions.push({
			id: 'question',
			category: 'Question',
			title: prompt,
			options: [],
			single: true
		});
	}
	return { sessionId, toolCallId, prompt, questions };
}

/**
 * Shared chat engine for sidebar/full-chat/new-tab. It now talks through the
 * browser-owned brain bridge. In normal Vite dev, that bridge is a tiny fake;
 * in Stead WebUI it is backed by BrainConsole.
 */
export function createChatSession(
	opts: {
		pin?: () => void;
		surface?: string;
		onModelSelection?: (selection: BrainModelSelection) => void;
		onPermissionMode?: (mode: AgentPermissionMode) => void;
		onSessionChange?: (sessionId: string | null) => void;
	} = {}
) {
	let messages = $state<Message[]>([]);
	let queue = $state<QueuedTurn[]>([]);
	let streaming = $state(false);
	let ownsActiveDrain = false;
	let stopRequested = false;
	let drainGeneration = 0;
	let title = $state('New chat');
	let brainSessionId = $state<string | null>(null);
	let sessionPath = '';
	let sessions = $state<BrainSessionInfo[]>([]);
	let sessionsLoading = $state(false);
	let sessionsError = $state<string | null>(null);
	let activeAssistant: AssistantMessage | null = null;
	let activeText = '';
	let activeNarrationStep: Step | null = null;
	let narrationSequence = 0;

	let questionActive = $state(false);
	let pendingQuestion = $state<PendingQuestionPrompt | null>(null);
	let artifacts = $state<Artifact[]>([]);
	let agentTabs = $state<AgentTab[]>([]);
	let panelDismissed = $state(false);
	let skills = $state<BrainSkillInfo[]>(brain.skills);

	const hasPanelContent = $derived(artifacts.length > 0 || agentTabs.length > 0);
	const showPanel = $derived(hasPanelContent && !panelDismissed);
	const sessionGroups = $derived(groupSessions(sessions));
	const pin = () => opts.pin?.();

	function persistLiveTurn() {
		if (!brainSessionId || !activeAssistant) return;
		try {
			const assistantIndex = messages.indexOf(activeAssistant);
			if (assistantIndex < 0) return;
			const snapshot: LiveTurnSnapshot = {
				sessionId: brainSessionId,
				title,
				messages: messages.slice(Math.max(0, assistantIndex - 1), assistantIndex + 1),
				activeText,
				updatedAt: Date.now()
			};
			globalThis.localStorage?.setItem(
				liveTurnStorageKey(brainSessionId),
				JSON.stringify(snapshot)
			);
		} catch {
			// The native stream remains authoritative if storage is unavailable.
		}
	}

	function liveContext(raw: unknown): ContextRef[] {
		if (!Array.isArray(raw)) return [];
		return raw.flatMap((value) => {
			if (!value || typeof value !== 'object') return [];
			const tab = value as Record<string, unknown>;
			if (typeof tab.tab_id !== 'number') return [];
			const url = typeof tab.url === 'string' ? tab.url : '';
			const title = typeof tab.title === 'string' && tab.title ? tab.title : url;
			if (!title) return [];
			return [
				{
					title,
					sublabel: url,
					favicon: faviconUrlForPage(url),
					tab_id: tab.tab_id,
					url
				}
			];
		});
	}

	function beginRemoteTurn(text?: string, context: ContextRef[] = []) {
		if (activeAssistant) return;
		if (text?.trim()) {
			const lastUser = [...messages].reverse().find((message) => message.role === 'user');
			if (lastUser?.role !== 'user' || lastUser.text !== text) {
				messages.push({ role: 'user', text, context });
			}
		}
		messages.push(createAssistant('Thinking'));
		activeAssistant = messages[messages.length - 1] as AssistantMessage;
		activeText = '';
		activeNarrationStep = null;
		ownsActiveDrain = false;
		streaming = true;
		void tick().then(pin);
	}

	function handleTurnStarted(payload: unknown) {
		const record =
			payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
		const selection =
			record.model && typeof record.model === 'object'
				? (record.model as Record<string, unknown>)
				: null;
		if (typeof selection?.provider === 'string' && typeof selection.model === 'string') {
			opts.onModelSelection?.({
				provider: selection.provider,
				model: selection.model
			});
		}
		if (
			record.permission_mode === 'ask' ||
			record.permission_mode === 'read' ||
			record.permission_mode === 'full'
		) {
			opts.onPermissionMode?.(record.permission_mode);
		}
		beginRemoteTurn(
			typeof record.text === 'string' ? record.text : undefined,
			liveContext(record.tab_contexts)
		);
	}

	async function refreshSessions() {
		sessionsLoading = true;
		sessionsError = null;
		try {
			sessions = await brain.listSessions();
		} catch (error) {
			sessionsError = error instanceof Error ? error.message : String(error);
		} finally {
			sessionsLoading = false;
		}
	}

	void brain
		.initialize()
		.then(refreshSessions)
		.catch((error) => {
			sessionsError = error instanceof Error ? error.message : String(error);
		});

	brain.subscribe((event, payload) => {
		// The skill catalog rides the `ready` event, which arrives outside any
		// turn (and is replayed to late-binding surfaces by the BrainBroker).
		if (event.type === 'ready') {
			skills = brain.skills;
			return;
		}
		if (event.session_id && (!brainSessionId || event.session_id !== brainSessionId)) return;
		if (event.type === 'session_title_updated') {
			const record =
				payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
			if (typeof record.title === 'string' && record.title.trim()) {
				title = record.title.trim();
				void refreshSessions();
			}
			return;
		}
		if (event.type === 'turn_started') {
			handleTurnStarted(payload);
			return;
		}
		// Cancellation acknowledgements are control-plane state, not model/tool
		// activity. Rendering them can resurrect a completed turn as "streaming".
		if (turnControlStatus(event, payload)) return;
		if (cancelledTurnDone(event, payload) && !activeAssistant) {
			streaming = false;
			ownsActiveDrain = false;
			removeLiveTurn(brainSessionId);
			return;
		}
		if (!activeAssistant) {
			// A surface can attach after turn_started (for example when an agent tab
			// selects its owning chat). Future streamed events still join the turn.
			if (
				event.type === 'assistant_delta' ||
				event.type === 'notification' ||
				event.type === 'tool_call' ||
				event.type === 'tool_status' ||
				event.type === 'assistant_done' ||
				event.type === 'error'
			) {
				beginRemoteTurn();
			} else {
				return;
			}
		}
		if (!activeAssistant) return;

		if (event.type === 'assistant_delta') {
			const record =
				payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
			const delta = typeof record.text === 'string' ? record.text : '';
			if (!delta) return;
			activeText += delta;
			activeAssistant.steps = activeAssistant.steps.filter((step) => step.label !== 'Thinking');
			if (!activeNarrationStep) {
				activeNarrationStep = {
					kind: 'thought',
					label: '',
					id: `narration-${++narrationSequence}`
				};
				activeAssistant.steps.push(activeNarrationStep);
			}
			activeNarrationStep.label = activeText.trim();
			activeAssistant.phase = 'thinking';
			activeAssistant.thoughtSeconds = Math.max(
				1,
				Math.round((Date.now() - activeAssistant.thoughtStartedAt) / 1000)
			);
			persistLiveTurn();
			void tick().then(pin);
			return;
		}

		if (event.type === 'notification') {
			activeAssistant.steps.push({
				kind: 'thought',
				label: eventMessage(event, payload)
			});
			persistLiveTurn();
			void tick().then(pin);
			return;
		}

		if (event.type === 'tool_call') {
			activeNarrationStep = null;
			activeText = '';
			const askUser = parseAskUserPrompt(event, payload);
			if (askUser) {
				pendingQuestion = askUser;
				questionActive = true;
				activeAssistant.steps.push({
					kind: 'thought',
					label: askUser.prompt
				});
				persistLiveTurn();
				void tick().then(pin);
				return;
			}
			trackToolSideContent(payload);
		}

		if (event.type === 'tool_call' || event.type === 'tool_status') {
			const activity = toolActivity(payload);
			if (!activity) return;
			activeAssistant.steps = activeAssistant.steps.filter((step) => step.label !== 'Thinking');
			// Failed low-level attempts are internal recovery details. If the turn
			// itself fails, the structured error card communicates that outcome;
			// recovered retries should not remain as alarming timeline entries.
			if (activity.status === 'failed') {
				activeAssistant.steps = activeAssistant.steps.filter((step) => step.id !== activity.id);
				persistLiveTurn();
				void tick().then(pin);
				return;
			}
			const existing = activity.id
				? activeAssistant.steps.find((step) => step.id === activity.id)
				: undefined;
			if (existing) existing.label = activity.label;
			else activeAssistant.steps = addActivityStep(activeAssistant.steps, activity);
			persistLiveTurn();
			void tick().then(pin);
			return;
		}

		if (event.type === 'assistant_done') {
			const record =
				payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
			const allArtifacts = Array.isArray(record.artifacts)
				? artifactsFromBrain(record.artifacts as BrainArtifactInfo[])
				: artifacts;
			const createdArtifacts = Array.isArray(record.created_artifacts)
				? artifactsFromBrain(record.created_artifacts as BrainArtifactInfo[])
				: [];
			artifacts = allArtifacts;
			if (createdArtifacts.length) {
				activeAssistant.artifacts = createdArtifacts;
				panelDismissed = false;
			}
			activeAssistant.thoughtSeconds = Math.max(
				1,
				Math.round((Date.now() - activeAssistant.thoughtStartedAt) / 1000)
			);
			if (activeText.trim()) {
				if (activeNarrationStep) {
					activeAssistant.steps = activeAssistant.steps.filter(
						(step) => step !== activeNarrationStep
					);
				}
				setAssistantText(activeAssistant, activeText);
			} else if (!activeAssistant.blocks.length && !activeAssistant.error) {
				activeAssistant.phase = 'answering';
				setAssistantText(
					activeAssistant,
					'Stead completed the turn without producing an answer. Please retry.'
				);
			}
			activeAssistant.phase = 'done';
			activeNarrationStep = null;
			if (!ownsActiveDrain) streaming = false;
			removeLiveTurn(brainSessionId);
			activeAssistant = null;
			void tick().then(pin);
			return;
		}

		if (event.type === 'error') {
			activeAssistant.phase = 'answering';
			activeAssistant.error = structuredError(payload);
			activeAssistant.blocks = [];
			activeAssistant.tokens = [];
			activeAssistant.revealed = 0;
			activeAssistant.thoughtSeconds = Math.max(
				1,
				Math.round((Date.now() - activeAssistant.thoughtStartedAt) / 1000)
			);
			activeAssistant.phase = 'done';
			activeNarrationStep = null;
			activeText = '';
			if (!ownsActiveDrain) streaming = false;
			removeLiveTurn(brainSessionId);
			activeAssistant = null;
			void tick().then(pin);
		}
	});

	// Side-panel rows come from real tool calls, not guesses based on user text.
	function trackToolSideContent(payload: unknown) {
		const record =
			payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
		const name = normalizedToolName(typeof record.name === 'string' ? record.name : '');
		const toolCallId =
			typeof record.tool_call_id === 'string'
				? record.tool_call_id
				: `live-tab-${Date.now()}-${agentTabs.length}`;
		const args =
			record.arguments && typeof record.arguments === 'object'
				? (record.arguments as Record<string, unknown>)
				: {};
		if (name === 'browser_open_tab') {
			const url = typeof args.url === 'string' ? args.url : '';
			if (url && !agentTabs.some((tab) => tab.id === toolCallId)) {
				agentTabs = [
					...agentTabs,
					{
						id: toolCallId,
						title: titleForUrl(url),
						url,
						favicon: faviconUrlForPage(url),
						status: 'opening'
					}
				];
				panelDismissed = false;
			}
			return;
		}
		if (name === 'browser_navigate') {
			const url = typeof args.url === 'string' ? args.url : '';
			const tabId = typeof args.tab_id === 'number' ? args.tab_id : undefined;
			const index = tabId === undefined ? -1 : agentTabs.findIndex((tab) => tab.tabId === tabId);
			if (url && index >= 0) {
				agentTabs[index] = {
					...agentTabs[index],
					title: titleForUrl(url),
					url,
					favicon: faviconUrlForPage(url)
				};
				agentTabs = [...agentTabs];
			}
			return;
		}
		if (name === 'browser_close_tab') {
			const tabId = typeof args.tab_id === 'number' ? args.tab_id : undefined;
			if (tabId !== undefined) agentTabs = agentTabs.filter((tab) => tab.tabId !== tabId);
			return;
		}
		if (name === 'files_write') {
			const path = typeof args.path === 'string' ? args.path : '';
			const artifact = artifactFromPath(path);
			if (artifact) {
				if (!artifacts.some((item) => item.name === artifact.name)) {
					artifacts = [...artifacts, artifact];
				}
				panelDismissed = false;
			}
		}
	}

	async function ensureBrainSession() {
		if (brainSessionId) return brainSessionId;
		const session = await brain.createSession(title, opts.surface ?? 'webui');
		brainSessionId = session.id;
		sessionPath = session.path;
		opts.onSessionChange?.(session.id);
		title = session.title;
		void refreshSessions();
		return session.id;
	}

	async function loadSession(sessionId: string) {
		if (streaming) return;
		const loaded = await brain.loadSession(sessionId);
		brainSessionId = loaded.session.id;
		sessionPath = loaded.session.path;
		opts.onSessionChange?.(loaded.session.id);
		title = loaded.session.title;
		const activeTurn = brain.getActiveTurn(sessionId);
		const liveTurn = activeTurn ? readLiveTurn(sessionId) : null;
		if (!activeTurn) removeLiveTurn(sessionId);
		messages = [...restoreMessages(loaded.messages), ...(liveTurn?.messages ?? [])];
		queue = [];
		artifacts = loaded.artifacts.length
			? artifactsFromBrain(loaded.artifacts)
			: restoreArtifacts(loaded.messages);
		// Agent tabs are live browser resources, not conversation history.
		agentTabs = [];
		panelDismissed = false;
		questionActive = false;
		pendingQuestion = null;
		const liveAssistant = liveTurn
			? [...messages]
					.reverse()
					.find(
						(message): message is AssistantMessage =>
							message.role === 'assistant' && message.phase !== 'done'
					)
			: undefined;
		activeAssistant = liveAssistant ?? null;
		activeText = liveAssistant ? (liveTurn?.activeText ?? '') : '';
		activeNarrationStep = liveAssistant
			? ([...liveAssistant.steps].reverse().find((step) => step.id?.startsWith('narration-')) ??
				null)
			: null;
		ownsActiveDrain = false;
		streaming = !!liveAssistant;
		if (liveTurn?.title) title = liveTurn.title;
		if (loaded.model) opts.onModelSelection?.(loaded.model);
		if (activeTurn) handleTurnStarted(activeTurn.payload);
		await tick();
		pin();

		// Reconcile against the native tab model after the chat is already live;
		// the independent query never delays event subscription or first paint.
		void getControlConsoleBridge()
			.getOpenTabContexts()
			.then((openTabs) => {
				if (brainSessionId !== loaded.session.id) return;
				const ownedTabs = openTabs.filter(
					(tab) => tab.agent_owned && tab.owner_session_id === loaded.session.id
				);
				const nativeTabs: AgentTab[] = ownedTabs.map((tab) => ({
					id: `tab-${tab.tab_id}`,
					tabId: tab.tab_id,
					title: tab.title || titleForUrl(tab.url),
					url: tab.url,
					favicon: faviconUrlForPage(tab.url),
					status: 'open'
				}));
				const stillOpening = agentTabs.filter(
					(tab) =>
						tab.status === 'opening' && !nativeTabs.some((nativeTab) => nativeTab.url === tab.url)
				);
				agentTabs = [...nativeTabs, ...stillOpening];
			});
		return loaded;
	}

	async function streamOne(
		text: string,
		context: ContextRef[],
		options: SendOptions | undefined,
		generation: number
	) {
		stopRequested = false;
		questionActive = false;
		pendingQuestion = null;

		messages.push({ role: 'user', text, context });
		const assistant = createAssistant('Thinking');
		messages.push(assistant);
		// `$state` proxies objects when they enter the array. Keep the proxied
		// reference so native stream events trigger a Svelte render.
		const renderedAssistant = messages[messages.length - 1] as AssistantMessage;
		activeAssistant = renderedAssistant;
		activeText = '';
		activeNarrationStep = null;
		await tick();
		pin();

		try {
			const sessionId = await ensureBrainSession();
			persistLiveTurn();
			if (!stopRequested) {
				await brain.sendMessage({
					sessionId,
					text,
					tabContexts: contextToTabContexts(context, options?.tabContext),
					model: modelSelection(options),
					reasoningEffort: reasoningEffort(options),
					permissionMode: options?.permission ?? 'ask'
				});
			}
		} catch (error) {
			renderedAssistant.phase = 'answering';
			renderedAssistant.error ??= structuredError(error);
			renderedAssistant.blocks = [];
			renderedAssistant.tokens = [];
			renderedAssistant.revealed = 0;
			removeLiveTurn(brainSessionId);
		} finally {
			renderedAssistant.phase = 'done';
			if (generation === drainGeneration) activeAssistant = null;
			await tick();
			pin();
			void refreshSessions();
		}
	}

	async function drain(text: string, context: ContextRef[], options?: SendOptions) {
		const generation = ++drainGeneration;
		ownsActiveDrain = true;
		streaming = true;
		try {
			let cur: QueuedTurn | null = { text, context, options };
			while (cur && generation === drainGeneration) {
				await streamOne(cur.text, cur.context, cur.options, generation);
				if (queue.length) {
					cur = queue[0];
					queue = queue.slice(1);
				} else {
					cur = null;
				}
			}
		} finally {
			if (generation === drainGeneration) {
				ownsActiveDrain = false;
				streaming = false;
			}
		}
	}

	function handleSend(text: string, context: ContextRef[], options?: SendOptions) {
		if (streaming) queue = [...queue, { text, context, options }];
		else void drain(text, context, options);
	}

	function newChat() {
		if (streaming) return;
		removeLiveTurn(brainSessionId);
		messages = [];
		queue = [];
		artifacts = [];
		agentTabs = [];
		panelDismissed = false;
		questionActive = false;
		pendingQuestion = null;
		brainSessionId = null;
		sessionPath = '';
		opts.onSessionChange?.(null);
		activeAssistant = null;
		activeText = '';
		activeNarrationStep = null;
		title = 'New chat';
		void refreshSessions();
	}

	async function stopStreaming() {
		stopRequested = true;
		const sessionId = brainSessionId;
		if (sessionId) await brain.cancelTurn(sessionId).catch(() => undefined);
		// Cancellation acknowledgement follows the harness abort signal, but the
		// old terminal event can arrive a few frames later. Do not race it with a
		// fresh send; a short bound still recovers stale cached turns promptly.
		if (sessionId) {
			const deadline = Date.now() + 1500;
			while (brain.getActiveTurn(sessionId) && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
		drainGeneration += 1;

		const assistant = activeAssistant;
		if (assistant) {
			assistant.steps = assistant.steps.filter((step) => step.label !== 'Thinking');
			assistant.phase = 'done';
			if (!assistant.steps.length && !assistant.blocks.length && !assistant.error) {
				messages = messages.filter((message) => message !== assistant);
			}
		}
		queue = [];
		questionActive = false;
		pendingQuestion = null;
		activeAssistant = null;
		activeText = '';
		activeNarrationStep = null;
		ownsActiveDrain = false;
		streaming = false;
		removeLiveTurn(sessionId);
		await tick();
		pin();
	}

	function revealArtifact(artifact: Artifact) {
		if (!sessionPath || !artifact.name || artifact.name.includes('..')) return;
		const separator = sessionPath.endsWith('/') ? '' : '/';
		const path = `${sessionPath}${separator}artifacts/${artifact.name}`;
		const chromeApi = (
			globalThis as typeof globalThis & {
				chrome?: { send?: (message: string, args?: unknown[]) => void };
			}
		).chrome;
		chromeApi?.send?.('revealSteadArtifact', [path]);
	}

	return {
		get messages() {
			return messages;
		},
		get queue() {
			return queue;
		},
		get streaming() {
			return streaming;
		},
		get title() {
			return title;
		},
		get sessionId() {
			return brainSessionId;
		},
		set title(v: string) {
			title = v;
		},
		get questionActive() {
			return questionActive;
		},
		get skills() {
			return skills;
		},
		get sessions() {
			return sessions;
		},
		get sessionGroups() {
			return sessionGroups;
		},
		get sessionsLoading() {
			return sessionsLoading;
		},
		get sessionsError() {
			return sessionsError;
		},
		get pendingQuestion() {
			return pendingQuestion;
		},
		get artifacts() {
			return artifacts;
		},
		get agentTabs() {
			return agentTabs;
		},
		get panelDismissed() {
			return panelDismissed;
		},
		get hasPanelContent() {
			return hasPanelContent;
		},
		get showPanel() {
			return showPanel;
		},
		handleSend,
		refreshSessions,
		loadSession,
		stopStreaming,
		revealArtifact,
		removeQueued: (i: number) => {
			queue = queue.filter((_, j) => j !== i);
		},
		newChat,
		cancelQuestion: () => {
			const pending = pendingQuestion;
			questionActive = false;
			pendingQuestion = null;
			if (pending) {
				void brain.respondToUserPrompt(
					pending.sessionId,
					pending.toolCallId,
					{ cancelled: true },
					true
				);
			}
		},
		completeQuestion: (answers: { picks: string[]; custom: string }[]) => {
			const pending = pendingQuestion;
			questionActive = false;
			pendingQuestion = null;
			if (!pending) return;
			void brain.respondToUserPrompt(pending.sessionId, pending.toolCallId, {
				prompt: pending.prompt,
				answers: answers.map((answer, index) => {
					const question = pending.questions[index];
					return {
						id: question?.id ?? `question_${index + 1}`,
						question: question?.title ?? '',
						selected_labels: answer.picks,
						custom: answer.custom
					};
				})
			});
		},
		togglePanel: () => {
			panelDismissed = !panelDismissed;
		}
	};
}

export type ChatSession = ReturnType<typeof createChatSession>;
