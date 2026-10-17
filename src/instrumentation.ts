export async function register() {
  if (process.env.VERCEL) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startBackupScheduler } = await import("./lib/backup");
      void startBackupScheduler().catch((error) => {
        console.error("Weekly backup scheduler failed to start", error);
      });
    } catch (error) {
      console.error("Unable to start backup scheduler", error);
    }
  }
}
