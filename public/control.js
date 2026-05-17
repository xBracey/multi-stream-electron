// WebSocket client for control panel

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}`);

const statusEl = document.getElementById('status');
let mutePositions = [null, null, null, null];
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
    document.querySelectorAll('.focus-btn').forEach(btn => {
      const stream = parseInt(btn.dataset.stream);
      btn.classList.toggle('active', stream === data.focused);
    });
    
    if (data.mutePositions) {
      mutePositions = data.mutePositions;
      updateMuteIndicators();
    }
    
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

function updateMuteIndicators() {
  document.querySelectorAll('.record-btn').forEach(btn => {
    const stream = parseInt(btn.dataset.stream);
    if (mutePositions[stream]) {
      btn.classList.add('saved');
      btn.textContent = `✓ S${stream + 1}`;
    } else {
      btn.classList.remove('saved');
      btn.textContent = `🎥 S${stream + 1}`;
    }
  });
  
  document.querySelectorAll('.mute-btn').forEach(btn => {
    const stream = parseInt(btn.dataset.stream);
    btn.classList.toggle('ready', !!mutePositions[stream]);
  });
}

function updateRecordingUI() {
  const section = document.querySelector('.recording-section');
  
  if (isRecording && recordStreamIndex !== null) {
    section.classList.add('recording');
    statusEl.textContent = `🎥 Recording... Click on mute button in Stream ${recordStreamIndex + 1} on TV!`;
    statusEl.className = 'status recording';
    
    document.querySelectorAll('.record-btn').forEach(btn => {
      btn.disabled = parseInt(btn.dataset.stream) !== recordStreamIndex;
    });
  } else {
    section.classList.remove('recording');
    document.querySelectorAll('.record-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
}

// Focus buttons
document.querySelectorAll('.focus-btn').forEach(btn => {
  btn.onclick = () => send('focus', { stream: parseInt(btn.dataset.stream) });
});

// Refresh buttons
document.querySelectorAll('.refresh-btn').forEach(btn => {
  btn.onclick = () => send('refresh', { stream: parseInt(btn.dataset.stream) });
});

document.getElementById('refreshAll')?.addEventListener('click', () => {
  send('refresh', { stream: 'all' });
});

// Fullscreen buttons
document.querySelectorAll('.fullscreen-btn').forEach(btn => {
  btn.onclick = () => send('fullscreen', { stream: parseInt(btn.dataset.stream) });
});

document.getElementById('exitFullscreenBtn')?.addEventListener('click', () => {
  send('exitfullscreen');
});

// Autoplay button
document.getElementById('autoplayBtn')?.addEventListener('click', () => {
  send('autoplay');
});

// Record buttons - start recording mode for a specific stream
document.querySelectorAll('.record-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('startRecord', { stream });
  };
});

// Record all button
document.getElementById('recordAllBtn')?.addEventListener('click', () => {
  alert('Record a position on one stream first, then click "Apply to All Streams" to use the same position.');
});

// Mute buttons
document.querySelectorAll('.mute-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    if (mutePositions[stream]) {
      send('mute', { stream });
    } else {
      btn.style.animation = 'shake 0.5s';
      setTimeout(() => btn.style.animation = '', 500);
    }
  };
});

// Mute all except focused
document.getElementById('muteAllBtn')?.addEventListener('click', () => {
  send('muteall');
});

// Apply to all button
document.getElementById('applyToAllBtn')?.addEventListener('click', () => {
  // Find the first saved position and apply to all
  const firstSaved = mutePositions.find(p => p);
  if (firstSaved) {
    send('applyToAllStreams', { x: firstSaved.x, y: firstSaved.y });
  } else {
    alert('Record a position on at least one stream first!');
  }
});

// Play buttons
document.querySelectorAll('.play-btn').forEach(btn => {
  btn.onclick = () => send('play', { stream: parseInt(btn.dataset.stream) });
});

document.getElementById('pauseAll')?.addEventListener('click', () => {
  send('pause', { stream: 'all' });
});

document.getElementById('playAll')?.addEventListener('click', () => {
  send('play', { stream: 'all' });
});

// Add CSS for recording state
const style = document.createElement('style');
style.textContent = `
  .recording-section { border: 2px solid #ffaa00; }
  .recording-section.recording { animation: pulse 1s infinite; }
  .recording { background: #3d3d0f; }
  @keyframes pulse {
    0%, 100% { border-color: #ffaa00; }
    50% { border-color: #ff6b6b; }
  }
  .status.recording { background: #3d3d0f; color: #ffaa00; }
  .record-btn.saved { background: #4ecca3; color: #0a0a0f; }
  .mute-btn.ready { background: #4ecca3; color: #0a0a0f; }
  .record-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);