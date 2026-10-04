/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.tsx", "./client/src/**/*.ts"],
  theme: {
    extend: {
      colors: {
        ink: "#111410",
        panel: "#181b16",
        raised: "#20241c",
        line: "#32382c",
        paper: "#efe8d6",
        mute: "#9aa392",
        signal: "#e3a008",
        moss: "#7dcea0",
        rust: "#d4654a",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
