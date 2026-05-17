const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');

let mainWindow;
let config = {
  streams: ['', '', '', ''],
  focused: 0
};

let mutePositions = [null, null, null, null];
let isRecordingMode = false;
let recordStreamIndex = null;
let fullscreenStream = null;

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

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.send(JSON.stringify({
    type: 'state',
    streams: config.streams,
    focused: config.focused,
    mutePositions: mutePositions,
    isRecording: isRecordingMode,
    recordStreamIndex: recordStreamIndex,
    fullscreenStream: fullscreenStream
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
      broadcastState();
      mainWindow?.webContents.send('focus', cmd.stream);
      break;

    case 'refresh':
      mainWindow?.webContents.send('refresh', cmd.stream === 'all' ? 'all' : parseInt(cmd.stream));
      break;

    case 'play':
      mainWindow?.webContents.send('play', cmd.stream === 'all' ? 'all' : parseInt(cmd.stream));
      break;

    case 'exitfullscreen':
      fullscreenStream = null;
      mainWindow?.webContents.send('exitfullscreen');
      broadcastState();
      break;

    case 'autoplay':
      if (cmd.stream !== undefined) {
        clickAllQuadrants(50, 50, parseInt(cmd.stream));
      } else {
        clickAllQuadrants(50, 50);
      }
      break;

    case 'fullscreen':
      fullscreenStream = cmd.stream;
      config.focused = cmd.stream;
      broadcastState();
      mainWindow?.webContents.send('fullscreen', parseInt(cmd.stream));
      break;

    case 'mute':
      if (cmd.stream !== undefined && mutePositions[cmd.stream]) {
        clickOnStream(cmd.stream, mutePositions[cmd.stream].x, mutePositions[cmd.stream].y);
      }
      break;

    case 'audioFocus':
      // Mute all other streams, unmute the selected one
      const focusStream = cmd.stream;
      config.focused = focusStream;
      
      // Click mute button of focused stream to unmute (toggle)
      if (mutePositions[focusStream]) {
        clickOnStream(focusStream, mutePositions[focusStream].x, mutePositions[focusStream].y);
      }
      
      // Mute all other streams (with delay between each)
      let focusDelay = 250;
      mutePositions.forEach((pos, i) => {
        if (pos && i !== focusStream) {
          setTimeout(() => clickOnStream(i, pos.x, pos.y), focusDelay);
          focusDelay += 250;
        }
      });
      
      broadcastState();
      mainWindow?.webContents.send('focus', focusStream);
      break;

    case 'muteall':
      let muteDelay = 0;
      mutePositions.forEach((pos, i) => {
        if (pos && i !== config.focused) {
          setTimeout(() => clickOnStream(i, pos.x, pos.y), muteDelay);
          muteDelay += 250;
        }
      });
      break;

    case 'startRecord':
      startRecording(cmd.stream);
      break;

    case 'stopRecord':
      stopRecording();
      break;

    case 'clickCaptured':
      captureClickPosition();
      break;

    case 'setmutePosition':
      if (cmd.stream !== undefined && cmd.x !== undefined && cmd.y !== undefined) {
        mutePositions[cmd.stream] = { x: cmd.x, y: cmd.y };
        saveMutePositions();
        broadcastState();
      }
      break;

    case 'applyToAllStreams':
      if (cmd.x !== undefined && cmd.y !== undefined) {
        mutePositions = mutePositions.map(() => ({ x: cmd.x, y: cmd.y }));
        saveMutePositions();
        broadcastState();
      }
      break;

    case 'resetmutePosition':
      mutePositions = [null, null, null, null];
      saveMutePositions();
      broadcastState();
      console.log('Robot: All mute positions reset');
      break;

    case 'setStream':
      if (cmd.stream !== undefined && cmd.url !== undefined) {
        config.streams[cmd.stream] = cmd.url;
        saveConfig();
        mainWindow?.webContents.send('setStream', { stream: cmd.stream, url: cmd.url });
        broadcastState();
      }
      break;

    case 'setFocus':
      // Only update internal state, don't press any mute buttons
      config.focused = cmd.stream;
      broadcastState();
      console.log(`Robot: Focus set to stream ${cmd.stream + 1} (no mute buttons pressed)`);
      break;


    case 'syncFocus':
      // Apply the current focus state to mute buttons
      const syncFocused = config.focused;
      console.log(`Robot: Syncing focus. Current focus: Stream ${syncFocused + 1}`);
      
      // Click mute button of focused stream to ensure it's unmuted
      if (mutePositions[syncFocused]) {
        clickOnStream(syncFocused, mutePositions[syncFocused].x, mutePositions[syncFocused].y);
      }
      
      // Mute all other streams
      let syncDelay = 250;
      mutePositions.forEach((pos, i) => {
        if (pos && i !== syncFocused) {
          setTimeout(() => clickOnStream(i, pos.x, pos.y), syncDelay);
          syncDelay += 250;
        }
      });
      
      console.log(`Robot: Sync complete. Stream ${syncFocused + 1} unmuted, others muted.`);
      break;

    case 'config':
      if (cmd.action === 'get') {
        sender.send(JSON.stringify({
          type: 'config',
          streams: config.streams,
          mutePositions: mutePositions
        }));
      } else if (cmd.action === 'set') {
        config.streams = cmd.streams;
        saveConfig();
        broadcastState();
        mainWindow?.webContents.send('config', config.streams);
      }
      break;
  }
}

function startRecording(stream) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  isRecordingMode = true;
  recordStreamIndex = stream;
  
  // Move mouse to center of the stream's quadrant
  const bounds = mainWindow.getBounds();
  const quadrantWidth = bounds.width / 2;
  const quadrantHeight = bounds.height / 2;
  
  const quadrantX = stream % 2;
  const quadrantY = Math.floor(stream / 2);
  
  const centerX = bounds.x + (quadrantX * quadrantWidth) + (quadrantWidth * 0.5);
  const centerY = bounds.y + (quadrantY * quadrantHeight) + (quadrantHeight * 0.5);
  
  robot.moveMouse(centerX, centerY);
  
  // Notify renderer to show recording UI
  mainWindow?.webContents.send('startRecord', stream);
  broadcastState();
  
  console.log(`Robot: Recording started for stream ${stream + 1}. Click on TV at mute button position.`);
}

