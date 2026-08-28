<script lang="ts">
	// One-shot traveling border beam (ported from /border-beam's "rotate" family).
	// Bump `signal` (e.g. on send) to fire exactly one eased lap.
	type Props = { signal?: number; radius?: number; width?: number; duration?: number };
	let { signal = 0, radius = 22, width = 1.6, duration = 1.25 }: Props = $props();

	let el = $state<HTMLDivElement | null>(null);
	let last = 0;

	// Drive the sweep imperatively so each trigger plays exactly once and cleanly
	// cancels any in-flight lap (no double / stuck-midway shine).
	$effect(() => {
		const s = signal;
		if (s <= 0 || s === last || !el) return;
		last = s;
		el.style.animation = 'none';
		void el.offsetWidth; // force reflow so the next assignment restarts from 0
		// travel on the motion-core curve; fade runs longer + gentler so the glow
		// trails off softly instead of snapping out.
		el.style.animation =
			`bb-angle ${duration}s cubic-bezier(0.625, 0.05, 0, 1) forwards,` +
			` bb-fade ${(duration + 0.55).toFixed(2)}s ease forwards`;
	});
</script>

{#if signal > 0}
	<div
		bind:this={el}
		class="bb-wrap"
		style="--bb-radius:{radius}px; --bb-width:{width}px"
		aria-hidden="true"
	>
		<div class="bb-bleed"></div>
		<div class="bb-ring"></div>
	</div>
{/if}
