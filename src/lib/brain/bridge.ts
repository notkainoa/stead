export type BrainRequestResult = {
	ok: boolean;
	request_id: string;
	code: string;
	message: string;
};

export type BrainConsoleEvent = {
	type: string;
	request_id?: string;
	session_id?: string;
	payload_json: string;
};

export type BrainSessionInfo = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	path: string;
};

export type BrainSessionMessage = {
	role: string;
	content: string;
	created_at: string;
	metadata: Record<string, unknown>;
};

export type BrainArtifactInfo = {
	path: string;
	name: string;
};

export type BrainLoadedSession = {
	session: BrainSessionInfo;
	messages: BrainSessionMessage[];
	model?: BrainModelSelection;
	artifacts: BrainArtifactInfo[];
};

export type ProviderAuthStatus = {
	provider: string;
	configured: boolean;
	credential_kind?: string;
	source?: string;
	account_id?: string;
	expires_at_unix_secs?: number;
	needs_refresh: boolean;
};

export type ProviderAuthUrl = {
	provider: string;
	url: string;
	expires_in_secs?: number;
};

export type BrainModelCatalogEntry = {
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
	input: string[];
	context_window: number;
	max_tokens: number;
};

export type BrainModelCatalogProvider = {
	provider: string;
	label: string;
	configured: boolean;
	credential_kind?: string;
	source?: string;
	supports_oauth: boolean;
	supports_codex_import: boolean;
	models: BrainModelCatalogEntry[];
};

export type BrainModelSelection = {
	provider: string;
	model: string;
};

export type AgentPermissionMode = 'ask' | 'read' | 'full';
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type BrainTabContext = {
	tab_id: number;
	url: string;
	title: string;
	agent_owned?: boolean;
	owner_session_id?: string;
};

export type BrainSkillInfo = {
	name: string;
	description: string;
	source: 'builtin' | 'user' | string;
};

export type NativeBrainConsole = {
	addObserver(handler: (event: BrainConsoleEvent) => void): () => void;
	initialize(): Promise<BrainRequestResult>;
	createSession(title: string | null, originSurface: string): Promise<BrainRequestResult>;
	listSessions(): Promise<BrainRequestResult>;
	loadSession(sessionId: string): Promise<BrainRequestResult>;
	getPermissionMode(): Promise<AgentPermissionMode>;
	setPermissionMode(mode: AgentPermissionMode): Promise<void>;
	sendMessage(
		sessionId: string,
		text: string,
		tabContexts?: BrainTabContext[],
		model?: BrainModelSelection | null,
		reasoningEffort?: ReasoningEffort,
		permissionMode?: AgentPermissionMode
	): Promise<BrainRequestResult>;
	cancelTurn(sessionId: string): Promise<BrainRequestResult>;
	listModels(): Promise<BrainRequestResult>;
	listProviderAuth(): Promise<BrainRequestResult>;
	startProviderOAuth(provider: string): Promise<BrainRequestResult>;
	importCodexAuth(path?: string | null): Promise<BrainRequestResult>;
	clearProviderCredential(provider: string): Promise<BrainRequestResult>;
	setProviderApiKey(provider: string, apiKey: string): Promise<BrainRequestResult>;
	respondToUserPrompt(
		sessionId: string,
		toolCallId: string,
		response: unknown,
		cancelled?: boolean
	): Promise<BrainRequestResult>;
	shutdownBrain(): Promise<BrainRequestResult>;
};

declare global {
	interface Window {
		steadBrain?: NativeBrainConsole;
		steadTabContext?: BrainTabContext | (() => BrainTabContext | null | Promise<BrainTabContext | null>);
	}
}

type MojoBrainResult = {
	ok: boolean;
	requestId?: string;
	request_id?: string;
	code: string;
	message: string;
};

type MojoBrainEvent = {
	type: string;
	requestId?: string;
	request_id?: string;
	sessionId?: string;
	session_id?: string;
	payloadJson?: string;
	payload_json?: string;
};

type MojoBrainPermissionMode = number;

