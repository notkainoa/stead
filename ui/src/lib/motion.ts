// Shared motion easing — the "motion-core-ease" house curve: cubic-bezier(0.625, 0.05, 0, 1).
// Used by Svelte JS transitions/animations; CSS transitions pick it up via
// --default-transition-timing-function (see layout.css).

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;

	const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
	const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
	const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

	function solveX(x: number) {
		let t = x;
		for (let i = 0; i < 8; i++) {
			const d = sampleX(t) - x;
			if (Math.abs(d) < 1e-6) return t;
			const dx = sampleDX(t);
			if (Math.abs(dx) < 1e-6) break;
			t -= d / dx;
		}
		let lo = 0;
		let hi = 1;
		t = x;
		for (let i = 0; i < 20; i++) {
			const d = sampleX(t) - x;
			if (Math.abs(d) < 1e-6) break;
			if (d > 0) hi = t;
			else lo = t;
			t = (lo + hi) / 2;
		}
		return t;
	}

	return (t: number) => sampleY(solveX(t));
}

export const motionEase = cubicBezier(0.625, 0.05, 0, 1);
