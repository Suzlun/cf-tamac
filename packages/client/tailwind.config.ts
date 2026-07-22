import type { Config } from 'tailwindcss';

/**
 * TAMAC の mineral teal semantic token、指定書体、repository content path を設定する。
 * 色と書体は globals.css の共有 token を参照し、route-local な値の重複を防ぐ。
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        operation: {
          success: {
            DEFAULT: 'hsl(var(--operation-success))',
            foreground: 'hsl(var(--operation-success-foreground))',
            border: 'hsl(var(--operation-success-border))',
          },
          reconciliation: {
            DEFAULT: 'hsl(var(--operation-reconciliation))',
            foreground: 'hsl(var(--operation-reconciliation-foreground))',
            border: 'hsl(var(--operation-reconciliation-border))',
          },
          reregistration: {
            DEFAULT: 'hsl(var(--operation-reregistration))',
            foreground: 'hsl(var(--operation-reregistration-foreground))',
            border: 'hsl(var(--operation-reregistration-border))',
          },
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans JP', 'BIZ UDPGothic', 'Noto Sans JP', 'sans-serif'],
        mono: ['IBM Plex Mono', 'BIZ UDGothic', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        // Shadcn 共通の dropdown/menu の入口/出口アニメーション。
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  // tailwindcss-animate 等の plugin は未許可依存のため追加せず、
  // data-[state=open]:animate-in 等は未知 utility として安全に無視される（即時遷移へ縮退）。
  plugins: [],
};

export default config;
