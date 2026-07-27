<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { motionEase } from '$lib/motion';
	import type { Message, AssistantMessage, Step, Token } from '$lib/chat';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	type Props = { messages: Message[] };
	let { messages }: Props = $props();

	// word reveal: long, soft fade (+ a touch of blur) so many words are mid-reveal
	// at once — reads as a flowing wave rather than discrete typing.
	function wordIn(_node: Element, { duration = 620 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number, u: number) => `opacity:${t}; filter: blur(${u * 2.5}px);`
		};
	}

	// step reveal: collapse-down height + fade
	function stepIn(node: HTMLElement, { duration = 260 } = {}) {
		const h = node.offsetHeight;
		return {
			duration,
			easing: motionEase,
			css: (t: number) => `opacity:${t}; height:${t * h}px; overflow:hidden;`
		};
	}
</script>

{#snippet stepsTimeline(steps: Step[], live: boolean)}
	<div class="flex flex-col">
		{#each steps as step, si (si)}
			<div in:stepIn class="flex gap-3">
				<!-- icon + connector -->
				<div class="flex w-4 shrink-0 flex-col items-center">
					<div class="flex h-[1.45rem] items-center">
						{#if step.kind === 'thought'}
							<span class="bg-muted-foreground/60 size-1.5 rounded-full"></span>
						{:else if step.kind === 'tab'}
							<GlobeIcon class="text-muted-foreground/70 size-4" />
						{:else}
							<CpuIcon class="text-muted-foreground/70 size-4" />
						{/if}
					</div>
					{#if si < steps.length - 1}
						<div class="bg-border w-px flex-1"></div>
					{/if}
				</div>
				<!-- thought / action text (wraps so you can read it) -->
				<div
					class="min-w-0 flex-1 text-sm leading-relaxed {si < steps.length - 1
						? 'pb-3'
						: ''} {live && si === steps.length - 1 ? 'shimmer-text' : 'text-muted-foreground'}"
				>
					{step.label}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet word(tok: Token)}
	{#if tok.href}
		<a
			in:wordIn
			href={tok.href}
			target="_blank"
			rel="noopener noreferrer"
			class="underline decoration-current/30 underline-offset-2 transition-colors hover:decoration-current/70 {tok.b
				? 'font-semibold'
				: ''}">{tok.word}</a
		>
	{:else if tok.c}
		<code in:wordIn class="prose-code">{tok.word}</code>
	{:else if tok.b && tok.i}
		<span in:wordIn class="font-semibold italic">{tok.word}</span>
	{:else if tok.b}
		<span in:wordIn class="font-semibold">{tok.word}</span>
	{:else if tok.i}
		<span in:wordIn class="italic">{tok.word}</span>
	{:else}
		<span in:wordIn>{tok.word}</span>
	{/if}
{/snippet}

{#snippet answer(msg: AssistantMessage)}
	{@const vis = msg.tokens.filter((t) => t.gi < msg.revealed)}
	<div class="text-foreground flex flex-col gap-2.5 text-[15px] leading-relaxed">
		{#each msg.blocks as block, bi (bi)}
			{@const bt = vis.filter((t) => t.blockIdx === bi)}
			{#if bt.length}
				{#if block.kind === 'li'}
					<div class="relative flex gap-2.5 pl-1">
						{#if block.ordinal != null}
							<span class="text-muted-foreground min-w-[1.15rem] shrink-0 text-right tabular-nums"
								>{block.ordinal}.</span
							>
						{:else}
							<span class="bg-muted-foreground mt-[0.62em] size-[5px] shrink-0 rounded-full"></span>
						{/if}
						<div class="min-w-0 flex-1">
							{#each bt as tok (tok.gi)}{@render word(tok)}{/each}
						</div>
					</div>
				{:else if block.kind === 'h'}
					<p class="mt-1.5 font-bold {(block.level ?? 3) <= 2 ? 'text-[17px]' : 'text-[15px]'}">
						{#each bt as tok (tok.gi)}{@render word(tok)}{/each}
					</p>
				{:else if block.kind === 'code'}
					<pre in:fade={{ duration: 200, easing: motionEase }} class="prose-pre"><code
							>{bt.map((t) => t.word).join('')}</code
						></pre>
				{:else if block.kind === 'quote'}
					<div class="text-muted-foreground border-border border-l-2 pl-3">
						{#each bt as tok (tok.gi)}{@render word(tok)}{/each}
					</div>
				{:else}
					<p>{#each bt as tok (tok.gi)}{@render word(tok)}{/each}</p>
				{/if}
			{/if}
		{/each}
	</div>
{/snippet}

<div class="flex flex-col gap-6 px-3 py-4">
	{#each messages as msg, i (i)}
		{#if msg.role === 'user'}
			<div class="flex flex-col items-end gap-1.5">
				{#if msg.context?.length}
					<div class="flex w-full min-w-0 flex-row flex-nowrap justify-end gap-1.5 overflow-hidden self-end">
						{#each msg.context as c (c.title)}
							<div
								class="surface-raised flex w-fit min-w-0 max-w-[68%] items-center gap-2 overflow-hidden rounded-xl py-1 pr-2.5 pl-1"
							>
								<div class="bg-muted relative grid size-7 shrink-0 place-items-center rounded-md">
									<GlobeIcon class="text-muted-foreground size-4" />
									{#if c.favicon}
										<img
											src={c.favicon}
											alt=""
											class="bg-muted absolute size-4"
											onerror={(event) => ((event.currentTarget as HTMLImageElement).hidden = true)}
										/>
									{/if}
								</div>
								<div class="min-w-0 flex-1 overflow-hidden">
									<p class="text-foreground truncate text-[13px] leading-tight font-semibold">
										{c.title}
									</p>
									{#if c.sublabel}
										<p class="text-muted-foreground truncate text-[11px] leading-tight">
											{c.sublabel}
										</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
				<div
					class="bg-muted/70 text-foreground max-w-[68%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed"
				>
					{msg.text}
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#if msg.phase === 'thinking'}
					<div out:slide={{ duration: 280, easing: motionEase }}>
						{@render stepsTimeline(msg.steps, true)}
					</div>
				{:else}
					{#if msg.thoughtSeconds > 0 && msg.steps.length > 0}
					<div in:fade={{ duration: 200, easing: motionEase }} class="flex flex-col gap-2">
						<button
							type="button"
							onclick={() => (msg.collapsed = !msg.collapsed)}
							class="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm transition-colors"
						>
								<span>Worked for {msg.thoughtSeconds} {msg.thoughtSeconds === 1 ? 'second' : 'seconds'}</span>
							<ChevronRightIcon
								class="size-3.5 opacity-60 transition-transform {msg.collapsed ? '' : 'rotate-90'}"
							/>
						</button>
						{#if !msg.collapsed}
							<div transition:slide={{ duration: 260, easing: motionEase }} class="pl-0.5">
								{@render stepsTimeline(msg.steps, false)}
							</div>
						{/if}
						</div>
					{/if}
						{#if msg.error}
							<div class="surface-raised flex max-w-xl items-start gap-3 rounded-xl px-3.5 py-3">
								<CircleAlertIcon
									class="mt-0.5 size-4 shrink-0 {msg.error.kind === 'auth'
										? 'text-amber-400'
										: 'text-muted-foreground'}"
								/>
								<div class="min-w-0">
									<p class="text-foreground text-sm font-medium">{msg.error.title}</p>
									<p class="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
										{msg.error.detail}
									</p>
								</div>
							</div>
						{:else}
							{@render answer(msg)}
						{/if}
						{#if msg.artifacts?.length}
							<div
								in:fade={{ duration: 180, easing: motionEase }}
								class="surface-raised flex w-fit max-w-xl items-center gap-2.5 rounded-xl px-3 py-2"
							>
								<FileTextIcon class="text-muted-foreground/80 size-4 shrink-0" />
								<p class="min-w-0 text-[13px] leading-snug">
									<span class="text-muted-foreground">Created</span>
									<span class="text-foreground ml-1 font-medium">
										{msg.artifacts.length === 1
											? msg.artifacts[0].name
											: `${msg.artifacts.length} artifacts`}
									</span>
								</p>
							</div>
						{/if}
				{/if}
			</div>
		{/if}
	{/each}
</div>
