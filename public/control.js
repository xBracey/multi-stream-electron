// WebSocket client for control panel

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}`);

const statusEl = document.getElementById('status');
let mutePositions = [null, null, null, null];
let streams = ['', '', '', ''];
let focused = 0;
let fullscreenStream = null;
let isRecording = false;
let recordStreamIndex = null;

ws.onopen = () => {
  if (statusEl) {
    statusEl.textContent = '🟢 Connected';
    statusEl.className = 'status connected';
  }
};

ws.onclose = () => {
  if (statusEl) {
    statusEl.textContent = '🔴 Disconnected - Reconnecting...';
    statusEl.className = 'status disconnected';
  }
  setTimeout(() => location.reload(), 2000);
};

ws.onerror = () => {
  if (statusEl) {
    statusEl.textContent = '❌ Connection Error';
    statusEl.className = 'status error';
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'state') {
    // Update streams if changed
    if (data.streams) {
      streams = data.streams;
      updateStreamInputs();
    }
    
    // Update focus buttons
    focused = data.focused;
    document.querySelectorAll('.set-focus-btn').forEach(btn => {
      const stream = parseInt(btn.closest('.stream-section').dataset.stream);
      btn.classList.toggle('focus-active', stream === focused);
    });
    
    // Store mute positions and update UI
    if (data.mutePositions) {
      mutePositions = data.mutePositions;
      updateMuteUI();
    }
    
    // Update recording state
    if (data.isRecording !== undefined) {
      isRecording = data.isRecording;
      recordStreamIndex = data.recordStreamIndex;
      updateRecordingUI();
    }
  }
  
  if (data.type === 'recordingInstruction') {
    statusEl.textContent = `🎥 Move mouse to mute button and click on TV!`;
    statusEl.className = 'status recording';
  }
  
  if (data.type === 'fullscreenState') {
    fullscreenStream = data.stream;
    updateFullscreenButtons();
  }
  
  if (data.type === 'state' && data.fullscreenStream !== undefined) {
    fullscreenStream = data.fullscreenStream;
    updateFullscreenButtons();
  }
};

function send(type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

function updateMuteUI() {
  document.querySelectorAll('.stream-section').forEach(section => {
    const stream = parseInt(section.dataset.stream);
    const statusSpan = section.querySelector('.mute-status');
    const muteBtn = section.querySelector('.mute-btn');
    const recordBtn = document.querySelector(`.record-btn[data-stream="${stream}"]`);
    
    if (mutePositions[stream]) {
      if (statusSpan) statusSpan.textContent = `${mutePositions[stream].x}%, ${mutePositions[stream].y}%`;
      if (muteBtn) muteBtn.classList.add('ready');
      if (recordBtn) recordBtn.classList.add('saved');
    } else {
      if (statusSpan) statusSpan.textContent = '-';
      if (muteBtn) muteBtn.classList.remove('ready');
      if (recordBtn) recordBtn.classList.remove('saved');
    }
  });
}

function updateStreamInputs() {
  document.querySelectorAll('.stream-section').forEach((section, i) => {
    const input = section.querySelector('.stream-url');
    if (input && streams[i] !== undefined) {
      input.value = streams[i] || '';
    }
  });
}

function updateRecordingUI() {
  document.querySelectorAll('.record-btn').forEach(btn => {
    const stream = parseInt(btn.dataset.stream);
    btn.classList.toggle('recording', stream === recordStreamIndex && isRecording);
    btn.disabled = isRecording && stream !== recordStreamIndex;
  });
  
  if (isRecording && recordStreamIndex !== null) {
    statusEl.textContent = `🎥 Recording... Click mute button on Stream ${recordStreamIndex + 1}`;
    statusEl.className = 'status recording';
  }
}

function updateFullscreenButtons() {
  document.querySelectorAll('.fullscreen-btn').forEach(btn => {
    const stream = parseInt(btn.closest('.stream-section').dataset.stream);
    btn.classList.toggle('fullscreen-active', stream === fullscreenStream);
    btn.textContent = stream === fullscreenStream ? '✕' : '⛶';
  });
}

// Stream-specific buttons
document.querySelectorAll('.stream-section').forEach(section => {
  const stream = parseInt(section.dataset.stream);
  
  // Stream URL input
  const urlInput = section.querySelector('.stream-url');
  urlInput?.addEventListener('change', () => {
    streams[stream] = urlInput.value;
    send('setStream', { stream, url: urlInput.value });
  });
  urlInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      streams[stream] = urlInput.value;
      send('setStream', { stream, url: urlInput.value });
    }
  });
  
  // Play button
  section.querySelector('.play-btn')?.addEventListener('click', () => {
    send('autoplay', { stream });
  });
  
  // Refresh button
  section.querySelector('.refresh-btn')?.addEventListener('click', () => {
    send('refresh', { stream });
  });
  
  // Set focus button - only updates internal state
  section.querySelector('.set-focus-btn')?.addEventListener('click', () => {
    send('setFocus', { stream });
  });
  
  // Fullscreen button - toggle
  section.querySelector('.fullscreen-btn')?.addEventListener('click', () => {
    if (fullscreenStream === stream) {
      send('exitfullscreen');
    } else {
      send('fullscreen', { stream });
    }
  });
});

// Center section buttons
document.getElementById('playAllBtn')?.addEventListener('click', () => {
  send('autoplay');
});

document.getElementById('refreshAllBtn')?.addEventListener('click', () => {
  send('refresh', { stream: 'all' });
});

document.getElementById('muteAllBtn')?.addEventListener('click', () => {
  send('muteall');
});

// Record buttons
document.querySelectorAll('.record-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const stream = parseInt(btn.dataset.stream);
    send('startRecord', { stream });
  });
});

// Sync focus button - reconciles the mute state to match current focus
document.getElementById('syncFocusBtn')?.addEventListener('click', () => {
  send('syncFocus');
});

// Apply focus button - actually presses the mute buttons to match current focus state
document.getElementById('applyFocusBtn')?.addEventListener('click', () => {
  send('audioFocus', { stream: focused });
});

// Add CSS for shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  .btn.recording {
    background: #ffaa00 !important;
    color: #0a0a0f !important;
    animation: pulse 0.5s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;
document.head.appendChild(style);