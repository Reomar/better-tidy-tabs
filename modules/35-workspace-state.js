(() => {
  // Track editable groups and keep one reversible layout per workspace.
  const ns = window.BetterTidyTabs;
  const { PREFS, state, getActiveWorkspaceId, getFilteredTabs } = ns;

  const getTabGroup = (tab) => tab?.closest?.("tab-group") || null;
  const groupTabs = (group) => Array.from(group?.querySelectorAll("tab") || [])
    .filter((tab) => !tab.hasAttribute("zen-empty-tab") && !tab.hasAttribute("zen-glance-tab"));
  const getWorkspaceGroups = (workspaceId) =>
    Array.from(new Set(getFilteredTabs(workspaceId, { includeGrouped: true })
      .map(getTabGroup).filter(Boolean)));
  const isOrdinaryGroup = (group) => !!group?.isConnected &&
    !group.pinned && !group.isZenFolder && !group.group &&
    !group.hasAttribute("split-view-group") &&
    !group.hasAttribute("zen-folder") && !group.querySelector("tab-group") &&
    !groupTabs(group).some((tab) => tab.pinned || tab.splitview);

  const readOwnership = () => {
    try {
      const value = JSON.parse(Services.prefs.getStringPref(PREFS.GROUP_OWNERSHIP, "{}"));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const saveOwnership = (records) => {
    try {
      Services.prefs.setStringPref(PREFS.GROUP_OWNERSHIP, JSON.stringify(records));
    } catch (error) {
      console.warn("[TabSort] Could not save group ownership:", error);
    }
  };
  const ownershipKey = (group) => group?.id ? `group:${group.id}` : "";
  const getGroupRecord = (group) => readOwnership()[ownershipKey(group)] || null;
  const isGroupLocked = (group) => getGroupRecord(group)?.locked === true;
  const isManagedGroup = (group) => {
    const record = getGroupRecord(group);
    const tabs = groupTabs(group);
    // Renaming a group or adding tabs by hand protects it automatically.
    return isOrdinaryGroup(group) && tabs.length > 0 && record?.managed === true && !record.locked &&
      record.workspaceId === tabs[0].getAttribute("zen-workspace-id") &&
      record.label === group.getAttribute("label") &&
      Array.isArray(record.tabIds) && tabs.every((tab) =>
        tab.id && record.tabIds.includes(tab.id));
  };
  const writeGroupRecord = (group, changes) => {
    const key = ownershipKey(group);
    if (!key) return;
    const records = readOwnership();
    records[key] = { ...(records[key] || {}), ...changes };
    saveOwnership(records);
  };
  const markManagedGroup = (group) => {
    if (!isOrdinaryGroup(group) || isGroupLocked(group)) return;
    writeGroupRecord(group, {
      managed: true,
      workspaceId: groupTabs(group)[0]?.getAttribute("zen-workspace-id") || "",
      label: group.getAttribute("label") || "",
      tabIds: groupTabs(group).map((tab) => tab.id).filter(Boolean),
    });
  };
  const setGroupManaged = (group, managed) => {
    if (managed) markManagedGroup(group);
    else writeGroupRecord(group, { managed: false });
  };
  const setGroupLocked = (group, locked) => writeGroupRecord(group, { locked });
  const forgetGroupRecord = (group) => {
    const records = readOwnership();
    delete records[ownershipKey(group)];
    saveOwnership(records);
  };

  const getSortableTabs = (workspaceId, mode = "new-tabs") => {
    const managedGroups = mode === "reorganize"
      ? new Set(getWorkspaceGroups(workspaceId).filter(isManagedGroup)) : new Set();
    return getFilteredTabs(workspaceId, { includeGrouped: mode === "reorganize" })
      .filter((tab) => {
        // Native split views and folders move multiple tabs as a unit.
        if (tab.splitview || tab.hasAttribute("zen-live-folder-item-id")) return false;
        const group = getTabGroup(tab);
        return !group || managedGroups.has(group);
      });
  };
  const tabLocation = (tab) => ({
    group: getTabGroup(tab),
    workspaceId: tab.getAttribute("zen-workspace-id"),
    url: tab.linkedBrowser?.currentURI?.spec || "",
    title: ns.getTabTitle(tab),
  });
  const captureWorkspaceLayout = (workspaceId) => {
    const tabs = getFilteredTabs(workspaceId, { includeGrouped: true }).filter((tab) =>
      !tab.splitview && (!getTabGroup(tab) || isOrdinaryGroup(getTabGroup(tab))));
    const groups = Array.from(new Set(tabs.map(getTabGroup).filter(Boolean))).map((group) => ({
      element: group, id: group.id, label: group.getAttribute("label") || "",
      color: group.color || group.getAttribute("color") || null,
      collapsed: group.collapsed === true || group.getAttribute("collapsed") === "true",
      record: getGroupRecord(group),
      tabs: groupTabs(group),
      icon: globalThis.advancedTabGroups?.savedIcons?.[group.id] || null,
      atgColor: globalThis.advancedTabGroups?.savedColors?.[group.id] || null,
      colorVars: ["", "-invert", "-favicon", "-favicon-invert"].map((suffix) => {
        const property = `--tab-group-color-${group.id}${suffix}`;
        return [property, document.documentElement.style.getPropertyValue(property)];
      }),
    }));
    return {
      workspaceId, groups,
      tabs: tabs.map((tab) => ({ tab, ...tabLocation(tab) })),
    };
  };
  const isTabUnchanged = (row) => {
    const tab = row.tab;
    return tab?.isConnected && !tab.pinned && !tab.splitview &&
      !tab.hasAttribute("zen-empty-tab") && !tab.hasAttribute("zen-glance-tab") &&
      tab.getAttribute("zen-workspace-id") === row.workspaceId &&
      getTabGroup(tab) === row.group && ns.getTabTitle(tab) === row.title &&
      (tab.linkedBrowser?.currentURI?.spec || "") === row.url;
  };
  const layoutMatches = (snapshot) => {
    // Closed tabs stay closed. Newly opened tabs must not be moved by Undo.
    const liveRows = snapshot.tabs.filter(({ tab }) => tab.isConnected);
    if (liveRows.some((row) => row.tab.pinned || row.tab.splitview ||
      row.tab.getAttribute("zen-workspace-id") !== snapshot.workspaceId ||
      getTabGroup(row.tab) !== row.group)) return false;
    const recordedTabs = new Set(snapshot.tabs.map(({ tab }) => tab));
    const currentOrder = getFilteredTabs(snapshot.workspaceId, { includeGrouped: true })
      .filter((tab) => recordedTabs.has(tab));
    if (currentOrder.some((tab, index) => tab !== liveRows[index]?.tab)) return false;
    return snapshot.groups.every(({ element, label, tabs, record, color }) => {
      if (!element.isConnected) return !tabs.some((tab) => tab.isConnected);
      const currentColor = element.color || element.getAttribute("color") || null;
      return element.getAttribute("label") === label &&
        // ATG can finish computing a favicon color after the snapshot is taken.
        (currentColor === color || currentColor === `${element.id}-favicon`) &&
        JSON.stringify(getGroupRecord(element)) === JSON.stringify(record) &&
        groupTabs(element).every((tab) => recordedTabs.has(tab));
    });
  };
  const rememberUndo = (before) => {
    const after = captureWorkspaceLayout(before.workspaceId);
    const beforeGroups = new Map(before.tabs.map((row) => [row.tab, row.group]));
    const changed = after.tabs.length !== before.tabs.length ||
      after.tabs.some((row, index) => row.tab !== before.tabs[index]?.tab ||
        beforeGroups.get(row.tab) !== row.group) ||
      after.groups.some((group) => {
        const saved = before.groups.find((entry) => entry.element === group.element);
        return !saved || saved.collapsed !== group.collapsed || saved.label !== group.label;
      });
    if (changed) {
      state.undoSnapshots.set(before.workspaceId, { before, after });
    }
  };
  const canUndoSort = () => state.undoSnapshots.has(getActiveWorkspaceId());
  const undoLastSort = async () => {
    const workspaceId = getActiveWorkspaceId();
    const snapshot = state.undoSnapshots.get(workspaceId);
    if (!snapshot || state.isSorting || state.disposed) return;
    if (!layoutMatches(snapshot.after)) {
      ns.showRuntimeToast?.({ message: "The layout changed since sorting. Undo was skipped to preserve your edits." });
      return;
    }
    state.isSorting = true;
    try {
      const { before } = snapshot;
      const destinations = new Map();
      const iconsToRestore = [];
      for (const saved of before.groups) {
        const tabs = saved.tabs.filter((tab) => tab.isConnected && !tab.pinned &&
          tab.getAttribute("zen-workspace-id") === workspaceId);
        if (!tabs.length) continue;
        let group = saved.element;
        if (!group.isConnected || !groupTabs(group).length) {
          // An empty native group may have an asynchronous removal scheduled.
          if (group.isConnected) group.remove();
          group = gBrowser.addTabGroup(tabs, {
            id: saved.id, label: saved.label, color: saved.color,
            insertBefore: getTabGroup(tabs[0]) || tabs[0],
          });
          group ||= getTabGroup(tabs[0]);
        } else {
          for (const tab of tabs) gBrowser.moveTabToExistingGroup(tab, group);
        }
        if (!group?.isConnected) throw new Error("Could not restore a tab group.");
        destinations.set(saved.element, group);
        if (saved.color) group.color = saved.color;
        group.collapsed = saved.collapsed;
        for (const [property, value] of saved.colorVars) {
          if (value) document.documentElement.style.setProperty(property, value);
          else document.documentElement.style.removeProperty(property);
        }
        const atg = globalThis.advancedTabGroups;
        if (saved.atgColor && atg) {
          atg.savedColors = { ...atg.savedColors, [group.id]: saved.atgColor };
        }
        atg?.syncGroupColorVars?.(group);
        if (saved.icon && typeof atg?.applyGroupIcon === "function") {
          iconsToRestore.push([group, saved.icon]);
        }
        const records = readOwnership();
        const key = ownershipKey(group);
        if (saved.record) records[key] = saved.record;
        else delete records[key];
        saveOwnership(records);
      }
      for (const row of before.tabs) {
        if (row.tab.isConnected && !row.group && getTabGroup(row.tab)) {
          gBrowser.ungroupTab(row.tab);
        }
      }
      // Restore member order, then restore top-level group/loose-tab order.
      for (const saved of before.groups) {
        const tabs = saved.tabs.filter((tab) => tab.isConnected);
        for (let index = tabs.length - 2; index >= 0; index--) {
          gBrowser.moveTabBefore(tabs[index], tabs[index + 1]);
        }
      }
      const blocks = Array.from(new Set(before.tabs.filter(({ tab }) => tab.isConnected)
        .map((row) => row.group ? destinations.get(row.group) : row.tab).filter(Boolean)));
      for (let index = blocks.length - 2; index >= 0; index--) {
        gBrowser.moveTabBefore(blocks[index], blocks[index + 1]);
      }
      state.undoSnapshots.delete(workspaceId);
      for (const saved of snapshot.after.groups) {
        if (!groupTabs(saved.element).length) {
          if (saved.element.isConnected) saved.element.remove();
          if (!before.groups.some((group) => group.id === saved.id)) forgetGroupRecord(saved.element);
        }
      }
      for (const [group, icon] of iconsToRestore) {
        if (state.disposed || typeof globalThis.advancedTabGroups?.applyGroupIcon !== "function") break;
        try {
          await globalThis.advancedTabGroups.applyGroupIcon(group, icon);
        } catch (error) {
          console.warn("[TabSort] Could not restore a group icon:", error);
        }
      }
      ns.showRuntimeToast?.({ message: "Restored the layout from before the last sort." });
    } catch (error) {
      console.error("[TabSort] Could not fully undo sorting:", error);
      ns.showRuntimeToast?.({ message: "Undo could not fully restore the layout. Your tabs remain open." });
    } finally {
      state.isSorting = false;
      ns.updateButtonsVisibilityState?.();
    }
  };

  Object.assign(ns, {
    getTabGroup, getWorkspaceGroups, isOrdinaryGroup, isGroupLocked,
    isManagedGroup, markManagedGroup, setGroupManaged, setGroupLocked,
    getSortableTabs, captureWorkspaceLayout, isTabUnchanged,
    rememberUndo, canUndoSort, undoLastSort, forgetGroupRecord,
  });
})();
