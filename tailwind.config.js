/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nav: {
          bg:      '#0B1628',
          surface: '#0F1F35',
          surface2:'#162238',
          border:  '#1E3552',
        },
        risk: {
          low:  '#1D9E75',
          mid:  '#C77B1A',
          high: '#E05555',
        },
        lock: '#7C3AED',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
