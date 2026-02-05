import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'IBM Plex Mono',
          'JetBrains Mono',
          'Courier New',
          'Courier',
          'monospace',
        ],
        sans: [
          'IBM Plex Mono',
          'JetBrains Mono',
          'Courier New',
          'Courier',
          'monospace',
        ],
      },
      fontSize: {
        'xs': ['0.7rem', { lineHeight: '1rem' }],
        'sm': ['0.775rem', { lineHeight: '1.15rem' }],
        'base': ['0.85rem', { lineHeight: '1.35rem' }],
        'lg': ['0.95rem', { lineHeight: '1.5rem' }],
        'xl': ['1.05rem', { lineHeight: '1.65rem' }],
        '2xl': ['1.275rem', { lineHeight: '1.85rem' }],
        '3xl': ['1.55rem', { lineHeight: '2.1rem' }],
        '4xl': ['1.9rem', { lineHeight: '2.4rem' }],
      },
      spacing: {
        '0.5': '0.1rem',
        '1': '0.2rem',
        '1.5': '0.3rem',
        '2': '0.425rem',
        '2.5': '0.53rem',
        '3': '0.64rem',
        '3.5': '0.75rem',
        '4': '0.85rem',
        '5': '1.05rem',
        '6': '1.275rem',
        '7': '1.49rem',
        '8': '1.7rem',
        '9': '1.9rem',
        '10': '2.1rem',
        '11': '2.3rem',
        '12': '2.55rem',
        '14': '2.975rem',
        '16': '3.4rem',
        '20': '4.25rem',
        '24': '5.1rem',
        '28': '5.95rem',
        '32': '6.8rem',
        '36': '7.65rem',
        '40': '8.5rem',
        '44': '9.35rem',
        '48': '10.2rem',
        '52': '11.05rem',
        '56': '11.9rem',
        '60': '12.75rem',
        '64': '13.6rem',
        '72': '15.3rem',
        '80': '17rem',
        '96': '20.4rem',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Cyan from DevForge logo
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        // Cyan/teal accent
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        danger: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          500: '#fbbf24',
          600: '#f59e0b',
          700: '#d97706',
          800: '#b45309',
          900: '#78350f',
        },
        // Terminal specific colors
        terminal: {
          bg: '#0d1117',
          bgLight: '#161b22',
          border: '#30363d',
          text: '#c9d1d9',
          textMuted: '#8b949e',
          green: '#10b981',   // Emerald (success)
          cyan: '#22d3ee',    // Logo cyan (primary)
          yellow: '#fbbf24',  // Amber WCAG AAA
          red: '#f97316',     // Orange WCAG AAA
          purple: '#a78bfa',  // Violet for Claude
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
