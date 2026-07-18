const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "**.s3.amazonaws.com" },
      { protocol: "https" as const, hostname: "**.s3.ap-south-1.amazonaws.com" },
    ],
  },
  async headers() {
    return securityHeaders();
  },
};

function securityHeaders() {
  return [{
    source: "/:path*",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ],
  }];
}

export default nextConfig;
