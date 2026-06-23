import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um build "standalone" (.next/standalone) com apenas os arquivos de
  // runtime necessários — usado pelo Dockerfile para uma imagem enxuta.
  output: "standalone",
};

export default nextConfig;
