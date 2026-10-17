const { spawnSync } = require("child_process");

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(build.status ?? 0);
