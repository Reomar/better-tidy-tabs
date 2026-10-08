(() => {
  // Provide shared AI helpers such as embeddings, caching, prefs, and context building.
  const ns = window.BetterTidyTabs;
  const {
    CONFIG,
    PROVIDERS,
    PREFS,
    state,
    CLOUD_PROMPT_CONFIG,
    ATG_ICON_CATALOG,
    GROQ_CONFIG,
    MISTRAL_CONFIG,
  } = ns;
  const {
    getActiveWorkspaceId,
    getTabNavigationInfo,
    getTabTitle,
    getFilteredTabs,
    getIconCatalogPromptText,
    normalizeIconId,
    normalizeTopicKey,
    truncateText,
  } = ns;

  // Average token or chunk embeddings into one normalized vector.
  function averageEmbedding(arrays) {
    if (!Array.isArray(arrays) || arrays.length === 0) return [];
    if (typeof arrays[0] === "number") return arrays;

    const length = arrays[0].length;
    const average = new Array(length).fill(0);

    for (const array of arrays) {
      for (let index = 0; index < length; index++) {
        average[index] += array[index];
      }
    }

    for (let index = 0; index < length; index++) {
      average[index] /= arrays.length;
    }

    return average;
  }

  // Measure semantic similarity between two embedding vectors.
  function cosineSimilarity(a, b) {
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      a.length !== b.length ||
      a.length === 0
    ) {
      return 0;
    }

    if (typeof a[0] !== "number" || typeof b[0] !== "number") {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let index = 0; index < a.length; index++) {
      dot += a[index] * b[index];
      normA += a[index] * a[index];
      normB += b[index] * b[index];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Build rough local clusters from embedding similarity scores.
  function clusterEmbeddings(vectors, threshold = CONFIG.SIMILARITY_THRESHOLD) {
    if (!Array.isArray(vectors) || vectors.length === 0) {
      return [];
    }

    const groups = [];
    const used = new Set();

    for (let index = 0; index < vectors.length; index++) {
      if (used.has(index)) continue;

      const group = [index];
      used.add(index);

      for (
        let compareIndex = index + 1;
        compareIndex < vectors.length;
        compareIndex++
      ) {
        if (used.has(compareIndex)) continue;

        const similarity = cosineSimilarity(
          vectors[index],
          vectors[compareIndex]
        );
        if (similarity >= threshold) {
          group.push(compareIndex);
          used.add(compareIndex);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  // Batch DOM mutations behind one helper to keep call sites simple.
  const batchDOMUpdates = (operations) => {
    if (!Array.isArray(operations) || operations.length === 0) return;

    const fragment = document.createDocumentFragment();

    try {
      operations.forEach((operation) => {
        if (typeof operation === "function") {
          operation(fragment);
        }
      });
    } catch (error) {
      console.error("Error in batch DOM operations:", error);
    }
  };

  // Process tabs in small batches so local embedding work does not spike too hard.
  const processTabsInBatches = async (
    tabs,
    batchSize = CONFIG.EMBEDDING_BATCH_SIZE
  ) => {
    if (!Array.isArray(tabs) || tabs.length === 0) return [];

    const results = [];
    for (let index = 0; index < tabs.length; index += batchSize) {
      const batch = tabs.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map((tab) => getCachedEmbeddingForTab(tab))
      );
      results.push(...batchResults);
    }

    return results;
  };

  // Build a stable cache key for embedding reuse across repeated sorts.
  const getEmbeddingCacheKey = (title) => {
    if (!title || typeof title !== "string") return null;
    const normalizedTitle = title.trim();
    return normalizedTitle || null;
  };

  // Store embeddings in a small LRU-style cache capped by config.
  const cacheEmbedding = (key, embedding) => {
    if (!key || !Array.isArray(embedding) || embedding.length === 0) return;

    if (state.embeddingCache.has(key)) {
      state.embeddingCache.delete(key);
    }

    state.embeddingCache.set(key, embedding);

    if (state.embeddingCache.size > CONFIG.MAX_EMBEDDING_CACHE_SIZE) {
      const oldestKey = state.embeddingCache.keys().next().value;
      if (oldestKey) {
        state.embeddingCache.delete(oldestKey);
      }
    }
  };

  // Reuse a cached embedding for a tab title or generate a fresh one.
  const getCachedEmbeddingForTab = async (tab) => {
    const title = getTabTitle(tab);
    const cacheKey = getEmbeddingCacheKey(title);

    if (cacheKey && state.embeddingCache.has(cacheKey)) {
      const cachedEmbedding = state.embeddingCache.get(cacheKey);
      state.embeddingCache.delete(cacheKey);
      state.embeddingCache.set(cacheKey, cachedEmbedding);
      return cachedEmbedding;
    }

    const embedding = await generateEmbedding(title);
    if (cacheKey && Array.isArray(embedding) && embedding.length > 0) {
      cacheEmbedding(cacheKey, embedding);
    }

    return embedding;
  };

  // Run Firefox local ML to generate a semantic embedding for a title.
  const generateEmbedding = async (title) => {
    if (!title || typeof title !== "string") return null;

    try {
      const { createEngine } = ChromeUtils.importESModule(
        "chrome://global/content/ml/EngineProcess.sys.mjs"
      );
      const engine = await createEngine({
        taskName: "feature-extraction",
        modelId: "Mozilla/smart-tab-embedding",
        modelHub: "huggingface",
        engineId: "embedding-engine",
      });

      const result = await engine.run({ args: [title] });
      let embedding;

      if (result?.[0]?.embedding && Array.isArray(result[0].embedding)) {
        embedding = result[0].embedding;
      } else if (result?.[0] && Array.isArray(result[0])) {
        embedding = result[0];
      } else if (Array.isArray(result)) {
        embedding = result;
      } else {
        return null;
      }

      const pooled = averageEmbedding(embedding);
      if (
        Array.isArray(pooled) &&
        pooled.length > 0 &&
        typeof pooled[0] === "number"
      ) {
        const norm = Math.sqrt(
          pooled.reduce((sum, value) => sum + value * value, 0)
        );
        return norm === 0 ? pooled : pooled.map((value) => value / norm);
      }

      return null;
    } catch (error) {
      console.error("[TabSort][AI] Error generating embedding:", error);
      return null;
    }
  };

  // Read the user's preferred AI provider from Firefox prefs.
  const getPreferredAIProvider = () => {
    try {
      return Services.prefs.getStringPref(
        PREFS.PROVIDER,
        PROVIDERS.FIREFOX_LOCAL
      );
    } catch {
      return PROVIDERS.FIREFOX_LOCAL;
    }
  };

  // Read and trim the Gemini API key from Firefox prefs.
  const getGeminiApiKey = () => {
    try {
      return Services.prefs.getStringPref(PREFS.GEMINI_API_KEY, "").trim();
    } catch {
      return "";
    }
  };

  // Read and trim the OpenRouter API key from Firefox prefs.
  const getOpenRouterApiKey = () => {
    try {
      return Services.prefs.getStringPref(PREFS.OPENROUTER_API_KEY, "").trim();
    } catch {
      return "";
    }
  };

  // Read and trim the user-selected OpenRouter model name from Firefox prefs.
  const getOpenRouterModel = () => {
    try {
      return Services.prefs.getStringPref(PREFS.OPENROUTER_MODEL, "").trim();
    } catch {
      return "";
    }
  };

  // Read the Groq model preference, using a supported default when it is blank.
  const getGroqModel = () => {
    try {
      return Services.prefs
        .getStringPref(PREFS.GROQ_MODEL, GROQ_CONFIG.DEFAULT_MODEL)
        .trim() || GROQ_CONFIG.DEFAULT_MODEL;
    } catch {
      return GROQ_CONFIG.DEFAULT_MODEL;
    }
  };

  // Read and trim the Groq API key from Firefox prefs.
  const getGroqApiKey = () => {
    try {
      return Services.prefs.getStringPref(PREFS.GROQ_API_KEY, "").trim();
    } catch {
      return "";
    }
  };

  // Read the Mistral model preference, using a supported default when it is blank.
  const getMistralModel = () => {
    try {
      return Services.prefs
        .getStringPref(PREFS.MISTRAL_MODEL, MISTRAL_CONFIG.DEFAULT_MODEL)
        .trim() || MISTRAL_CONFIG.DEFAULT_MODEL;
    } catch {
      return MISTRAL_CONFIG.DEFAULT_MODEL;
    }
  };

  // Read and trim the Mistral API key from Firefox prefs.
  const getMistralApiKey = () => {
    try {
      return Services.prefs.getStringPref(PREFS.MISTRAL_API_KEY, "").trim();
    } catch {
      return "";
    }
  };

  // Collect existing groups in the active workspace for provider reuse decisions.
  const getExistingWorkspaceGroups = (workspaceId) => {
    const existingWorkspaceGroups = new Map();
    if (!workspaceId) {
      return existingWorkspaceGroups;
    }

    const groupSelector = `tab-group:has(tab[zen-workspace-id="${workspaceId}"])`;
    document.querySelectorAll(groupSelector).forEach((groupEl) => {
      if (ns.isGroupLocked?.(groupEl) || ns.isOrdinaryGroup?.(groupEl) === false) return;
      const label = groupEl.getAttribute("label");
      if (!label) return;

      const groupTabs = Array.from(groupEl.querySelectorAll("tab")).filter(
        (tab) => tab.getAttribute("zen-workspace-id") === workspaceId
      );

      if (groupTabs.length > 0) {
        existingWorkspaceGroups.set(label, {
          element: groupEl,
          tabs: groupTabs,
          tabTitles: groupTabs.map((tab) => getTabTitle(tab)),
        });
      }
    });

    return existingWorkspaceGroups;
  };

  // Build the common provider context so all providers receive the same inputs.
  const buildProviderContext = (tabs, { mode = "new-tabs", workspaceId = getActiveWorkspaceId() } = {}) => {
    const validTabs = Array.isArray(tabs)
      ? tabs.filter((tab) => tab?.isConnected)
      : [];
    const existingWorkspaceGroups = getExistingWorkspaceGroups(workspaceId);
    const groupSelector = workspaceId
      ? `tab-group:has(tab[zen-workspace-id="${workspaceId}"])`
      : "";

    return {
      tabs: validTabs,
      mode,
      workspaceId,
      groupSelector,
      existingWorkspaceGroups,
      allWorkspaceTabs: workspaceId
        ? getFilteredTabs(workspaceId, {
            includeGrouped: true,
            includeSelected: true,
            includePinned: false,
            includeEmpty: false,
            includeGlance: false,
          })
        : [],
    };
  };

  // Turn live tabs into the compact records used by cloud prompts and response mapping.
  const buildCloudTabRecords = (tabs) =>
    tabs.map((tab, index) => {
      const navigationInfo = getTabNavigationInfo(tab);
      return {
        id: `t${index + 1}`,
        tab,
        title: truncateText(
          getTabTitle(tab),
          CLOUD_PROMPT_CONFIG.MAX_TITLE_LENGTH
        ),
        host: navigationInfo.host,
        pathHint: truncateText(
          navigationInfo.pathHint,
          CLOUD_PROMPT_CONFIG.MAX_PATH_HINT_LENGTH
        ),
      };
    });

  // Turn existing groups into compact prompt records shared by cloud providers.
  const buildExistingGroupPromptRecords = (existingWorkspaceGroups) =>
    Array.from(existingWorkspaceGroups.entries()).map(([groupName, groupInfo]) => ({
      name: groupName,
      // Mixed leftovers are not examples of a topic the model should reuse.
      sampleTitles:
        normalizeTopicKey(groupName) === "others"
          ? []
          : groupInfo.tabTitles
              .slice(0, CLOUD_PROMPT_CONFIG.MAX_GROUP_SAMPLE_TITLES)
              .map((title) =>
                truncateText(title, CLOUD_PROMPT_CONFIG.MAX_TITLE_LENGTH)
              ),
    }));

  // Build the provider-agnostic grouping prompt used by cloud models.
  const buildCloudAssignmentsPrompt = (tabRecords, existingGroups, mode = "new-tabs") => {
    const existingGroupsText =
      existingGroups.length === 0
        ? "None"
        : existingGroups
            .map((group) =>
              normalizeTopicKey(group.name) === "others"
                ? `${group.name}: residual bucket only; its contents do not define a topic.`
                : `${group.name}: ${group.sampleTitles.join(" | ") || "No samples"}`
            )
            .join("\n");

    const tabsText = tabRecords
      .map((tab) => {
        const parts = [`${tab.id}`, tab.title];
        if (tab.host) parts.push(`host=${tab.host}`);
        if (tab.pathHint) parts.push(`path=${tab.pathHint}`);
        return parts.join(" | ");
      })
      .join("\n");

    return [
      "Group the incoming browser tabs by browsing task or topic.",
      mode === "reorganize"
        ? "Reorganize mode: these tabs include previously AI-grouped tabs. Reassess every tab against the current tasks; its previous group is not a fixed assignment."
        : "Sort-new-tabs mode: assign only the listed tabs; existing group members are context and stay in place.",
      "First identify coherent tasks among the incoming tabs from their titles, hosts, and paths.",
      "Then compare those tasks with existing topical groups as optional reuse candidates.",
      "Create a new group when at least two incoming tabs share a distinct task that an existing group does not clearly cover.",
      "Creating new groups and reusing existing groups are equally valid outcomes.",
      "Reuse an existing topical group only when its purpose and sample titles clearly match the task; use its exact name when you do.",
      "An existing group's presence or broad name alone is not evidence that a tab belongs there.",
      "Keep distinct tasks separate even when a broad existing group could contain both.",
      "Avoid duplicate topics and unnecessary fragmentation, while keeping every useful distinct task visible.",
      "Prefer broad task-oriented groups over narrow repo-name or page-name groups.",
      "Favor useful work-context grouping over literal title similarity.",
      "Use concise title-case task names with at most 24 characters.",
      "Never create a new topical group for a single tab; one incoming tab may join a clearly matching existing topical group.",
      "Only after deciding useful new groups and clear existing-group matches, assign remaining unrelated or uncertain tabs to Others.",
      "Others is a residual bucket, not a topical group. Its mixed contents must never guide topic matching or absorb an identifiable task.",
      "An existing Others group does not reduce the need to create useful new groups.",
      "For residual tabs, reuse the exact existing Others name if present; otherwise use Others. This bucket may contain a single residual tab.",
      "Example: with existing Coding and Others, flight and hotel tabs form Travel Planning; a matching coding-doc tab may join Coding; one unrelated tab may go to Others.",
      "Assign each incoming tab exactly once. You decide the final grouping.",
      "Choose exactly one iconId for each assignment from the supported icon catalog below.",
      'Return only valid JSON with this exact shape: {"assignments":[{"tabId":"t1","topic":"Example","iconId":"folder"}]}.',
      "Do not include markdown fences, prose, explanations, or extra keys.",
      "",
      "Incoming tabs to group:",
      tabsText,
      "",
      "Existing groups (optional reuse context):",
      existingGroupsText,
      "",
      "Supported icons:",
      getIconCatalogPromptText(),
    ].join("\n");
  };

  // Remove markdown fences when a model wraps JSON in formatting.
  const stripCodeFences = (text) => {
    if (!text || typeof text !== "string") return "";
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  };

  // Extract the outer JSON object from model output that may include extra text.
  const extractJsonObjectText = (text) => {
    if (!text || typeof text !== "string") return "";

    const trimmed = text.trim();
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      return trimmed;
    }

    return trimmed.slice(firstBrace, lastBrace + 1);
  };

  // Parse a model text response into the expected assignments JSON payload.
  const parseAssignmentsPayloadText = (text) =>
    JSON.parse(extractJsonObjectText(stripCodeFences(text)));

  // Scale cloud output tokens with the number of tabs and existing groups in context.
  const getCloudMaxOutputTokens = (tabCount, existingGroupCount = 0) =>
    Math.min(
      CLOUD_PROMPT_CONFIG.MAX_OUTPUT_TOKENS,
      Math.max(
        CLOUD_PROMPT_CONFIG.BASE_OUTPUT_TOKENS,
        CLOUD_PROMPT_CONFIG.BASE_OUTPUT_TOKENS +
          tabCount * CLOUD_PROMPT_CONFIG.OUTPUT_TOKENS_PER_TAB +
          existingGroupCount *
            CLOUD_PROMPT_CONFIG.OUTPUT_TOKENS_PER_EXISTING_GROUP
      )
    );

  // Convert provider assignment payloads into live tab-topic records for sorting.
  const mapProviderAssignments = (assignments, tabRecords) => {
    const tabMap = new Map(tabRecords.map((record) => [record.id, record]));
    const seenTabIds = new Set();

    return assignments
      .map((assignment) => {
        if (
          !assignment ||
          typeof assignment.tabId !== "string" ||
          typeof assignment.topic !== "string"
        ) {
          return null;
        }

        const tabRecord = tabMap.get(assignment.tabId);
        if (!tabRecord || seenTabIds.has(assignment.tabId)) {
          return null;
        }

        seenTabIds.add(assignment.tabId);
        return {
          tab: tabRecord.tab,
          topic: assignment.topic,
          iconId:
            typeof assignment.iconId === "string"
              ? normalizeIconId(assignment.iconId)
              : "",
        };
      })
      .filter(Boolean);
  };

  // Store the last provider feedback so the sorting layer can show it once.
  const setProviderFeedback = (feedback) => {
    state.lastProviderFeedback = feedback || null;
  };

  // Consume the last provider feedback so it is not shown more than once.
  const consumeProviderFeedback = () => {
    const feedback = state.lastProviderFeedback;
    state.lastProviderFeedback = null;
    return feedback;
  };

  // Format provider ids into short user-facing labels for logs and toasts.
  const formatProviderLabel = (providerId) => {
    switch (providerId) {
      case PROVIDERS.GEMINI:
        return "Gemini";
      case PROVIDERS.OPENROUTER:
        return "OpenRouter";
      case PROVIDERS.GROQ:
        return "Groq";
      case PROVIDERS.MISTRAL:
        return "Mistral";
      case PROVIDERS.FIREFOX_LOCAL:
        return "Firefox local AI";
      default:
        return providerId || "AI provider";
    }
  };

  // Create a provider error with both console detail and a user-facing message.
  const createProviderError = (
    providerId,
    userMessage,
    { cause = null, retryable = false, status = null, rawTextPreview = "" } = {}
  ) => {
    const error = new Error(userMessage);
    error.providerId = providerId;
    error.userMessage = userMessage;
    error.retryable = retryable;
    error.status = status;
    error.rawTextPreview = rawTextPreview;
    error.cause = cause;
    return error;
  };

  // Validate the generic assignments shape returned by a cloud provider.
  const hasValidAssignmentsPayload = (payload) =>
    Array.isArray(payload?.assignments);

  // Call an OpenAI-compatible chat endpoint and convert failures into the
  // standard visible cloud-to-local fallback feedback.
  const requestOpenAICompatibleAssignments = async ({
    providerId,
    providerLabel,
    apiUrl,
    apiKey,
    modelName,
    prompt,
    maxOutputTokens,
    timeoutMs,
    tokenLimitField,
  }) => {
    const showFailure = (message) => {
      setProviderFeedback({
        providerId,
        title: providerLabel,
        message: `${message} Using Firefox local AI instead.`,
      });
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestBody = {
        model: modelName,
        messages: [
          {
            role: "system",
            content: "You are a tab-grouping assistant. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      };
      requestBody[tokenLimitField] = maxOutputTokens;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        let errorData = null;
        try {
          errorData = responseText ? JSON.parse(responseText) : null;
        } catch {
          // The status code is enough to produce useful fallback feedback.
        }
        const status = response.status;
        const errorCode = errorData?.error?.code || errorData?.code || "";
        let message = `${providerLabel} request failed`;

        if (status === 401 || status === 403) {
          message = `${providerLabel} rejected the API key`;
        } else if (status === 404) {
          message = `${providerLabel} model is unavailable`;
        } else if (status === 429) {
          message = `${providerLabel} rate limit was reached`;
        } else if (status === 400) {
          message = `${providerLabel} rejected the request; check the selected model`;
        } else if (status >= 500) {
          message = `${providerLabel} is temporarily unavailable`;
        }

        console.warn(
          `[TabSort][${providerLabel}] Chat request failed with status ${status}${
            errorCode ? ` (${errorCode})` : ""
          }.`
        );
        showFailure(message);
        return null;
      }

      const responseData = await response.json();
      const content = responseData?.choices?.[0]?.message?.content;
      const rawText =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content
                .map((part) =>
                  typeof part === "string"
                    ? part
                    : typeof part?.text === "string"
                      ? part.text
                      : ""
                )
                .join("")
                .trim()
            : "";

      if (!rawText) {
        showFailure(`${providerLabel} returned an empty response`);
        return null;
      }

      let payload;
      try {
        payload = parseAssignmentsPayloadText(rawText);
      } catch (error) {
        console.warn(
          `[TabSort][${providerLabel}] Could not parse the chat response as JSON:`,
          error
        );
        showFailure(`${providerLabel} returned invalid JSON`);
        return null;
      }

      if (!hasValidAssignmentsPayload(payload)) {
        showFailure(`${providerLabel} returned an invalid assignments response`);
        return null;
      }

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        showFailure(
          `${providerLabel} request timed out after ${Math.round(timeoutMs / 1000)}s`
        );
      } else if (error instanceof TypeError) {
        showFailure(`${providerLabel} network request failed`);
      } else {
        console.warn(`[TabSort][${providerLabel}] Chat request failed:`, error);
        showFailure(`${providerLabel} request failed`);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  Object.assign(ns, {
    averageEmbedding,
    cosineSimilarity,
    clusterEmbeddings,
    batchDOMUpdates,
    processTabsInBatches,
    getEmbeddingCacheKey,
    cacheEmbedding,
    getCachedEmbeddingForTab,
    generateEmbedding,
    getPreferredAIProvider,
    getGeminiApiKey,
    getOpenRouterApiKey,
    getOpenRouterModel,
    getGroqApiKey,
    getGroqModel,
    getMistralApiKey,
    getMistralModel,
    getExistingWorkspaceGroups,
    buildProviderContext,
    buildCloudTabRecords,
    buildExistingGroupPromptRecords,
    buildCloudAssignmentsPrompt,
    stripCodeFences,
    extractJsonObjectText,
    parseAssignmentsPayloadText,
    getCloudMaxOutputTokens,
    mapProviderAssignments,
    setProviderFeedback,
    consumeProviderFeedback,
    formatProviderLabel,
    createProviderError,
    hasValidAssignmentsPayload,
    requestOpenAICompatibleAssignments,
  });
})();
