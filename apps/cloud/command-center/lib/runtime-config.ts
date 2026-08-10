export type DeploymentProfile = "local" | "staging" | "production";

const rawProfile =
  process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE ||
  process.env.NEXT_PUBLIC_APP_ENV ||
  "local";

export const deploymentProfile: DeploymentProfile =
  rawProfile === "production" ? "production" : rawProfile === "staging" ? "staging" : "local";

export const isProductionDeployment = deploymentProfile === "production";

function normalizeOrigin(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\/$/, "");
}

export const runtimeConfig = {
  deploymentProfile,
  apiOrigin: normalizeOrigin(process.env.NEXT_PUBLIC_API_URL, "http://127.0.0.1:8000"),
  wsOrigin: normalizeOrigin(process.env.NEXT_PUBLIC_WS_URL, process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"),
  assetsOrigin: normalizeOrigin(
    process.env.NEXT_PUBLIC_ASSETS_URL,
    `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/storage/assets`,
  ),
  speakerPortalOrigin: normalizeOrigin(process.env.NEXT_PUBLIC_SPEAKER_PORTAL_URL, "http://localhost:3002"),
  disableRealtime: process.env.NEXT_PUBLIC_DISABLE_REALTIME === "1",
} as const;

if (isProductionDeployment && runtimeConfig.apiOrigin.includes("localhost")) {
  throw new Error("NEXT_PUBLIC_API_URL must not point to localhost in production deployments.");
}

if (isProductionDeployment && !runtimeConfig.apiOrigin.startsWith("https://")) {
  throw new Error("NEXT_PUBLIC_API_URL must use HTTPS in production deployments.");
}
