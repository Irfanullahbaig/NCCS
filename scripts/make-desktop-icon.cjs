const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const svg = path.join(root, "desktop", "icon.svg");
const icons = path.join(root, "desktop", "icons");
const png = path.join(icons, "icon.png");
const ico = path.join(icons, "icon.ico");

function writeIco(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  fs.writeFileSync(ico, Buffer.concat([header, entry, pngBuffer]));
}

fs.mkdirSync(icons, { recursive: true });

if (process.platform === "darwin") {
  const preview = spawnSync("qlmanage", ["-t", "-s", "256", "-o", icons, svg], { encoding: "utf8" });
  const generated = path.join(icons, "icon.svg.png");
  if (preview.status === 0 && fs.existsSync(generated)) {
    fs.renameSync(generated, png);
  }
}

if (!fs.existsSync(png)) {
  throw new Error("Could not create desktop/icons/icon.png from the NCCS mark.");
}

writeIco(fs.readFileSync(png));
console.log("Wrote", png);
console.log("Wrote", ico);

if (process.platform === "darwin") {
  const large = spawnSync("qlmanage", ["-t", "-s", "1024", "-o", icons, svg], { encoding: "utf8" });
  const generatedLarge = path.join(icons, "icon.svg.png");
  const source = fs.existsSync(generatedLarge) ? generatedLarge : png;
  const iconset = path.join(icons, "icon.iconset");
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  const sizes = [16, 32, 128, 256, 512];
  for (const size of sizes) {
    spawnSync("sips", ["-z", String(size), String(size), source, "--out", path.join(iconset, `icon_${size}x${size}.png`)]);
    spawnSync("sips", ["-z", String(size * 2), String(size * 2), source, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)]);
  }
  const icns = path.join(icons, "icon.icns");
  const made = spawnSync("iconutil", ["-c", "icns", iconset, "-o", icns], { encoding: "utf8" });
  if (made.status === 0 && fs.existsSync(icns)) console.log("Wrote", icns);
  if (fs.existsSync(generatedLarge)) fs.unlinkSync(generatedLarge);
  fs.rmSync(iconset, { recursive: true, force: true });
}
