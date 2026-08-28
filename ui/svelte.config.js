import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	// Force runes mode for project files (not libraries). Can be removed in Svelte 6.
	compilerOptions: {
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},

	kit: {
		// Static SPA: index.html fallback for client-routed pages, plus any
		// prerender=true routes are emitted as real HTML (see /new-tab).
		adapter: adapter({ fallback: 'index.html' }),
		// Absolute asset paths (/_app/...) so they resolve under the WebUI host
		// root regardless of the client route.
		paths: { relative: false },
		appDir: '_app'
	}
};

export default config;
