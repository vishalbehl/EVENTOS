import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
            { protocol: "http", hostname: "localhost", port: "9000" },
            { protocol: "http", hostname: "minio", port: "9000" },
        ],
    },
    outputFileTracingRoot: path.join(__dirname, '../../../'),
    // Proxy API calls to backend in development
    async rewrites() {
        return [
            {
                source: "/api/v1/:path*",
                destination: `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001"}/api/v1/:path*`,
            },
            {
                source: "/thumbnails/:path*",
                destination: `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001"}/api/v1/storage/thumbnails/:path*`,
            },
        ];
    },
};

export default nextConfig;