type MojoRemote = {
	$: { bindNewPipeAndPassReceiver(): unknown };
	addObserver(remote: unknown): void;
	initialize(): Promise<{ result: MojoBrainResult }>;
	shutdownBrain(): Promise<{ result: MojoBrainResult }>;
	createSession(title: string | null, originSurface: string): Promise<{ result: MojoBrainResult }>;
	listSessions(): Promise<{ result: MojoBrainResult }>;
	loadSession(sessionId: string): Promise<{ result: MojoBrainResult }>;
	getPermissionMode(): Promise<{ permissionMode: MojoBrainPermissionMode }>;
	setPermissionMode(permissionMode: MojoBrainPermissionMode): Promise<unknown>;
	sendMessage(
		sessionId: string,
		text: string,
		tabContexts: Array<{ tabId: number; url: string; title: string }>,
		model: BrainModelSelection | null,
		reasoningEffort: ReasoningEffort,
		permissionMode: MojoBrainPermissionMode
	): Promise<{ result: MojoBrainResult }>;
	cancelTurn(sessionId: string): Promise<{ result: MojoBrainResult }>;
	listModels(): Promise<{ result: MojoBrainResult }>;
	listProviderAuth(): Promise<{ result: MojoBrainResult }>;
	startProviderOAuth(provider: string): Promise<{ result: MojoBrainResult }>;
	importCodexAuth(path: string | null): Promise<{ result: MojoBrainResult }>;
	clearProviderCredential(provider: string): Promise<{ result: MojoBrainResult }>;
	setProviderApiKey(provider: string, apiKey: string): Promise<{ result: MojoBrainResult }>;
	respondToUserPrompt(
		sessionId: string,
		toolCallId: string,
		responseJson: string,
		cancelled: boolean
	): Promise<{ result: MojoBrainResult }>;
};

type MojoModule = {
	BrainConsole: {
		getRemote(): MojoRemote;
	};
	BrainPermissionMode: {
		kAsk: MojoBrainPermissionMode;
		kRead: MojoBrainPermissionMode;
		kFull: MojoBrainPermissionMode;
	};
	BrainObserverReceiver: new (impl: { onBrainEvent(event: MojoBrainEvent): void }) => {
		$: { bindNewPipeAndPassRemote(): unknown };
	};
};

type ChromeTabsApi = {
	query(
		queryInfo: { active: boolean; currentWindow: boolean },
		callback: (tabs: Array<{ id?: number; url?: string; title?: string }>) => void
	): void;
};

import { getControlConsoleBridge } from './controlConsole';

