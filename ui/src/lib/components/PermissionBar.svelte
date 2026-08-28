<script lang="ts">
	import { slide } from 'svelte/transition';
	import { motionEase } from '$lib/motion';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getControlState } from '$lib/controlState.svelte';
	import type { ControlConfirmation } from '$lib/brain/controlConsole';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import CheckIcon from '@lucide/svelte/icons/check';

	type Props = {
		onApproved?: (request: ControlConfirmation) => void;
	};

	let { onApproved }: Props = $props();

	const control = getControlState();
	let busyAction = $state<number | null>(null);

	function classLabel(value: string) {
		return value.replaceAll('_', ' ');
	}

	async function respond(request: ControlConfirmation, approve: boolean) {
		busyAction = request.action_id;
		try {
			await control.respond(request, approve);
			if (approve) onApproved?.(request);
		} finally {
			busyAction = null;
		}
	}
</script>

{#if control.pending.length}
	<div class="flex flex-col items-start gap-1.5">
		{#each control.pending as request (request.action_id)}
			<div
				transition:slide={{ duration: 220, easing: motionEase }}
				class="surface-glass w-full rounded-2xl p-2.5"
			>
				<div class="flex items-start gap-2.5">
					<ShieldAlertIcon class="mt-0.5 size-4 shrink-0 text-amber-300" />
					<div class="min-w-0 flex-1">
						<p class="text-foreground text-sm font-medium">
							{request.operation || 'Agent action'}
							<span class="text-muted-foreground font-normal">
								· {classLabel(request.action_class)}</span
							>
						</p>
						<p class="text-muted-foreground mt-0.5 text-xs">
							{request.reason || 'This action needs your approval before the agent continues.'}
						</p>
					</div>
					<div class="flex shrink-0 gap-1.5">
						<Button
							variant="secondary"
							size="sm"
							class="h-7 px-2.5 text-xs"
							disabled={busyAction === request.action_id}
							onclick={() => respond(request, false)}
						>
							Deny
						</Button>
						<Button
							size="sm"
							class="h-7 px-2.5 text-xs"
							disabled={busyAction === request.action_id}
							onclick={() => respond(request, true)}
						>
							<CheckIcon class="mr-1 size-3.5" />
							Approve
						</Button>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
