<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import ShieldQuestionIcon from '@lucide/svelte/icons/shield-question-mark';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	type Props = { permission?: string; showLabel?: boolean };
	let { permission = $bindable('ask'), showLabel = false }: Props = $props();

	// Single source of truth for the options — shared everywhere.
	const options = [
		{ value: 'ask', label: 'Ask first', icon: ShieldQuestionIcon, color: 'text-muted-foreground' },
		{ value: 'read', label: 'Read only', icon: ShieldCheckIcon, color: 'text-muted-foreground' },
		{ value: 'full', label: 'Full access', icon: ShieldAlertIcon, color: 'text-amber-500' }
	];

	let current = $derived(options.find((o) => o.value === permission) ?? options[0]);
	let Icon = $derived(current.icon);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				aria-label="Permissions"
				class="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground flex items-center {showLabel
					? 'gap-1.5 px-2'
					: 'gap-1 px-1'} hover:bg-muted/60 rounded-md py-1 text-sm transition-colors outline-none"
			>
				<Icon class="size-4 {current.color}" />
				{#if showLabel}<span>{current.label}</span>{/if}
				<ChevronDownIcon class="size-3.5 opacity-70" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" sideOffset={8} class="w-48">
		<DropdownMenu.RadioGroup bind:value={permission}>
			{#each options as o (o.value)}
				<DropdownMenu.RadioItem value={o.value}>{o.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
