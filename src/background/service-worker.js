/**
 * service-worker.js
 *
 * Background service worker for TouchGuide.
 * Runs independently of any tab. Handles:
 *  - Text-to-speech (chrome.tts API)
 *  - Settings persistence relay
 *  - Tab messaging
 */

'use strict';

// ── TTS & message handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Speak text via Chrome's built-in TTS engine
  if (msg.type === 'SPEAK') {
    chrome.tts.stop();
    chrome.tts.speak(msg.text || '', {
      rate:   0.9,
      pitch:  1.0,
      volume: 1.0,
      onEvent: (e) => {
        if (e.type === 'error') console.warn('[TouchGuide TTS]', e);
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Stop any ongoing speech
  if (msg.type === 'STOP_SPEAK') {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return true;
  }

  // Relay toggle messages to the active tab's content script
  if (msg.type === 'TOGGLE_GUIDANCE' || msg.type === 'TOGGLE_VOICE' || msg.type === 'SHOW_DEMO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg, () => {
          // Ignore errors for tabs that don't have the content script
          if (chrome.runtime.lastError) {}
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});

// ── Install / update hook ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.set({
      guidanceEnabled: false,
      voiceEnabled:    true,
    });
    console.log('[TouchGuide] Installed successfully.');
  }
});
