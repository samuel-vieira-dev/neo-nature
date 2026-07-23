import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Product thumbnails come from arbitrary external hosts (BuyGoods CDN, etc.).
  // We don't need Next's image optimizer, so disable it — this also lifts the
  // remote-host allowlist requirement.
  images: { unoptimized: true },
};

export default nextConfig;