type Waiter<T> = {
	requestId: string;
	accept: (event: BrainConsoleEvent, payload: unknown) => T | undefined;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
	timeoutMs: number;
	timer: ReturnType<typeof setTimeout> | null;
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const TURN_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const AUTH_EVENT_TIMEOUT_MS = 5 * 60 * 1000;

class BrainRequestIdleError extends Error {}
const BRAIN_MOJO_MODULES = [
	'chrome://resources/mojo/chrome/browser/ui/stead/brain/brain_console.mojom-webui.js',
	'/brain_console.mojom-webui.js',
	'./brain_console.mojom-webui.js'
];
const DEV_MODEL_CATALOG: BrainModelCatalogProvider[] = [
	{
		provider: 'anthropic',
		label: 'Claude',
		configured: false,
		supports_oauth: true,
		supports_codex_import: false,
		models: [
			{
				id: 'claude-opus-4-6',
				name: 'Claude Opus 4.6',
				api: 'anthropic-messages',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 1_000_000,
				max_tokens: 128_000
			},
			{
				id: 'claude-sonnet-4-6',
				name: 'Claude Sonnet 4.6',
				api: 'anthropic-messages',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 1_000_000,
				max_tokens: 64_000
			}
		]
	},
	{
		provider: 'openai-codex',
		label: 'Codex',
		configured: false,
		supports_oauth: true,
		supports_codex_import: true,
		models: [
			{
				id: 'gpt-5.5',
				name: 'GPT-5.5',
				api: 'openai-codex-responses',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 400_000,
				max_tokens: 128_000
			},
			{
				id: 'gpt-5.3-codex',
				name: 'GPT-5.3 Codex',
				api: 'openai-codex-responses',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 400_000,
				max_tokens: 128_000
			}
		]
	},
	{
		provider: 'openai',
		label: 'OpenAI',
		configured: false,
		supports_oauth: false,
		supports_codex_import: false,
		models: [
			{
				id: 'gpt-5.5',
				name: 'GPT-5.5',
				api: 'openai-responses',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 400_000,
				max_tokens: 128_000
			}
		]
	},
	{
		provider: 'google',
		label: 'Gemini',
		configured: false,
		supports_oauth: false,
		supports_codex_import: false,
		models: [
			{
				id: 'gemini-3-pro',
				name: 'Gemini 3 Pro',
				api: 'google-generative-ai',
				reasoning: true,
				input: ['text', 'image'],
				context_window: 1_000_000,
				max_tokens: 65_536
			}
		]
	}
];

const dynamicImport = <T>(specifier: string) =>
	import(/* @vite-ignore */ specifier) as Promise<T>;

async function importFirst<T>(specifiers: string[]): Promise<T> {
	const failures: string[] = [];
	for (const specifier of specifiers) {
		try {
			return await dynamicImport<T>(specifier);
		} catch (error) {
			failures.push(`${specifier}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	throw new Error(`Unable to load Stead Brain Mojo module. ${failures.join(' | ')}`);
}

function normalizeResult(result: MojoBrainResult): BrainRequestResult {
	return {
		ok: result.ok,
		request_id: result.request_id ?? result.requestId ?? '',
		code: result.code,
		message: result.message
	};
}

function normalizeEvent(event: MojoBrainEvent): BrainConsoleEvent {
	return {
		type: event.type,
		request_id: event.request_id ?? event.requestId ?? '',
		session_id: event.session_id ?? event.sessionId ?? '',
		payload_json: event.payload_json ?? event.payloadJson ?? '{}'
	};
}

function toMojoTabContexts(tabContexts: BrainTabContext[] = []) {
	return tabContexts.map((tabContext) => ({
		tabId: tabContext.tab_id,
		url: tabContext.url,
		title: tabContext.title
	}));
}

function normalizeTabContext(value: unknown): BrainTabContext | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	const tabId = record.tab_id ?? record.tabId ?? record.id;
	if (typeof tabId !== 'number') return null;
	return {
		tab_id: tabId,
		url: typeof record.url === 'string' ? record.url : '',
		title: typeof record.title === 'string' ? record.title : '',
		agent_owned: record.agent_owned === true || record.agentOwned === true,
		owner_session_id:
			typeof (record.owner_session_id ?? record.ownerSessionId) === 'string'
				? String(record.owner_session_id ?? record.ownerSessionId)
				: ''
	};
}

async function tabContextFromChromeTabs(): Promise<BrainTabContext | null> {
	const chromeTabs = (globalThis as { chrome?: { tabs?: ChromeTabsApi } }).chrome?.tabs;
	if (!chromeTabs?.query) return null;
	return new Promise((resolve) => {
		try {
			chromeTabs.query({ active: true, currentWindow: true }, (tabs) => {
				resolve(normalizeTabContext(tabs[0]));
			});
		} catch {
			resolve(null);
		}
	});
}

export async function getCurrentTabContext(): Promise<BrainTabContext | null> {
	const provider = globalThis.window?.steadTabContext;
	if (typeof provider === 'function') {
		try {
			return normalizeTabContext(await provider());
		} catch {
			return null;
		}
	}
	const provided = normalizeTabContext(provider);
	if (provided) return provided;
	// Native path: the ControlConsole knows the active tab of this profile's
	// focused window (null for non-web pages and outside chrome://).
	try {
		const context = await getControlConsoleBridge().getActiveTabContext();
		if (context) return { ...context };
	} catch {
		// fall through to the extension-style API if it exists
	}
	return tabContextFromChromeTabs();
}

function toMojoPermissionMode(
	mode: AgentPermissionMode,
	permissionModes: MojoModule['BrainPermissionMode']
) {
	if (mode === 'ask') return permissionModes.kAsk;
	if (mode === 'full') return permissionModes.kFull;
	return permissionModes.kRead;
}

function fromMojoPermissionMode(
	mode: MojoBrainPermissionMode,
	permissionModes: MojoModule['BrainPermissionMode']
): AgentPermissionMode {
	if (mode === permissionModes.kFull) return 'full';
	if (mode === permissionModes.kRead) return 'read';
	return 'ask';
}

function parsePayload(event: BrainConsoleEvent): unknown {
	try {
		return JSON.parse(event.payload_json);
	} catch {
		return {};
	}
}

function eventError(event: BrainConsoleEvent, payload: unknown) {
	if (event.type !== 'error') return undefined;
	const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	const code = typeof record.code === 'string' ? record.code : 'brain_error';
	const message = typeof record.message === 'string' ? record.message : 'Brain request failed.';
	return new Error(`${code}: ${message}`);
}

class MojoBrainConsole implements NativeBrainConsole {
	private listeners = new Set<(event: BrainConsoleEvent) => void>();
	private observerReceiver: InstanceType<MojoModule['BrainObserverReceiver']>;

	constructor(
		private remote: MojoRemote,
		BrainObserverReceiver: MojoModule['BrainObserverReceiver'],
		private permissionModes: MojoModule['BrainPermissionMode']
	) {
		this.observerReceiver = new BrainObserverReceiver({
			onBrainEvent: (event) => this.emit(normalizeEvent(event))
		});
		this.remote.addObserver(this.observerReceiver.$.bindNewPipeAndPassRemote());
	}

	addObserver(handler: (event: BrainConsoleEvent) => void) {
		this.listeners.add(handler);
		return () => this.listeners.delete(handler);
	}

	initialize() {
		return this.call(() => this.remote.initialize());
	}

	createSession(title: string | null, originSurface: string) {
		return this.call(() => this.remote.createSession(title, originSurface));
	}

	listSessions() {
		return this.call(() => this.remote.listSessions());
	}

	loadSession(sessionId: string) {
		return this.call(() => this.remote.loadSession(sessionId));
	}

	async getPermissionMode() {
		const response = await this.remote.getPermissionMode();
		return fromMojoPermissionMode(response.permissionMode, this.permissionModes);
	}

	async setPermissionMode(mode: AgentPermissionMode) {
		await this.remote.setPermissionMode(toMojoPermissionMode(mode, this.permissionModes));
	}

	sendMessage(
		sessionId: string,
		text: string,
		tabContexts: BrainTabContext[] = [],
		model?: BrainModelSelection | null,
		reasoningEffort: ReasoningEffort = 'high',
		permissionMode: AgentPermissionMode = 'ask'
	) {
		return this.call(() =>
			this.remote.sendMessage(
				sessionId,
				text,
				toMojoTabContexts(tabContexts),
				model ?? null,
				reasoningEffort,
				toMojoPermissionMode(permissionMode, this.permissionModes)
			)
		);
	}

	cancelTurn(sessionId: string) {
		return this.call(() => this.remote.cancelTurn(sessionId));
	}

	listModels() {
		return this.call(() => this.remote.listModels());
	}

	listProviderAuth() {
		return this.call(() => this.remote.listProviderAuth());
	}

	startProviderOAuth(provider: string) {
		return this.call(() => this.remote.startProviderOAuth(provider));
	}

	importCodexAuth(path?: string | null) {
		return this.call(() => this.remote.importCodexAuth(path ?? null));
	}

	clearProviderCredential(provider: string) {
		return this.call(() => this.remote.clearProviderCredential(provider));
	}

	setProviderApiKey(provider: string, apiKey: string) {
		return this.call(() => this.remote.setProviderApiKey(provider, apiKey));
	}

	respondToUserPrompt(
		sessionId: string,
		toolCallId: string,
		response: unknown,
		cancelled = false
	) {
		return this.call(() =>
			this.remote.respondToUserPrompt(sessionId, toolCallId, JSON.stringify(response ?? {}), cancelled)
		);
	}

	shutdownBrain() {
		return this.call(() => this.remote.shutdownBrain());
	}

	private async call(fn: () => Promise<{ result: MojoBrainResult }>) {
		const response = await fn();
		return normalizeResult(response.result);
	}

	private emit(event: BrainConsoleEvent) {
		for (const listener of this.listeners) listener(event);
	}
}

class LazyNativeBrainConsole implements NativeBrainConsole {
	private listeners = new Set<(event: BrainConsoleEvent) => void>();
	private nativePromise: Promise<NativeBrainConsole> | undefined;

	private getNative() {
		this.nativePromise ??= createMojoBrainConsole();
		return this.nativePromise;
	}

	addObserver(handler: (event: BrainConsoleEvent) => void) {
		this.listeners.add(handler);
		let unsubscribeNative: (() => void) | undefined;
		let active = true;
		void this.getNative()
			.then((native) => {
				if (!active) return;
				unsubscribeNative = native.addObserver(handler);
			})
			.catch(() => {
				// Calls such as initialize surface the connection error to the UI.
			});
		return () => {
			active = false;
			this.listeners.delete(handler);
			unsubscribeNative?.();
		};
	}

	async initialize() {
		return (await this.getNative()).initialize();
	}

	async createSession(title: string | null, originSurface: string) {
		return (await this.getNative()).createSession(title, originSurface);
	}

	async listSessions() {
		return (await this.getNative()).listSessions();
	}

	async loadSession(sessionId: string) {
		return (await this.getNative()).loadSession(sessionId);
	}

	async getPermissionMode() {
		return (await this.getNative()).getPermissionMode();
	}

	async setPermissionMode(mode: AgentPermissionMode) {
		return (await this.getNative()).setPermissionMode(mode);
	}

	async sendMessage(
		sessionId: string,
		text: string,
		tabContexts: BrainTabContext[] = [],
		model?: BrainModelSelection | null,
		reasoningEffort: ReasoningEffort = 'high',
		permissionMode: AgentPermissionMode = 'ask'
	) {
		return (await this.getNative()).sendMessage(
			sessionId,
			text,
			tabContexts,
			model,
			reasoningEffort,
			permissionMode
		);
	}

	async cancelTurn(sessionId: string) {
		return (await this.getNative()).cancelTurn(sessionId);
	}

	async listModels() {
		return (await this.getNative()).listModels();
	}

	async listProviderAuth() {
		return (await this.getNative()).listProviderAuth();
	}

	async startProviderOAuth(provider: string) {
		return (await this.getNative()).startProviderOAuth(provider);
	}

	async importCodexAuth(path?: string | null) {
		return (await this.getNative()).importCodexAuth(path);
	}

	async clearProviderCredential(provider: string) {
		return (await this.getNative()).clearProviderCredential(provider);
	}

	async setProviderApiKey(provider: string, apiKey: string) {
		return (await this.getNative()).setProviderApiKey(provider, apiKey);
	}

	async respondToUserPrompt(
		sessionId: string,
		toolCallId: string,
		response: unknown,
		cancelled = false
	) {
		return (await this.getNative()).respondToUserPrompt(
			sessionId,
			toolCallId,
			response,
			cancelled
		);
	}

	async shutdownBrain() {
		return (await this.getNative()).shutdownBrain();
	}
}

async function createMojoBrainConsole(): Promise<NativeBrainConsole> {
	const mojoModule = await importFirst<MojoModule>(BRAIN_MOJO_MODULES);
	const remote = mojoModule.BrainConsole.getRemote();
	return new MojoBrainConsole(
		remote,
		mojoModule.BrainObserverReceiver,
		mojoModule.BrainPermissionMode
	);
}

class BrainBridge {
	readonly isNative: boolean;
	private listeners = new Set<(event: BrainConsoleEvent, payload: unknown) => void>();
	private waiters = new Set<Waiter<unknown>>();
	private activeTurns = new Map<
		string,
		{ event: BrainConsoleEvent; payload: unknown }
	>();
	private bufferedEvents = new Map<
		string,
		Array<{ event: BrainConsoleEvent; payload: unknown }>
	>();
	private cachedSkills: BrainSkillInfo[] = [];

	constructor(private native: NativeBrainConsole) {
		this.isNative = native !== fakeBrainConsole;
		this.native.addObserver((event) => this.handleEvent(event));
	}

	/** Skill catalog from the latest brain `ready` event (may lag subscribe). */
	get skills(): BrainSkillInfo[] {
		return this.cachedSkills;
	}

	/** Current turn snapshot replayed by native code to surfaces that bind late. */
	getActiveTurn(sessionId: string) {
		return this.activeTurns.get(sessionId);
	}

	subscribe(listener: (event: BrainConsoleEvent, payload: unknown) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	initialize() {
		return this.native.initialize();
	}

	async createSession(title: string | null, originSurface: string) {
		const accepted = await this.native.createSession(title, originSurface);
		this.assertAccepted(accepted);
		return this.waitFor(accepted.request_id, (event, payload) => {
			if (event.type !== 'session_created') return;
			const session = (payload as { session?: BrainSessionInfo }).session;
			return session;
		});
	}

	async listSessions() {
		const accepted = await this.native.listSessions();
		this.assertAccepted(accepted);
		return this.waitFor<BrainSessionInfo[]>(accepted.request_id, (event, payload) => {
			if (event.type !== 'sessions') return;
			return (payload as { sessions?: BrainSessionInfo[] }).sessions ?? [];
		});
	}

	async loadSession(sessionId: string) {
		const accepted = await this.native.loadSession(sessionId);
		this.assertAccepted(accepted);
		return this.waitFor(accepted.request_id, (event, payload) => {
			if (event.type !== 'session_loaded') return;
			const loaded = payload as Partial<BrainLoadedSession>;
			if (!loaded.session) return;
			return {
				session: loaded.session,
				messages: loaded.messages ?? [],
				model: loaded.model,
				artifacts: loaded.artifacts ?? []
			};
		});
	}

	getPermissionMode() {
		return this.native.getPermissionMode();
	}

	setPermissionMode(mode: AgentPermissionMode) {
		return this.native.setPermissionMode(mode);
	}

	async listProviderAuth() {
		const accepted = await this.native.listProviderAuth();
		this.assertAccepted(accepted);
		return this.waitFor(accepted.request_id, (event, payload) => {
			if (event.type !== 'provider_auth_status') return;
			return (payload as { providers?: ProviderAuthStatus[] }).providers ?? [];
		});
	}

	async listModels() {
		const accepted = await this.native.listModels();
		this.assertAccepted(accepted);
		return this.waitFor<BrainModelCatalogProvider[]>(accepted.request_id, (event, payload) => {
			if (event.type !== 'model_catalog') return;
			return (payload as { providers?: BrainModelCatalogProvider[] }).providers ?? [];
		});
	}

	async startProviderOAuth(provider: string) {
		const accepted = await this.native.startProviderOAuth(provider);
		this.assertAccepted(accepted);
		return this.waitFor<ProviderAuthUrl>(
			accepted.request_id,
			(event, payload) => {
				if (event.type !== 'provider_auth_url') return;
				const record =
					payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
				if (record.provider !== provider || typeof record.url !== 'string') return;
				return {
					provider,
					url: record.url,
					expires_in_secs:
						typeof record.expires_in_secs === 'number' ? record.expires_in_secs : undefined
				};
			},
			AUTH_EVENT_TIMEOUT_MS
		);
	}

	async importCodexAuth(path?: string | null) {
		const accepted = await this.native.importCodexAuth(path ?? null);
		this.assertAccepted(accepted);
		return this.waitFor(
			accepted.request_id,
			(event, payload) => {
				if (event.type !== 'provider_auth_completed') return;
				const status = (payload as { status?: ProviderAuthStatus }).status;
				return status?.provider === 'openai-codex' ? status : undefined;
			},
			AUTH_EVENT_TIMEOUT_MS
		);
	}

	async setProviderApiKey(provider: string, apiKey: string) {
		const accepted = await this.native.setProviderApiKey(provider, apiKey);
		this.assertAccepted(accepted);
		return this.waitFor(
			accepted.request_id,
			(event, payload) => {
				if (event.type !== 'provider_auth_completed') return;
				const status = (payload as { status?: ProviderAuthStatus }).status;
				return status?.provider === provider ? status : undefined;
			},
			AUTH_EVENT_TIMEOUT_MS
		);
	}

	async clearProviderCredential(provider: string) {
		const accepted = await this.native.clearProviderCredential(provider);
		this.assertAccepted(accepted);
		return this.waitFor(
			accepted.request_id,
			(event, payload) => {
				if (event.type !== 'provider_auth_status') return;
				const providers = (payload as { providers?: ProviderAuthStatus[] }).providers ?? [];
				const status = providers.find((candidate) => candidate.provider === provider);
				return status ? providers : undefined;
			},
			AUTH_EVENT_TIMEOUT_MS
		);
	}

	async sendMessage(params: {
		sessionId: string;
		text: string;
		tabContexts?: BrainTabContext[];
		model?: BrainModelSelection | null;
		reasoningEffort?: ReasoningEffort;
		permissionMode?: AgentPermissionMode;
	}) {
		const accepted = await this.native.sendMessage(
			params.sessionId,
			params.text,
			params.tabContexts ?? [],
			params.model ?? null,
			params.reasoningEffort ?? 'high',
			params.permissionMode ?? 'ask'
		);
		this.assertAccepted(accepted);
		try {
			await this.waitFor(
				accepted.request_id,
				(event) => {
					if (event.type === 'assistant_done') return true;
					if (event.type === 'error') return true;
					return undefined;
				},
				TURN_IDLE_TIMEOUT_MS
			);
		} catch (error) {
			// Only an actual idle timeout needs an explicit abort. Provider/auth
			// errors are already terminal; cancelling them creates a second, unrelated
			// "not running" event that can be mistaken for new turn activity.
			if (error instanceof BrainRequestIdleError) {
				await this.native.cancelTurn(params.sessionId).catch(() => undefined);
			}
			throw error;
		}
	}

	cancelTurn(sessionId: string) {
		return this.native.cancelTurn(sessionId);
	}

	async respondToUserPrompt(
		sessionId: string,
		toolCallId: string,
		response: unknown,
		cancelled = false
	) {
		const accepted = await this.native.respondToUserPrompt(
			sessionId,
			toolCallId,
			response,
			cancelled
		);
		this.assertAccepted(accepted);
		return accepted;
	}

	private assertAccepted(result: BrainRequestResult) {
		if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	}

	private waitFor<T>(
		requestId: string,
		accept: (event: BrainConsoleEvent, payload: unknown) => T | undefined,
		timeoutMs = DEFAULT_TIMEOUT_MS
	) {
		return new Promise<T>((resolve, reject) => {
			const waiter: Waiter<T> = {
				requestId,
				accept,
				resolve,
				reject,
				timeoutMs,
				timer: null
			};
			this.resetWaiterTimeout(waiter as Waiter<unknown>);
			this.waiters.add(waiter as Waiter<unknown>);
			const buffered = this.bufferedEvents.get(requestId) ?? [];
			for (const item of buffered) {
				if (this.deliverToWaiter(waiter as Waiter<unknown>, item.event, item.payload)) break;
			}
		});
	}

	private resetWaiterTimeout(waiter: Waiter<unknown>) {
		if (waiter.timer) clearTimeout(waiter.timer);
		waiter.timer = setTimeout(() => {
			this.waiters.delete(waiter);
			this.bufferedEvents.delete(waiter.requestId);
			waiter.reject(
				new BrainRequestIdleError(
					'Stead stopped waiting because the model was idle for too long. Please retry.'
				)
			);
		}, waiter.timeoutMs);
	}

	private deliverToWaiter(
		waiter: Waiter<unknown>,
		event: BrainConsoleEvent,
		payload: unknown
	) {
		const error = eventError(event, payload);
		if (error) {
			if (waiter.timer) clearTimeout(waiter.timer);
			this.waiters.delete(waiter);
			this.bufferedEvents.delete(waiter.requestId);
			waiter.reject(error);
			return true;
		}
		const value = waiter.accept(event, payload);
		if (value === undefined) {
			this.resetWaiterTimeout(waiter);
			return false;
		}
		if (waiter.timer) clearTimeout(waiter.timer);
		this.waiters.delete(waiter);
		this.bufferedEvents.delete(waiter.requestId);
		waiter.resolve(value);
		return true;
	}

	private handleEvent(event: BrainConsoleEvent) {
		const payload = parsePayload(event);
		if (event.session_id) {
			if (event.type === 'turn_started') {
				this.activeTurns.set(event.session_id, { event, payload });
			} else if (event.type === 'assistant_done' || event.type === 'error') {
				this.activeTurns.delete(event.session_id);
			}
		}
		if (event.type === 'ready') {
			const record =
				payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
			if (Array.isArray(record.skills)) {
				this.cachedSkills = record.skills
					.map((raw): BrainSkillInfo | null => {
						if (!raw || typeof raw !== 'object') return null;
						const skill = raw as Record<string, unknown>;
						if (typeof skill.name !== 'string' || !skill.name) return null;
						return {
							name: skill.name,
							description: typeof skill.description === 'string' ? skill.description : '',
							source: typeof skill.source === 'string' ? skill.source : 'builtin'
						};
					})
					.filter((skill): skill is BrainSkillInfo => skill !== null);
			}
		}
		for (const listener of this.listeners) listener(event, payload);
		let matchedWaiter = false;
		for (const waiter of Array.from(this.waiters)) {
			if (event.request_id !== waiter.requestId) continue;
			matchedWaiter = true;
			this.deliverToWaiter(waiter, event, payload);
		}
		if (!matchedWaiter && event.request_id && event.type !== 'ready') {
			const buffered = this.bufferedEvents.get(event.request_id) ?? [];
			buffered.push({ event, payload });
			this.bufferedEvents.set(event.request_id, buffered.slice(-32));
			while (this.bufferedEvents.size > 64) {
				const oldest = this.bufferedEvents.keys().next().value;
				if (typeof oldest !== 'string') break;
				this.bufferedEvents.delete(oldest);
			}
		}
	}
}

class FakeBrainConsole implements NativeBrainConsole {
	private listeners = new Set<(event: BrainConsoleEvent) => void>();
	private nextRequest = 1;
	private permissionMode: AgentPermissionMode = 'ask';
	private sessions: BrainSessionInfo[] = [
		this.sessionInfo('dev-session', 'New chat', new Date(Date.now() - 4 * 60 * 1000)),
		this.sessionInfo('dev-repo', 'Repository size check', new Date(Date.now() - 2 * 60 * 60 * 1000)),
		this.sessionInfo('dev-architecture', 'Agent architecture review', new Date(Date.now() - 26 * 60 * 60 * 1000))
	];

	addObserver(handler: (event: BrainConsoleEvent) => void) {
		this.listeners.add(handler);
		return () => this.listeners.delete(handler);
	}

	async initialize() {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'ready', {
			brain_version: 'dev',
			pie_commit: 'dev',
			app_support_dir: '/tmp/stead-dev',
			// Mirrors the real bundled skill library (brain/skills/builtin).
			skills: [
				{ name: 'browser-credential-handoff', description: 'Log in via your password manager', source: 'builtin' },
				{ name: 'gmail-browser', description: 'Read and act on Gmail', source: 'builtin' },
				{ name: 'github-browser', description: 'Work with GitHub in the browser', source: 'builtin' },
				{ name: 'notion-browser', description: 'Work with Notion pages', source: 'builtin' },
				{ name: 'artifact-document', description: 'Create documents and files', source: 'builtin' }
			]
		});
		return this.accepted(requestId);
	}

	async createSession(title: string | null, _originSurface = 'webui') {
		const requestId = this.requestId();
		const session = this.sessionInfo(`dev-session-${this.nextRequest}`, title || 'New chat', new Date());
		this.sessions = [session, ...this.sessions.filter((candidate) => candidate.id !== session.id)];
		this.emit(requestId, this.sessionId, 'session_created', {
			session
		});
		return this.accepted(requestId);
	}

	async listSessions() {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'sessions', { sessions: this.sessions });
		return this.accepted(requestId);
	}

	async loadSession(sessionId: string) {
		const requestId = this.requestId();
		const session =
			this.sessions.find((candidate) => candidate.id === sessionId) ??
			this.sessionInfo(sessionId, 'Loaded chat', new Date());
		this.emit(requestId, sessionId, 'session_loaded', {
			session,
			messages: [],
			model: { provider: 'openai-codex', model: 'gpt-5.4' }
		});
		return this.accepted(requestId);
	}

	async getPermissionMode() {
		return this.permissionMode;
	}

	async setPermissionMode(mode: AgentPermissionMode) {
		this.permissionMode = mode;
	}

	async sendMessage(
		sessionId: string,
		text: string,
		_tabContexts: BrainTabContext[] = [],
		_model?: BrainModelSelection | null,
		_reasoningEffort: ReasoningEffort = 'high',
		permissionMode: AgentPermissionMode = 'ask'
	) {
		const requestId = this.requestId();
		this.emit(requestId, sessionId, 'turn_started', {
			text,
			tab_contexts: _tabContexts,
			model: _model,
			reasoning_effort: _reasoningEffort,
			permission_mode: permissionMode
		});
		queueMicrotask(async () => {
			const response = [
				`**Dev brain bridge** is active (\`${permissionMode}\`). Native Chromium wiring will stream the real Pie turn for: *${text}*`,
				'',
				'A quick markdown check:',
				'',
				'1. Ordered items render with numbers',
				'- Bullets render with dots',
				'- Inline `code`, **bold**, and [links](https://example.com) work',
				'',
				'```',
				'const stead = "code blocks too";',
				'```'
			].join('\n');
			for (const token of response.split(/(\s+)/)) {
				this.emit(requestId, sessionId, 'assistant_delta', { text: token });
				await new Promise((resolve) => setTimeout(resolve, 12));
			}
			this.emit(requestId, sessionId, 'assistant_done', { stop_reason: 'dev_fake' });
		});
		return this.accepted(requestId);
	}

	async cancelTurn(sessionId: string) {
		const requestId = this.requestId();
		this.emit(requestId, sessionId, 'assistant_done', { stop_reason: 'cancelled' });
		return this.accepted(requestId);
	}

	async listProviderAuth() {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'provider_auth_status', {
			providers: [
				{ provider: 'anthropic', configured: false, needs_refresh: false },
				{ provider: 'openai-codex', configured: false, needs_refresh: false },
				{ provider: 'openai', configured: false, needs_refresh: false },
				{ provider: 'google', configured: false, needs_refresh: false }
			]
		});
		return this.accepted(requestId);
	}

	async listModels() {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'model_catalog', {
			providers: DEV_MODEL_CATALOG
		});
		return this.accepted(requestId);
	}

	async startProviderOAuth(provider: string) {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'provider_auth_url', {
			provider,
			url: 'about:blank',
			expires_in_secs: 300
		});
		return this.accepted(requestId);
	}

	async importCodexAuth() {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'provider_auth_completed', {
			status: { provider: 'openai-codex', configured: false, needs_refresh: false }
		});
		return this.accepted(requestId);
	}

	async clearProviderCredential(provider: string) {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'provider_auth_status', {
			providers: [{ provider, configured: false, needs_refresh: false }]
		});
		return this.accepted(requestId);
	}

	async setProviderApiKey(provider: string) {
		const requestId = this.requestId();
		this.emit(requestId, undefined, 'provider_auth_completed', {
			status: { provider, configured: true, credential_kind: 'api_key', needs_refresh: false }
		});
		return this.accepted(requestId);
	}

	async respondToUserPrompt() {
		return this.accepted(this.requestId());
	}

	async shutdownBrain() {
		return this.accepted(this.requestId());
	}

	private requestId() {
		return `ui_dev_${this.nextRequest++}`;
	}

	private get sessionId() {
		return this.sessions[0]?.id ?? 'dev-session';
	}

	private sessionInfo(id: string, title: string, date: Date): BrainSessionInfo {
		return {
			id,
			title,
			created_at: date.toISOString(),
			updated_at: date.toISOString(),
			path: `/tmp/stead-dev/sessions/${id}`
		};
	}

	private accepted(requestId: string): BrainRequestResult {
		return { ok: true, request_id: requestId, code: 'accepted', message: 'accepted' };
	}

	private emit(requestId: string, sessionId: string | undefined, type: string, payload: unknown) {
		const payloadObject =
			payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
		const event: BrainConsoleEvent = {
			type,
			request_id: requestId,
			session_id: sessionId,
			payload_json: JSON.stringify({
				type,
				request_id: requestId,
				session_id: sessionId,
				...payloadObject
			})
		};
		for (const listener of this.listeners) listener(event);
	}
}

const fakeBrainConsole = new FakeBrainConsole();
const lazyNativeBrainConsole = new LazyNativeBrainConsole();
let bridge: BrainBridge | undefined;

export function getBrainBridge() {
	if (!bridge) {
		const native =
			globalThis.window?.steadBrain ??
			(globalThis.window?.location.protocol === 'chrome:' ? lazyNativeBrainConsole : fakeBrainConsole);
		bridge = new BrainBridge(native);
	}
	return bridge;
}
