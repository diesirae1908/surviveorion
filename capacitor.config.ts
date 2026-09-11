import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Bundled webDir only. Do not set server.url to surviveorion.com:
 * App Store Guideline 4.2 rejects a remote website in a WebView.
 */
const config: CapacitorConfig = {
  appId: "com.surviveorion.app",
  appName: "ORION",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
    scheme: "capacitor",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
    },
  },
};

export default config;
