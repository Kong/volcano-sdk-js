/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Volcano brand colors
        volcano: {
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#fececa',
          300: '#fcaca5',
          400: '#f87c71',
          500: '#ef5544',
          600: '#dc3626',
          700: '#b92b1c',
          800: '#99271b',
          900: '#7f261d',
        },
      },
    },
  },
  plugins: [],
};
