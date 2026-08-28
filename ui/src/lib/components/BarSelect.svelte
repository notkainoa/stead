<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';

	type Opt = { value: string; label: string };
	type Props = {
		value: string;
		options: Opt[];
		align?: 'start' | 'end';
		leading?: Snippet;
		triggerClass?: string;
		width?: string;
	};

	let {
		value = $bindable(),
		options,
		align = 'start',
		leading,
		triggerClass = '',
		width = 'w-44'
	}: Props = $props();

	let current = $derived(options.find((o) => o.value === value));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground hover:bg-muted/60 flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors outline-none {triggerClass}"
			>
				{#if leading}{@render leading()}{/if}
				<span>{current?.label ?? value}</span>
				<ChevronDownIcon class="size-3.5 opacity-70" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content {align} sideOffset={8} class={width}>
		<DropdownMenu.RadioGroup bind:value>
			{#each options as o (o.value)}
				<DropdownMenu.RadioItem value={o.value}>{o.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
