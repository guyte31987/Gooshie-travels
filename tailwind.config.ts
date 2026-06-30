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
        ivory: {
          DEFAULT: "#F7F2E9",
          sheet: "#FBF8F1",
          muted: "#efe9dd",
          deep: "#f4efe5",
        },
        // legacy aliases kept for backward compat
        sheet: "#FBF8F1",
        fill: { DEFAULT: "#efe9dd", soft: "#f4efe5" },
        ink: {
          DEFAULT: "#211C18",
          body: "#3f3a33",
          secondary: "#4b463f",
          tertiary: "#8c8579",
          faint: "#9a9082",
          ghost: "#a89f90",
        },
        // legacy aliases
        body: "#3f3a33",
        secondary: "#8c8579",
        tertiary: "#9a9082",
        faint: "#a89f90",
        rust: {
          DEFAULT: "#B4502E",
          deep: "#C0683A",
        },
        border: {
          DEFAULT: "#e3ddd0",
          card: "#e3ddd0",
          divider: "#ece7dd",
          dash: "#e0d8c8",
          dashed: "#e0d8c8",
        },
        booked: { DEFAULT: "#3F7A52", bg: "#e8efe7" },
        tentative: { DEFAULT: "#9a7b2e", bg: "#f3edda" },
        // Category colours — one per entity type, muted
        cat: {
          food: "#C0683A",
          museum: "#7E5A86",
          party: "#A8456A",
          hike: "#5E7445",
          spa: "#3F7E80",
          vintage: "#B08A2E",
          sight: "#5A7891",
          travel: "#8A8175",
        },
        // Status colours
        status: {
          bookedText: "#3F7A52",
          bookedBg: "#e8efe7",
          tentativeText: "#9a7b2e",
          tentativeBg: "#f3edda",
          doneMuted: "#cfc6b6",
          doneText: "#7c756a",
          doneCheck: "#9aa386",
          cancelledText: "#b0a795",
          cancelledBorder: "#d8a99c",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
