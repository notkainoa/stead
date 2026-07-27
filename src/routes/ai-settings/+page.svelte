<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getBrainBridge,
		type BrainModelCatalogProvider,
		type ProviderAuthStatus
	} from '$lib/brain/bridge';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	const brain = getBrainBridge();
	let runtimeState = $state<'starting' | 'ready' | 'error'>('starting');
	let runtimeDetail = $state('Starting bundled Stead brain');
	let providers = $state<BrainModelCatalogProvider[]>([]);
	let auth = $state<ProviderAuthStatus[]>([]);
	let busyProvider = $state<string | null>(null);
	let apiKeyProvider = $state<string | null>(null);
	let apiKeyDraft = $state('');
	let error = $state<string | null>(null);

	function statusFor(provider: BrainModelCatalogProvider) {
		return (
			auth.find((candidate) => candidate.provider === provider.provider) ?? {
				provider: provider.provider,
				configured: provider.configured,
				credential_kind: provider.credential_kind,
				source: provider.source,
				needs_refresh: false
			}
		);
	}

	function errorMessage(value: unknown) {
		return value instanceof Error ? value.message : String(value);
	}

	async function refresh() {
		error = null;
		try {
			const [catalog, statuses] = await Promise.all([
				brain.listModels(),
				brain.listProviderAuth()
			]);
			providers = catalog;
			auth = statuses;
			runtimeState = 'ready';
			runtimeDetail = `Bundled brain connected · ${catalog.length} providers`;
		} catch (value) {
			runtimeState = 'error';
			runtimeDetail = 'Bundled brain unavailable';
			error = errorMessage(value);
		}
	}

	async function runProviderAction(provider: string, action: () => Promise<unknown>) {
		busyProvider = provider;
		error = null;
		try {
			await action();
			await refresh();
		} catch (value) {
			error = errorMessage(value);
		} finally {
			busyProvider = null;
		}
	}

	async function connectOAuth(provider: string) {
		const oauthWindow = window.open('about:blank', '_blank');
		await runProviderAction(provider, async () => {
			const result = await brain.startProviderOAuth(provider);
			if (result.url && result.url !== 'about:blank') {
				if (oauthWindow && !oauthWindow.closed) oauthWindow.location.href = result.url;
				else window.open(result.url, '_blank', 'noopener,noreferrer');
			} else {
				oauthWindow?.close();
			}
		});
	}

	async function saveApiKey(provider: string) {
		const value = apiKeyDraft.trim();
		if (!value) return;
		await runProviderAction(provider, () => brain.setProviderApiKey(provider, value));
		apiKeyDraft = '';
		apiKeyProvider = null;
	}

	onMount(() => {
		const unsubscribe = brain.subscribe((event, payload) => {
			if (event.type === 'ready') {
				const info = payload as { brain_version?: string; pie_commit?: string };
				runtimeState = 'ready';
				runtimeDetail = `Bundled brain ${info.brain_version ?? 'connected'} · Pie ${
					info.pie_commit?.slice(0, 8) ?? 'ready'
				}`;
			}
		});
		void brain
			.initialize()
			.then(refresh)
			.catch((value) => {
				runtimeState = 'error';
				runtimeDetail = 'Bundled brain failed to start';
				error = errorMessage(value);
			});
		return unsubscribe;
	});
</script>

<svelte:head>
	<title>Stead AI Settings</title>
</svelte:head>

