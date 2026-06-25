import type { Config } from 'tailwindcss';

const PANEL_TOKEN = 'var(--panel)';
const PAPER_TOKEN = 'var(--paper)';

const config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Control-room token names (kept for direct token reference).
        coal: 'var(--coal)',
        cyan: 'var(--cyan)',
        error: 'var(--error)',
        ink: 'var(--ink)',
        line: 'var(--line)',
        panel: PANEL_TOKEN,
        paper: PAPER_TOKEN,
        signal: 'var(--signal)',
        // shadcn/ui semantic slots mapped to the Management Client control-room palette.
        // The control-room `--muted` token is a text color (rgba paper 0.68)
        // and maps to `muted-foreground`; `muted` (background) maps to `--panel`.
        background: 'var(--coal)',
        foreground: PAPER_TOKEN,
        card: PANEL_TOKEN,
        'card-foreground': PAPER_TOKEN,
        popover: PANEL_TOKEN,
        'popover-foreground': PAPER_TOKEN,
        primary: 'var(--signal)',
        'primary-foreground': 'var(--ink)',
        secondary: PANEL_TOKEN,
        'secondary-foreground': PAPER_TOKEN,
        muted: PANEL_TOKEN,
        'muted-foreground': 'var(--muted)',
        accent: PANEL_TOKEN,
        'accent-foreground': 'var(--cyan)',
        destructive: 'var(--error)',
        'destructive-foreground': PAPER_TOKEN,
        border: 'var(--line)',
        input: 'var(--line)',
        ring: 'var(--cyan)',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
        serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'serif'],
      },
      borderRadius: {
        '2xl': '1.75rem',
        lg: '1.25rem',
        md: '0.75rem',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
