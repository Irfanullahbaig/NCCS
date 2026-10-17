const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

run("node", [path.join("scripts", "make-desktop-icon.cjs")]);
if (!process.argv.includes("--skip-next") || !fs.existsSync(path.join(standalone, "server.js"))) {
  run("npx", ["next", "build"], { NCCS_DESKTOP_BUILD: "1" });
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Next.js standalone server.js was not produced.");
  process.exit(1);
}

copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standalone, "public"));

const targets = process.argv.includes("--mac")
  ? ["--mac", "dmg"]
  : ["--win", "portable", "--x64"];

run("npx", [
  "electron-builder",
  ...targets,
  "--config.directories.output=dist",
], {
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});
