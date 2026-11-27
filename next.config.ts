import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  // Settings sits at the bottom left; keep the dev-only Next.js badge out of its way.
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
