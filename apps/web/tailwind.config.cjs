/** @type {import('tailwindcss').Config} */
module.exports = {
  // Staff design tokens live in the shared UI package; the customer site's
  // oven palette is added below. Both apps share this one web build.
  presets: [require('@posshope/ui/tailwind-preset')],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Corner Pizza brand, resolved from the storefront theme variables in
        // src/storefront/index.css so the customer site can flip between the
        // dark oven canvas and the cream daylight canvas.
        forest: {
          DEFAULT: 'rgb(var(--sf-bg) / <alpha-value>)',
          2: 'rgb(var(--sf-bg-2) / <alpha-value>)',
          3: 'rgb(var(--sf-bg-3) / <alpha-value>)',
        },
        line: 'rgb(var(--sf-line) / <alpha-value>)',
        cream: {
          DEFAULT: 'rgb(var(--sf-text) / <alpha-value>)',
          dim: 'rgb(var(--sf-text-dim) / <alpha-value>)',
          faint: 'rgb(var(--sf-text-faint) / <alpha-value>)',
        },
        brick: {
          DEFAULT: 'rgb(var(--sf-brick) / <alpha-value>)',
          deep: 'rgb(var(--sf-brick-deep) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--sf-gold) / <alpha-value>)',
          soft: 'rgb(var(--sf-gold-soft) / <alpha-value>)',
        },
        tomato: 'rgb(var(--sf-tomato) / <alpha-value>)',
        basil: 'rgb(var(--sf-basil) / <alpha-value>)',
        // Fixed in both themes: dark glass on photography and the type that
        // sits on brick-red or over photos.
        scrim: '#0d1f14',
        onmedia: '#f5f1e6',
      },
      borderRadius: { card: '14px' },
      maxWidth: { page: '76rem' },
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        spinIn: {
          from: { transform: 'rotate(-28deg) scale(0.92)' },
          to: { transform: 'rotate(0deg) scale(1)' },
        },
        bump: {
          '0%,100%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        rise: 'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'spin-in': 'spinIn 1.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        bump: 'bump 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
};
