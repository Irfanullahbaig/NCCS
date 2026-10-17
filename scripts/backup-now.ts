import { createBackup } from "../src/lib/backup";

async function main() {
  const backup = await createBackup("manual");
  console.log(`Wrote ${backup.filename} (${backup.counts.students} students, ${backup.counts.staff} staff)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
