// The Python hub (backend/) serves the API and WebSockets; Next.js proxies them so the
// browser only ever talks to one origin (this also works from phones on the same Wi-Fi).
const HUB_URL = process.env.HUB_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let tablets/phones on the local network load the dev server (e.g. a dashboard on the room screen).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  experimental: {
    // Uploads (presentations) are forwarded to the hub; Next buffers request bodies only up to 10 MB by default.
    proxyClientMaxBodySize: "250mb",
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${HUB_URL}/api/:path*` },
      { source: "/ws/:path*", destination: `${HUB_URL}/ws/:path*` },
    ];
  },
};

export default nextConfig;
