import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0d0d0d",
        panel: "#161616",
        "panel-2": "#1c1c1c",
        "panel-3": "#242424",
        border: "#2a2a2a",
        text: "#e8e8e8",
        "text-muted": "#8a8a8a",
        "text-faint": "#5c5c5c",
        accent: "#e07856",
        success: "#3ecf5e",
        danger: "#e5484d"
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ]
      },
      fontSize: {
        h1: ["22px", { fontWeight: "600" }],
        label: ["12.5px", { fontWeight: "500" }],
        eyebrow: ["12.5px", { fontWeight: "400" }],
        body: ["13.5px", { fontWeight: "400" }],
        sub: ["12.5px", { fontWeight: "400" }],
        th: ["12px", { fontWeight: "500" }]
      },
      borderRadius: {
        card: "8px",
        control: "6px"
      }
    }
  },
  plugins: []
};

export default config;
