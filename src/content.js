(function () {
  "use strict";

  const ROOT_ID = "linkedin-job-copy-agent-root";
  const MENU_ID = "linkedin-job-copy-agent-menu";
  const TOAST_ID = "linkedin-job-copy-agent-toast";
  const RESCAN_DELAY_MS = 220;
  const MENU_GAP_PX = 9;
  const MENU_MARGIN_PX = 12;
  const OPEN_PROMPT_PREFIX = "Read and evaluate this job spec so I can ask questions about it";

  const VENDOR_TARGETS = {
    ChatGPT: {
      urlPrefix: "https://chat.openai.com/?q="
    },
    Codex: {
      urlPrefix: "codex://new?prompt="
    },
    "Claude Code": {
      urlPrefix: "claude-cli://open?q="
    },
    "Claude Desktop": {
      urlPrefix: "claude://claude.ai/new?q="
    },
    "Claude Web": {
      urlPrefix: "https://claude.ai/new?q="
    }
  };

  const MENU_ITEMS = [
    {
      id: "raw",
      label: "Copy raw output",
      icon: copyIcon(),
      kind: "copy",
      formatter: buildRawJson,
      toast: "Raw LinkedIn job data copied"
    },
    {
      id: "markdown",
      label: "Copy Markdown",
      icon: markdownIcon(),
      kind: "copy",
      formatter: buildMarkdown,
      toast: "Markdown job brief copied"
    },
    { type: "divider" },
    {
      id: "chatgpt",
      label: "Open in ChatGPT",
      icon: sparkleIcon(),
      kind: "vendor",
      vendor: "ChatGPT",
      formatter: buildOpenPrompt,
      toast: "Opening ChatGPT with the job spec"
    },
    {
      id: "codex",
      label: "Open in Codex",
      icon: terminalIcon(),
      kind: "vendor",
      vendor: "Codex",
      formatter: buildOpenPrompt,
      toast: "Opening Codex with the job spec"
    },
    {
      id: "claude-code",
      label: "Open in Claude Code",
      icon: codeIcon(),
      kind: "vendor",
      vendor: "Claude Code",
      formatter: buildOpenPrompt,
      toast: "Opening Claude Code with the job spec"
    },
    {
      id: "claude-desktop",
      label: "Open in Claude Desktop",
      icon: claudeIcon(),
      kind: "vendor",
      vendor: "Claude Desktop",
      formatter: buildOpenPrompt,
      toast: "Opening Claude Desktop with the job spec"
    },
    {
      id: "claude-web",
      label: "Open in Claude",
      icon: claudeIcon(),
      kind: "vendor",
      vendor: "Claude Web",
      formatter: buildOpenPrompt,
      toast: "Opening Claude with the job spec"
    }
  ];

  let rescanTimer = 0;
  let lastUrl = location.href;
  let menuPositionFrame = 0;

  function scheduleMount() {
    clearTimeout(rescanTimer);
    rescanTimer = window.setTimeout(mountControl, RESCAN_DELAY_MS);
  }

  function mountControl() {
    const topCard = findTopCard();
    if (!topCard) {
      return;
    }

    const root = getOrCreateRoot();
    const insertion = findInsertionPoint(topCard);

    if (insertion.mode === "append") {
      if (root.parentElement !== insertion.target) {
        insertion.target.appendChild(root);
      }
      root.classList.toggle("lja-inline-row", insertion.inline);
      return;
    }

    if (root.previousElementSibling !== insertion.target) {
      insertion.target.insertAdjacentElement("afterend", root);
    }
    root.classList.toggle("lja-inline-row", insertion.inline);
  }

  function getOrCreateRoot() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      return existing;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lja-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", MENU_ID);
    trigger.innerHTML = [
      `<span class="lja-trigger-icon" aria-hidden="true">${copyIcon()}</span>`,
      "<span>Copy job</span>",
      '<span class="lja-agent-mark">Agent</span>',
      `<span class="lja-trigger-chevron" aria-hidden="true">${chevronIcon()}</span>`
    ].join("");

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.className = "lja-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    const title = document.createElement("div");
    title.className = "lja-menu-title";
    title.textContent = "LinkedIn to Agent";
    menu.appendChild(title);

    for (const item of MENU_ITEMS) {
      if (item.type === "divider") {
        const divider = document.createElement("div");
        divider.className = "lja-menu-divider";
        divider.setAttribute("role", "separator");
        menu.appendChild(divider);
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "lja-menu-item";
      button.setAttribute("role", "menuitem");
      button.dataset.action = item.id;
      button.innerHTML = [
        `<span class="lja-menu-icon" aria-hidden="true">${item.icon}</span>`,
        `<span>${escapeHtml(item.label)}</span>`
      ].join("");
      menu.appendChild(button);
    }

    root.append(trigger);
    document.body.appendChild(menu);
    bindRootEvents(root, trigger, menu);
    return root;
  }

  function bindRootEvents(root, trigger, menu) {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(root, !isMenuOpen(trigger));
    });

    menu.addEventListener("click", async (event) => {
      const itemButton = event.target.closest(".lja-menu-item");
      if (!itemButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await handleMenuAction(root, itemButton.dataset.action);
    });

    root.addEventListener("keydown", (event) => handleKeyboard(event, root));
    menu.addEventListener("keydown", (event) => handleKeyboard(event, root));

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target) && !menu.contains(event.target)) {
        setMenuOpen(root, false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMenuOpen(root, false);
      }
    });

    window.addEventListener("resize", requestMenuPositionUpdate, { passive: true });
    document.addEventListener("scroll", requestMenuPositionUpdate, { passive: true, capture: true });
  }

  async function handleMenuAction(root, actionId) {
    const item = MENU_ITEMS.find((entry) => entry.id === actionId);
    if (!item) {
      return;
    }

    let openedTab = null;
    if (item.kind === "vendor") {
      openedTab = window.open("about:blank", "_blank");
      if (openedTab) {
        openedTab.opener = null;
      }
    }

    try {
      setMenuOpen(root, false);
      await expandVisibleDescription();

      const job = extractJobData();
      if (!job.title && !job.description) {
        throw new Error("No LinkedIn job listing content was found on this page.");
      }

      const payload = item.formatter(job);
      await writeToClipboard(payload);

      if (item.kind === "vendor") {
        const destinationUrl = buildVendorUrl(item.vendor, payload);
        if (openedTab && !openedTab.closed) {
          openedTab.location.href = destinationUrl;
        } else {
          window.open(destinationUrl, "_blank", "noopener,noreferrer");
        }
      }

      showToast(item.toast);
    } catch (error) {
      if (openedTab && !openedTab.closed) {
        openedTab.close();
      }
      showToast(error.message || "Could not copy this LinkedIn job listing", "error");
    }
  }

  function handleKeyboard(event, root) {
    const trigger = root.querySelector(".lja-trigger");
    const menu = document.getElementById(MENU_ID);
    const items = Array.from(menu?.querySelectorAll(".lja-menu-item") || []);
    const activeIndex = items.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isMenuOpen(trigger)) {
        setMenuOpen(root, true);
        items[0]?.focus();
        return;
      }
      items[(activeIndex + 1 + items.length) % items.length]?.focus();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isMenuOpen(trigger)) {
        setMenuOpen(root, true);
        items[items.length - 1]?.focus();
        return;
      }
      items[(activeIndex - 1 + items.length) % items.length]?.focus();
    }
  }

  function setMenuOpen(root, isOpen) {
    const trigger = root.querySelector(".lja-trigger");
    const menu = document.getElementById(MENU_ID);
    if (!trigger || !menu) {
      return;
    }

    trigger.setAttribute("aria-expanded", String(isOpen));
    menu.hidden = !isOpen;

    if (isOpen) {
      positionMenu(root, menu);
    } else {
      menu.removeAttribute("data-placement");
      menu.style.removeProperty("--lja-arrow-left");
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
    }
  }

  function isMenuOpen(trigger) {
    return trigger.getAttribute("aria-expanded") === "true";
  }

  function requestMenuPositionUpdate() {
    if (menuPositionFrame) {
      return;
    }

    menuPositionFrame = window.requestAnimationFrame(() => {
      menuPositionFrame = 0;
      const root = document.getElementById(ROOT_ID);
      const trigger = root?.querySelector(".lja-trigger");
      const menu = document.getElementById(MENU_ID);

      if (root && trigger && menu && isMenuOpen(trigger) && !menu.hidden) {
        positionMenu(root, menu);
      }
    });
  }

  function positionMenu(root, menu) {
    const trigger = root.querySelector(".lja-trigger");
    if (!trigger) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();

    menu.style.visibility = "hidden";
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";

    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const menuWidth = Math.min(menuRect.width || 286, viewportWidth - MENU_MARGIN_PX * 2);
    const menuHeight = menuRect.height || 0;

    const preferredLeft = triggerRect.left;
    const maxLeft = viewportWidth - menuWidth - MENU_MARGIN_PX;
    const left = clamp(preferredLeft, MENU_MARGIN_PX, Math.max(MENU_MARGIN_PX, maxLeft));
    const hasRoomBelow = triggerRect.bottom + MENU_GAP_PX + menuHeight <= viewportHeight - MENU_MARGIN_PX;
    const top = hasRoomBelow
      ? triggerRect.bottom + MENU_GAP_PX
      : Math.max(MENU_MARGIN_PX, triggerRect.top - MENU_GAP_PX - menuHeight);

    const arrowCenter = triggerRect.left + Math.min(36, triggerRect.width / 2);

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "";
    menu.dataset.placement = hasRoomBelow ? "bottom" : "top";
    menu.style.setProperty("--lja-arrow-left", `${Math.round(clamp(arrowCenter - left, 18, menuWidth - 18))}px`);
  }

  function findTopCard() {
    const selectors = [
      ".job-details-jobs-unified-top-card",
      ".jobs-unified-top-card",
      ".jobs-details-top-card",
      ".jobs-search__job-details--container",
      "main section[aria-label='Primary content']",
      "main [class*='top-card']"
    ];

    for (const selector of selectors) {
      const card = queryVisible(selector, document);
      if (card && looksLikeJobContainer(card)) {
        return card;
      }
    }

    const titleNode = findTitleNode();
    if (titleNode) {
      const title = findTitleText();
      let current = titleNode.parentElement;

      while (current && current !== document.body) {
        if (isVisible(current) && looksLikeTopCard(current, title)) {
          return current;
        }
        current = current.parentElement;
      }
    }

    const heading = queryVisible("h1", document) || findVisibleExactTextNode("About the job");
    return heading?.closest("section, article, main, div") || null;
  }

  function looksLikeJobContainer(element) {
    const text = textOf(element);
    const rect = element.getBoundingClientRect();
    return (
      text.length > 80 &&
      rect.width > 260 &&
      rect.height > 80 &&
      rect.height < 650 &&
      /(?:easy apply|apply|save)/i.test(text) &&
      /(?:applicant|ago|remote|hybrid|on-site|full-time|part-time|contract|salary|[$£€]|\b(?:gbp|usd|eur)\b)/i.test(text)
    );
  }

  function looksLikeTopCard(element, title) {
    const text = textOf(element);
    const rect = element.getBoundingClientRect();
    return (
      text.includes(title) &&
      looksLikeJobContainer(element) &&
      !/^about the job\b/i.test(text)
    );
  }

  function findTitleText() {
    const headingText = queryText("h1", document);
    if (headingText) {
      return headingText;
    }

    const title = cleanText(document.title)
      .replace(/\s+\|\s+LinkedIn.*$/i, "")
      .replace(/\s+\|\s+[^|]+$/i, "");

    return /linkedin|jobs|job search/i.test(title) ? "" : title;
  }

  function findTitleNode() {
    const title = findTitleText();
    if (!title) {
      return queryVisible("h1", document);
    }

    return findVisibleExactTextNode(title) || Array.from(document.querySelectorAll("main h1, main h2, main h3, main [role='heading'], main p, main a, main span"))
      .filter(isVisible)
      .find((node) => textOf(node).includes(title)) || null;
  }

  function findVisibleExactTextNode(value) {
    const expected = cleanText(value).toLowerCase();
    if (!expected) {
      return null;
    }

    return Array.from(document.querySelectorAll("main h1, main h2, main h3, main [role='heading'], main p, main a, main span, main div"))
      .filter(isVisible)
      .find((node) => textOf(node).toLowerCase() === expected) || null;
  }

  function findInsertionPoint(topCard) {
    const directTargets = [
      ".jobs-unified-top-card__buttons",
      ".job-details-jobs-unified-top-card__buttons",
      ".jobs-s-apply",
      ".jobs-apply-button--top-card",
      "[class*='top-card'] [class*='button']"
    ];

    for (const selector of directTargets) {
      const target = queryVisible(selector, topCard);
      if (target) {
        const row = findActionRow(target, topCard);
        if (row) {
          return { target: row, mode: "append", inline: true };
        }
      }
    }

    const actionButton = Array.from(topCard.querySelectorAll("button, a"))
      .filter(isVisible)
      .find((element) => /easy apply|apply|save/i.test(textOf(element)));

    if (actionButton) {
      const row = findActionRow(actionButton, topCard);
      if (row) {
        return { target: row, mode: "append", inline: true };
      }
    }

    return { target: topCard, mode: "append", inline: false };
  }

  function findActionRow(actionElement, boundary) {
    let fallback = actionElement.closest("div, ul, section") || actionElement.parentElement;
    let current = fallback;

    while (current && current !== document.body) {
      const text = textOf(current);
      const rect = current.getBoundingClientRect();
      const isCompactRow = rect.width > 120 && rect.height > 20 && rect.height < 140;
      const hasApply = /(?:easy apply|^apply$)/i.test(text);
      const hasSave = /\bsave\b/i.test(text);

      if (isVisible(current) && isCompactRow && hasApply && hasSave) {
        return current;
      }

      if (isVisible(current) && isCompactRow && hasApply && rect.width > actionElement.getBoundingClientRect().width) {
        fallback = current;
      }

      if (current === boundary) {
        break;
      }

      current = current.parentElement;
    }

    return fallback;
  }

  async function expandVisibleDescription() {
    const descriptionScope = findDescriptionNode()?.closest("section, article, div") || document;
    const buttons = Array.from(descriptionScope.querySelectorAll("button"))
      .filter(isVisible)
      .filter((button) => /show more|see more|more description|expand/i.test(textOf(button) || button.getAttribute("aria-label") || ""));

    for (const button of buttons.slice(0, 2)) {
      button.click();
    }

    if (buttons.length > 0) {
      await wait(90);
    }
  }

  function extractJobData() {
    const topCard = findTopCard();
    const descriptionNode = findDescriptionNode();
    const topCardText = topCard ? textOf(topCard) : "";
    const topLines = linesOf(topCardText);
    const detailLines = linesOf(descriptionNode ? textOf(descriptionNode) : "");
    const segments = collectSegments(topLines.join("\n"));
    const metaSegments = collectMetaSegments(topLines);
    const chipTexts = collectLikelyChips(topLines, segments);

    const title = firstCleanText([
      () => findTitleText(),
      () => queryText("h1", topCard),
      () => queryText(".jobs-unified-top-card__job-title", topCard),
      () => queryText(".job-details-jobs-unified-top-card__job-title", topCard),
      () => queryText(".top-card-layout__title", topCard)
    ]);

    const company = firstCleanText([
      () => queryText("a[href*='/company/']", topCard),
      () => queryText(".jobs-unified-top-card__company-name a", topCard),
      () => queryText(".job-details-jobs-unified-top-card__company-name a", topCard),
      () => queryText(".topcard__org-name-link", topCard),
      () => inferCompanyFromSegments(metaSegments),
      () => inferCompanyFromSegments(segments)
    ]);

    const posted = firstCleanText([
      () => firstMatchingSegment(metaSegments, /(?:ago|reposted|just now|today|yesterday)/i),
      () => firstMatchingLine(topLines, /(?:ago|reposted|just now|today|yesterday)/i)
    ]);

    const applicants = firstCleanText([
      () => firstMatchingSegment(metaSegments, /applicant/i),
      () => firstMatchingLine(topLines, /applicant/i)
    ]);

    const salary = firstCleanText([
      () => firstMatchingText(chipTexts, salaryRegex()),
      () => firstMatchingLine(topLines, salaryRegex())
    ]);

    const workplace = firstCleanText([
      () => firstMatchingText(chipTexts, /^(remote|hybrid|on-site|on site)$/i),
      () => firstMatchingSegment(metaSegments, /^(remote|hybrid|on-site|on site)$/i),
      () => firstMatchingSegment(segments, /^(remote|hybrid|on-site|on site)$/i)
    ]);

    const employmentType = firstCleanText([
      () => firstMatchingText(chipTexts, /^(full-time|part-time|contract|temporary|internship|apprenticeship|volunteer|freelance)$/i),
      () => firstMatchingSegment(segments, /^(full-time|part-time|contract|temporary|internship|apprenticeship|volunteer|freelance)$/i)
    ]);

    const locationText = firstCleanText([
      () => inferLocationFromSegments(metaSegments, company),
      () => firstMatchingLine(topLines, /\b(remote|hybrid|on-site|on site)\b/i)
    ]);

    const applyType = firstCleanText([
      () => firstMatchingLine(topLines, /easy apply/i),
      () => firstMatchingLine(topLines, /^apply$/i)
    ]);

    const description = cleanDescription(detailLines.join("\n"));

    return {
      source: "LinkedIn",
      url: normalizeLinkedInUrl(location.href),
      jobId: extractJobId(location.href),
      extractedAt: new Date().toISOString(),
      title,
      company,
      location: locationText,
      salary,
      workplace,
      employmentType,
      posted,
      applicants,
      applyType,
      metadata: {
        chips: chipTexts,
        topCardSegments: segments,
        topCardMetaSegments: metaSegments
      },
      description
    };
  }

  function findDescriptionNode() {
    const selectors = [
      "#job-details",
      ".jobs-description-content__text",
      ".jobs-description__content",
      ".jobs-box__html-content",
      ".description__text",
      "section.jobs-description",
      "[class*='jobs-description']"
    ];

    for (const selector of selectors) {
      const node = queryVisible(selector, document);
      if (node && textOf(node).length > 40) {
        return node;
      }
    }

    const headings = Array.from(document.querySelectorAll("h2, h3, [role='heading'], div, p"))
      .filter(isVisible)
      .filter((heading) => /^(about the job|job description|about this job)$/i.test(textOf(heading)));

    for (const heading of headings) {
      let current = heading.parentElement;
      while (current && current !== document.body) {
        if (isVisible(current) && textOf(current).length > 80) {
          return current;
        }
        current = current.parentElement;
      }
    }

    return null;
  }

  function buildRawJson(job) {
    return JSON.stringify(job, null, 2);
  }

  function buildMarkdown(job) {
    const lines = [
      `# ${job.title || "LinkedIn job listing"}`,
      "",
      fieldLine("Company", job.company),
      fieldLine("Location", job.location),
      fieldLine("Salary", job.salary),
      fieldLine("Workplace", job.workplace),
      fieldLine("Employment type", job.employmentType),
      fieldLine("Posted", job.posted),
      fieldLine("Applicants", job.applicants),
      fieldLine("Apply type", job.applyType),
      fieldLine("LinkedIn URL", job.url),
      "",
      "## Job description",
      "",
      job.description || "_No description text was found._"
    ];

    return lines.filter((line) => line !== null).join("\n");
  }

  function buildOpenPrompt(job) {
    return [OPEN_PROMPT_PREFIX, "", buildMarkdown(job)].join("\n");
  }

  function buildVendorUrl(vendor, payload) {
    const target = VENDOR_TARGETS[vendor];
    if (!target) {
      throw new Error(`No destination is configured for ${vendor}.`);
    }

    return `${target.urlPrefix}${encodeURIComponent(payload)}`;
  }

  async function writeToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard access was blocked by the browser.");
    }
  }

  function showToast(message, tone = "success") {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "lja-toast";
    toast.dataset.tone = tone;
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, tone === "error" ? 5200 : 3200);
  }

  function queryVisible(selector, scope = document) {
    return Array.from((scope || document).querySelectorAll(selector)).find(isVisible) || null;
  }

  function queryText(selector, scope = document) {
    const node = scope ? queryVisible(selector, scope) : null;
    return node ? textOf(node) : "";
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function textOf(node) {
    return cleanText(node?.innerText || node?.textContent || "");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanDescription(value) {
    return cleanText(value)
      .replace(/^about the job\s*/i, "")
      .replace(/\n?(?:show less|show more|(?:\.\.\.|…)\s*more)\s*$/i, "")
      .trim();
  }

  function linesOf(value) {
    return cleanText(value)
      .split("\n")
      .map((line) => cleanText(line))
      .filter(Boolean);
  }

  function collectSegments(value) {
    return unique(
      cleanText(value)
        .split(/\n|\u00b7|\u2022|\|/g)
        .map((part) => cleanText(part))
        .filter(Boolean)
        .filter((part) => !/^(promoted by hirer|actively reviewing applicants|save)$/i.test(part))
    );
  }

  function collectMetaSegments(lines) {
    return collectSegments(
      lines
        .filter((line) => /\u00b7|\u2022|\||(?:applicant|ago|reposted|just now|today|yesterday)/i.test(line))
        .join("\n")
    );
  }

  function collectLikelyChips(lines, segments) {
    const joined = [...lines, ...segments];
    return unique(
      joined
        .map((line) => cleanText(line))
        .filter((line) => line.length > 1 && line.length <= 90)
        .filter((line) => {
          return (
            salaryRegex().test(line) ||
            /^(remote|hybrid|on-site|on site)$/i.test(line) ||
            /^(full-time|part-time|contract|temporary|internship|apprenticeship|volunteer|freelance)$/i.test(line)
          );
        })
    );
  }

  function inferCompanyFromSegments(segments) {
    const blocked = /(?:applicant|ago|remote|hybrid|on-site|full-time|part-time|contract|temporary|internship|salary|easy apply|save)/i;
    return segments.find((segment) => !blocked.test(segment) && segment.length <= 80) || "";
  }

  function inferLocationFromSegments(segments, company) {
    const blocked = /(?:applicant|ago|reposted|just now|today|yesterday|salary|easy apply|save|full-time|part-time|contract|temporary|internship)/i;
    const candidates = segments.filter((segment) => !blocked.test(segment));

    if (company) {
      const companyIndex = candidates.findIndex((segment) => segment.toLowerCase() === company.toLowerCase());
      if (companyIndex >= 0 && candidates[companyIndex + 1]) {
        return candidates[companyIndex + 1];
      }
    }

    return candidates.find((segment) => {
      return /remote|hybrid|on-site|on site|united|kingdom|states|city|london|new york|san francisco|europe|emea|uk|usa|canada/i.test(segment);
    }) || "";
  }

  function firstCleanText(readers) {
    for (const read of readers) {
      const value = cleanText(typeof read === "function" ? read() : read);
      if (value) {
        return value;
      }
    }
    return "";
  }

  function firstMatchingLine(lines, pattern) {
    return lines.find((line) => pattern.test(line)) || "";
  }

  function firstMatchingSegment(segments, pattern) {
    return segments.find((segment) => pattern.test(segment)) || "";
  }

  function firstMatchingText(values, pattern) {
    return values.find((value) => pattern.test(value)) || "";
  }

  function fieldLine(label, value) {
    return value ? `- **${label}:** ${value}` : null;
  }

  function salaryRegex() {
    return /(?:[$£€]|usd|gbp|eur|cad|aud|\b\d{2,3}\s?k\b).*(?:\/\s?(?:yr|year|hr|hour)|per\s+(?:year|hour)|salary|compensation|base|annum|pa)|(?:salary|compensation).*(?:[$£€]|usd|gbp|eur|cad|aud|\b\d{2,3}\s?k\b)/i;
  }

  function extractJobId(url) {
    return new URL(url).pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || "";
  }

  function normalizeLinkedInUrl(url) {
    const parsed = new URL(url);
    parsed.hash = "";

    const jobId = extractJobId(url);
    if (jobId) {
      parsed.pathname = `/jobs/view/${jobId}/`;
      parsed.search = "";
    }

    return parsed.toString();
  }

  function unique(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
    }
    return result;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function svg(path, options = {}) {
    const size = options.size || 18;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${options.stroke || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  function copyIcon() {
    return svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
  }

  function markdownIcon() {
    return svg('<path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="M6 15V9l3 3 3-3v6"/><path d="M17 9v6"/><path d="m15 13 2 2 2-2"/>');
  }

  function sparkleIcon() {
    return svg('<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/>');
  }

  function terminalIcon() {
    return svg('<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>');
  }

  function codeIcon() {
    return svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/><path d="m14.5 4-5 16"/>');
  }

  function claudeIcon() {
    return svg('<path d="M12 2v20"/><path d="M2 12h20"/><path d="m4.9 4.9 14.2 14.2"/><path d="m19.1 4.9-14.2 14.2"/><path d="M5 12a7 7 0 0 1 14 0 7 7 0 0 1-14 0Z"/>', { stroke: 1.8 });
  }

  function chevronIcon() {
    return svg('<path d="m6 9 6 6 6-6"/>', { size: 16 });
  }

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(MENU_ID)?.remove();
    }
    scheduleMount();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.LinkedInJobCopyAgent = {
    extractJobData,
    buildMarkdown,
    buildRawJson,
    buildOpenPrompt,
    buildVendorUrl,
    mount: scheduleMount
  };

  scheduleMount();
})();
