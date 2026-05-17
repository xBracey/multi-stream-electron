const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

let mainWindow;
let config = {
  streams: ['', '', '', ''],
  focused: 0
};

// HTTP server to serve control UI
const server = http.createServer((req, res) => {
  let filePath;
  let contentType = 'text/html';

  if (req.url === '/' || req.url === '/index.html') {
    filePath = path.join(__dirname, 'public', 'index.html');
  } else if (req.url === '/config') {
    filePath = path.join(__dirname, 'public', 'config.html');
  } else if (req.url === '/control.js') {
    filePath = path.join(__dirname, 'public', 'control.js');
    contentType = 'application/javascript';
  } else if (req.url === '/styles.css') {
    filePath = path.join(__dirname, 'public', 'styles.css');
    contentType = 'text/css';
  } else {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// WebSocket server for real-time commands
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send current state on connect
  ws.send(JSON.stringify({
    type: 'state',
    streams: config.streams,
    focused: config.focused
  }));

  ws.on('message', (message) => {
    try {
      const cmd = JSON.parse(message);
      handleCommand(cmd, ws);
    } catch (e) {
      console.error('Invalid command:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

function handleCommand(cmd, sender) {
  switch (cmd.type) {
    case 'focus':
      config.focused = cmd.stream;
      broadcast({ type: 'state', streams: config.streams, focused: config.focused });
      mainWindow?.webContents.send('focus', cmd.stream);
      break;

    case 'refresh':
      mainWindow?.webContents.send('refresh', cmd.stream === 'all' ? 'all' : parseInt(cmd.stream));
      break;

    case 'play':
      mainWindow?.webContents.send('play', cmd.stream === 'all' ? 'all' : parseInt(cmd.stream));
      break;

    case 'exitfullscreen':
      mainWindow?.webContents.send('exitfullscreen');
      break;

    case 'click':
      mainWindow?.webContents.send('click');
      break;

    case 'clickPosition':
      mainWindow?.webContents.send('clickPosition', { stream: cmd.stream, x: cmd.x, y: cmd.y });
      break;

    case 'pause':
      mainWindow?.webContents.send('pause', cmd.stream === 'all' ? 'all' : parseInt(cmd.stream));
      break;

    case 'fullscreen':
      config.focused = cmd.stream;
      broadcast({ type: 'state', streams: config.streams, focused: config.focused });
      mainWindow?.webContents.send('fullscreen', parseInt(cmd.stream));
      break;

    case 'config':
      if (cmd.action === 'get') {
        sender.send(JSON.stringify({
          type: 'config',
          streams: config.streams
        }));
      } else if (cmd.action === 'set') {
        config.streams = cmd.streams;
        saveConfig();
        broadcast({ type: 'state', streams: config.streams, focused: config.focused });
        mainWindow?.webContents.send('config', config.streams);
      }
      break;
  }
}

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      config = { ...config, ...JSON.parse(data) };
    }
  } catch (e) {
    console.log('No saved config, using defaults');
  }
}

function saveConfig() {
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false // Disable webview tag for security
    }
  });

  // Block popups and new windows
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
  
  // Block popup windows
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Prevent navigation to new URLs (popup redirects)
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Get initial config via IPC
ipcMain.handle('getConfig', () => config);

// Handle config updates from renderer
ipcMain.on('updateStreams', (_, streams) => {
  config.streams = streams;
  saveConfig();
});
function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.whenReady().then(() => {
  loadConfig();

  // Start HTTP/WS server
  const PORT = 8765;
  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 Multi-Stream Electron App');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📺 Display: Fullscreen on local monitor`);
    console.log(`📱 Control: http://${ip}:${PORT}`);
    console.log(`⚙️  Config:  http://${ip}:${PORT}/config`);
    console.log('═══════════════════════════════════════════════════════════');
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});