/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        factory: {
          950: '#0b0f19',
          900: '#111827',
          850: '#172033',
          800: '#1f293d',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
        },
        conveyor: {
          dark: '#1e2530',
          metal: '#2d3748',
          track: '#141a22',
          belt: '#0f141c',
          roller: '#3a4759',
          hazard: '#f59e0b',
          incinerator: '#ef4444',
        },
        arcade: {
          cyan: '#06b6d4',
          neon: '#10b981',
          gold: '#f59e0b',
          rose: '#f43f5e',
          violet: '#8b5cf6',
          sky: '#38bdf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        display: ['Cabinet Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'conveyor-tread': 'conveyorScroll 1s linear infinite',
        'warning-blink': 'warningBlink 0.5s ease-in-out infinite alternate',
        'float-up': 'floatUp 1.2s ease-out forwards',
        'shake': 'shake 0.4s ease-in-out',
      },
      keyframes: {
        conveyorScroll: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '32px 0' },
        },
        warningBlink: {
          '0%': { opacity: '0.2', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1.05)' },
        },
        floatUp: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-60px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
      },
    },
  },
  plugins: [],
};
