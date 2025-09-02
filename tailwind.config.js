/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-spotify': '#1DB954',
        'spotify-gray-900': '#121212',
        'spotify-gray-800': '#181818',
        'spotify-gray-700': '#282828',
        'spotify-gray-600': '#3e3e3e',
        'spotify-gray-500': '#535353',
        'spotify-gray-400': '#b3b3b3',
        'spotify-gray-300': '#dedede',
        'spotify-gray-100': '#ffffff',
      },
      animation: {
        'subtle-pulse': 'subtle-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'subtle-pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: .85 },
        }
      }
    },
  },
  plugins: [],
}