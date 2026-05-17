// WebSocket client for control panel

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}`);

const statusEl = document.getElementById('status');
let mutePositions = [null, null, null, null];
let focused = 0;
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
    // Update focus buttons
    document.querySelectorAll('.focus-btn').forEach(btn => {
      const stream = parseInt(btn.closest('.stream-section').dataset.stream);
      btn.classList.toggle('focus-active', stream === data.focused);
    });
    
    focused = data.focused;
    
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

// Stream-specific buttons
document.querySelectorAll('.stream-section').forEach(section => {
  const stream = parseInt(section.dataset.stream);
  
  section.querySelector('.play-btn')?.addEventListener('click', () => {
    send('autoplay', { stream });
  });
  
  section.querySelector('.refresh-btn')?.addEventListener('click', () => {
    send('refresh', { stream });
  });
  
  section.querySelector('.focus-btn')?.addEventListener('click', () => {
    send('audioFocus', { stream });
  });
  
  section.querySelector('.fullscreen-btn')?.addEventListener('click', () => {
    send('fullscreen', { stream });
  });
  
  section.querySelector('.mute-btn')?.addEventListener('click', () => {
    if (mutePositions[stream]) {
      send('mute', { stream });
    } else {
      // Shake animation
      const btn = section.querySelector('.mute-btn');
      btn.style.animation = 'shake 0.3s';
      setTimeout(() => btn.style.animation = '', 300);
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

// Exit fullscreen
document.getElementById('exitFullscreenBtn')?.addEventListener('click', () => {
  send('exitfullscreen');
});

// Record buttons
document.querySelectorAll('.record-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const stream = parseInt(btn.dataset.stream);
    send('startRecord', { stream });
  });
});

// Apply to all / Reset
document.getElementById('applyToAllBtn')?.addEventListener('click', () => {
  const firstSaved = mutePositions.find(p => p);
  if (firstSaved) {
    send('applyToAllStreams', { x: firstSaved.x, y: firstSaved.y });
  } else {
    alert('Record a position on at least one stream first!');
  }
});

document.getElementById('resetMuteBtn')?.addEventListener('click', () => {
  if (confirm('Reset all mute button positions?')) {
    mutePositions = [null, null, null, null];
    send('resetmutePosition');
    updateMuteUI();
  }
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