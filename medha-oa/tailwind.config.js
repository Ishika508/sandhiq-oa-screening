/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        clinical: {
          50: "#effcff", 100: "#dff8fb", 200: "#b9eef2", 300: "#7cdee6", 400: "#3cc8d5",
          500: "#14a8b8", 600: "#0c879c", 700: "#0d6d82", 800: "#11576a", 900: "#12495a", 950: "#082f3c",
        },
        teal: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
        },
        assistant: { 50: "#f7f5ff", 100: "#eeeaff", 200: "#ddd5ff", 300: "#c3b3ff", 400: "#a48cff", 500: "#8665ed", 600: "#704bd3", 700: "#5f3bb4", 800: "#4e3292", 900: "#422b75", 950: "#281849" },
        success: { 50: "#effdf5", 100: "#d9fbe8", 200: "#b6f4d1", 300: "#7be8b2", 400: "#3bd995", 500: "#16bd76", 600: "#0b995f", 700: "#087a4e", 800: "#09613f", 900: "#085037", 950: "#032d20" },
        warning: { 50: "#fffbed", 100: "#fff3c9", 200: "#ffe68b", 300: "#ffd052", 400: "#ffb52b", 500: "#f39214", 600: "#d96f0a", 700: "#b44e0b", 800: "#923e10", 900: "#783512", 950: "#451a06" },
        danger: { 50: "#fff2f3", 100: "#ffe1e3", 200: "#ffc8cc", 300: "#ff9da6", 400: "#fb6875", 500: "#ee4052", 600: "#d9273e", 700: "#b71e36", 800: "#981d36", 900: "#811d34", 950: "#480b19" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 8px rgba(15, 35, 52, 0.06), 0 1px 2px rgba(15, 35, 52, 0.04)",
        soft: "0 4px 20px rgba(15, 23, 42, 0.06)",
        "elevation-1": "0 2px 8px rgba(15, 35, 52, 0.06), 0 1px 2px rgba(15, 35, 52, 0.04)",
        "elevation-2": "0 10px 24px rgba(15, 35, 52, 0.11), 0 2px 5px rgba(15, 35, 52, 0.06)",
        "elevation-3": "0 18px 45px rgba(15, 35, 52, 0.16), 0 4px 10px rgba(15, 35, 52, 0.08)",
        "elevation-4": "0 24px 60px rgba(15, 35, 52, 0.22), 0 6px 14px rgba(15, 35, 52, 0.1)",
      },
      fontSize: { caption: ["0.75rem", { lineHeight: "1.35" }], body: ["0.9375rem", { lineHeight: "1.5" }], label: ["0.8125rem", { lineHeight: "1.35" }], title: ["1.25rem", { lineHeight: "1.25" }], section: ["1.5625rem", { lineHeight: "1.2" }], metric: ["3rem", { lineHeight: "1" }] },
      transitionTimingFunction: { clinical: "cubic-bezier(0.22, 1, 0.36, 1)" },
    },
  },
  plugins: [],
};
