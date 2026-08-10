import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["@eventos/email-builder-studio", "@eventos/website-builder-studio"],
    outputFileTracingRoot: path.join(__dirname, '../../..'),
    distDir: process.env.NEXT_DIST_DIR || ".next",
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
            { protocol: "http", hostname: "localhost", port: "9000" },
            { protocol: "http", hostname: "minio", port: "9000" },
            { protocol: "https", hostname: "**.s3.amazonaws.com" },
            { protocol: "https", hostname: "**.s3.ap-south-1.amazonaws.com" },
        ],
    },
    async headers() {
        return securityHeaders();
    },
    // Production browsers call the AWS API directly. Rewrites remain local-only.
    async rewrites() {
        if (process.env.NODE_ENV === "production") return [];
        return [
            {
                source: "/api/v1/:path*",
                destination: `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/:path*`,
            },
            {
                source: "/thumbnails/:path*",
                destination: `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/storage/thumbnails/:path*`,
            },
        ];
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
