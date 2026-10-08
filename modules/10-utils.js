(() => {
  // Provide shared tab, text, icon, and grouping helpers used across modules.
  const ns = window.BetterTidyTabs;
  const { CLOUD_PROMPT_CONFIG, ATG_ICON_CATALOG, ATG_ICON_KEYWORDS } = ns;

  // Resolve the active workspace id even when Zen internals change shape.
  const getActiveWorkspaceId = () => {
    const preferredWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
    if (preferredWorkspaceId) {
      return preferredWorkspaceId;
    }

    const selectedTabWorkspaceId =
      window.gBrowser?.selectedTab?.getAttribute?.("zen-workspace-id") || "";
    if (selectedTabWorkspaceId) {
      return selectedTabWorkspaceId;
    }

    const activeTab = Array.from(window.gBrowser?.tabs || []).find(
      (tab) => tab?.selected && tab?.isConnected
    );
    return activeTab?.getAttribute?.("zen-workspace-id") || "";
  };

  // Resolve the active workspace element with fallbacks for newer Zen builds.
  const getActiveWorkspaceElement = () => {
    const preferredElement = window.gZenWorkspaces?.activeWorkspaceElement;
    if (preferredElement?.isConnected) {
      return preferredElement;
    }

    const workspaceId = getActiveWorkspaceId();
    if (workspaceId) {
      const matchingElement = document.querySelector(
        [
          `.zen-workspace-tabs-section[zen-workspace-id="${workspaceId}"]`,
          `.zen-workspace-tabs-section[data-workspace-id="${workspaceId}"]`,
          `.zen-workspace-tabs-section[id="${workspaceId}"]`,
        ].join(", ")
      );
      if (matchingElement?.isConnected) {
        return matchingElement;
      }
    }

    return (
      document.querySelector(
        [
          ".zen-workspace-tabs-section[selected]",
          ".zen-workspace-tabs-section[active]",
          '.zen-workspace-tabs-section[data-active="true"]',
          ".zen-workspace-tabs-section:not([hidden])",
        ].join(", ")
      ) || null
    );
  };

  // Return tabs from the active workspace that match the requested filters.
  const getFilteredTabs = (workspaceId, options = {}) => {
    if (!workspaceId || typeof gBrowser === "undefined" || !gBrowser.tabs) {
      return [];
    }

    const {
      includeGrouped = false,
      includeSelected = true,
      includePinned = false,
      includeEmpty = false,
      includeGlance = false,
    } = options;

    return Array.from(gBrowser.tabs).filter((tab) => {
      if (!tab?.isConnected) return false;

      const isInCorrectWorkspace =
        tab.getAttribute("zen-workspace-id") === workspaceId;
      if (!isInCorrectWorkspace) return false;

      const groupParent = tab.closest("tab-group");
      const isInGroup = !!groupParent;

      return (
        (includePinned || !tab.pinned) &&
        (includeGrouped || !isInGroup) &&
        (includeSelected || !tab.selected) &&
        (includeEmpty || !tab.hasAttribute("zen-empty-tab")) &&
        (includeGlance || !tab.hasAttribute("zen-glance-tab"))
      );
    });
  };

  // Resolve the best human-readable title for a tab, with URL-based fallback.
  const getTabTitle = (tab) => {
    if (!tab?.isConnected) {
      return "Invalid Tab";
    }

    try {
      const originalTitle =
        tab.getAttribute("label") ||
        tab.querySelector(".tab-label, .tab-text")?.textContent ||
        "";

      if (
        !originalTitle ||
        originalTitle === "New Tab" ||
        originalTitle === "about:blank" ||
        originalTitle === "Loading..." ||
        originalTitle.startsWith("http:") ||
        originalTitle.startsWith("https:")
      ) {
        const browser =
          tab.linkedBrowser ||
          tab._linkedBrowser ||
          window.gBrowser?.getBrowserForTab?.(tab);

        if (
          browser?.currentURI?.spec &&
          !browser.currentURI.spec.startsWith("about:")
        ) {
          try {
            const currentURL = new URL(browser.currentURI.spec);
            const hostname = currentURL.hostname.replace(/^www\./, "");
            if (
              hostname &&
              hostname !== "localhost" &&
              hostname !== "127.0.0.1"
            ) {
              return hostname;
            }

            const pathSegment = currentURL.pathname.split("/")[1];
            if (pathSegment) return pathSegment;
          } catch {
            // Ignore URL parsing failures and fall back to a generic label.
          }
        }

        return "Untitled Page";
      }

      return originalTitle.trim() || "Untitled Page";
    } catch (error) {
      console.error("Error getting tab title for tab:", tab, error);
      return "Error Processing Tab";
    }
  };

  // Keep path and search evidence separate, including on /search pages.
  const getTabNavigationInfo = (tab) => {
    const empty = { host: "", pathHint: "", searchHint: "", repositoryKey: "" };
    if (!tab?.isConnected) return empty;
    try {
      const browser = tab.linkedBrowser || tab._linkedBrowser ||
        window.gBrowser?.getBrowserForTab?.(tab);
      const url = new URL(browser?.currentURI?.spec || "");
      if (!["http:", "https:"].includes(url.protocol)) return empty;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const segments = url.pathname.split("/").filter(Boolean).slice(0, 3)
        .map((segment) => {
          try { return decodeURIComponent(segment); } catch { return segment; }
        });
      const reserved = new Set(["search", "settings", "topics", "collections",
        "orgs", "users", "login", "signup", "marketplace", "features", "sponsors"]);
      const repositoryKey = host === "github.com" && segments.length >= 2 &&
        !reserved.has(segments[0].toLowerCase())
        ? `${segments[0]}/${segments[1].replace(/\.git$/i, "")}`.toLowerCase() : "";
      return {
        host,
        pathHint: segments.join("/"),
        searchHint: url.searchParams.get("q") || url.searchParams.get("query") ||
          url.searchParams.get("search") || "",
        repositoryKey,
      };
    } catch { return empty; }
  };

  const tokenizeText = (text) =>
    (String(text || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
      .filter((word) => Array.from(word).length > 2);

  const getStableTabKey = (tab) => {
    const info = getTabNavigationInfo(tab);
    return tab.id || [getTabTitle(tab).toLowerCase(), info.host, info.pathHint,
      info.searchHint].join("\u0000");
  };

  // Limit long strings before sending them to models or using them in labels.
  const truncateText = (text, maxLength) => {
    if (!text || typeof text !== "string") return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
  };

  // Normalize topic names for case-insensitive matching and map lookups.
  const normalizeTopicKey = (topic) => {
    if (!topic || typeof topic !== "string") return "";
    return topic.trim().toLowerCase();
  };

  // Normalize icon ids so provider output maps cleanly to the icon catalog.
  const normalizeIconId = (iconId) => {
    if (!iconId || typeof iconId !== "string") return "";
    return iconId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  };

  // Clean model-generated group names before creating or reusing a tab group.
  const sanitizeTopicName = (topic, fallback = "Group") => {
    const safeFallback =
      typeof fallback === "string" && fallback.trim() ? fallback.trim() : "Group";
    if (!topic || typeof topic !== "string") {
      return safeFallback;
    }

    const cleaned = topic.trim().replace(/^['"`]+|['"`]+$/g, "")
      .replace(/[.?!,:;]+$/g, "").replace(/\s+/g, " ").trim();
    const chars = Array.from(cleaned);
    const limit = CLOUD_PROMPT_CONFIG.MAX_GROUP_NAME_LENGTH;
    if (chars.length <= limit) return cleaned || safeFallback;
    const prefix = chars.slice(0, limit).join("");
    const boundary = prefix.lastIndexOf(" ");
    return (boundary > 0 && chars[limit] !== " " ? prefix.slice(0, boundary) : prefix)
      .trim() || safeFallback;
  };

  // Remove duplicate or falsy values while preserving insertion order.
  const uniqueArray = (items) => Array.from(new Set(items.filter(Boolean)));

  // Check whether an icon id exists in the supported ATG icon catalog.
  const isValidIconId = (iconId) =>
    !!ATG_ICON_CATALOG[normalizeIconId(iconId)];

  // Convert an icon id into the chrome URL expected by Advanced Tab Groups.
  const getIconUrlForIconId = (iconId) =>
    ATG_ICON_CATALOG[normalizeIconId(iconId)]?.url || null;

  // Format the supported icon list as prompt text for cloud providers.
  const getIconCatalogPromptText = () =>
    Object.entries(ATG_ICON_CATALOG)
      .map(([iconId, { label }]) => `${iconId}: ${label}`)
      .join("\n");

  // Pick a reasonable icon from keywords when the provider does not supply one.
  const getFallbackIconIdForTopic = (topic) => {
    if (!topic || typeof topic !== "string") {
      return "folder";
    }

    const match = ATG_ICON_KEYWORDS.find(({ pattern }) => pattern.test(topic));
    return match?.iconId || "folder";
  };

  // Resolve an icon id and fall back to keyword-based matching when needed.
  const getResolvedIconId = (iconId, topic) =>
    isValidIconId(iconId) ? normalizeIconId(iconId) : getFallbackIconIdForTopic(topic);

  // Detect whether a tab group already has an Advanced Tab Groups icon set.
  const groupHasATGIcon = (group) => {
    if (!group?.isConnected) return false;

    try {
      if (globalThis.advancedTabGroups?.savedIcons?.[group.id]) {
        return true;
      }
    } catch {
      // Ignore ATG state read failures and fall through to DOM inspection.
    }

    return !!group.querySelector(
      ".tab-group-icon .group-icon, .tab-group-icon label"
    );
  };

  // Apply an ATG icon to a group without overwriting an existing custom icon.
  const applyATGGroupIconIfNeeded = async (group, iconId) => {
    const resolvedIconId = getResolvedIconId(
      iconId,
      group?.getAttribute("label") || ""
    );
    const iconUrl = getIconUrlForIconId(resolvedIconId);

    if (
      !group?.isConnected ||
      !iconUrl ||
      !globalThis.advancedTabGroups ||
      typeof globalThis.advancedTabGroups.applyGroupIcon !== "function" ||
      groupHasATGIcon(group)
    ) {
      return;
    }

    try {
      await globalThis.advancedTabGroups.applyGroupIcon(group, iconUrl);
    } catch (error) {
      console.error(
        `[TabSort] Failed applying ATG icon "${resolvedIconId}" to group "${group.getAttribute("label") || "Unknown"}":`,
        error
      );
    }
  };

  // Bucket by provider identity; display-label collisions never change membership.
  const buildFinalGroupsFromAssignments = (assignments, existingGroups = new Map()) => {
    const finalGroups = Object.create(null);
    const seenTabs = new Set();
    for (const assignment of assignments) {
      const { tab, topic, iconId, existingGroupId = null } = assignment || {};
      if (!tab?.isConnected || seenTabs.has(tab) || typeof topic !== "string" || !topic.trim()) continue;
      const legacy = !assignment.groupId;
      let destinationId = existingGroupId;
      if (legacy) {
        const matches = [...existingGroups.entries()].filter(([, info]) =>
          normalizeTopicKey(info.name) === normalizeTopicKey(topic));
        if (matches.length === 1) destinationId = matches[0][0];
      }
      const destination = destinationId ? existingGroups.get(destinationId) : null;
      if (destinationId && (!destination ||
          normalizeTopicKey(destination.name) !== normalizeTopicKey(topic))) continue;
      const bucketId = legacy ? `legacy:${normalizeTopicKey(topic)}` : `provider:${assignment.groupId}`;
      const bucket = finalGroups[bucketId];
      if (bucket && ((legacy ? normalizeTopicKey(bucket.topic) !== normalizeTopicKey(topic) :
          bucket.topic !== topic) || bucket.existingGroupId !== destinationId)) continue;
      finalGroups[bucketId] ||= {
        groupId: bucketId, topic, label: destination ? destination.name : sanitizeTopicName(topic),
        existingGroupId: destinationId, tabs: [], iconId: getResolvedIconId(iconId, topic),
      };
      finalGroups[bucketId].tabs.push(tab);
      seenTabs.add(tab);
    }
    return finalGroups;
  };

  // Convert model-generated names into title case for cleaner group labels.
  const toTitleCase = (value) => {
    if (!value || typeof value !== "string") return "";
    return value
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Find the DOM element for a group by name inside a specific workspace.
  const findGroupElement = (topicName, workspaceId) => {
    if (!topicName || typeof topicName !== "string" || !workspaceId) {
      return null;
    }

    const sanitizedTopicName = topicName.trim();
    if (!sanitizedTopicName) return null;

    const safeSelectorTopicName = sanitizedTopicName
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

    try {
      return document.querySelector(
        `tab-group[label="${safeSelectorTopicName}"][zen-workspace-id="${workspaceId}"]`
      );
    } catch (error) {
      console.error(
        `Error finding group selector for "${sanitizedTopicName}":`,
        error
      );
      return null;
    }
  };

  Object.assign(ns, {
    getActiveWorkspaceId,
    getActiveWorkspaceElement,
    getFilteredTabs,
    getTabTitle,
    getTabNavigationInfo,
    tokenizeText,
    getStableTabKey,
    truncateText,
    normalizeTopicKey,
    normalizeIconId,
    sanitizeTopicName,
    uniqueArray,
    isValidIconId,
    getIconUrlForIconId,
    getIconCatalogPromptText,
    getFallbackIconIdForTopic,
    getResolvedIconId,
    groupHasATGIcon,
    applyATGGroupIconIfNeeded,
    buildFinalGroupsFromAssignments,
    toTitleCase,
    findGroupElement,
  });
})();
