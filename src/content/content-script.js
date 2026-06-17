/**
 * content-script.js
 *
 * The BRAIN of TouchGuide on every webpage.
 * Injected into every page the user visits.
 *
 * Flow:
 *  User click
 *    → ElementInfo.extract(el)           (fast ARIA/semantic extraction)
 *    → IconRecognizer.identify(el)       (fallback heuristic)
 *    → ContextAnalyzer.analyze(el)       (gather page + element context)
 *    → ContextAI.enrich(info, ctx, el)   (Claude API: contextual explanation)
 *    → GuidanceOverlay.show(info, x, y)
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let guidanceEnabled = false;
  let voiceEnabled    = true;
  let lastTarget      = null;
  let highlightBox    = null;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
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

  // ── Hover highlight ────────────────────────────────────────────────────────
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

  // ── Click ─────────────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!guidanceEnabled) return;
    if (GuidanceOverlay.isInsideCard(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    handleClick(e.target, e.clientX, e.clientY);
  }, true);

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

    // 1️⃣  Fast semantic/ARIA extraction
    let info = ElementInfo.extract(element);

    // 2️⃣  Heuristic icon fallback
    if (!info || info.confidence < 0.5) {
      const aiInfo = await IconRecognizer.identify(element);
      if (aiInfo) {
        const aiConf      = aiInfo.confidence  ?? 0;
        const curConf     = info?.confidence   ?? 0;
        if (aiConf >= curConf) info = aiInfo;
      }
    }

    // 3️⃣  Hard fallback
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

    // 4️⃣  Long-press extra
    if (isLongPress && element.title) {
      info.extra = `Title: "${element.title}"`;
    }

    // 5️⃣  Show card immediately with what we know (fast feedback)
    GuidanceOverlay.show(info, x, y);

    // 6️⃣  Speak the base guidance right away
    if (voiceEnabled) {
      speak(`${info.name}. ${info.description}`);
    }

    // 7️⃣  Context-aware AI enrichment (async — updates card when ready)
    enrichWithContext(element, info, x, y);
  }

  // ── Context-AI enrichment ─────────────────────────────────────────────────
  async function enrichWithContext(element, baseInfo, x, y) {
    try {
      // Gather page + element context
      const context = ContextAnalyzer.analyze(element);

      // Call Claude API via background proxy
      const enriched = await ContextAI.enrich(baseInfo, context, element);

      if (!enriched) return; // No API key or call failed — keep base card

      // Update the card that's already showing with the contextual result
      GuidanceOverlay.updateContent(enriched);

      // Re-speak with the better description
      if (voiceEnabled) {
        speak(`${enriched.name}. ${enriched.description}`);
      }
    } catch (err) {
      // Silent fail — base card remains visible
      console.warn('[TouchGuide] Context enrichment failed:', err);
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

  // ── TTS ──────────────────────────────────────────────────────────────────
  function speak(text) {
    chrome.runtime.sendMessage({ type: 'SPEAK', text });
  }

  // ── Demo ─────────────────────────────────────────────────────────────────
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
