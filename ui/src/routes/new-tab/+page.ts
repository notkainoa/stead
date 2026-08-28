// Prerender the new-tab page to real HTML so a new tab paints instantly with
// zero JS, then hydrates. Overrides the global ssr=false from the root layout.
export const ssr = true;
export const prerender = true;
