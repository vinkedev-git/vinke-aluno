/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Vinke (Direção H). Semântica: roxo = marca/ação, verde = SÓ acerto.
        vinke: {
          DEFAULT: "#6236F0",
          deep: "#3E1DB8",
          soft: "#F1EFFB",
          sel: "#F8F6FE",
          ring: "#EDE8FD",
          lav: "#8B6DFF",

          green: "#17D07C",
          "green-text": "#0E9C5C",
          "green-soft": "#E6F9F0",

          red: "#D6455D",
          "red-soft": "#FBEDF0",
          "red-dark": "#FF6E88",

          amber: "#B4650A",
          "amber-soft": "#FDF3E3",
          "amber-bar": "#E8A13D",

          navy: "#0B0A21",
          "navy-deep": "#070617",
          "navy-card": "#151233",
          "navy-line": "#262047",
          "navy-sel": "#1D1745",

          offwhite: "#F7F6F2",
          ink: "#0B0A21",
          ink2: "#5D5A72",
          ink3: "#8A87A0",
          ink4: "#B9B6C6",
          line: "#ECEAF4",
          line2: "#F0EFF3",
          line3: "#F7F6FA",
        },
        // aliases herdados (mantidos para não quebrar telas ainda não migradas)
        primary: "#0B0A21",
        accent: "#6236F0",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-manrope)", "sans-serif"],
      },
    },
  },
  plugins: [],
}
