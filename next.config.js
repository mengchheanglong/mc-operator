/** @type {import('next').NextConfig} */
const nextConfig = {
  // OpenClaw: Optimized for low-memory environments
  // Port: 3100 (OpenClaw Gateway Integration)
  output: "standalone",
  poweredByHeader: false,


  // Disable features not needed for OpenClaw
  experimental: {
    // Optimize package imports
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    root: __dirname,
  },

  // TypeScript and linting
  typescript: {
    ignoreBuildErrors: false,
  },

  // Bind to all interfaces for external access
  async headers() {
    return [];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/quest",
        destination: "/dashboard/quests",
        permanent: true,
      },
      {
        source: "/dashboard/chat",
        destination: "/dashboard/prompt-pack",
        permanent: true,
      },
      {
        source: "/api/quest/:path*",
        destination: "/api/quests/:path*",
        permanent: true,
      },
      {
        source: "/api/note/:path*",
        destination: "/api/notes/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
