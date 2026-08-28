<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		const chromeApi = (
			globalThis as typeof globalThis & { chrome?: { send?: (message: string) => void } }
		).chrome;
		chromeApi?.send?.('getSteadTheme');
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
