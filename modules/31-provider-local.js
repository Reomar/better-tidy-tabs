(() => {
  // Local semantics choose membership; naming happens only after clustering.
  const ns = window.BetterTidyTabs;
  const { PROVIDERS, CONFIG, GROUPING_CONFIG } = ns;
  const {
    processTabsInBatches, clusterEmbeddings, getCachedEmbeddingForTab,
    cosineSimilarity, getURLSimilarityBoost, buildCloudTabRecords,
    selectRepresentativeRecords, tokenizeText, getFallbackIconIdForTopic,
  } = ns;

  const STOP_WORDS = new Set((
    "the and for are but not you all can had her was one our out day get has him his " +
    "how new now old see two way who did its let put say she too use with from this " +
    "that your into about using guide page home google search youtube github docs " +
    "documentation issue issues pull request official website"
  ).split(" "));

  const meaningfulWords = (titles) => titles.flatMap(tokenizeText)
    .filter((word) => !STOP_WORDS.has(word));

  // Distinguish a cluster from workspace vocabulary, instead of counting boilerplate.
  const extractKeywords = (titles, workspaceClusters = [titles]) => {
    const words = meaningfulWords(titles);
    const counts = new Map();
    words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
    const documents = workspaceClusters.map((cluster) => new Set(meaningfulWords(cluster)));
    return [...counts].map(([word, count]) => ({ word,
      score: count / (words.length || 1) * (1 + Math.log(
        (documents.length + 1) / (1 + documents.filter((doc) => doc.has(word)).length))),
    })).sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
      .slice(0, 3).map(({ word }) => word);
  };

  // Keep acronyms and recognizable brands when generation changes their casing.
  const restoreNameCasing = (name, titles) => {
    const vocabulary = new Map();
    for (const token of titles.join(" ").match(/[\p{L}\p{N}]+/gu) || []) {
      if (/^[A-Z0-9]{2,}$/.test(token) || /[a-z][A-Z]/.test(token))
        vocabulary.set(token.toLowerCase(), token);
    }
    for (const brand of ["GitHub", "API", "iPhone", "YouTube", "OAuth", "JavaScript", "TypeScript"])
      vocabulary.set(brand.toLowerCase(), brand);
    return name.replace(/[\p{L}\p{N}]+/gu, (word) => vocabulary.get(word.toLowerCase()) || word)
      .replace(/^([a-z])/, (first) => first.toUpperCase());
  };

  const fallbackGroupName = (records) => {
    const repository = records[0]?.repositoryKey;
    if (repository && records.every((record) => record.repositoryKey === repository))
      return restoreNameCasing(repository.split("/")[1].replace(/[-_]+/g, " "), records.map((r) => r.title));
    const host = records[0]?.host;
    if (host && host !== "localhost" && host !== "127.0.0.1" &&
        !GROUPING_CONFIG.MULTIPURPOSE_HOSTS.includes(host) && records.every((record) => record.host === host))
      return host;
    return "Related Pages";
  };

  const nameGroupWithSmartTabTopic = async (titles, { records = [], workspaceClusters = [titles] } = {}) => {
    const keywords = extractKeywords(titles, workspaceClusters);
    const samples = records.length ? selectRepresentativeRecords(records).map((record) => record.title)
      : [...new Set(titles)].sort().slice(0, 3);
    const input = `Topic from keywords: ${keywords.join(",")}. titles: \n${samples.join("\n")}`;
    try {
      const { createEngine } = ChromeUtils.importESModule("chrome://global/content/ml/EngineProcess.sys.mjs");
      const engine = await createEngine({
        taskName: "text2text-generation", modelId: "Mozilla/smart-tab-topic",
        modelHub: "huggingface", engineId: "group-namer",
      });
      const result = await engine.run({ args: [input],
        options: { max_new_tokens: 8, do_sample: false } });
      const name = (result[0]?.generated_text || "").split("\n").map((line) => line.trim())
        .find(Boolean)?.replace(/^['"`]+|['"`]+$/g, "").replace(/[.?!,:;]+$/g, "").trim();
      if (name && !/^(none|adult content|group|others)$/i.test(name) && /[a-z]/i.test(name))
        return restoreNameCasing(name, titles);
    } catch (error) {
      console.warn("[TabSort][Local] Naming unavailable; using grounded fallback.", error);
    }
    return fallbackGroupName(records);
  };

  // Require a clear destination for the entire candidate, including singleton candidates.
  const findLocalGroupMatch = (candidate, records, vectors, destinations) => {
    const matches = destinations.map((destination) => {
      const members = candidate.map((index) => {
        const scores = destination.samples.map((sample) => {
          const semantic = cosineSimilarity(vectors[index], sample.embedding);
          return { semantic, boosted: Math.min(1, semantic + getURLSimilarityBoost(records[index], sample)) };
        });
        return {
          semantic: scores.reduce((sum, score) => sum + score.semantic, 0) / scores.length,
          boosted: scores.reduce((sum, score) => sum + score.boosted, 0) / scores.length,
        };
      });
      return { ...destination,
        score: members.reduce((sum, member) => sum + member.boosted, 0) / members.length,
        eligible: members.every((member) => member.semantic >= GROUPING_CONFIG.REUSE_MEMBER_SEMANTIC),
      };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const best = matches[0];
    return best?.eligible && best.score >= GROUPING_CONFIG.REUSE_THRESHOLD &&
      (!matches[1] || best.score - matches[1].score >= GROUPING_CONFIG.REUSE_MARGIN) ? best : null;
  };

  const assignTopicsWithLocalAI = async (context) => {
    if (!context?.tabs?.length) return [];
    const allRecords = context.tabRecords || buildCloudTabRecords(context.tabs);
    const allVectors = await processTabsInBatches(allRecords.map((record) => record.tab),
      CONFIG.EMBEDDING_BATCH_SIZE, allRecords);
    const valid = allVectors.map((vector, index) => ({ vector, record: allRecords[index] }))
      .filter(({ vector }) => Array.isArray(vector) && vector.length &&
        vector.every(Number.isFinite) && vector.some((value) => value !== 0));
    if (!valid.length) return null;
    const records = valid.map(({ record }) => record), vectors = valid.map(({ vector }) => vector);
    const clusters = clusterEmbeddings(vectors, CONFIG.SIMILARITY_THRESHOLD, records);
    const destinations = [];
    for (const group of context.existingWorkspaceGroups?.values() || []) {
      const samples = [];
      for (const sample of group.samples) {
        const embedding = await getCachedEmbeddingForTab(sample.tab, sample.title);
        if (Array.isArray(embedding) && embedding.length && embedding.every(Number.isFinite) &&
            embedding.some((value) => value !== 0)) samples.push({ ...sample, embedding });
      }
      if (samples.length) destinations.push({ id: group.id, name: group.name, samples });
    }
    const incoming = new Set(records.map((record) => record.tab));
    const workspaceClusters = clusters.map((cluster) => cluster.map((index) => records[index].title));
    for (const group of context.existingWorkspaceGroups?.values() || []) {
      const titles = group.tabRecords.filter((record) => !incoming.has(record.tab)).map((record) => record.title);
      if (titles.length) workspaceClusters.push(titles);
    }
    const assignments = [];
    for (let index = 0; index < clusters.length; index++) {
      const cluster = clusters[index];
      const destination = findLocalGroupMatch(cluster, records, vectors, destinations);
      if (!destination && cluster.length < 2) continue;
      const groupRecords = cluster.map((member) => records[member]);
      const topic = destination?.name || await nameGroupWithSmartTabTopic(
        groupRecords.map((record) => record.title), { records: groupRecords, workspaceClusters });
      const groupId = destination ? `existing:${destination.id}` : `local:${index + 1}`;
      for (const record of groupRecords) assignments.push({ tab: record.tab, groupId, topic,
        iconId: getFallbackIconIdForTopic(topic), existingGroupId: destination?.id || null });
    }
    return assignments;
  };

  ns.registerProvider({ id: PROVIDERS.FIREFOX_LOCAL, isCloud: false, assignTopics: assignTopicsWithLocalAI });
  Object.assign(ns, { extractKeywords, restoreNameCasing, fallbackGroupName,
    nameGroupWithSmartTabTopic, findLocalGroupMatch });
})();
