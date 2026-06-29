import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Non-application code — tooling, skills, scripts, infra. Not app source.
      ".agent/**",
      ".agents/**",
      "scripts/**",
      "loadtests/**",
      "audits/**",
      "docs/**",
      "supabase/**",
    ],
  },
];

export default eslintConfig;
