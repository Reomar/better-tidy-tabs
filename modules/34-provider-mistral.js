(() => {
  // Implement the Mistral cloud provider using the shared chat-completion flow.
  const ns = window.BetterTidyTabs;
  const { PROVIDERS, MISTRAL_CONFIG } = ns;
  const {
    buildCloudAssignmentsPrompt,
    buildCloudTabRecords,
    buildExistingGroupPromptRecords,
    formatProviderLabel,
    getCloudMaxOutputTokens,
    getExistingWorkspaceGroups,
    getMistralApiKey,
    getMistralModel,
    mapProviderAssignments,
    requestOpenAICompatibleAssignments,
    setProviderFeedback,
  } = ns;

  const assignTopicsWithMistral = async (context) => {
    if (!Array.isArray(context?.tabs) || context.tabs.length === 0) return [];

    const providerLabel = formatProviderLabel(PROVIDERS.MISTRAL);
    const apiKey = getMistralApiKey();
    if (!apiKey) {
      setProviderFeedback({
        providerId: PROVIDERS.MISTRAL,
        title: providerLabel,
        message: "Mistral API key is missing. Using Firefox local AI instead.",
      });
      return null;
    }

    const modelName = getMistralModel();
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
      providerId: PROVIDERS.MISTRAL,
      providerLabel,
      apiUrl: MISTRAL_CONFIG.API_URL,
      apiKey,
      modelName,
      prompt,
      maxOutputTokens: Math.min(
        MISTRAL_CONFIG.MAX_OUTPUT_TOKENS,
        getCloudMaxOutputTokens(tabRecords.length, existingWorkspaceGroups.size)
      ),
      timeoutMs: MISTRAL_CONFIG.REQUEST_TIMEOUT_MS,
      tokenLimitField: MISTRAL_CONFIG.TOKEN_LIMIT_FIELD,
    });

    if (!responseData) return null;
    return mapProviderAssignments(responseData, tabRecords, existingWorkspaceGroups);
  };

  ns.registerProvider({
    id: PROVIDERS.MISTRAL,
    isCloud: true,
    assignTopics: assignTopicsWithMistral,
  });
})();
