<script lang="ts">
	import { onMount } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		getBrainBridge,
		type BrainModelCatalogProvider,
		type ProviderAuthStatus
	} from '$lib/brain/bridge';
	import ModelEffortSelect from './ModelEffortSelect.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	type Props = {
		provider?: string;
		model?: string;
		effort?: string;
	};

	let {
		provider = $bindable('anthropic'),
		model = $bindable('claude-opus-4-6'),
		effort = $bindable('High')
	}: Props = $props();

	const fallbackModelProviders: BrainModelCatalogProvider[] = [
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
				}
			]
		}
	];
	const efforts = ['High', 'Medium', 'Low'];
	const preferredModels: Record<string, string[]> = {
		'openai-codex': [
			'gpt-5.6-sol',
			'gpt-5.6-terra',
			'gpt-5.6-luna',
			'gpt-5.5',
			'gpt-5.4',
			'gpt-5.4-mini'
		]
	};

	const brain = getBrainBridge();
	let modelProviders = $state<BrainModelCatalogProvider[]>(
		brain.isNative ? [] : fallbackModelProviders
	);
	let providers = $derived(modelProviders.map((p) => ({ id: p.provider, label: p.label })));
	let selectedProvider = $derived(modelProviders.find((p) => p.provider === provider));
	let modelOptions = $derived(selectedProvider?.models ?? []);
	let models = $derived(modelOptions.map((m) => m.id));
	let providerLabel = $derived(selectedProvider?.label ?? (brain.isNative ? 'Loading' : provider));
	let modelLabels = $derived.by(() =>
		Object.fromEntries(
			modelOptions.map((modelOption) => {
				const prefix = `${providerLabel} `;
				const label = modelOption.name.startsWith(prefix)
					? modelOption.name.slice(prefix.length)
					: modelOption.name;
				return [modelOption.id, label];
			})
		)
	);
	let authStatuses = $state<ProviderAuthStatus[]>([]);
	let authBusy = $state(false);
	let apiKeyOpen = $state(false);
	let apiKeyDraft = $state('');
	let authError = $state<string | null>(null);
	let restoredLastSelection = $state(false);
	let providerAuth = $derived(
		authStatuses.find((s) => s.provider === provider) ??
			(selectedProvider
				? {
						provider: selectedProvider.provider,
						configured: selectedProvider.configured,
						credential_kind: selectedProvider.credential_kind,
						source: selectedProvider.source,
						needs_refresh: false
					}
				: undefined)
	);
	let authConfigured = $derived(providerAuth?.configured ?? false);
	let supportsOAuth = $derived(selectedProvider?.supports_oauth ?? false);
	let supportsCodexImport = $derived(selectedProvider?.supports_codex_import ?? false);
	let authLabel = $derived(
		authConfigured
			? providerAuth?.source === 'oauth' || providerAuth?.credential_kind === 'oauth'
				? 'OAuth connected'
				: 'API key saved'
			: 'Not connected'
	);
	let authMeta = $derived(
		providerAuth?.account_id ??
			(providerAuth?.needs_refresh ? 'Refresh needed' : providerAuth?.source ?? providerAuth?.credential_kind)
	);

	function mergeCatalogAuth(catalog: BrainModelCatalogProvider[]) {
		const catalogStatuses = catalog.map((entry) => ({
			provider: entry.provider,
			configured: entry.configured,
			credential_kind: entry.credential_kind,
			source: entry.source,
			needs_refresh: false
		}));
		const existing = new Map(authStatuses.map((status) => [status.provider, status]));
		for (const status of catalogStatuses) {
			if (!existing.has(status.provider)) existing.set(status.provider, status);
		}
		authStatuses = Array.from(existing.values());
	}

	// Keep the selected model valid for the chosen provider.
	$effect(() => {
		if (providers.length > 0 && !providers.some((p) => p.id === provider)) {
			provider = providers[0].id;
		}
		if (models.length > 0 && !models.includes(model)) {
			model = preferredModels[provider]?.find((candidate) => models.includes(candidate)) ?? models[0];
		}
	});

	$effect(() => {
		provider;
		apiKeyOpen = false;
		apiKeyDraft = '';
		authError = null;
	});

	async function refreshAuth() {
		try {
			authStatuses = await brain.listProviderAuth();
			authError = null;
		} catch {
			authStatuses = [];
			authError = 'Status unavailable';
		}
	}

	async function refreshModels() {
		try {
			const catalog = await brain.listModels();
			if (catalog.length > 0) {
				modelProviders = catalog;
				mergeCatalogAuth(catalog);
			}
			authError = null;
		} catch {
			authError = 'Model catalog unavailable';
		}
	}

	async function refreshAll() {
		await Promise.all([refreshModels(), refreshAuth()]);
	}

		onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem('stead:last-model-selection') ?? 'null') as
				| { provider?: string; model?: string; effort?: string }
				| null;
			if (saved?.provider && saved.model) {
				provider = saved.provider;
				model = saved.model;
				if (saved.effort && efforts.includes(saved.effort)) effort = saved.effort;
			}
		} catch {
			// Ignore corrupt or unavailable local storage and use the catalog default.
		}
		restoredLastSelection = true;
		void refreshAll();
		return brain.subscribe((event, payload) => {
			if (event.type === 'model_catalog') {
				const catalog = (payload as { providers?: BrainModelCatalogProvider[] }).providers ?? [];
				if (catalog.length > 0) {
					modelProviders = catalog;
					mergeCatalogAuth(catalog);
				}
			}
			if (event.type === 'provider_auth_status') {
				authStatuses = (payload as { providers?: ProviderAuthStatus[] }).providers ?? authStatuses;
			}
			if (event.type === 'provider_auth_completed') {
				const status = (payload as { status?: ProviderAuthStatus }).status;
				if (status) authStatuses = [...authStatuses.filter((s) => s.provider !== status.provider), status];
			}
		});
	});

	$effect(() => {
		if (!restoredLastSelection || !provider || !model || !effort) return;
		localStorage.setItem(
			'stead:last-model-selection',
			JSON.stringify({ provider, model, effort })
		);
	});

	async function connectOAuth() {
		authBusy = true;
		authError = null;
		const oauthWindow = window.open('about:blank', '_blank');
		if (oauthWindow) {
			try {
				oauthWindow.opener = null;
				oauthWindow.document.title = 'Stead sign-in';
				oauthWindow.document.body.textContent = 'Opening sign-in...';
			} catch {
				// The browser may restrict about:blank access; navigation below is the important part.
			}
		}
		try {
			const authUrl = await brain.startProviderOAuth(provider);
			if (authUrl.url && authUrl.url !== 'about:blank') {
				if (oauthWindow && !oauthWindow.closed) {
					oauthWindow.location.href = authUrl.url;
				} else {
					window.open(authUrl.url, '_blank', 'noopener,noreferrer');
				}
			} else {
				oauthWindow?.close();
			}
		} catch (error) {
			oauthWindow?.close();
			authError = error instanceof Error ? error.message : 'OAuth failed';
		} finally {
			authBusy = false;
		}
	}

	async function importCodex() {
		authBusy = true;
		authError = null;
		try {
			await brain.importCodexAuth();
			await refreshAuth();
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Import failed';
		} finally {
			authBusy = false;
		}
	}

	async function saveApiKey() {
		const apiKey = apiKeyDraft.trim();
		if (!apiKey) return;
		authBusy = true;
		authError = null;
		try {
			await brain.setProviderApiKey(provider, apiKey);
			apiKeyDraft = '';
			apiKeyOpen = false;
			await refreshAuth();
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Save failed';
		} finally {
			authBusy = false;
		}
	}

	async function clearCredential() {
		if (!authConfigured) return;
		authBusy = true;
		authError = null;
		try {
			await brain.clearProviderCredential(provider);
			await refreshAuth();
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Disconnect failed';
		} finally {
			authBusy = false;
		}
	}

	const triggerText =
		'text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/60 outline-none data-[state=open]:text-foreground';
