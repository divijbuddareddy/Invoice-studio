/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff5ff', 100: '#dbe7fe', 200: '#bfd4fe', 500: '#2f6fed', 600: '#1f57d6', 700: '#1a45ad', 800: '#1b3a87', 900: '#0f2453' },
      },
      fontFamily: { sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
