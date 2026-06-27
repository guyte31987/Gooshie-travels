import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        accent: ["var(--font-accent)", "Georgia", "serif"],
      },
      colors: {
        // Warm editorial palette (see redesign brief "Design tokens").
        ivory: "#F7F2E9", // app surface
        sheet: "#FBF8F1", // raised sheets / tab bars
        fill: { DEFAULT: "#efe9dd", soft: "#f4efe5" }, // alt fills
        ink: "#211C18", // primary text / dark frame
        body: "#3f3a33",
        secondary: "#8c8579",
        tertiary: "#9a9082",
        faint: "#a89f90",
        rust: "#B4502E", // accent — buttons, active tab, "Book now!"
        border: { card: "#e3ddd0", divider: "#ece7dd", dash: "#e0d8c8" },
        booked: { DEFAULT: "#3F7A52", bg: "#e8efe7" },
        tentative: { DEFAULT: "#9a7b2e", bg: "#f3edda" },
      },
    },
  },
  plugins: [],
} satisfies Config;
