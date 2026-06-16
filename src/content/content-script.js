/**
 * content-script.js
 *
 * The BRAIN of TouchGuide on every webpage.
 * Injected into every page the user visits.
 *
 * Responsibilities:
 *  1. Listen for clicks in "guidance mode"
 *  2. Identify what was clicked (ARIA, semantic HTML, AI fallback)
 *  3. Show a floating guidance card near the click
 *  4. Speak the guidance via Chrome TTS
 *
 * Flow:
 *  User click → ElementInfo.extract(el) → GuidanceOverlay.show(info)
 *                                       ↘ (if unknown) IconRecognizer.identify(el)
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let guidanceEnabled = false;
  let voiceEnabled    = true;
  let lastTarget      = null;      // element the cursor is currently over
  let highlightBox    = null;      // the blue hover-highlight rectangle

  // ── Bootstrap: read persisted settings ────────────────────────────────────
  chrome.storage.sync.get(
    { guidanceEnabled: false, voiceEnabled: true },
    (settings) => {
      guidanceEnabled = settings.guidanceEnabled;
      voiceEnabled    = settings.voiceEnabled;
    }
  );

  // ── Listen for setting changes from the popup ──────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_GUIDANCE') {
      guidanceEnabled = msg.enabled;
      if (!guidanceEnabled) {
        GuidanceOverlay.hide();
        removeHighlight();
      }
    }
    if (msg.type === 'TOGGLE_VOICE') {
      voiceEnabled = msg.enabled;
    }
    if (msg.type === 'SHOW_DEMO') {
      showDemo();
    }
  });

  // ── Hover: highlight element under cursor ──────────────────────────────────
  document.addEventListener('mouseover', (e) => {
    if (!guidanceEnabled) return;
    if (GuidanceOverlay.isInsideCard(e.target)) return;

    lastTarget = e.target;
    showHighlight(e.target);
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (GuidanceOverlay.isInsideCard(e.target)) return;
    removeHighlight();
  }, true);

  // ── Click: show guidance card ──────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!guidanceEnabled) return;
    if (GuidanceOverlay.isInsideCard(e.target)) return;   // clicks inside card are fine

    e.preventDefault();
    e.stopPropagation();

    handleClick(e.target, e.clientX, e.clientY);
  }, true);   // capture phase — fires before any page listener

  // ── Long-press (300 ms) ────────────────────────────────────────────────────
  let pressTimer = null;
  document.addEventListener('mousedown', (e) => {
    if (!guidanceEnabled) return;
    if (GuidanceOverlay.isInsideCard(e.target)) return;
    pressTimer = setTimeout(() => {
      handleClick(e.target, e.clientX, e.clientY, true);
    }, 300);
  }, true);
  document.addEventListener('mouseup',   () => clearTimeout(pressTimer), true);
  document.addEventListener('mousemove', () => clearTimeout(pressTimer), true);

  // ── Core handler ──────────────────────────────────────────────────────────
  async function handleClick(element, x, y, isLongPress = false) {
    removeHighlight();

    // 1️⃣  Try semantic / ARIA extraction (fast, accurate)
    let info = ElementInfo.extract(element);

         // 2️⃣  Fallback: AI heuristic identification
    if (!info || info.confidence < 0.5) {
      const aiInfo = await IconRecognizer.identify(element);
      
      if (aiInfo) {
        const aiConfidence = aiInfo.confidence !== undefined ? aiInfo.confidence : 0;
        const currentConfidence = info && info.confidence !== undefined ? info.confidence : 0;
        
        if (aiConfidence >= currentConfidence) {
          info = aiInfo;
        }
      }
    }

    // 3️⃣  Final fallback
    if (!info) {
      info = {
        name:        'Unknown Element',
        description: 'This element doesn\'t have a label or recognisable role.',
        howToUse:    'Try right-clicking for more options, or look for nearby text hints.',
        icon:        '❓',
        confidence:  0,
        source:      'fallback',
      };
    }

    // 4️⃣  Annotate with long-press context
    if (isLongPress && element.title) {
      info.extra = `Title: "${element.title}"`;
    }

    // 5️⃣  Show card
    GuidanceOverlay.show(info, x, y);

    // 6️⃣  Speak
    if (voiceEnabled) {
      speak(`${info.name}. ${info.description}`);
    }
  }

  // ── Highlight helpers ─────────────────────────────────────────────────────
  function showHighlight(el) {
    removeHighlight();
    if (!el || el === document.body || el === document.documentElement) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;

    highlightBox = document.createElement('div');
    highlightBox.id = 'tg-highlight';
    Object.assign(highlightBox.style, {
      position:      'fixed',
      top:           `${rect.top}px`,
      left:          `${rect.left}px`,
      width:         `${rect.width}px`,
      height:        `${rect.height}px`,
      border:        '2px solid #4F46E5',
      borderRadius:  '4px',
      background:    'rgba(79,70,229,0.06)',
      pointerEvents: 'none',
      zIndex:        '2147483645',
      transition:    'all 0.1s ease',
      boxSizing:     'border-box',
    });
    document.body.appendChild(highlightBox);
  }

  function removeHighlight() {
    if (highlightBox) highlightBox.remove();
    highlightBox = null;
  }

  // ── TTS via Chrome extension API ──────────────────────────────────────────
  function speak(text) {
    chrome.runtime.sendMessage({ type: 'SPEAK', text });
  }

  // ── Demo ──────────────────────────────────────────────────────────────────
  function showDemo() {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    GuidanceOverlay.show({
      name:        '🔍 Search Box',
      description: 'A text field where you type keywords to search the website or the web.',
      howToUse:    'Click it, type your query, then press Enter or click the Search button.',
      icon:        '🔍',
      confidence:  1,
      source:      'demo',
    }, cx, cy);
    if (voiceEnabled) speak('This is a demo of TouchGuide. Click any element to learn about it.');
  }

})();
