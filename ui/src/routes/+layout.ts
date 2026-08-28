// Pure client-side SPA by default: no SSR, no prerender. Individual routes can
// opt back in (see /new-tab, which is prerendered for instant first paint).
export const ssr = false;
export const prerender = false;
