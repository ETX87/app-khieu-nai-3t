/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "accent-soft": "var(--accent-soft)",
        bg: "var(--bg)",
        surface: "var(--surface)",
      },
    },
  },
  plugins: [],
};
