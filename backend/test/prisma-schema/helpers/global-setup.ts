import { execSync } from "child_process";
import path from "path";

export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. " +
        "Copy .env.example to backend/.env and run `npm run db:up` first."
    );
  }

  const schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma");

  // Apply schema.prisma to the test DB without generating the client.
  // Uses --force-reset so each full run starts from a clean slate.
  execSync(
    `npx prisma db push --force-reset --skip-generate --schema="${schemaPath}"`,
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    }
  );
}
