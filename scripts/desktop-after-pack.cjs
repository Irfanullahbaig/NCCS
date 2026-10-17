const fs = require("fs");
const path = require("path");

function serverDest(appOutDir, platform, productFilename) {
  if (platform === "darwin") {
    const bundled = path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources", "app-server");
    if (fs.existsSync(path.join(appOutDir, `${productFilename}.app`))) return bundled;
    if (fs.existsSync(path.join(appOutDir, "Contents"))) {
      return path.join(appOutDir, "Contents", "Resources", "app-server");
    }
    return bundled;
  }
  return path.join(appOutDir, "resources", "app-server");
}

function copyServer(appOutDir, projectDir, platform, productFilename) {
  const src = path.join(projectDir, ".next", "standalone");
  const dest = serverDest(appOutDir, platform, productFilename);
  if (!fs.existsSync(path.join(src, "server.js"))) {
    throw new Error("Next.js standalone server.js is missing. Run a desktop build first.");
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  for (const name of [".env", ".env.local", ".data"]) {
    const extra = path.join(dest, name);
    if (fs.existsSync(extra)) fs.rmSync(extra, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(dest, "server.js"))) {
    throw new Error("Packaged server.js is missing after copy.");
  }
  if (!fs.existsSync(path.join(dest, "node_modules", "next"))) {
    throw new Error("Packaged Next.js runtime is missing after copy.");
  }
}

exports.default = async function afterPack(context) {
  copyServer(
    context.appOutDir,
    context.packager.projectDir,
    context.electronPlatformName,
    context.packager.appInfo.productFilename,
  );
};
