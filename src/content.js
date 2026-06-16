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
      icon: chatGptLogoIcon(),
      kind: "vendor",
      vendor: "ChatGPT",
      formatter: buildOpenPrompt,
      toast: "Opening ChatGPT with the job spec"
    },
    {
      id: "codex",
      label: "Open in Codex",
      icon: codexLogoIcon(),
      kind: "vendor",
      vendor: "Codex",
      formatter: buildOpenPrompt,
      toast: "Opening Codex with the job spec"
    },
    {
      id: "claude-code",
      label: "Open in Claude Code",
      icon: claudeLogoIcon(),
      kind: "vendor",
      vendor: "Claude Code",
      formatter: buildOpenPrompt,
      toast: "Opening Claude Code with the job spec"
    },
    {
      id: "claude-desktop",
      label: "Open in Claude Desktop",
      icon: claudeLogoIcon(),
      kind: "vendor",
      vendor: "Claude Desktop",
      formatter: buildOpenPrompt,
      toast: "Opening Claude Desktop with the job spec"
    },
    {
      id: "claude-web",
      label: "Open in Claude",
      icon: claudeLogoIcon(),
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

  function logoSvg(path, viewBox) {
    return `<svg width="18" height="18" viewBox="${viewBox}" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
  }

  function codexLogoIcon() {
    return logoSvg('<path fill-rule="evenodd" clip-rule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"/>', "0 0 24 24");
  }

  function chatGptLogoIcon() {
    return logoSvg('<path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/>', "0 0 256 260");
  }

  function claudeLogoIcon() {
    return logoSvg('<path fill="#D97757" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/>', "0 0 256 257");
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