function captureClickPosition() {
  console.log('Robot: captureClickPosition called', { isRecordingMode, recordStreamIndex });
  
  if (!isRecordingMode || recordStreamIndex === null) {
    console.log('Robot: Not in recording mode, ignoring click');
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  // Get current mouse position
  const mousePos = robot.getMousePos();
  console.log('Robot: Mouse position:', mousePos);
  
  const bounds = mainWindow.getBounds();
  console.log('Robot: Window bounds:', bounds);
  
  // Calculate percentage within the stream's quadrant
  const quadrantWidth = bounds.width / 2;
  const quadrantHeight = bounds.height / 2;
  
  const quadX = recordStreamIndex % 2;
  const quadY = Math.floor(recordStreamIndex / 2);
  
  const quadrantLeft = quadX * quadrantWidth;
  const quadrantTop = quadY * quadrantHeight;
  
  // Position relative to quadrant
  const relToQuadX = mousePos.x - bounds.x - quadrantLeft;
  const relToQuadY = mousePos.y - bounds.y - quadrantTop;
  
  // Convert to percentage (0-100)
  const xPercent = Math.round((relToQuadX / quadrantWidth) * 100);
  const yPercent = Math.round((relToQuadY / quadrantHeight) * 100);
  
  // Clamp to 0-100
  const x = Math.max(0, Math.min(100, xPercent));
  const y = Math.max(0, Math.min(100, yPercent));
  
  // Save position
  const capturedStream = recordStreamIndex;
  mutePositions[capturedStream] = { x, y };
  saveMutePositions();
  
  // Clean up
  isRecordingMode = false;
  const savedX = x, savedY = y;
  recordStreamIndex = null;
  
  // Notify
  mainWindow?.webContents.send('mutePositionCaptured', { stream: capturedStream, x: savedX, y: savedY });
  broadcastState();
  
  console.log(`Robot: Mute position captured for stream ${capturedStream + 1}: (${savedX}%, ${savedY}%) at screen (${mousePos.x}, ${mousePos.y})`);
}

function stopRecording() {
  isRecordingMode = false;
  recordStreamIndex = null;
  mainWindow?.webContents.send('stopRecord');
  broadcastState();
  console.log('Robot: Recording stopped');
}

// Click on stream at specific percentage position
function clickOnStream(stream, xPercent, yPercent) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const bounds = mainWindow.getBounds();
  const quadrantWidth = bounds.width / 2;
  const quadrantHeight = bounds.height / 2;
  
  const quadrantX = stream % 2;
  const quadrantY = Math.floor(stream / 2);
  
  const targetX = bounds.x + (quadrantX * quadrantWidth) + (quadrantWidth * xPercent / 100);
  const targetY = bounds.y + (quadrantY * quadrantHeight) + (quadrantHeight * yPercent / 100);
  
  robot.moveMouse(targetX, targetY);
  robot.mouseClick();
  
  console.log(`Robot: Clicked stream ${stream + 1} at (${xPercent}%, ${yPercent}%)`);
}

