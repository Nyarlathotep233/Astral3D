import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, safeStorage, session } from 'electron';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, isAppUrl, resolveAppRequest, validateSettings } from './security.mjs';
import { EDITOR_TOOLS, startMcp } from './mcp.mjs';
import { createLocalImportAccess, IMPORT_PREFIX } from './localImports.mjs';

app.setName('H3D Desktop');
if (process.env.H3D_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.H3D_DESKTOP_USER_DATA));
protocol.registerSchemesAsPrivileged([{ scheme: 'h3d', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();

const windows = new Map();
const pending = new Map();
const localImports = createLocalImportAccess();
let settings;
let mcp;
let token;
let mcpError = '';
const root = app.isPackaged ? path.join(process.resourcesPath, 'editor') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../editor/dist');

async function loadSettings() {
  const dir = app.getPath('userData');
  await mkdir(dir, { recursive: true });
  const configPath = path.join(dir, 'settings.json');
  let source;
  try { source = await readFile(configPath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    source = JSON.stringify({ serviceUrl: 'http://127.0.0.1:8080', socketUrl: 'ws://127.0.0.1:8080/api/sys/ws', mcpPort: 8098 }, null, 2);
    await writeFile(configPath, source, { flag: 'wx' });
  }
  settings = validateSettings(JSON.parse(source));
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure local credential storage is unavailable');
  const secretPath = path.join(dir, 'mcp-token.bin');
  try { token = (await safeStorage.decryptStringAsync(await readFile(secretPath))).result; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('hex');
    await writeFile(secretPath, await safeStorage.encryptStringAsync(token), { flag: 'wx', mode: 0o600 });
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid MCP credential');
}

function trustedSender(event) {
  return windows.has(event.sender.id) && event.senderFrame === event.sender.mainFrame && isAppUrl(event.senderFrame.url);
}

function rejectWindowRequests(entry, reason) {
  for (const [id, request] of pending) {
    if (request.entry !== entry) continue;
    clearTimeout(request.timer);
    request.reject(new Error(reason));
    pending.delete(id);
  }
}

async function callWindow(sessionId, method, args) {
  const entry = [...windows.values()].find(item => item.id === sessionId);
  if (!entry || entry.window.isDestroyed()) throw new Error('Editor session expired; list sessions again');
  if (!entry.ready) throw new Error('Editor bridge is not ready');
  if (pending.size >= 16) throw new Error('Too many pending editor requests');
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Editor request timed out')); }, 30_000);
    pending.set(id, { entry, resolve, reject, timer });
    entry.window.webContents.send('h3d:read', { id, method, args });
  });
}

async function listWindows() {
  return Promise.all([...windows.values()].map(async entry => {
    const base = { sessionId: entry.id, title: entry.window.getTitle(), bridgeReady: entry.ready };
    if (!entry.ready) return base;
    try { return { ...base, ...await callWindow(entry.id, 'status', {}) }; }
    catch (error) { return { ...base, error: error.message }; }
  }));
}

function createWindow(url = `${APP_ORIGIN}/#/`) {
  const win = new BrowserWindow({
    title: 'H3D Desktop', width: 1440, height: 960, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs'),
      nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      additionalArguments: [`--h3d-socket=${settings.socketUrl}`],
    },
  });
  const entry = { id: randomUUID(), ready: false, window: win };
  const contentsId = win.webContents.id;
  windows.set(contentsId, entry);
  win.webContents.on('did-start-navigation', (_event, _url, sameDocument, mainFrame) => {
    if (!mainFrame || sameDocument) return;
    rejectWindowRequests(entry, 'Editor navigated; request was not completed');
    entry.ready = false;
    entry.id = randomUUID();
  });
  win.webContents.on('render-process-gone', () => { entry.ready = false; rejectWindowRequests(entry, 'Editor process exited'); });
  win.webContents.on('will-navigate', (event, target) => { if (!isAppUrl(target)) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isAppUrl(target)) createWindow(target);
    return { action: 'deny' };
  });
  win.on('closed', () => { rejectWindowRequests(entry, 'Editor closed'); windows.delete(contentsId); });
  void win.loadURL(url).catch(error => console.error('[H3D Desktop] Window load failed:', error.message));
  return win;
}

async function handleAppRequest(request) {
  try {
    if (isAppUrl(request.url) && new URL(request.url).pathname.startsWith(IMPORT_PREFIX)) return await localImports.respond(request.url, request.method);
    const target = resolveAppRequest(request.url, root, settings.serviceUrl);
    if (target.kind === 'file') {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      await access(target.path);
      return net.fetch(pathToFileURL(target.path).href);
    }
    const headers = new Headers(request.headers);
    for (const name of ['host', 'connection', 'content-length', 'origin', 'referer']) headers.delete(name);
    const response = await net.fetch(target.url, {
      method: request.method, headers, redirect: 'manual',
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: request.body, duplex: 'half' }),
    });
    // Do not follow upstream redirects to arbitrary hosts or silently turn a POST into a GET.
    if (response.status >= 300 && response.status < 400) return new Response('Business service redirect requires configuration', { status: 502 });
    const outgoing = new Headers(response.headers);
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) outgoing.delete(name);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
  } catch (error) {
    console.error('[H3D Desktop] Resource request failed:', error.message);
    return new Response('Resource request failed', { status: error.code === 'ENOENT' ? 404 : 502 });
  }
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [{ label: '场景列表', click: () => createWindow() }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'MCP', submenu: [
      { label: '连接信息', click: () => void dialog.showMessageBox({ type: mcp ? 'info' : 'error', title: 'H3D MCP', message: mcp ? `http://127.0.0.1:${mcp.port}/mcp` : 'MCP 未启动', detail: mcp ? `场景查询与内存批量编辑已启用（不自动保存）\n配置目录：${app.getPath('userData')}` : mcpError }) },
      { label: '复制配置', enabled: !!mcp, click: () => clipboard.writeText(JSON.stringify({ mcpServers: { h3d: { url: `http://127.0.0.1:${mcp.port}/mcp`, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)) },
    ] },
  ]));
}

