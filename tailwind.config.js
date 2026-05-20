/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        yellow: {
          50: "#FACC15",
          100: "#FACC15",
          200: "#FACC15",
          300: "#FACC15",
          400: "#FACC15",
          500: "#FACC15",
          600: "#FACC15",
          700: "#FACC15",
          800: "#FACC15",
          900: "#FACC15",
          950: "#FACC15",
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  safelist: [
    'perspective',
    'backface-hidden',
    'transform-style-preserve-3d',
    'rotate-y-180',
  ],
  plugins: [
    require('@tailwindcss/aspect-ratio'),
  ],
};
