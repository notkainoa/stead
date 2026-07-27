<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { motionEase } from '$lib/motion';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PencilIcon from '@lucide/svelte/icons/pencil-line';

	type Option = { label: string; info: string };
	type Question = { category: string; title: string; options: Option[]; single?: boolean };

	const DEFAULT_QUESTIONS: Question[] = [
		{
			category: 'Personal short-term',
			title: 'Personal SHORT-term (next 1–4 years): pick about 2 areas, or type your own.',
			options: [
				{ label: 'Fitness / health', info: 'Training, nutrition, sleep — being physically in shape.' },
				{ label: 'Cut screen/phone time', info: 'Less doomscrolling, more focused, intentional time.' },
				{ label: 'Money / saving', info: 'Build a buffer, budget, start investing.' },
				{ label: 'Learn a hobby skill', info: 'An instrument, a language, cooking, a craft.' },
				{ label: 'Relationships / social', info: 'Deeper friendships, more time with people you love.' }
			]
		},
		{
			category: 'Personal long-term',
			title: 'Personal LONG-term (5–10 years): what matters most?',
			options: [
				{ label: 'Buy a home', info: 'Put down roots somewhere of your own.' },
				{ label: 'Family / kids', info: 'Start or grow a family.' },
				{ label: 'Financial independence', info: 'Enough invested that work is optional.' },
				{ label: 'Travel the world', info: 'See the places that are still on the list.' },
				{ label: 'Master a craft', info: 'Go deep on one thing until you’re great at it.' }
			]
		},
		{
			category: 'Career short-term',
			single: true,
			title: 'Career SHORT-term: pick the one to focus on next.',
			options: [
				{ label: 'Get promoted', info: 'Take the next step on your current track.' },
				{ label: 'Switch roles', info: 'Move into something that fits you better.' },
				{ label: 'Build a side project', info: 'Ship something that’s yours.' },
				{ label: 'Learn a new stack', info: 'Pick up the tools the next role needs.' },
				{ label: 'Grow my network', info: 'Meet people who open doors.' }
			]
		},
		{
			category: 'Career long-term',
			single: true,
			title: 'Career LONG-term: which one matters most?',
			options: [
				{ label: 'Start a company', info: 'Build something from zero.' },
				{ label: 'Become a lead', info: 'Grow into managing and mentoring.' },
				{ label: 'Go independent', info: 'Freelance, consult, or run solo.' },
				{ label: 'Financial freedom', info: 'Work because you want to, not have to.' },
				{ label: 'Make an impact', info: 'Work on problems that matter to you.' }
			]
		},
		{
			category: 'Health',
			title: 'Health: pick the habits to focus on first.',
			options: [
				{ label: 'Sleep better', info: 'Consistent schedule, real rest.' },
				{ label: 'Exercise regularly', info: 'A routine you’ll actually keep.' },
				{ label: 'Eat cleaner', info: 'Fewer ultra-processed foods.' },
				{ label: 'Reduce stress', info: 'Meditation, boundaries, downtime.' },
				{ label: 'Drink more water', info: 'The boring one that works.' }
			]
		},
		{
			category: 'Learning',
			title: 'Learning: what do you want to pick up?',
			options: [
				{ label: 'A language', info: 'Conversational in something new.' },
				{ label: 'An instrument', info: 'Guitar, piano, anything with strings or keys.' },
				{ label: 'Coding', info: 'Build your own tools and ideas.' },
				{ label: 'Design', info: 'Make things that look and feel right.' },
				{ label: 'Writing', info: 'Think more clearly on the page.' }
			]
		}
	];

	type Props = {
		questions?: Question[];
		onCancel?: () => void;
		onComplete?: (answers: { picks: string[]; custom: string }[]) => void;
	};
	let { questions = DEFAULT_QUESTIONS, onCancel, onComplete }: Props = $props();

	let qIndex = $state(0);
	let active = $state(0);
	let editingCustom = $state(false);
	let customInput = $state<HTMLInputElement | null>(null);
	let dir = $state(1); // page transition direction

	// One answer slot per question (initialized once).
	let answers = $state(untrack(() => questions.map(() => ({ picks: [] as number[], custom: '' }))));

	let q = $derived(questions[qIndex]);
	let cur = $derived(answers[qIndex]);
	let rowCount = $derived(q.options.length + 1); // options + "type your own"
	let customRow = $derived(q.options.length);
	let isLast = $derived(qIndex === questions.length - 1);

	function togglePick(i: number) {
		cur.picks = cur.picks.includes(i) ? cur.picks.filter((p) => p !== i) : [...cur.picks, i];
	}

	// Single-choice questions select one option and auto-advance; multi toggles.
	function choose(i: number) {
		active = i;
		if (q.single) {
			cur.picks = [i];
			setTimeout(() => next(), 180);
		} else {
			togglePick(i);
		}
	}

	function goto(i: number) {
		if (i < 0 || i >= questions.length) return;
		dir = i > qIndex ? 1 : -1;
		qIndex = i;
		active = 0;
		editingCustom = false;
	}

	function next() {
		if (isLast) onComplete?.($state.snapshot(answers).map((a, qi) => ({
			picks: a.picks.map((p) => questions[qi].options[p].label),
			custom: a.custom
		})));
		else goto(qIndex + 1);
	}

	function startCustom() {
		editingCustom = true;
		active = customRow;
		setTimeout(() => customInput?.focus(), 0);
	}

	function commitCustom() {
		cur.custom = customInput?.value.trim() ?? '';
		editingCustom = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (editingCustom) {
			if (e.key === 'Enter') {
				e.preventDefault();
				commitCustom();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				editingCustom = false;
			}
			return;
		}
		// Don't hijack keys while the user is typing in another field (e.g. the composer).
		const el = document.activeElement as HTMLElement | null;
		if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				active = (active + 1) % rowCount;
				break;
			case 'ArrowUp':
				e.preventDefault();
				active = (active - 1 + rowCount) % rowCount;
				break;
			case 'ArrowRight':
				e.preventDefault();
				goto(qIndex + 1);
				break;
			case 'ArrowLeft':
				e.preventDefault();
				goto(qIndex - 1);
				break;
			case 'Enter':
				e.preventDefault();
				if (active === customRow) startCustom();
				else choose(active);
				break;
			default:
				if (/^[1-9]$/.test(e.key)) {
					const i = Number(e.key) - 1;
					if (i < q.options.length) choose(i);
				}
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<div class="surface-panel w-full rounded-2xl p-4">
	<!-- Header: category + pager -->
	<div class="flex items-center justify-between">
		<span class="text-muted-foreground text-sm">{q.category}</span>
		<div class="text-muted-foreground flex items-center gap-2 text-sm">
			<button
				type="button"
				onclick={() => goto(qIndex - 1)}
				disabled={qIndex === 0}
				aria-label="Previous question"
				class="hover:text-foreground hover:bg-muted/60 grid size-6 place-items-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
			>
				<ChevronLeftIcon class="size-4" />
			</button>
			<span class="tabular-nums"><span class="text-foreground">{qIndex + 1}</span>/{questions.length}</span>
			<button
				type="button"
				onclick={() => goto(qIndex + 1)}
				disabled={isLast}
				aria-label="Next question"
				class="hover:text-foreground hover:bg-muted/60 grid size-6 place-items-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
			>
				<ChevronRightIcon class="size-4" />
			</button>
		</div>
	</div>

	<!-- Question + options keyed on qIndex so they animate between questions -->
	{#key qIndex}
		<div in:fly={{ x: dir * 18, duration: 260, easing: motionEase }}>
			<h2 class="text-foreground mt-1 text-base leading-snug font-semibold">{q.title}</h2>

			<div class="mt-3 flex flex-col gap-0.5">
				{#each q.options as opt, i (opt.label)}
					{@const selected = cur.picks.includes(i)}
					<button
						type="button"
						onclick={() => choose(i)}
						class="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors {active ===
						i
							? 'surface-raised'
							: 'hover:bg-muted/40'}"
					>
						<span class="text-muted-foreground w-5 shrink-0 tabular-nums {selected ? 'text-indigo-300' : ''}"
							>{i + 1}.</span
						>
						<span class="flex min-w-0 flex-1 items-center gap-2">
							<span class="text-foreground truncate text-sm {selected ? '' : 'font-normal'}">{opt.label}</span>
							<span class="text-muted-foreground/50 hover:text-muted-foreground shrink-0" title={opt.info}>
								<InfoIcon class="size-4" />
							</span>
						</span>
						<span class="flex shrink-0 items-center gap-2">
							{#if selected}
								<CheckIcon class="size-4 text-indigo-300" />
							{/if}
							{#if active === i}
								<span class="text-muted-foreground flex items-center gap-1.5">
									<ArrowUpIcon class="size-4" />
									<ArrowDownIcon class="size-4" />
									<span class="bg-muted grid size-6 place-items-center rounded-md">
										<CornerDownLeftIcon class="size-3.5" />
									</span>
								</span>
							{/if}
						</span>
					</button>
				{/each}

				<!-- Type your own -->
				<button
					type="button"
					onclick={startCustom}
					class="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors {active ===
					customRow
						? 'surface-raised'
						: 'hover:bg-muted/40'}"
				>
					<span class="text-muted-foreground/70 grid w-5 shrink-0 place-items-center">
						<PencilIcon class="size-4" />
					</span>
					{#if editingCustom}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							bind:this={customInput}
							value={cur.custom}
							onblur={commitCustom}
							autofocus
							placeholder="Type your own…"
							class="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
						/>
					{:else}
						<span class="text-foreground flex-1 truncate text-sm {cur.custom ? '' : 'text-muted-foreground'}">
							{cur.custom || 'Type your own…'}
						</span>
						{#if cur.custom}
							<CheckIcon class="size-4 shrink-0 text-indigo-300" />
						{/if}
					{/if}
				</button>
			</div>
		</div>
	{/key}

	<!-- Footer -->
	<div class="mt-4 flex items-center justify-end gap-2">
		<button
			type="button"
			onclick={() => (qIndex === 0 ? onCancel?.() : goto(qIndex - 1))}
			class="surface-raised text-foreground rounded-lg px-3 py-1.5 text-[13px] font-medium transition-[filter] hover:brightness-110"
		>
			{qIndex === 0 ? 'Cancel' : 'Previous'}
		</button>
		<button
			type="button"
			onclick={next}
			class="btn-light rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-[filter] hover:brightness-[0.97]"
		>
			{isLast ? 'Done' : 'Next question'}
		</button>
	</div>
</div>
