/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We typecheck in CI / via `npm run typecheck`. Lint is run separately so a
  // stray lint warning never blocks a production build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
