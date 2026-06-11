import type { NextConfig } from "next";
import { networkInterfaces } from "os";

function localIPv4Hosts(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

const nextConfig: NextConfig = {
  images: { remotePatterns: [] },
  allowedDevOrigins: Array.from(new Set([
    "localhost",
    "127.0.0.1",
    ...localIPv4Hosts(),
  ])),
};

export default nextConfig;
