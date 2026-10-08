const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHarness, jsonResponse } = require('./harness.cjs');
const fixtureScope = {};
vm.runInNewContext(fs.readFileSync(`${__dirname}/fixtures.js`, 'utf8'), fixtureScope);
const fixtures = fixtureScope.BetterTidyTabsFixtures;
const plain = (value) => JSON.parse(JSON.stringify(value));
const group = (tabIds, overrides = {}) => ({ id: 'g1', topic: 'Payments', iconId: 'folder', existingGroupId: null, tabIds, ...overrides });
const plan = (groups, unassignedTabIds = []) => ({ groups, unassignedTabIds });
const addPair = (h) => [h.addTab({ id: 'a', title: 'Payment callback' }), h.addTab({ id: 'b', title: 'Payment docs' })];
const assignments = (tabs, overrides = {}) => tabs.map((tab) => ({ tab, groupId: 'g1', topic: 'Payments', iconId: 'folder', existingGroupId: null, ...overrides }));
const fakeProvider = (h, fn) => {
  h.world.prefs.set(h.ns.PREFS.PROVIDER, 'gemini');
  h.ns.registerProvider({ id: 'gemini', assignTopics: fn });
};

function referencePayload(fixture, records) {
  const sourceIds = new Map(records.map((record) => [record.tab.id, record.id]));
  const components = fixture.tabs.map((tab) => new Set([tab.id]));
  for (const [a, b] of fixture.together) {
    const left = components.find((set) => set.has(a));
    const right = components.find((set) => set.has(b));
    if (left !== right) { right.forEach((id) => left.add(id)); components.splice(components.indexOf(right), 1); }
  }
  return plan(components.filter((set) => set.size > 1).map((set, index) => group(
    [...set].map((id) => sourceIds.get(id)), { id: `g${index + 1}`, topic: fixture.label || 'Related Pages' })),
    components.filter((set) => set.size === 1).flatMap((set) => [...set].map((id) => sourceIds.get(id))));
}
const sameCluster = (clusters, a, b) => clusters.some((cluster) => cluster.includes(a) && cluster.includes(b));
function oldClusters(vectors, similarity) {
  const used = new Set(), groups = [];
  for (let i = 0; i < vectors.length; i++) {
    if (used.has(i)) continue;
    const group = [i]; used.add(i);
    for (let j = i + 1; j < vectors.length; j++) if (!used.has(j) && similarity(vectors[i], vectors[j]) >= 0.45) {
      group.push(j); used.add(j);
    }
    groups.push(group);
  }
  return groups;
}

