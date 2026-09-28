const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nccsDesktop", {
  createAdmin: (payload) => ipcRenderer.invoke("nccs:create-admin", payload),
});
