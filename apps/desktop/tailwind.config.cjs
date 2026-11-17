/** @type {import('tailwindcss').Config} */
module.exports = {
  // Design tokens live in the shared UI package; this app only says where to
  // look for class names.
  presets: [require('@posshope/ui/tailwind-preset')],
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
