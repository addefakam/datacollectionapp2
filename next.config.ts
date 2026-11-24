import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the deployment model (.zscripts/start.sh runs the standalone
  // server.js). Without this, deploy relies on the build-script self-heal.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