</script>

<div class="flex items-center gap-0.5">
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="{triggerText} {authConfigured ? 'text-foreground' : ''}"
					aria-label="Provider auth"
				>
					<KeyRoundIcon class="size-3.5" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" sideOffset={8} class="w-64">
			<DropdownMenu.Label>{providerLabel}</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<div class="px-2 py-1.5">
				<div class="flex items-center gap-2 text-sm">
					<span
						class="flex size-4 items-center justify-center rounded-full {authConfigured
							? 'bg-emerald-500/15 text-emerald-300'
							: 'bg-muted text-muted-foreground'}"
					>
						{#if authConfigured}
							<CheckIcon class="size-3" />
						{/if}
					</span>
					<span class="truncate">{authLabel}</span>
				</div>
				{#if authMeta}
					<div class="mt-0.5 truncate pl-6 text-xs text-muted-foreground">{authMeta}</div>
				{/if}
				{#if authError}
					<div class="mt-1 line-clamp-2 pl-6 text-xs text-red-300">{authError}</div>
				{/if}
			</div>
			{#if supportsOAuth}
				<DropdownMenu.Item onclick={connectOAuth} disabled={authBusy}>
					<LogInIcon class="mr-2 size-3.5" />
					Connect OAuth
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item onclick={() => (apiKeyOpen = !apiKeyOpen)} disabled={authBusy}>
				<KeyRoundIcon class="mr-2 size-3.5" />
				API key
			</DropdownMenu.Item>
			{#if apiKeyOpen}
				<div class="px-2 pb-2">
					<div class="border-border bg-muted/50 flex items-center gap-1 rounded-md border p-1">
						<input
							bind:value={apiKeyDraft}
							type="password"
							autocomplete="off"
							placeholder="API key"
							class="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs outline-none placeholder:text-muted-foreground"
							onkeydown={(event) => {
								if (event.key === 'Enter') void saveApiKey();
							}}
						/>
						<button
							type="button"
							class="hover:bg-muted flex size-7 items-center justify-center rounded disabled:opacity-40"
							disabled={!apiKeyDraft.trim() || authBusy}
							onclick={saveApiKey}
							aria-label="Save API key"
						>
							<SaveIcon class="size-3.5" />
						</button>
					</div>
				</div>
			{/if}
			{#if supportsCodexImport}
				<DropdownMenu.Item onclick={importCodex} disabled={authBusy}>
					<RefreshCwIcon class="mr-2 size-3.5" />
					Import Codex
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item onclick={refreshAll} disabled={authBusy}>
				<RefreshCwIcon class="mr-2 size-3.5" />
				Refresh
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={clearCredential} disabled={authBusy || !authConfigured}>
				<Trash2Icon class="mr-2 size-3.5" />
				Disconnect
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- Provider: Claude / Codex -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button {...props} class={triggerText}>
					{providerLabel}
					<ChevronDownIcon class="size-3.5 opacity-70" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" sideOffset={8} class="w-40">
			<DropdownMenu.RadioGroup bind:value={provider}>
				{#each providers as p (p.id)}
					<DropdownMenu.RadioItem value={p.id}>{p.label}</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<ModelEffortSelect bind:model bind:effort {models} {modelLabels} {efforts} />
</div>
