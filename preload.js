const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openExcel: () => ipcRenderer.invoke("open-excel-dialog"),
  openExcelImg: () => ipcRenderer.invoke("open-excel-dialog-img"),
  generateVideos: (data) => ipcRenderer.invoke("generate-videos", data),
  generateImage: (data) => ipcRenderer.invoke("generate-images", data),
  loginAccount: (acc) => ipcRenderer.invoke("login-account", acc),

  // Lưu config
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),

  // Load config
  loadConfig: () => ipcRenderer.invoke("load-config"),
  onDone: (callback) => ipcRenderer.on("done", callback),
  onDoneImg: (callback) => ipcRenderer.on("doneImg", callback),
  onProgress: (callback) => ipcRenderer.on("progress", callback),
  onProgressImg: (callback) => ipcRenderer.on("progressImg", callback),
  on: (ch, callback) => ipcRenderer.on(ch, callback),
  login: (data) => ipcRenderer.invoke("login", data),
  getCurrentUser: () => ipcRenderer.invoke("getCurrentUser"),
  getUsers: () => ipcRenderer.invoke("getUsers"),
  addUser: (data) => ipcRenderer.invoke("addUser", data),
  editUser: (data) => ipcRenderer.invoke("editUser", data),
  deleteUser: (data) => ipcRenderer.invoke("deleteUser", data)
});