let oldMisses = 0, newMisses = 0, oldFalseJoins = 0, newFalseJoins = 0;
for (const fixture of fixtures) {
  test(`local fixture: ${fixture.name}`, async () => {
    const embeddings = new Map(fixture.tabs.map((tab) => [tab.title, Array.from(tab.vector)]));
    const h = createHarness({ embeddings, namer: fixture.label || 'Related Pages' });
    const tabs = fixture.tabs.map(h.addTab);
    const records = h.ns.buildCloudTabRecords(tabs);
    const orderedVectors = records.map((record) => embeddings.get(record.title));
    const current = h.ns.clusterEmbeddings(orderedVectors, 0.45, records)
      .map((members) => members.map((index) => records[index].tab.id));
    const baseline = oldClusters(fixture.tabs.map((tab) => Array.from(tab.vector)), h.ns.cosineSimilarity)
      .map((members) => members.map((index) => fixture.tabs[index].id));
    for (const [a, b] of fixture.together) {
      oldMisses += !sameCluster(baseline, a, b); newMisses += !sameCluster(current, a, b);
      assert.ok(sameCluster(current, a, b), `${a} and ${b} must stay together`);
    }
    for (const [a, b] of fixture.separate) {
      oldFalseJoins += sameCluster(baseline, a, b); newFalseJoins += sameCluster(current, a, b);
      assert.ok(!sameCluster(current, a, b), `${a} and ${b} must stay separate`);
    }
    const context = h.ns.buildProviderContext(tabs);
    const result = await h.ns.getProvider('firefox-local').assignTopics(context);
    const runtimeClusters = Object.values(h.ns.buildFinalGroupsFromAssignments(result)).map((g) => g.tabs.map((t) => t.id));
    for (const [a,b] of fixture.together) assert.ok(sameCluster(runtimeClusters, a, b));
    for (const [a,b] of fixture.separate) assert.ok(!sameCluster(runtimeClusters, a, b));
    assert.ok(result.every((row) => row.groupId && row.topic !== 'Others'));
    const reversed = [...records].reverse();
    const permuted = h.ns.clusterEmbeddings([...orderedVectors].reverse(), 0.45, reversed)
      .map((members) => members.map((index) => reversed[index].tab.id).sort()).sort();
    assert.deepEqual(plain(permuted), plain(current.map((members) => [...members].sort()).sort()));
  });
  for (const provider of ['gemini', 'openrouter', 'groq', 'mistral']) {
    test(`${provider} mocked transport fixture: ${fixture.name}`, async () => {
      const h = createHarness({ provider });
      const tabs = fixture.tabs.map(h.addTab), context = h.ns.buildProviderContext(tabs);
      const payload = referencePayload(fixture, context.tabRecords);
      h.world.prefs.set(h.ns.PREFS[`${provider.toUpperCase()}_API_KEY`], 'synthetic-test-key');
      h.world.prefs.set(h.ns.PREFS.OPENROUTER_MODEL, 'synthetic-test-model');
      if (provider === 'groq') {
        h.world.prefs.set('extension.zen-tidy-tabs.groq-model', 'user-selected-model-must-be-ignored');
      }
      h.world.response = jsonResponse(payload, { gemini: provider === 'gemini' });
      const result = await h.ns.getProvider(provider).assignTopics(context);
      const clusters = Object.values(h.ns.buildFinalGroupsFromAssignments(result)).map((g) => g.tabs.map((t) => t.id));
      for (const [a,b] of fixture.together) assert.ok(sameCluster(clusters, a, b));
      for (const [a,b] of fixture.separate) assert.ok(!sameCluster(clusters, a, b));
      assert.equal(h.world.requests.length, 1);
      const request = h.world.requests[0].body;
      const prompt = provider === 'gemini' ? request.contents[0].parts[0].text : request.messages.find((message) => message.role === 'user').content;
      assert.match(prompt, /broadest coherent/);
      assert.match(prompt, /unassignedTabIds/);
      assert.ok(!prompt.includes('linkedBrowser'));
      if (provider === 'groq') {
        assert.equal(h.ns.PREFS.GROQ_MODEL, undefined);
        assert.equal(request.model, 'openai/gpt-oss-20b');
        assert.equal(request.temperature, 0.6);
        assert.equal(request.top_p, 0.95);
        assert.equal(request.reasoning_effort, 'medium');
        assert.equal(request.reasoning_format, 'hidden');
        assert.ok(request.max_completion_tokens <= 2048);
        assert.deepEqual(plain(request.messages.map((message) => message.role)), ['user']);
        assert.equal(request.response_format.type, 'json_schema');
        assert.equal(request.response_format.json_schema.strict, true);
        assert.deepEqual(plain(request.response_format.json_schema.schema.required), ['groups', 'unassignedTabIds']);
      }
    });
  }
}

test('synthetic baseline improves inclusivity without new false joins', () => {
  assert.ok(newMisses < oldMisses); assert.equal(newFalseJoins, 0);
  console.log(`Synthetic vectors: missed positive pairs ${oldMisses} -> ${newMisses}; false joins ${oldFalseJoins} -> ${newFalseJoins}.`);
});

