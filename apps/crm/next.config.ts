import type { NextConfig } from "next";

const publicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const publicSupabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const nextConfig: NextConfig = {
  transpilePackages: ["@crm/shared"],
  // Attachments are validated at 100 MB in the server action. Keep the
  // framework limits slightly higher so multipart overhead does not reject
  // the request before our validation can return a useful message.
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
    proxyClientMaxBodySize: "110mb",
  },
  env: {
    ...(publicSupabaseUrl
      ? { NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl }
      : {}),
    ...(publicSupabaseAnonKey
      ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey }
      : {}),
  },
};

export default nextConfig;
