const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nccsDesktop", {
  setupState: () => ipcRenderer.invoke("nccs:setup-state"),
  verifyLicense: (key) => ipcRenderer.invoke("nccs:verify-license", key),
  createAdmin: (payload) => ipcRenderer.invoke("nccs:create-admin", payload),
});
