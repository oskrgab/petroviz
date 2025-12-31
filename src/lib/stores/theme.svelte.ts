/**
 * Theme Store
 *
 * Manages light/dark theme preference with localStorage persistence.
 * Respects system preference on initial load.
 */

type Theme = 'light' | 'dark';

// Reactive state for current theme
let currentTheme = $state<Theme>('light');

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined';

/**
 * Initialize theme from localStorage or system preference
 */
function initializeTheme(): void {
	if (!isBrowser) return;

	// Check localStorage first
	const stored = localStorage.getItem('theme') as Theme | null;
	if (stored === 'light' || stored === 'dark') {
		currentTheme = stored;
	} else {
		// Fall back to system preference
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		currentTheme = prefersDark ? 'dark' : 'light';
	}

	// Apply to document
	applyTheme(currentTheme);

	// Listen for system preference changes
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
		// Only auto-switch if no explicit preference is stored
		if (!localStorage.getItem('theme')) {
			setTheme(e.matches ? 'dark' : 'light', false);
		}
	});
}

/**
 * Apply theme to document element
 * Also applies 'theme-dark' class to body for Unovis compatibility
 */
function applyTheme(theme: Theme): void {
	if (!isBrowser) return;
	document.documentElement.setAttribute('data-theme', theme);

	// Unovis looks for 'theme-dark' class on body for dark mode styling
	if (theme === 'dark') {
		document.body.classList.add('theme-dark');
	} else {
		document.body.classList.remove('theme-dark');
	}
}

/**
 * Set theme and optionally persist to localStorage
 */
function setTheme(theme: Theme, persist = true): void {
	currentTheme = theme;
	applyTheme(theme);
	if (persist && isBrowser) {
		localStorage.setItem('theme', theme);
	}
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme(): void {
	const newTheme = currentTheme === 'light' ? 'dark' : 'light';
	setTheme(newTheme);
}

/**
 * Get current theme (reactive)
 */
function getTheme(): Theme {
	return currentTheme;
}

// Initialize on module load
if (isBrowser) {
	initializeTheme();
}

export const themeStore = {
	get theme() {
		return currentTheme;
	},
	get isDark() {
		return currentTheme === 'dark';
	},
	toggle: toggleTheme,
	setTheme,
	initialize: initializeTheme
};
