/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "field-bg": "var(--field-bg)",
        "field-border": "var(--field-border)",
      },
    },
  },
  plugins: [],
};
