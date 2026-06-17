/**
 * popup.js
 * Logic for the extension toolbar popup.
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────
const guidanceToggle = document.getElementById('guidanceToggle');
const voiceToggle    = document.getElementById('voiceToggle');
const statusPill     = document.getElementById('statusPill');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const demoBtn        = document.getElementById('demoBtn');
const stopVoiceBtn   = document.getElementById('stopVoiceBtn');
const apiKeyInput    = document.getElementById('apiKeyInput');
const apiKeySave     = document.getElementById('apiKeySave');
const apiStatusDot   = document.getElementById('apiStatusDot');
const apiHint        = document.getElementById('apiHint');

// ── Load saved settings ───────────────────────────────────────────────────
chrome.storage.sync.get(
  { guidanceEnabled: false, voiceEnabled: true, claudeApiKey: '' },
  (s) => {
    guidanceToggle.checked = s.guidanceEnabled;
    voiceToggle.checked    = s.voiceEnabled;
    updateStatus(s.guidanceEnabled);

    if (s.claudeApiKey) {
      // Show masked key
      apiKeyInput.value = maskKey(s.claudeApiKey);
      apiKeyInput.dataset.saved = 'true';
      setApiStatus(true);
    } else {
      setApiStatus(false);
    }
  }
);

// ── Guidance toggle ───────────────────────────────────────────────────────
guidanceToggle.addEventListener('change', () => {
  const enabled = guidanceToggle.checked;
  chrome.storage.sync.set({ guidanceEnabled: enabled });
  updateStatus(enabled);
  sendToTab({ type: 'TOGGLE_GUIDANCE', enabled });
});

// ── Voice toggle ──────────────────────────────────────────────────────────
voiceToggle.addEventListener('change', () => {
  const enabled = voiceToggle.checked;
  chrome.storage.sync.set({ voiceEnabled: enabled });
  sendToTab({ type: 'TOGGLE_VOICE', enabled });
});

// ── API key: clear mask on focus ──────────────────────────────────────────
apiKeyInput.addEventListener('focus', () => {
  if (apiKeyInput.dataset.saved === 'true') {
    apiKeyInput.value = '';
    apiKeyInput.dataset.saved = 'false';
  }
});

// ── API key: save ─────────────────────────────────────────────────────────
apiKeySave.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveApiKey();
});

function saveApiKey() {
  const raw = apiKeyInput.value.trim();

  if (!raw) {
    // Clear key
    chrome.storage.sync.set({ claudeApiKey: '' });
    setApiStatus(false);
    apiKeyInput.dataset.saved = 'false';
    showSaveFeedback('Cleared');
    return;
  }

  if (!raw.startsWith('sk-ant-')) {
    apiKeyInput.style.borderColor = '#EF4444';
    apiHint.textContent = '⚠️ Key should start with sk-ant-';
    apiHint.style.color = '#EF4444';
    return;
  }

  chrome.storage.sync.set({ claudeApiKey: raw });
  apiKeyInput.value        = maskKey(raw);
  apiKeyInput.dataset.saved = 'true';
  apiKeyInput.style.borderColor = '';
  setApiStatus(true);
  showSaveFeedback('Saved ✓');
  resetApiHint();
}

// ── Demo button ───────────────────────────────────────────────────────────
demoBtn.addEventListener('click', () => {
  if (!guidanceToggle.checked) {
    guidanceToggle.checked = true;
    chrome.storage.sync.set({ guidanceEnabled: true });
    updateStatus(true);
    sendToTab({ type: 'TOGGLE_GUIDANCE', enabled: true });
  }
  sendToTab({ type: 'SHOW_DEMO' });
  window.close();
});

// ── Stop voice button ─────────────────────────────────────────────────────
stopVoiceBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_SPEAK' });
});

// ── Helpers ───────────────────────────────────────────────────────────────
function updateStatus(enabled) {
  if (enabled) {
    statusDot.className    = 'dot dot-on';
    statusText.textContent = 'Guidance is active';
    statusPill.classList.add('active');
  } else {
    statusDot.className    = 'dot dot-off';
    statusText.textContent = 'Guidance is off';
    statusPill.classList.remove('active');
  }
}

function setApiStatus(hasKey) {
  if (hasKey) {
    apiStatusDot.className   = 'api-status-dot api-dot-on';
    apiStatusDot.title       = 'Contextual AI active';
  } else {
    apiStatusDot.className   = 'api-status-dot api-dot-off';
    apiStatusDot.title       = 'No API key — generic mode';
  }
}

function maskKey(key) {
  if (!key || key.length < 12) return key;
  return key.slice(0, 10) + '••••••••••' + key.slice(-4);
}

function showSaveFeedback(msg) {
  const orig = apiKeySave.textContent;
  apiKeySave.textContent = msg;
  apiKeySave.disabled    = true;
  setTimeout(() => {
    apiKeySave.textContent = orig;
    apiKeySave.disabled    = false;
  }, 1500);
}

function resetApiHint() {
  apiHint.style.color = '';
  apiHint.innerHTML   = '<a href="https://console.anthropic.com/keys" target="_blank">Get a free API key ↗</a> — without it, generic descriptions are shown.';
}

function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TouchGuide popup]', chrome.runtime.lastError.message);
        }
      });
    }
  });
}