test('URL context preserves queries and decoded paths within exact bounds', () => {
  const h = createHarness();
  const tab = h.addTab({ id: 'a', title: 'x'.repeat(130), url: 'https://www.google.com/search?q=oauth+callback' });
  const record = h.ns.buildCloudTabRecords([tab])[0];
  assert.equal(record.host, 'google.com'); assert.equal(record.pathHint, 'search');
  assert.equal(record.searchHint, 'oauth callback'); assert.equal(record.title.length, 120);
  tab.linkedBrowser.currentURI.spec = 'https://github.com/Team/My%20Repo/blob/main';
  const info = h.ns.getTabNavigationInfo(tab);
  assert.equal(info.pathHint, 'Team/My Repo/blob'); assert.equal(info.repositoryKey, 'team/my repo');
  for (const url of ['about:config', 'chrome://browser/content/browser.xhtml', 'file:///tmp/page', 'invalid']) {
    tab.linkedBrowser.currentURI.spec = url;
    assert.equal(h.ns.getTabNavigationInfo(tab).host, '');
  }
  tab.linkedBrowser.currentURI.spec = 'https://github.com/settings/profile';
  assert.equal(h.ns.getTabNavigationInfo(tab).repositoryKey, '');
});

test('URL boosts support matching but are not stacked', () => {
  const { ns } = createHarness();
  assert.equal(ns.getURLSimilarityBoost({host:'shop.test'}, {host:'shop.test'}), 0.08);
  assert.equal(ns.getURLSimilarityBoost({host:'github.com'}, {host:'github.com'}), 0.03);
  assert.equal(ns.getURLSimilarityBoost({host:'github.com', repositoryKey:'x/y'}, {host:'github.com', repositoryKey:'x/y'}), 0.12);
  assert.equal(ns.getURLSimilarityBoost({}, {}), 0);
});

test('keyword extraction retains Arabic and discounts workspace boilerplate', () => {
  const { ns } = createHarness();
  const arabic = '\u0627\u0644\u0628\u0631\u0645\u062c\u0629';
  assert.ok(ns.extractKeywords([`${arabic} ${arabic} GitHub Google Search`]).includes(arabic));
  const keywords = ns.extractKeywords(['webhook documentation GitHub', 'webhook docs'],
    [['webhook docs'], ['travel docs'], ['cooking docs']]);
  assert.equal(keywords[0], 'webhook'); assert.ok(!keywords.includes('github'));
});

test('local naming uses at most three titles and keywords and restores brands', async () => {
  const h = createHarness({ namer: 'github api iphone' });
  const tabs = ['GitHub API iPhone', 'OAuth callback issue', 'TypeScript integration', 'JavaScript login'].map((title, index) => h.addTab({id:`t${index}`,title}));
  const records = h.ns.buildCloudTabRecords(tabs);
  assert.equal(await h.ns.nameGroupWithSmartTabTopic(records.map((r) => r.title), { records }), 'GitHub API iPhone');
  const input = h.world.engineInputs.at(-1).input;
  assert.ok(input.args[0].split('titles: \n')[1].split('\n').length <= 3);
  assert.ok(input.args[0].split('. titles:')[0].replace('Topic from keywords: ', '').split(',').length <= 3);
  assert.equal(input.options.do_sample, false);
});

test('naming fallback is grounded and cache keys include model/version', async () => {
  const h = createHarness({ namer: 'None' });
  const records = h.ns.buildCloudTabRecords([
    h.addTab({id:'a',title:'SDK overview',url:'https://github.com/team/sdk'}),
    h.addTab({id:'b',title:'SDK reference',url:'https://github.com/team/sdk/issues'}),
  ]);
  assert.equal(await h.ns.nameGroupWithSmartTabTopic(records.map((r) => r.title), {records}), 'SDK');
  assert.match(h.ns.getEmbeddingCacheKey('SDK overview'), /^Mozilla\/smart-tab-embedding:v2:/);
});

