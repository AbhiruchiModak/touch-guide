/**
 * popup.js
 * Logic for the extension toolbar popup.
 * Reads/writes chrome.storage and messages the content script.
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

// ── Load saved settings ───────────────────────────────────────────────────
chrome.storage.sync.get({ guidanceEnabled: false, voiceEnabled: true }, (s) => {
  guidanceToggle.checked = s.guidanceEnabled;
  voiceToggle.checked    = s.voiceEnabled;
  updateStatus(s.guidanceEnabled);
});

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

// ── Demo button ───────────────────────────────────────────────────────────
demoBtn.addEventListener('click', () => {
  // Make sure guidance is on first
  if (!guidanceToggle.checked) {
    guidanceToggle.checked = true;
    chrome.storage.sync.set({ guidanceEnabled: true });
    updateStatus(true);
    sendToTab({ type: 'TOGGLE_GUIDANCE', enabled: true });
  }
  sendToTab({ type: 'SHOW_DEMO' });
  window.close(); // close popup so the demo is visible
});

// ── Stop voice button ─────────────────────────────────────────────────────
stopVoiceBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_SPEAK' });
});

// ── Helpers ───────────────────────────────────────────────────────────────
function updateStatus(enabled) {
  if (enabled) {
    statusDot.className  = 'dot dot-on';
    statusText.textContent = 'Guidance is active';
    statusPill.classList.add('active');
  } else {
    statusDot.className  = 'dot dot-off';
    statusText.textContent = 'Guidance is off';
    statusPill.classList.remove('active');
  }
}

function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, () => {
        if (chrome.runtime.lastError) {
          // Content script not yet injected on this tab (e.g. chrome:// pages)
          console.warn('[TouchGuide popup] Could not reach content script:', chrome.runtime.lastError.message);
        }
      });
    }
  });
}
