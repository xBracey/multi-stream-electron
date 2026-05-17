// WebSocket client for control panel

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}`);

// Status element
const statusEl = document.getElementById('status');

// Connection status
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

// Handle state updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'state') {
    document.querySelectorAll('.focus-btn').forEach(btn => {
      const stream = parseInt(btn.dataset.stream);
      btn.classList.toggle('active', stream === data.focused);
    });
  }
};

// Helper to send commands
function send(type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

// Focus buttons
document.querySelectorAll('.focus-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('focus', { stream });
  };
});

// Refresh buttons
document.querySelectorAll('.refresh-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('refresh', { stream });
  };
});

// Refresh all
document.getElementById('refreshAll')?.addEventListener('click', () => {
  send('refresh', { stream: 'all' });
});

// Fullscreen buttons
document.querySelectorAll('.fullscreen-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('fullscreen', { stream });
  };
});

// Exit fullscreen button
document.getElementById('exitFullscreenBtn')?.addEventListener('click', () => {
  send('exitfullscreen');
});

// Enable autoplay button
document.getElementById('enableAutoplayBtn')?.addEventListener('click', () => {
  send('click');
});

// Mute buttons - click in bottom-right corner to mute
document.querySelectorAll('.mute-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    // Click at bottom-right corner (assuming 100x100 is the video size, click at 90,90)
    send('clickPosition', { stream, x: 90, y: 90 });
  };
});

// Play buttons
document.querySelectorAll('.play-btn').forEach(btn => {
  btn.onclick = () => {
    const stream = parseInt(btn.dataset.stream);
    send('play', { stream });
  };
});

// Pause all
document.getElementById('pauseAll')?.addEventListener('click', () => {
  send('pause', { stream: 'all' });
});

// Play all
document.getElementById('playAll')?.addEventListener('click', () => {
  send('play', { stream: 'all' });
});