<div class="bg-background text-foreground min-h-dvh antialiased">
	<header class="border-border/70 bg-background/75 sticky top-0 z-20 border-b backdrop-blur-xl">
		<div class="mx-auto flex h-14 max-w-4xl items-center gap-3 px-5">
			<Button variant="ghost" size="icon" class="size-8" aria-label="Back" onclick={() => history.back()}>
				<ArrowLeftIcon class="size-4" />
			</Button>
			<h1 class="text-base font-semibold">Stead AI</h1>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-5 py-8">
		<section class="border-border/70 flex items-center justify-between gap-5 border-b pb-7">
			<div class="min-w-0">
				<h2 class="text-xl font-semibold">Brain runtime</h2>
				<p class="text-muted-foreground mt-1 truncate text-sm">{runtimeDetail}</p>
				{#if error}<p class="mt-2 text-sm text-red-300">{error}</p>{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<span class="flex items-center gap-2 text-sm {runtimeState === 'ready' ? 'text-emerald-300' : runtimeState === 'error' ? 'text-red-300' : 'text-muted-foreground'}">
					{#if runtimeState === 'starting'}
						<LoaderCircleIcon class="size-4 animate-spin" />
					{:else if runtimeState === 'ready'}
						<CheckIcon class="size-4" />
					{/if}
					{runtimeState === 'ready' ? 'Ready' : runtimeState === 'error' ? 'Error' : 'Starting'}
				</span>
				<Button variant="outline" size="sm" onclick={refresh}>
					<RefreshCwIcon class="size-4" /> Refresh
				</Button>
			</div>
		</section>

		<section class="pt-7">
			<div class="mb-4">
				<h2 class="text-xl font-semibold">Providers</h2>
				<p class="text-muted-foreground mt-1 text-sm">Credentials are stored in macOS Keychain and used only by the bundled brain.</p>
			</div>

			<div class="divide-border/70 border-border/70 divide-y rounded-lg border">
				{#each providers as provider (provider.provider)}
					{@const providerAuth = statusFor(provider)}
					<div class="p-4">
						<div class="flex flex-wrap items-start justify-between gap-4">
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<h3 class="font-medium">{provider.label}</h3>
									<span class="rounded px-1.5 py-0.5 text-xs {providerAuth.configured ? 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}">
										{providerAuth.configured ? 'Connected' : 'Not connected'}
									</span>
								</div>
								<p class="text-muted-foreground mt-1 text-sm">
									{provider.models.length} {provider.models.length === 1 ? 'model' : 'models'}
									{#if providerAuth.account_id} · {providerAuth.account_id}{/if}
									{#if providerAuth.needs_refresh} · Refresh required{/if}
								</p>
							</div>

							<div class="flex flex-wrap items-center justify-end gap-2">
								{#if provider.supports_oauth}
									<Button variant="outline" size="sm" disabled={busyProvider === provider.provider} onclick={() => connectOAuth(provider.provider)}>
										<LogInIcon class="size-4" /> OAuth
									</Button>
								{/if}
								{#if provider.supports_codex_import}
									<Button variant="outline" size="sm" disabled={busyProvider === provider.provider} onclick={() => runProviderAction(provider.provider, () => brain.importCodexAuth())}>
										<RefreshCwIcon class="size-4" /> Import Codex
									</Button>
								{/if}
								<Button variant="outline" size="sm" onclick={() => { apiKeyProvider = apiKeyProvider === provider.provider ? null : provider.provider; apiKeyDraft = ''; }}>
									<KeyRoundIcon class="size-4" /> API key
								</Button>
								{#if providerAuth.configured}
									<Button variant="ghost" size="icon" class="size-8 text-red-300" aria-label={`Disconnect ${provider.label}`} disabled={busyProvider === provider.provider} onclick={() => runProviderAction(provider.provider, () => brain.clearProviderCredential(provider.provider))}>
										<Trash2Icon class="size-4" />
									</Button>
								{/if}
							</div>
						</div>

						{#if apiKeyProvider === provider.provider}
							<div class="mt-3 flex max-w-md gap-2">
								<input bind:value={apiKeyDraft} type="password" autocomplete="off" placeholder={`${provider.label} API key`} class="border-border bg-input/40 focus:border-ring h-9 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none" onkeydown={(event) => { if (event.key === 'Enter') void saveApiKey(provider.provider); }} />
								<Button size="sm" disabled={!apiKeyDraft.trim() || busyProvider === provider.provider} onclick={() => saveApiKey(provider.provider)}>
									<SaveIcon class="size-4" /> Save
								</Button>
							</div>
						{/if}
					</div>
				{/each}

				{#if runtimeState === 'starting'}
					<div class="text-muted-foreground flex items-center gap-2 p-4 text-sm"><LoaderCircleIcon class="size-4 animate-spin" /> Loading provider catalog</div>
				{:else if providers.length === 0}
					<div class="text-muted-foreground p-4 text-sm">No providers returned by Stead brain.</div>
				{/if}
			</div>
		</section>
	</main>
</div>
