// Shared ControlConsole state — one observer subscription feeding every
// surface that renders confirmations, audit, or driving status (the header
// console popover, the inline permission bar, and the driving indicator).

import {
	getControlConsoleBridge,
	type ControlAuditEntry,
	type ControlConfirmation
} from './brain/controlConsole';

const MAX_PENDING = 8;
const MAX_AUDIT = 30;

let pending = $state<ControlConfirmation[]>([]);
let audit = $state<ControlAuditEntry[]>([]);
let lastCancelled = $state<number | null>(null);
let drivingTabs = $state<Record<number, boolean>>({});
let started = false;

function ingestAudit(entry: ControlAuditEntry) {
	audit = [entry, ...audit.filter((candidate) => candidate.action_id !== entry.action_id)].slice(
		0,
		MAX_AUDIT
	);
	if (entry.code === 'needs_confirmation') {
		if (!pending.some((candidate) => candidate.action_id === entry.action_id)) {
			pending = [
				{
					action_id: entry.action_id,
					session_id: entry.session_id,
					tab_id: entry.tab_id,
					action_class: entry.action_class,
					operation: entry.operation,
					reason: entry.message
				},
				...pending
			].slice(0, MAX_PENDING);
		}
	} else {
		pending = pending.filter((candidate) => candidate.action_id !== entry.action_id);
	}
}

async function syncAuditLog() {
	const entries = await getControlConsoleBridge().getAuditLog(MAX_AUDIT);
	// Native returns oldest to newest. Reconcile only the latest state for each
	// action so the fallback does not repeatedly replay superseded entries.
	const latestByAction = new Map<number, ControlAuditEntry>();
	for (const entry of entries) latestByAction.set(entry.action_id, entry);
	for (const entry of latestByAction.values()) ingestAudit(entry);
}

function ensureStarted() {
	if (started) return;
	started = true;
	const bridge = getControlConsoleBridge();
	void syncAuditLog().catch(() => {});
	// Mojo observer delivery can be lost while a top-chrome WebUI is being
	// rebound. Reconcile against the broker's persistent audit log so a pending
	// confirmation can never disappear from the UI.
	setInterval(() => void syncAuditLog().catch(() => {}), 750);
	bridge.addObserver((event) => {
		if (event.type === 'confirmation') {
			pending = [
				event.request,
				...pending.filter((candidate) => candidate.action_id !== event.request.action_id)
			].slice(0, MAX_PENDING);
		} else if (event.type === 'audit') {
			ingestAudit(event.entry);
		} else if (event.type === 'cancelled') {
			lastCancelled = event.tab_id;
			if (drivingTabs[event.tab_id]) drivingTabs = { ...drivingTabs, [event.tab_id]: false };
		} else if (event.type === 'driving_changed') {
			drivingTabs = { ...drivingTabs, [event.tab_id]: event.driving };
		}
	});
}

async function respondToConfirmation(request: ControlConfirmation, approve: boolean) {
	await getControlConsoleBridge().respondToConfirmation(request.action_id, approve);
	pending = pending.filter((candidate) => candidate.action_id !== request.action_id);
}

export function getControlState() {
	ensureStarted();
	return {
		get pending() {
			return pending;
		},
		get audit() {
			return audit;
		},
		get lastCancelled() {
			return lastCancelled;
		},
		get drivingTabIds() {
			return Object.entries(drivingTabs)
				.filter(([, driving]) => driving)
				.map(([id]) => Number(id));
		},
		get anyDriving() {
			return Object.values(drivingTabs).some(Boolean);
		},
		isDriving(tabId: number | null | undefined) {
			return tabId != null && !!drivingTabs[tabId];
		},
		respond: respondToConfirmation,
		async resolveFromUserMessage(sessionId: string | null, text: string) {
			if (!sessionId) return;
			const requests = pending.filter((request) => request.session_id === sessionId);
			if (!requests.length) return;

			const normalized = text
				.trim()
				.toLowerCase()
				.replace(/[.!]+$/g, '')
				.replace(/\s+/g, ' ');
			const affirmative = new Set([
				'yes',
				'yes please',
				'yep',
				'yeah',
				'sure',
				'ok',
				'okay',
				'go ahead',
				'yes go ahead',
				'ok go ahead',
				'okay go ahead',
				'do it',
				'proceed',
				'continue',
				'approve',
				'approved',
				'allow it',
				'you are good to go',
				"you're good to go",
				'youre good to go',
				'ur good to go'
			]).has(normalized);

			// A direct affirmative grants only the newest exact action. Any other
			// reply retires the old request so it cannot ambush a later turn.
			const [newest, ...older] = requests.sort((a, b) => b.action_id - a.action_id);
			await Promise.all(older.map((request) => respondToConfirmation(request, false)));
			await respondToConfirmation(newest, affirmative);
		},
		async cancel(tabId: number) {
			await getControlConsoleBridge().cancel(tabId);
			lastCancelled = tabId;
		}
	};
}

export type ControlState = ReturnType<typeof getControlState>;
