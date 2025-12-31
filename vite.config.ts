import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['@duckdb/duckdb-wasm']
	},
	server: {
		host: '0.0.0.0',
		port: 5173,
		fs: {
			allow: ['..']
		}
	}
});