test('display collisions and identical fallback labels never merge buckets', () => {
  const h = createHarness(), tabs = [...addPair(h), h.addTab({id:'c',title:'x'}), h.addTab({id:'d',title:'y'})];
  for (const labels of [['Authentication debugging - Academy', 'Authentication debugging - Store'], ['Related Pages', 'Related Pages']]) {
    const buckets = h.ns.buildFinalGroupsFromAssignments([
      ...assignments(tabs.slice(0,2), {groupId:'g1',topic:labels[0]}),
      ...assignments(tabs.slice(2), {groupId:'g2',topic:labels[1]}),
    ]);
    assert.equal(Object.keys(buckets).length, 2);
    assert.ok(Object.values(buckets).every((g) => g.tabs.length === 2 && g.topic && Array.from(g.label).length <= 24));
  }
  const legacy = h.ns.buildFinalGroupsFromAssignments(tabs.map((tab,index) => ({tab,topic:index<2?'Authentication debugging - Academy':'Authentication debugging - Store'})));
  assert.equal(Object.keys(legacy).length, 2);
});

test('duplicate existing labels retain distinct identities and representative hosts', () => {
  const h = createHarness();
  h.addGroup([h.addTab({id:'a',title:'Payment docs',url:'https://docs.test/pay'}), h.addTab({id:'b',title:'Payment issue',url:'https://github.com/team/pay'})], {id:'a-group',label:'Payments'});
  h.addGroup([h.addTab({id:'c',title:'Other payment docs'})], {id:'b-group',label:'Payments'});
  const context = h.ns.buildProviderContext([]);
  assert.equal(context.existingWorkspaceGroups.size, 2);
  const groups = [...context.existingWorkspaceGroups.values()];
  assert.notEqual(groups[0].id, groups[1].id);
  assert.equal(new Set(groups[0].samples.map((r)=>r.host)).size, 2);
  assert.ok(!JSON.stringify(h.ns.buildExistingGroupPromptRecords(context.existingWorkspaceGroups)).includes('linkedBrowser'));
});

test('cloud validation rejects malformed and conflicting plans before mapping', () => {
  const h = createHarness(), tabs = addPair(h), records = h.ns.buildCloudTabRecords(tabs);
  const existing = new Map([['e1',{name:'Payments'}]]);
  const invalid = [null, {}, plan([group(['t1'])], ['t2']), plan([group(['t1','unknown'])]),
    plan([group(['t1','t1'])], ['t2']), plan([group(['t1','t2'])], ['t1']),
    plan([], ['t1']), plan([group(['t1','t2'], {topic:' '})]),
    plan([group(['t1','t2'], {topic:'Others'})]),
    plan([group(['t1','t2'], {topic:'"Others."'})]),
    plan([group(['t1','t2'], {existingGroupId:'missing'})]),
    plan([group(['t1'], {existingGroupId:'e1'}), group(['t2'], {id:'g2',existingGroupId:'e1'})]),
    plan([group(['t1'], {existingGroupId:'e1'}), group(['t2'], {existingGroupId:'e1'})]),
    plan([group(['t1','t2'], {existingGroupId:'e1',topic:'Travel'})]),
  ];
  for (const payload of invalid) assert.throws(() => h.ns.mapProviderAssignments(payload, records, existing));
  assert.equal(h.ns.mapProviderAssignments(plan([], ['t1','t2']), records, existing).length, 0);
  assert.equal(h.ns.mapProviderAssignments(plan([group(['t1'], {existingGroupId:'e1'})], ['t2']), records, existing).length, 1);
});

test('local singleton can reuse a clear destination; ambiguous destinations stay unchanged', async () => {
  const h = createHarness();
  const source = h.addTab({id:'a',title:'Payment callback'});
  h.addGroup([h.addTab({id:'b',title:'Payment docs'})], {id:'a-group',label:'Payments'});
  let result = await h.ns.getProvider('firefox-local').assignTopics(h.ns.buildProviderContext([source]));
  assert.equal(result[0].existingGroupId, 'e1');
  h.addGroup([h.addTab({id:'c',title:'Payment reference'})], {id:'b-group',label:'Other Payments'});
  result = await h.ns.getProvider('firefox-local').assignTopics(h.ns.buildProviderContext([source]));
  assert.equal(result.length, 0);
});

