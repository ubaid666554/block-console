/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The setup route reads db/schema.sql at runtime via a path built with
    // path.join(), which the serverless bundler cannot trace statically.
    // Without this the file is missing from the deployed function and setup
    // 500s. (In Next 15+ this key moves to the top level.)
    outputFileTracingIncludes: {
      '/api/setup': ['./db/schema.sql'],
    },
  },
};

export default nextConfig;
