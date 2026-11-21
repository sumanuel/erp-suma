import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
  {
    // Aislamiento entre clientes: ningún módulo puede crear su propio cliente Prisma ni importar uno fijo.
    // Todo acceso a datos pasa por @/lib/db.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/tenant.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/generated/prisma/client",
              importNames: ["PrismaClient"],
              message: "Use requerirSesion() de @/lib/dal: no cree clientes Prisma fuera de src/lib/tenant.ts.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