test('valid no-op preserves loose and previously grouped tabs without failure animation', async () => {
  const h = createHarness(), tabs = addPair(h), source = h.addGroup(tabs, {label:'Original'});
  h.ns.markManagedGroup(source); fakeProvider(h, async () => []);
  await h.ns.sortTabsByTopic({mode:'reorganize'});
  assert.equal(h.world.moves.length, 0); assert.equal(tabs[0].group, source);
  assert.equal(h.ns.state.isPlayingFailureAnimation, false);
  assert.match(h.world.toasts[0].message, /No clear groups found/);
});

for (const mutation of ['workspace', 'navigate', 'pin', 'group', 'rename', 'lock', 'destination-workspace', 'destination-remove']) {
  test(`delayed result preserves ${mutation} changes`, async () => {
    const h = createHarness(), tabs = addPair(h);
    const destination = h.addGroup([h.addTab({id:'c',title:'Payment reference'})], {label:'Payments'});
    fakeProvider(h, async (context) => {
      const id = [...context.existingWorkspaceGroups.keys()][0];
      if (mutation === 'workspace') h.world.active = 'other';
      if (mutation === 'navigate') tabs[0].linkedBrowser.currentURI.spec = 'https://other.test/';
      if (mutation === 'pin') tabs[0].pinned = true;
      if (mutation === 'group') h.addGroup([tabs[0]], {label:'Manual'});
      if (mutation === 'rename') destination.setAttribute('label','Renamed');
      if (mutation === 'lock') h.ns.setGroupLocked(destination,true);
      if (mutation === 'destination-workspace') destination.tabs[0].setAttribute('zen-workspace-id','other');
      if (mutation === 'destination-remove') destination.remove();
      return assignments(tabs, {existingGroupId:id});
    });
    await h.ns.sortTabsByTopic();
    if (['navigate','pin','group'].includes(mutation)) {
      assert.ok(!h.world.moves.some((move)=>move[0]==='move' && move[1]==='a'));
    } else assert.equal(h.world.moves.length, 0);
  });
}

test('new group reduced by stale tabs never becomes a singleton', async () => {
  const h = createHarness(), tabs = addPair(h);
  fakeProvider(h, async () => { tabs[0].pinned=true; return assignments(tabs); });
  await h.ns.sortTabsByTopic(); assert.equal(h.world.moves.length, 0);
});

for (const addResult of ['normal','undefined','throw']) {
  test(`group creation ${addResult} keeps collision identities and supports Undo`, async () => {
    const h = createHarness(), tabs = [...addPair(h),h.addTab({id:'c',title:'Travel docs'}),h.addTab({id:'d',title:'Travel plans'})];
    h.world.addResult=addResult;
    fakeProvider(h, async () => [...assignments(tabs.slice(0,2), {topic:'Related Pages'}), ...assignments(tabs.slice(2), {groupId:'g2',topic:'Related Pages'})]);
    await h.ns.sortTabsByTopic();
    assert.notEqual(tabs[0].group,tabs[2].group); assert.ok(tabs.every((tab)=>tab.group));
    h.world.addResult='normal'; await h.ns.undoLastSort();
    assert.ok(tabs.every((tab)=>!tab.group));
    assert.deepEqual(h.tabs().map((tab)=>tab.id), ['a','b','c','d']);
  });
}

test('reorganization restores an emptied source group including label, color and collapse', async () => {
  const h = createHarness(), tabs = addPair(h), residual = h.addTab({id:'c',title:'Uncertain'});
  const source = h.addGroup(tabs, {id:'source',label:'Others',color:'red'});
  source.collapsed=true; h.ns.markManagedGroup(source);
  fakeProvider(h, async () => assignments(tabs));
  await h.ns.sortTabsByTopic({mode:'reorganize'});
  assert.equal(source.isConnected,false); assert.equal(residual.group,null);
  await h.ns.undoLastSort();
  assert.equal(tabs[0].group.id,'source'); assert.equal(tabs[0].group.getAttribute('label'),'Others');
  assert.equal(tabs[0].group.color,'red'); assert.equal(tabs[0].group.collapsed,true);
});

