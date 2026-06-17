/**
 * service-worker.js
 *
 * Background service worker for TouchGuide.
 * Handles:
 *  - Text-to-speech (chrome.tts API)
 *  - Tab messaging relay
 *  - Claude API proxy (avoids CSP restrictions on host pages)
 */

'use strict';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── TTS ───────────────────────────────────────────────────────────────────
  if (msg.type === 'SPEAK') {
    chrome.tts.stop();
    chrome.tts.speak(msg.text || '', {
      rate: 0.9, pitch: 1.0, volume: 1.0,
      onEvent: (e) => { if (e.type === 'error') console.warn('[TouchGuide TTS]', e); }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'STOP_SPEAK') {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return true;
  }

  // ── Tab messaging relay ───────────────────────────────────────────────────
  if (['TOGGLE_GUIDANCE', 'TOGGLE_VOICE', 'SHOW_DEMO'].includes(msg.type)) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // ── Claude API proxy ──────────────────────────────────────────────────────
  // Content scripts can't call external APIs directly due to CSP on host pages.
  // We proxy the call through the service worker which has no such restriction.
  if (msg.type === 'CLAUDE_API') {
    (async () => {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':         'application/json',
            'x-api-key':            msg.apiKey,
            'anthropic-version':    '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',  // fast + cheap for inline UI
            max_tokens: 300,
            messages: [{ role: 'user', content: msg.prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn('[TouchGuide] Claude API error:', response.status, errText);
          sendResponse({ ok: false, error: `HTTP ${response.status}` });
          return;
        }

        const data = await response.json();
        const text = data?.content?.[0]?.text || '';
        sendResponse({ ok: true, text });

      } catch (err) {
        console.warn('[TouchGuide] Claude API fetch failed:', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;  // keep message channel open for async sendResponse
  }

});

// ── Install hook ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      guidanceEnabled: false,
      voiceEnabled:    true,
      claudeApiKey:    '',
    });
    console.log('[TouchGuide] Installed successfully.');
  }
});
