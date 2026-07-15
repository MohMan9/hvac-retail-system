import type { NextConfig } from "next";

// Product images are served from Supabase Storage's public bucket. Allow
// next/image to optimize them by whitelisting the Supabase project host
// (derived from the same env var the app already uses), so we can use
// <Image> instead of a raw <img>.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
