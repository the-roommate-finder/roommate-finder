import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { primary: '#000080', 'primary-dark': '#00006d', canvas: '#eff6ff', ink: '#111827' },
    fontFamily: { sans: ['Plus Jakarta Sans Variable', 'sans-serif'], button: ['Manrope Variable', 'sans-serif'], inter: ['Inter Variable', 'sans-serif'] },
  } }, plugins: [],
} satisfies Config;
