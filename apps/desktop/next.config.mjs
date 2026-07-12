/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Electron loads files from the filesystem, so asset prefix must be relative.
  assetPrefix: './',
};

export default nextConfig;
