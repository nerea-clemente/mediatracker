// Static export targeting GitHub Pages.
// basePath/assetPrefix are set when DEPLOY_BASE_PATH is provided by CI.
const basePath = process.env.DEPLOY_BASE_PATH || "";

/** @type {import('next').NextConfig} */
module.exports = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
};