// Click all quadrants (optionally single stream)
function clickAllQuadrants(xPercent = 50, yPercent = 50, singleStream = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const bounds = mainWindow.getBounds();
  const quadrantWidth = bounds.width / 2;
  const quadrantHeight = bounds.height / 2;
  
  const streamsToClick = singleStream !== null ? [singleStream] : [0, 1, 2, 3];
  
  const positions = [
    { stream: 0, x: bounds.x + quadrantWidth * 0.5, y: bounds.y + quadrantHeight * 0.5 },
    { stream: 1, x: bounds.x + quadrantWidth * 1.5, y: bounds.y + quadrantHeight * 0.5 },
    { stream: 2, x: bounds.x + quadrantWidth * 0.5, y: bounds.y + quadrantHeight * 1.5 },
    { stream: 3, x: bounds.x + quadrantWidth * 1.5, y: bounds.y + quadrantHeight * 1.5 },
  ];
  
  let delay = 0;
  streamsToClick.forEach((streamIdx) => {
    const pos = positions[streamIdx];
    setTimeout(() => {
      robot.moveMouse(pos.x, pos.y);
      robot.mouseClick();
      console.log(`Robot: Clicked stream ${streamIdx + 1} at center`);
    }, delay);
    delay += 250; // 0.25 seconds between each click
  });
}

function startAutoClick() {
  setTimeout(() => {
    console.log('Robot: Initial autoplay click');
    clickAllQuadrants();
  }, 5000);
}

function broadcastState() {
  const message = JSON.stringify({
    type: 'state',
    streams: config.streams,
    focused: config.focused,
    mutePositions: mutePositions,
    isRecording: isRecordingMode,
    recordStreamIndex: recordStreamIndex,
    fullscreenStream: fullscreenStream
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
  } catch (e) {}
}

function saveConfig() {
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
}

function loadMutePositions() {
  const mutePath = path.join(__dirname, 'mute-positions.json');
  try {
    if (fs.existsSync(mutePath)) {
      mutePositions = JSON.parse(fs.readFileSync(mutePath, 'utf8'));
    }
  } catch (e) {}
}

function saveMutePositions() {
  fs.writeFileSync(path.join(__dirname, 'mute-positions.json'), JSON.stringify(mutePositions, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    startAutoClick();
  });
}

ipcMain.handle('getConfig', () => ({ ...config, mutePositions }));

ipcMain.on('updateStreams', (_, streams) => {
  config.streams = streams;
  saveConfig();
});

// Handle user click during recording mode
ipcMain.on('userClicked', () => {
  console.log('Robot: userClicked received in main');
  if (isRecordingMode && recordStreamIndex !== null) {
    captureClickPosition();
  }
});

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
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
  loadMutePositions();

  const PORT = 8765;
  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 Multi-Stream Electron App');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📺 Display: Fullscreen on local monitor`);
    console.log(`📱 Control: http://${ip}:${PORT}`);
    console.log(`⚙️  Config:  http://${ip}:${PORT}/config`);
    console.log('🤖 Robot ready (initial click in 5s)');
    
    const savedMutes = mutePositions.filter(p => p).length;
    if (savedMutes > 0) {
      console.log(`🔇 Mute positions saved for ${savedMutes} streams`);
    }
    
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