test('Undo refuses restoration over manual layout edits', async () => {
  const h = createHarness(), tabs=addPair(h); fakeProvider(h,async()=>assignments(tabs));
  await h.ns.sortTabsByTopic(); tabs[0].group.setAttribute('label','My Label');
  await h.ns.undoLastSort(); assert.equal(tabs[0].group.getAttribute('label'),'My Label');
  assert.match(h.world.toasts.at(-1).message,/layout changed/);
});

for (const provider of ['gemini','openrouter','groq','mistral']) {
  for (const status of [401,404,429]) {
    test(`${provider} HTTP ${status} falls back locally with feedback`, async () => {
      const h=createHarness({provider}); addPair(h);
      h.world.prefs.set(h.ns.PREFS[`${provider.toUpperCase()}_API_KEY`],'synthetic-test-key');
      h.world.prefs.set(h.ns.PREFS.OPENROUTER_MODEL,'synthetic-test-model');
      h.world.response=jsonResponse({}, {status});
      const result=await h.ns.askAIForMultipleTopics(h.ns.getSortableTabs('workspace'));
      assert.equal(result.length,2); assert.ok(h.world.toasts.length);
      assert.match(h.world.toasts[0].message,/Firefox local AI/);
    });
  }
}

test('reorganization can exchange members between destinations even when a source empties first', async () => {
  const h=createHarness();
  const left=addPair(h), right=[h.addTab({id:'c',title:'Store code'}),h.addTab({id:'d',title:'Store docs'})];
  const a=h.addGroup(left,{id:'a-group',label:'Payments'}), b=h.addGroup(right,{id:'b-group',label:'Store'});
  h.ns.markManagedGroup(a); h.ns.markManagedGroup(b);
  fakeProvider(h,async()=>[...assignments(left,{existingGroupId:'e2',topic:'Store'}),
    ...assignments(right,{groupId:'g2',existingGroupId:'e1',topic:'Payments'})]);
  await h.ns.sortTabsByTopic({mode:'reorganize'});
  assert.equal(right[0].group.id,'a-group'); assert.equal(left[0].group.id,'b-group');
  assert.notEqual(left[0].group,right[0].group);
  await h.ns.undoLastSort();
  assert.equal(left[0].group.id,'a-group'); assert.equal(right[0].group.id,'b-group');
});

test('manual tab reordering during a provider request cancels applying the result', async () => {
  const h=createHarness(), tabs=addPair(h);
  fakeProvider(h,async()=>{h.world.blocks.reverse();return assignments(tabs);});
  await h.ns.sortTabsByTopic(); assert.equal(h.world.moves.length,0);
  assert.deepEqual(h.tabs().map((tab)=>tab.id),['b','a']);
});

test('blocked singleton output does not reorder unrelated loose tabs', async () => {
  const h=createHarness(), tabs=addPair(h);
  h.addGroup([h.addTab({id:'c',title:'Manual topic'})],{label:'Manual'});
  const before=h.tabs().map((tab)=>tab.id);
  fakeProvider(h,async()=>assignments([tabs[0]]));
  await h.ns.sortTabsByTopic(); assert.deepEqual(h.tabs().map((tab)=>tab.id),before);
});

test('live validation runner reports actual provider outcomes without browser mutations', async () => {
  const h=createHarness();
  h.context.window.BetterTidyTabsFixtures=fixtures;
  vm.runInContext(fs.readFileSync(`${__dirname}/live-validation.js`,'utf8'),h.context);
  const result=await h.context.window.BetterTidyTabsValidation.run({providers:['firefox-local','groq']});
  assert.equal(result.length,fixtures.length*2);
  assert.ok(result.filter((row)=>row.provider==='firefox-local').every((row)=>row.status==='completed' && row.baseline));
  assert.ok(result.filter((row)=>row.provider==='groq').every((row)=>row.status==='unavailable'));
  assert.equal(h.world.moves.length,0); assert.equal(h.world.requests.length,0);
  assert.equal(h.ns.state.isSorting,false);
});

