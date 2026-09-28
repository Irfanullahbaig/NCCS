const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const TABLES = [
  "User",
  "Setting",
  "Sequence",
  "AcademicYear",
  "Program",
  "Subject",
  "Class",
  "ClassSubject",
  "Staff",
  "StaffSubject",
  "StaffAssignment",
  "Student",
  "FeeRecord",
  "FeePayment",
  "IncomeTransaction",
  "ExpenseTransaction",
  "SalaryRecord",
  "SalaryPayment",
  "AuditLog",
];

let serverProcess;
let mainWindow;
let appUrl = process.env.NCCS_DESKTOP_URL || "";

function iconPath() {
  const ico = path.join(__dirname, "icons", "icon.ico");
  const png = path.join(__dirname, "icons", "icon.png");
  if (process.platform === "win32" && fs.existsSync(ico)) return ico;
  return fs.existsSync(png) ? png : undefined;
}

function dataDir() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storePath() {
  return path.join(dataDir(), "dummy.json");
}

function configPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function loadSecrets() {
  const file = configPath();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const secrets = {
    AUTH_SECRET: crypto.randomBytes(32).toString("hex"),
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
  };
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2));
  return secrets;
}

function needsSetup() {
  if (!fs.existsSync(storePath())) return true;
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return !Array.isArray(parsed.User) || parsed.User.length === 0;
  } catch {
    return true;
  }
}

function emptyStore() {
  return Object.fromEntries(TABLES.map((table) => [table, []]));
}

function createLocalAdmin({ name, email, password }) {
  const bcrypt = require("bcryptjs");
  const trimmedName = String(name ?? "").trim();
  const trimmedEmail = String(email ?? "").trim().toLowerCase();
  const trimmedPassword = String(password ?? "");
  if (!trimmedName) return { ok: false, error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return { ok: false, error: "Enter a valid email." };
  if (trimmedPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const stamp = new Date().toISOString();
  const year = new Date().getFullYear();
  const adminId = crypto.randomUUID();
  const store = emptyStore();
  store.User = [
    {
      id: adminId,
      name: trimmedName,
      email: trimmedEmail,
      passwordHash: bcrypt.hashSync(trimmedPassword, 12),
      role: "ADMIN",
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: null,
      updatedById: null,
    },
  ];
  store.Setting = [
    { id: crypto.randomUUID(), key: "schoolName", value: "NCCS" },
    { id: crypto.randomUUID(), key: "schoolAddress", value: "" },
    { id: crypto.randomUUID(), key: "schoolPhone", value: "" },
    { id: crypto.randomUUID(), key: "currencyPrefix", value: "Rs." },
  ];
  store.AcademicYear = [
    {
      id: crypto.randomUUID(),
      name: `${year}-${year + 1}`,
      startDate: new Date(Date.UTC(year, 3, 1)).toISOString(),
      endDate: new Date(Date.UTC(year + 1, 2, 31)).toISOString(),
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: adminId,
      updatedById: adminId,
    },
  ];
  store.Program = [
    {
      id: crypto.randomUUID(),
      name: "Local System",
      description: "Local academic system",
      createdAt: stamp,
      updatedAt: stamp,
      createdById: adminId,
      updatedById: adminId,
    },
  ];
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
  return { ok: true };
}

function findPort(start = 47821) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.unref();
    server.on("error", () => {
      if (start > 47921) reject(new Error("No free local port"));
      else findPort(start + 1).then(resolve, reject);
    });
    server.listen(start, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForUrl(url, timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("NCCS local server did not start in time."));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function serverRoot() {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, "app-server") : "",
    path.join(path.dirname(process.execPath), "resources", "app-server"),
    path.join(path.dirname(process.execPath), "app-server"),
    path.join(__dirname, "..", ".next", "standalone"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "server.js"))) return dir;
  }
  return candidates[0] || "";
}

function startLocalServer(port, secrets) {
  const root = serverRoot();
  const serverJs = path.join(root, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`The packaged NCCS server is missing at ${root || "(unknown)"}. Use the new NCCS.exe from dist/.`);
  }
  if (!fs.existsSync(path.join(root, "node_modules", "next"))) {
    throw new Error("The packaged NCCS runtime is incomplete. Use the new NCCS.exe from dist/.");
  }
  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NCCS_USE_DUMMY_DATA: "1",
      NCCS_DATA_DIR: dataDir(),
      AUTH_SECRET: secrets.AUTH_SECRET,
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: secrets.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    },
    stdio: "ignore",
  });
  serverProcess.on("exit", (code) => {
    if (code && mainWindow && !mainWindow.isDestroyed()) {
      console.error(`NCCS server exited with code ${code}`);
    }
  });
}

function stopLocalServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = undefined;
  }
}

function createWindow(url, { setup = false } = {}) {
  mainWindow = new BrowserWindow({
    width: setup ? 520 : 1280,
    height: setup ? 640 : 840,
    minWidth: setup ? 420 : 960,
    minHeight: setup ? 520 : 640,
    title: "NCCS",
    backgroundColor: "#0f2744",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: setup ? path.join(__dirname, "preload.cjs") : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

async function openApp() {
  if (!appUrl) {
    const secrets = loadSecrets();
    const port = await findPort();
    startLocalServer(port, secrets);
    appUrl = `http://127.0.0.1:${port}`;
    await waitForUrl(`${appUrl}/login`);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(appUrl);
    mainWindow.setSize(1280, 840);
    mainWindow.setMinimumSize(960, 640);
    mainWindow.center();
    return;
  }
  createWindow(appUrl);
}

app.setName("NCCS");
app.setAppUserModelId("edu.nccs.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("nccs:create-admin", async (_event, payload) => {
    try {
      const result = createLocalAdmin(payload ?? {});
      if (result.ok) await openApp();
      return result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not start NCCS." };
    }
  });

  app.whenReady().then(async () => {
    try {
      if (needsSetup() && !process.env.NCCS_DESKTOP_URL) {
        createWindow(`file://${path.join(__dirname, "setup.html")}`, { setup: true });
        return;
      }
      await openApp();
    } catch (error) {
      const { dialog } = require("electron");
      await dialog.showErrorBox("NCCS", error instanceof Error ? error.message : "Could not start NCCS.");
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  stopLocalServer();
  app.quit();
});

app.on("before-quit", () => {
  stopLocalServer();
});
