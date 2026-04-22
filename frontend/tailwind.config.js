/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind which files to scan for class names.
  // Anything it doesn't find in these files gets stripped from the final CSS.
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      // Custom "forensic editorial" color palette for the dashboard.
      // Used throughout the UI for a cohesive look.
      colors: {
        ink:       '#1a1918',  // near-black for primary text
        cream:     '#faf7f0',  // warm off-white background
        parchment: '#f3ede0',  // subtle card backgrounds
        border:    '#e7e0cc',  // muted borders
        muted:     '#6b6862',  // secondary text

        // Risk-level semantic colors
        forest:    '#14532d',  // low-risk green
        amber:     '#c2410c',  // medium-risk orange
        crimson:   '#991b1b',  // high-risk red
      },
    },
  },
  plugins: [],
};