/** @type {import('next').NextConfig} */
// When NEXT_OUTPUT=export the build emits a self-contained static export
// under `frontend/out`. The Python server (FastAPI) mounts that directory
// and serves both the UI and the API at the same origin, so no /api proxy
// rewrites are needed. This is the mode used for Docker and PyInstaller
// bundles. For `npm run dev` the rewrites below proxy /api to the Python
// backend running on a separate port.
const isStaticExport = process.env.NEXT_OUTPUT === "export";
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? { output: "export", images: { unoptimized: true }, trailingSlash: true }
    : {
        async rewrites() {
          return [
            { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
          ];
        },
      }),
};

export default nextConfig;
