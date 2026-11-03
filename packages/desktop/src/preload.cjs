const { contextBridge, ipcRenderer } = require('electron');

// This preload is not a filesystem/network bridge. It only answers pending editor read requests.
if (process.isMainFrame) {
  const socketUrl = process.argv.find(arg => arg.startsWith('--h3d-socket='))?.slice('--h3d-socket='.length);
  let installed = false;
  contextBridge.exposeInMainWorld('h3dDesktop', {
    socketUrl,
    installReadHandler(callback) {
      if (installed || typeof callback !== 'function') throw new Error('Desktop read handler already installed or invalid');
      installed = true;
      ipcRenderer.on('h3d:read', async (_event, request) => {
        try {
          const result = await callback(request.method, request.args);
          ipcRenderer.send('h3d:read-result', { id: request.id, ok: true, result });
        } catch (error) {
          ipcRenderer.send('h3d:read-result', { id: request.id, ok: false, error: error instanceof Error ? error.message : 'Editor read failed' });
        }
      });
      ipcRenderer.send('h3d:read-ready');
    },
  });
}