if (locked) {
  app.on('second-instance', () => { const win = [...windows.values()][0]?.window; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (mcp) { void mcp.close(); mcp = undefined; } });
  app.whenReady().then(async () => {
    await loadSettings();
    await access(path.join(root, 'index.html'));
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('h3d', handleAppRequest);
    ipcMain.on('h3d:read-ready', event => { if (trustedSender(event)) windows.get(event.sender.id).ready = true; });
    ipcMain.on('h3d:read-result', (event, message) => {
      if (!trustedSender(event) || !message || typeof message.id !== 'string') return;
      const request = pending.get(message.id);
      if (!request || request.entry !== windows.get(event.sender.id)) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.ok === true) request.resolve(message.result);
      else request.reject(new Error(typeof message.error === 'string' ? message.error.slice(0, 2000) : 'Editor request failed'));
    });
    try {
      mcp = await startMcp({ port: settings.mcpPort, token, bridge: { list: listWindows, call: async (id, method, args) => {
        if (!Object.hasOwn(EDITOR_TOOLS, method)) throw new Error('Unknown editor tool');
        if (method === 'h3d_model_prepare') args = { ...args, resolvedLocal: await localImports.prepare(args.filePath) };
        if (method === 'h3d_import_prepare' && args.source.type === 'local-prefab') args = { ...args, resolvedLocal: await localImports.prepare(args.source.filePath, 'prefab') };
        return callWindow(id, method, args);
      } } });
    } catch (error) { mcpError = error.message; console.error('[H3D Desktop] MCP start failed:', mcpError); }
    installMenu();
    createWindow();
  }).catch(error => { dialog.showErrorBox('H3D Desktop 启动失败', error.message); app.quit(); });
}
