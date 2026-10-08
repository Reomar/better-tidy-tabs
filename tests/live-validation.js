(() => {
  // Run synthetic metadata through real engines without creating or moving browser tabs.
  const ns = window.BetterTidyTabs;
  const fixtures = window.BetterTidyTabsFixtures;
  if (!ns?.validateGroupingPayload || !Array.isArray(fixtures))
    throw new Error("Load the updated mod and fixtures.js in the browser chrome window first.");

  const baselineClusters = (vectors) => {
    const used = new Set(), clusters = [];
    for (let index = 0; index < vectors.length; index++) {
      if (used.has(index)) continue;
      const cluster = [index]; used.add(index);
      for (let other = index + 1; other < vectors.length; other++) {
        if (!used.has(other) && ns.cosineSimilarity(vectors[index], vectors[other]) >= 0.45) {
          used.add(other); cluster.push(other);
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  };
  const sameCluster = (clusters, a, b) => clusters.some((cluster) => cluster.includes(a) && cluster.includes(b));
  const evaluate = (fixture, clusters) => ({
    missedTogether: fixture.together.filter(([a, b]) => !sameCluster(clusters, a, b)),
    falseJoins: fixture.separate.filter(([a, b]) => sameCluster(clusters, a, b)),
  });
  const makeTabs = (fixture) => fixture.tabs.map(({ id, title, url }) => ({
    id, isConnected: true,
    getAttribute: (key) => key === "label" ? title : null,
    linkedBrowser: { currentURI: { spec: url } },
    querySelector: () => null,
  }));

  const run = async ({ providers = ["firefox-local", "gemini", "openrouter", "groq", "mistral"] } = {}) => {
    if (ns.state.isSorting) throw new Error("Wait for the active sort to finish.");
    const report = [];
    const previousFeedback = ns.state.lastProviderFeedback;
    ns.state.isSorting = true;
    ns.updateButtonsVisibilityState?.();
    try {
      for (const providerId of providers) {
        const provider = ns.getProvider(providerId);
        if (!provider) throw new Error(`Unknown provider: ${providerId}`);
        for (const fixture of fixtures) {
          if (ns.state.disposed || window.BetterTidyTabs !== ns) return report;
          const context = ns.buildProviderContext(makeTabs(fixture), { workspaceId: null });
          const started = performance.now();
          try {
            // Call providers directly: a failure must not be mistaken for local fallback success.
            const assignments = await provider.assignTopics(context);
            if (!Array.isArray(assignments)) {
              report.push({ provider: providerId, fixture: fixture.name, status: "unavailable" });
              continue;
            }
            const groups = Object.values(ns.buildFinalGroupsFromAssignments(assignments));
            const clusters = groups.map((group) => group.tabs.map((tab) => tab.id));
            const row = { provider: providerId, fixture: fixture.name, status: "completed",
              elapsedMs: Math.round(performance.now() - started), ...evaluate(fixture, clusters),
              names: groups.map((group) => ({ label: group.label, fullTopic: group.topic,
                memberTitles: group.tabs.map(ns.getTabTitle) })),
            };
            if (providerId === "firefox-local") {
              const records = context.tabRecords;
              const vectors = await ns.processTabsInBatches(records.map((record) => record.tab),
                ns.CONFIG.EMBEDDING_BATCH_SIZE, records);
              const valid = vectors.map((vector, index) => ({ vector, record: records[index] }))
                .filter(({ vector }) => Array.isArray(vector) && vector.length && vector.every(Number.isFinite));
              const baseline = baselineClusters(valid.map(({ vector }) => vector))
                .map((members) => members.map((index) => valid[index].record.tab.id));
              row.baseline = evaluate(fixture, baseline);
            }
            report.push(row);
          } catch (error) {
            // Report safe metadata; provider errors can contain response text.
            report.push({ provider: providerId, fixture: fixture.name, status: "failed",
              httpStatus: Number.isInteger(error?.status) ? error.status : null });
          }
        }
      }
      return report;
    } finally {
      ns.state.lastProviderFeedback = previousFeedback;
      ns.state.isSorting = false;
      if (!ns.state.disposed) ns.updateButtonsVisibilityState?.();
    }
  };

  window.BetterTidyTabsValidation = { run };
})();
