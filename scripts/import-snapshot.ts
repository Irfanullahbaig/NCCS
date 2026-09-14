import path from "path";
import { restoreFromFile } from "../src/lib/backup";

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage: npm run db:import -- <backup.json>");
    process.exit(1);
  }

  const safety = await restoreFromFile(path.resolve(source));
  console.log(`Imported ${source}. Safety copy: ${safety.filename}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
