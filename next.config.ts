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
  // The invoice PDF route loads its fonts from public/fonts/*.ttf via a
  // runtime-constructed path (`${process.cwd()}/public/fonts/...`), which
  // Next's build-time file tracer (@vercel/nft) cannot statically follow —
  // so on Vercel the .ttf files were silently left out of the deployed
  // function, and @react-pdf/font's fontkit.open() threw ENOENT at runtime.
  // Force-include them explicitly for that route.
  outputFileTracingIncludes: {
    "/api/invoices/\\[id\\]/pdf": ["./public/fonts/**/*"],
  },
};

export default nextConfig;
