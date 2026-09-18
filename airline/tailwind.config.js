/** @type {import('tailwindcss').Config} */

// Semantic colours read from CSS variables (see src/index.css), so one class set
// serves both themes and the light/dark switch is a single class on <html>.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces & structure
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        line: token('line'),
        'line-strong': token('line-strong'),

        // Text
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        'ink-4': token('ink-4'),
        'on-brand': token('on-brand'),

        // Brand + secondary accent (neutral airline palette)
        brand: token('brand'),
        'brand-strong': token('brand-strong'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),

        // Status
        ok: token('ok'),
        'ok-strong': token('ok-strong'),
        warn: token('warn'),
        'warn-strong': token('warn-strong'),
        danger: token('danger'),
        'danger-strong': token('danger-strong')
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out'
      }
    }
  },
  plugins: []
};
