(() => {
  // Implement the Groq cloud provider using the shared chat-completion flow.
  const ns = window.BetterTidyTabs;
  const { PROVIDERS, GROQ_CONFIG } = ns;
  const {
    buildCloudAssignmentsPrompt,
    buildCloudTabRecords,
    buildExistingGroupPromptRecords,
    formatProviderLabel,
    getCloudMaxOutputTokens,
    getExistingWorkspaceGroups,
    getGroqApiKey,
    getGroqModel,
    mapProviderAssignments,
    requestOpenAICompatibleAssignments,
    setProviderFeedback,
  } = ns;

  const assignTopicsWithGroq = async (context) => {
    if (!Array.isArray(context?.tabs) || context.tabs.length === 0) return [];

    const providerLabel = formatProviderLabel(PROVIDERS.GROQ);
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      setProviderFeedback({
        providerId: PROVIDERS.GROQ,
        title: providerLabel,
        message: "Groq API key is missing. Using Firefox local AI instead.",
      });
      return null;
    }

    const modelName = getGroqModel();
    const existingWorkspaceGroups =
      context.existingWorkspaceGroups ||
      getExistingWorkspaceGroups(context.workspaceId);
    const tabRecords = context.tabRecords || buildCloudTabRecords(context.tabs);
    const prompt = buildCloudAssignmentsPrompt(
      tabRecords,
      buildExistingGroupPromptRecords(existingWorkspaceGroups),
      context.mode
    );
    const responseData = await requestOpenAICompatibleAssignments({
      providerId: PROVIDERS.GROQ,
      providerLabel,
      apiUrl: GROQ_CONFIG.API_URL,
      apiKey,
      modelName,
      prompt,
      maxOutputTokens: Math.min(
        GROQ_CONFIG.MAX_OUTPUT_TOKENS,
        getCloudMaxOutputTokens(tabRecords.length, existingWorkspaceGroups.size)
      ),
      timeoutMs: GROQ_CONFIG.REQUEST_TIMEOUT_MS,
      tokenLimitField: GROQ_CONFIG.TOKEN_LIMIT_FIELD,
    });

    if (!responseData) return null;
    return mapProviderAssignments(responseData, tabRecords, existingWorkspaceGroups);
  };

  ns.registerProvider({
    id: PROVIDERS.GROQ,
    isCloud: true,
    assignTopics: assignTopicsWithGroq,
  });
})();
