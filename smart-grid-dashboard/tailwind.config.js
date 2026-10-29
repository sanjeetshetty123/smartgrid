/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-danger': 'pulse-danger 1.2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-danger': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.72' },
        },
      },
      boxShadow: {
        glass: '0 0 20px rgba(34, 211, 238, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-danger': '0 0 24px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        'neon-cyan': '0 0 12px rgba(34, 211, 238, 0.65), 0 0 28px rgba(34, 211, 238, 0.35)',
        'neon-emerald': '0 0 12px rgba(52, 211, 153, 0.55), 0 0 24px rgba(16, 185, 129, 0.3)',
        'neon-green-btn': '0 0 24px rgba(34, 197, 94, 0.45), 0 0 48px rgba(34, 197, 94, 0.2)',
        'neon-red-btn': '0 0 24px rgba(239, 68, 68, 0.5), 0 0 48px rgba(239, 68, 68, 0.25)',
      },
    },
  },
  plugins: [],
};
