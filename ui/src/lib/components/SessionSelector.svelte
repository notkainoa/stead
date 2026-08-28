<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';

	type Session = { id: string; title: string; unread?: boolean };
	type Group = { label: string; sessions: Session[] };

	type Props = {
		current?: string;
		groups?: Group[];
		loading?: boolean;
		onNew?: () => void;
		onSelect?: (id: string) => void;
	};

	let {
		current = 'New Session',
		groups = [],
		loading = false,
		onNew,
		onSelect
	}: Props = $props();

	let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="secondary"
				size="sm"
				class="border-border bg-muted/75 hover:bg-muted aria-expanded:bg-muted max-w-[180px] gap-1.5 font-medium transition-colors"
			>
				<span class="truncate">{current}</span>
				<ChevronDownIcon
					class="text-muted-foreground size-3.5 transition-transform duration-200 {open
						? 'rotate-180'
						: ''}"
				/>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content
		align="start"
		sideOffset={8}
		class="w-72 max-w-[calc(100vw-1.5rem)]"
	>
		<DropdownMenu.Item onSelect={() => onNew?.()} class="gap-2 font-medium">
			<PlusIcon class="size-4" />
			New session
		</DropdownMenu.Item>

		<DropdownMenu.Separator />

		{#if loading}
			<DropdownMenu.Item class="text-muted-foreground">Loading sessions</DropdownMenu.Item>
		{:else if groups.length}
			{#each groups as group (group.label)}
				<DropdownMenu.Group>
					<DropdownMenu.GroupHeading
						class="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium"
					>
						{group.label}
					</DropdownMenu.GroupHeading>
					{#each group.sessions as s (s.id)}
						<DropdownMenu.Item onSelect={() => onSelect?.(s.id)} class="gap-2">
							<span class="min-w-0 flex-1 truncate">{s.title}</span>
							{#if s.unread}
								<span class="size-1.5 shrink-0 rounded-full bg-[#3b9eff]"></span>
							{/if}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
			{/each}
		{:else}
			<DropdownMenu.Item class="text-muted-foreground">No sessions</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
