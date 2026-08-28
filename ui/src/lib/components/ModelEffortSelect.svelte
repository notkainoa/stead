<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	type Props = {
		model: string;
		effort: string;
		models: string[];
		modelLabels?: Record<string, string>;
		efforts: string[];
		align?: 'start' | 'end';
	};

	let {
		model = $bindable(),
		effort = $bindable(),
		models,
		modelLabels = {},
		efforts,
		align = 'end'
	}: Props = $props();

	const triggerText =
		'text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/60 outline-none data-[state=open]:text-foreground';
	const sectionLabel = 'text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button {...props} class={triggerText}>
				<span>{modelLabels[model] ?? model}</span>
				<span class="opacity-55">{effort}</span>
				<ChevronDownIcon class="size-3.5 opacity-70" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content {align} sideOffset={8} class="w-48">
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading class={sectionLabel}>Model</DropdownMenu.GroupHeading>
			<DropdownMenu.RadioGroup bind:value={model}>
				{#each models as m (m)}
					<DropdownMenu.RadioItem value={m}>{modelLabels[m] ?? m}</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>

		<DropdownMenu.Separator />

		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading class={sectionLabel}>Effort</DropdownMenu.GroupHeading>
			<DropdownMenu.RadioGroup bind:value={effort}>
				{#each efforts as e (e)}
					<DropdownMenu.RadioItem value={e}>{e}</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
