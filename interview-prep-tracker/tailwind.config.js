/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
  "./src/**/*.{js,jsx,ts,tsx}",
  "./settings.local.json", // Add this line if it's missing
],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#faf5ff', // Very light purple
          600: '#9333ea', // Your "primary" purple
          700: '#7e22ce', // Darker purple for hover
          // ... add other numbers if you see them (500, 800, etc.)
        },
      },
    },
  },
  plugins: [],
}

