/**
 * context-ai.js
 *
 * Calls the Claude API (via the background service worker proxy) with
 * full page + element context to produce SPECIFIC, CONTEXTUAL guidance.
 *
 * Instead of:
 *   "A button labelled 'Submit'. Clicking it will trigger an action."
 *
 * It produces:
 *   "This Submit button on GitHub's new repository form creates your
 *    repository with the name and settings you've filled in above."
 *
 * The API call is proxied through the background service worker to avoid
 * Content Security Policy restrictions on the host page.
 */

const ContextAI = (() => {
  'use strict';

  // Cache to avoid re-querying the same element on the same page load
  const _cache = new Map();

  return { enrich };

  /**
   * Takes a base info object from ElementInfo/IconRecognizer and enriches it
   * with contextual AI guidance.
   *
   * @param {Object}  baseInfo   The existing info (name, description, howToUse…)
   * @param {Object}  context    Output of ContextAnalyzer.analyze(el)
   * @param {Element} el         The clicked DOM element
   * @returns {Object|null}      Enriched info object, or null on failure
   */
  async function enrich(baseInfo, context, el) {
    // Check we have an API key
    const apiKey = await getApiKey();
    if (!apiKey) return null;

    // Build a cache key from site + page + element signals
    const cacheKey = buildCacheKey(context);
    if (_cache.has(cacheKey)) {
      return _cache.get(cacheKey);
    }

    const prompt = buildPrompt(baseInfo, context);

    try {
      const response = await chrome.runtime.sendMessage({
        type:   'CLAUDE_API',
        apiKey,
        prompt,
      });

      if (!response?.ok || !response.text) return null;

      const parsed = parseResponse(response.text, baseInfo);
      if (!parsed) return null;

      // Mark source and confidence
      parsed.source     = 'context-ai';
      parsed.confidence = 0.95;
      parsed.icon       = baseInfo.icon || '🤖';

      _cache.set(cacheKey, parsed);
      return parsed;

    } catch (err) {
      console.warn('[TouchGuide ContextAI] API call failed:', err);
      return null;
    }
  }

  // ── Prompt builder ─────────────────────────────────────────────────────────
  function buildPrompt(baseInfo, ctx) {
    const lines = [
      `You are TouchGuide, a browser extension that explains web UI elements to users who are learning to use the internet.`,
      ``,
      `The user clicked an element on a webpage. Your job is to explain what this specific element does IN CONTEXT of THIS SPECIFIC WEBSITE and PAGE — not a generic description.`,
      ``,
      `## Page Context`,
      `- Website: ${ctx.site}`,
      `- Page type: ${ctx.pageType}`,
      `- Page title: ${ctx.pageTitle}`,
      ctx.breadcrumb  ? `- Breadcrumb trail: ${ctx.breadcrumb}` : '',
      ctx.mainHeading ? `- Main heading on page: "${ctx.mainHeading}"` : '',
      ctx.section     ? `- Section: "${ctx.section}"` : '',
      ctx.formContext ? `- Form context: ${ctx.formContext}` : '',
      ctx.listContext ? `- List context: ${ctx.listContext}` : '',
      ctx.tableContext? `- Table context: ${ctx.tableContext}` : '',
      ``,
      `## Element Details`,
      `- Tag: <${ctx.elementTag}>`,
      ctx.ariaLabel   ? `- ARIA label: "${ctx.ariaLabel}"` : '',
      ctx.elementText ? `- Visible text: "${ctx.elementText}"` : '',
      ctx.placeholder ? `- Placeholder: "${ctx.placeholder}"` : '',
      ctx.elementType ? `- Type: ${ctx.elementType}` : '',
      ctx.elementHref ? `- Links to: ${ctx.elementHref.slice(0, 100)}` : '',
      ctx.isDisabled  ? `- Status: DISABLED` : '',
      ctx.isExpanded !== null ? `- Expanded: ${ctx.isExpanded}` : '',
      ctx.nearbyText?.length  ? `- Nearby text on page: ${ctx.nearbyText.map(t => `"${t}"`).join(', ')}` : '',
      ctx.siblingLabels?.length ? `- Sibling labels: ${ctx.siblingLabels.map(t => `"${t}"`).join(', ')}` : '',
      Object.keys(ctx.dataAttrs||{}).length ? `- Data attributes: ${JSON.stringify(ctx.dataAttrs)}` : '',
      ``,
      `## What generic analysis already knows`,
      `- Element name: "${baseInfo.name}"`,
      `- Generic description: "${baseInfo.description}"`,
      `- Generic how-to: "${baseInfo.howToUse}"`,
      ``,
      `## Your task`,
      `Write a SHORT, CONTEXTUAL explanation for a non-technical user.`,
      `Be specific to ${ctx.site} and this "${ctx.pageType}" page.`,
      `Mention what will ACTUALLY HAPPEN on this specific website when they interact with it.`,
      ``,
      `Respond with ONLY a JSON object (no markdown, no backticks):`,
      `{`,
      `  "name": "Short element name (5 words max)",`,
      `  "description": "1-2 sentences. What this element does on THIS page/site specifically.",`,
      `  "howToUse": "1 sentence. Exactly how to use it on this site."`,
      `}`,
    ].filter(line => line !== undefined && line !== '').join('\n');

    return lines;
  }

  // ── Response parser ────────────────────────────────────────────────────────
  function parseResponse(text, baseInfo) {
    try {
      // Strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim();

      // Find the JSON object
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const obj = JSON.parse(match[0]);

      if (!obj.description) return null;

      return {
        name:        obj.name        || baseInfo.name,
        description: obj.description,
        howToUse:    obj.howToUse    || baseInfo.howToUse,
        role:        baseInfo.role,
        tagName:     baseInfo.tagName,
      };
    } catch {
      return null;
    }
  }

  // ── Cache key ─────────────────────────────────────────────────────────────
  function buildCacheKey(ctx) {
    return [
      ctx.url,
      ctx.elementTag,
      ctx.ariaLabel,
      ctx.elementText?.slice(0, 30),
      ctx.elementId,
    ].join('|');
  }

  // ── API key loader ─────────────────────────────────────────────────────────
  function getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ claudeApiKey: '' }, (s) => {
        resolve(s.claudeApiKey?.trim() || null);
      });
    });
  }

})();
