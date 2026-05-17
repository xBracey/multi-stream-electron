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
      const stream = parseInt(btn.dataset.stream);
      btn.classList.toggle('active', stream === data.focused);
    });
    
    focused = data.focused;
    
    // Store mute positions
    if (data.mutePositions) {
      mutePositions = data.mutePositions;
      updateMuteIndicators();
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
  
  if (data.type === 'mutePosition') {
    mutePositions = data.mutePositions;
    updateMuteIndicators();
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

// Audio Focus buttons - robot clicks center, mutes others
document.querySelectorAll('.focus-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    // Send command: robot clicks center of this stream, mutes all others
    send('audioFocus', { stream });
  };
});

// Autoplay all button - robot clicks center of all streams
document.getElementById('autoplayAllBtn')?.addEventListener('click', () => {
  send('autoplay');
});

// Refresh buttons
document.querySelectorAll('.refresh-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('refresh', { stream });
  };
});

document.getElementById('refreshAll')?.addEventListener('click', () => {
  send('refresh', { stream: 'all' });
});

// Playback buttons - robot clicks center of specific stream
document.querySelectorAll('.play-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('autoplay', { stream });
  };
});

// Fullscreen buttons
document.querySelectorAll('.fullscreen-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('fullscreen', { stream });
  };
});

document.getElementById('exitFullscreenBtn')?.addEventListener('click', () => {
  send('exitfullscreen');
});

// Record buttons - start recording mode for a specific stream
document.querySelectorAll('.record-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('startRecord', { stream });
  };
});

// Apply to all button
document.getElementById('applyToAllBtn')?.addEventListener('click', () => {
  const firstSaved = mutePositions.find(p => p);
  if (firstSaved) {
    send('applyToAllStreams', { x: firstSaved.x, y: firstSaved.y });
  } else {
    alert('Record a position on at least one stream first!');
  }
});

// Reset all mute positions button
document.getElementById('resetMuteBtn')?.addEventListener('click', () => {
  if (confirm('Reset all mute button positions?')) {
    mutePositions = [null, null, null, null];
    send('resetmutePosition');
    updateMuteIndicators();
  }
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

// Add CSS
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
  .focus-btn.active { background: #4ecca3 !important; color: #0a0a0f !important; }
`;
document.head.appendChild(style);