for (const provider of ['gemini','openrouter','groq','mistral']) {
  test(`${provider} empty valid plans stay authoritative and incomplete plans fall back`, async () => {
    const h=createHarness({provider}); addPair(h);
    h.world.prefs.set(h.ns.PREFS[`${provider.toUpperCase()}_API_KEY`],'synthetic-test-key');
    h.world.prefs.set(h.ns.PREFS.OPENROUTER_MODEL,'synthetic-test-model');
    h.world.response=jsonResponse(plan([],['t1','t2']),{gemini:provider==='gemini'});
    let result=await h.ns.askAIForMultipleTopics(h.ns.getSortableTabs('workspace'));
    assert.equal(result.length,0); assert.equal(h.world.engineInputs.length,0);
    h.world.response=jsonResponse(plan([],['t1']),{gemini:provider==='gemini'});
    result=await h.ns.askAIForMultipleTopics(h.ns.getSortableTabs('workspace'));
    assert.equal(result.length,2); assert.ok(h.world.toasts.length);
  });
}

test('unknown groups, folders and locked groups cannot lose members or receive stale additions', async () => {
  const h=createHarness(), loose=addPair(h);
  const member=h.addTab({id:'c',title:'Locked member'}), locked=h.addGroup([member],{label:'Payments'});
  h.ns.setGroupLocked(locked,true);
  const manual=h.addGroup([h.addTab({id:'d',title:'Manual member'})],{label:'Manual'});
  const folder=h.addGroup([h.addTab({id:'e',title:'Folder member'})],{label:'Folder'}); folder.isZenFolder=true;
  const eligible=h.ns.getSortableTabs('workspace','reorganize');
  assert.deepEqual(plain(eligible.map((tab)=>tab.id)),['a','b']);
  fakeProvider(h,async()=>assignments([...loose,member],{existingGroupId:'missing'}));
  await h.ns.sortTabsByTopic({mode:'reorganize'});
  assert.equal(h.world.moves.length,0); assert.equal(member.group,locked);
  assert.equal(manual.tabs.length,1); assert.equal(folder.tabs.length,1);
});

test('partial native creation failures retain an Undo snapshot', async () => {
  const h=createHarness(), tabs=addPair(h);
  const nativeAdd=h.context.gBrowser.addTabGroup;
  h.context.gBrowser.addTabGroup=(members,options)=>{nativeAdd([members[0]],options);throw new Error('partial creation');};
  fakeProvider(h,async()=>assignments(tabs));
  await h.ns.sortTabsByTopic();
  assert.equal(h.ns.canUndoSort(),true);
  await h.ns.undoLastSort(); assert.ok(tabs.every((tab)=>!tab.group));
});

test('Undo restores Advanced Tab Groups icons and colors on an emptied source', async () => {
  const h=createHarness(), tabs=addPair(h), source=h.addGroup(tabs,{id:'source',label:'Original',color:'red'});
  const applied=[];
  h.context.advancedTabGroups={savedIcons:{source:'custom-icon'},savedColors:{source:'custom-color'},
    applyGroupIcon:async(group,icon)=>{applied.push([group.id,icon]);},syncGroupColorVars() {}};
  h.ns.markManagedGroup(source); fakeProvider(h,async()=>assignments(tabs));
  await h.ns.sortTabsByTopic({mode:'reorganize'}); await h.ns.undoLastSort();
  assert.ok(applied.some(([id,icon])=>id==='source'&&icon==='custom-icon'));
  assert.equal(h.context.advancedTabGroups.savedColors.source,'custom-color');
});
