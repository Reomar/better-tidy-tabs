(() => {
  // Coordinate provider selection, fallback behavior, tab grouping, and reordering.
  const ns = window.BetterTidyTabs;
  const { PROVIDERS, state, domCache } = ns;
  const {
    batchDOMUpdates,
    buildProviderContext,
    consumeProviderFeedback,
    formatProviderLabel,
    getActiveWorkspaceElement,
    getActiveWorkspaceId,
    getPreferredAIProvider,
    buildFinalGroupsFromAssignments,
    applyATGGroupIconIfNeeded,
  } = ns;

  // Route tab grouping through the selected provider and fall back to local AI.
  const askAIForMultipleTopics = async (tabs, options = {}) => {
    // Build one provider-neutral snapshot so every provider sees the same tabs
    // and existing-group context.
    const context = options.context || buildProviderContext(tabs, options);
    state.lastProviderFeedback = null;
    if (context.tabs.length === 0) {
      return [];
    }

    // Local AI is required because it is the final fallback for unavailable or
    // failed cloud providers.
    const localProvider = ns.getProvider(PROVIDERS.FIREFOX_LOCAL);
    if (!localProvider) {
      console.error("[TabSort] Local provider is not registered.");
      return null;
    }

    const preferredProviderId = getPreferredAIProvider();
    const preferredProvider = ns.getProvider(preferredProviderId) || localProvider;

    if (preferredProvider.id !== PROVIDERS.FIREFOX_LOCAL) {
      let cloudAssignments = null;
      let feedback = null;

      try {
        // A cloud provider returning null means it is unavailable; an array is
        // authoritative, even when it intentionally leaves tabs unassigned.
        cloudAssignments = await preferredProvider.assignTopics(context);
      } catch (error) {
        console.error(
          `[TabSort][${formatProviderLabel(preferredProvider.id)}] Error grouping tabs:`,
          error
        );

        feedback = {
          providerId: preferredProvider.id,
          title: formatProviderLabel(preferredProvider.id),
          message: error?.userMessage || `${formatProviderLabel(preferredProvider.id)} returned an invalid result or failed. Using Firefox local AI instead.`,
        };
      }

      if (Array.isArray(cloudAssignments)) {
        return cloudAssignments;
      }

      // Providers can publish a user-facing failure message without throwing.
      // Consume it before falling back so the UI does not fail silently.
      feedback ||= consumeProviderFeedback();
      feedback ||= {
        providerId: preferredProvider.id,
        title: formatProviderLabel(preferredProvider.id),
        message: `${formatProviderLabel(preferredProvider.id)} is unavailable. Using Firefox local AI instead.`,
      };
      if (
        feedback?.message &&
        typeof ns.showRuntimeToast === "function"
      ) {
        ns.showRuntimeToast({
          id: `better-tidy-tabs-${feedback.providerId || preferredProvider.id}-error`,
          title: feedback.title || formatProviderLabel(preferredProvider.id),
          message: feedback.message,
        });
      }

      console.warn(
        `[TabSort] Falling back to Firefox local AI after ${preferredProvider.id} was unavailable.`
      );
    }

    try {
      return await localProvider.assignTopics(context);
    } catch (error) {
      console.warn("[TabSort] Firefox local AI failed:", error);
      return null;
    }
  };

  // Stop any running separator animation and reset the line to a resting state.
  const cleanupAnimation = () => {
    if (state.isPlayingFailureAnimation) {
      return;
    }

    if (state.sortAnimationId !== null) {
      cancelAnimationFrame(state.sortAnimationId);
      state.sortAnimationId = null;

      try {
        const activeWorkspace = getActiveWorkspaceElement();
        // Zen can recreate separators outside the active workspace. Prefer the
        // active workspace, then use any connected sort host as a safe fallback.
        const activeSeparator =
          activeWorkspace?.querySelector(
            `:is(${ns.SELECTORS.SEPARATORS}):not(.has-no-sortable-tabs)`
          ) ||
          ns.getSortHostTargets?.().find(
            (separator) =>
              separator?.isConnected &&
              !separator.classList.contains("has-no-sortable-tabs")
          );
        const pathElement = activeSeparator?.querySelector("#separator-path");
        if (pathElement) {
          pathElement.setAttribute("d", "M 0 1 L 100 1");
        }
      } catch (error) {
        console.error("Error resetting animation:", error);
      }
    }
  };

  // Play the failure animation when no useful assignments were produced.
  const startFailureAnimation = () => {
    if (state.sortAnimationId !== null) {
      cancelAnimationFrame(state.sortAnimationId);
    }

    state.isPlayingFailureAnimation = true;

    try {
      const activeWorkspace = getActiveWorkspaceElement();
      // Resolve the live separator at animation time because Zen may have
      // rerendered the sidebar since sorting started.
      const activeSeparator =
        activeWorkspace?.querySelector(
          `:is(${ns.SELECTORS.SEPARATORS}):not(.has-no-sortable-tabs)`
        ) ||
        ns.getSortHostTargets?.().find(
          (separator) =>
            separator?.isConnected &&
            !separator.classList.contains("has-no-sortable-tabs")
        );
      const pathElement = activeSeparator?.querySelector("#separator-path");

      if (pathElement) {
        // These values produce three short, visible pulses instead of a
        // persistent error state on the separator.
        const maxAmplitude = 8;
        const frequency = 20;
        const segments = 100;
        const pulseDuration = 400;
        const totalPulses = 3;
        let currentPulse = 0;
        let t = 0;
        let pulseStartTime = performance.now();

        // Animate the separator with sharp pulses to show a failed sort attempt.
        function animateFailureLoop(timestamp) {
          if (state.sortAnimationId === null || state.disposed) return;

          const elapsedSincePulseStart = timestamp - pulseStartTime;
          const pulseProgress = elapsedSincePulseStart / pulseDuration;

          if (pulseProgress >= 1) {
            currentPulse++;
            if (currentPulse >= totalPulses) {
              pathElement.setAttribute("d", "M 0 1 L 100 1");
              state.sortAnimationId = null;
              state.isPlayingFailureAnimation = false;
              return;
            }

            pulseStartTime = timestamp;
          }

          const envelope = Math.sin(Math.min(pulseProgress, 1) * Math.PI);
          t += 0.9;

          const points = [];
          for (let index = 0; index <= segments; index++) {
            const x = (index / segments) * 100;
            const y =
              1 +
              maxAmplitude *
                envelope *
                Math.sin((x / (100 / frequency)) * 2 * Math.PI + t * 0.15);
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
          }

          if (pathElement?.isConnected) {
            pathElement.setAttribute("d", "M" + points.join(" L"));
            state.sortAnimationId = requestAnimationFrame(animateFailureLoop);
          } else {
            state.sortAnimationId = null;
            state.isPlayingFailureAnimation = false;
          }
        }

        state.sortAnimationId = requestAnimationFrame(animateFailureLoop);
      } else {
        state.isPlayingFailureAnimation = false;
      }
    } catch (error) {
      console.error("Error starting failure animation:", error);
      state.isPlayingFailureAnimation = false;
      state.sortAnimationId = null;
    }
  };

  // Remove temporary sorting classes after a sort or failure animation completes.
  const clearSortingIndicators = (separatorsToSort) => {
    // Remove the separator state immediately, but keep tab highlighting long
    // enough for the completion animation to be perceptible.
    if (separatorsToSort.length > 0) {
      batchDOMUpdates([
        () =>
          separatorsToSort.forEach((separator) => {
            if (separator?.isConnected) {
              separator.classList.remove("separator-is-sorting");
            }
          }),
      ]);
    }

    setTimeout(() => {
      if (state.disposed) return;
      batchDOMUpdates([
        () => {
          if (typeof gBrowser !== "undefined" && gBrowser.tabs) {
            Array.from(gBrowser.tabs).forEach((tab) => {
              if (tab?.isConnected) {
                tab.classList.remove("tab-is-sorting");
              }
            });
          }
        },
      ]);
      ns.updateButtonsVisibilityState?.();
    }, 500);
  };

  // Keep grouped tabs above loose tabs after sorting changes the workspace layout.
  const reorderWorkspaceChildren = (workspaceElement) => {
    if (!workspaceElement?.tabsContainer) {
      return;
    }

    const tabsContainer = workspaceElement.tabsContainer;
    const allChildren = Array.from(tabsContainer.children);
    const groups = [];
    const ungroupedTabs = [];

    // Only direct children are considered here; nested tabs belong to their
    // group and must not be moved independently.
    for (const child of allChildren) {
      const tagName = child.tagName?.toLowerCase();
      if (tagName === "tab-group") {
        groups.push(child);
      } else if (
        tagName === "tab" &&
        !child.hasAttribute("zen-empty-tab") &&
        !child.hasAttribute("zen-glance-tab")
      ) {
        ungroupedTabs.push(child);
      }
    }

    if (groups.length === 0 || ungroupedTabs.length === 0) {
      return;
    }

    const lastGroup = groups[groups.length - 1];
    let insertAfterElement = lastGroup;

    // Insert loose tabs after the final group while preserving their current
    // relative order.
    ungroupedTabs.forEach((tab) => {
      if (tab.isConnected && insertAfterElement?.isConnected) {
        const nextSibling = insertAfterElement.nextSibling;
        if (nextSibling) {
          tabsContainer.insertBefore(tab, nextSibling);
        } else {
          tabsContainer.appendChild(tab);
        }
        insertAfterElement = tab;
      }
    });
  };

  // Run the end-to-end sort flow for the current workspace.
  const sortTabsByTopic = async ({ mode = "new-tabs" } = {}) => {
    if (state.isSorting || state.disposed) return;
    mode = mode === "reorganize" ? mode : "new-tabs";
    state.isSorting = true;

    let separatorsToSort = [];
    let undoBefore = null;

    try {
      separatorsToSort =
        ns.getSortHostTargets?.() || Array.from(domCache.getSeparators());
      if (separatorsToSort.length > 0) {
        batchDOMUpdates([
          () =>
            separatorsToSort.forEach((separator) => {
              if (separator?.isConnected) {
                separator.classList.add("separator-is-sorting");
              }
            }),
        ]);
      }

      const currentWorkspaceId = getActiveWorkspaceId();
      if (!currentWorkspaceId) {
        console.error("Cannot get current workspace ID.");
        return;
      }

      const initialTabsToSort = ns.getSortableTabs(currentWorkspaceId, mode);

      if (initialTabsToSort.length === 0) {
        return;
      }

      // Provider assignments are converted into final group buckets while
      // preserving the provider's topic decisions.
      const requestLayout = ns.captureWorkspaceLayout(currentWorkspaceId);
      const originalRows = new Map(requestLayout.tabs.map((row) => [row.tab, row]));
      const context = buildProviderContext(initialTabsToSort, { mode, workspaceId: currentWorkspaceId });
      const aiTabTopics = await askAIForMultipleTopics(initialTabsToSort, { context });
      if (state.disposed || window.BetterTidyTabs !== ns) return;
      if (getActiveWorkspaceId() !== currentWorkspaceId) {
        ns.showRuntimeToast?.({ message: "Workspace changed while sorting. No tabs were moved." });
        return;
      }

      if (!Array.isArray(aiTabTopics)) {
        ns.showRuntimeToast?.({ message: "Firefox local AI is unavailable. Tabs were left unchanged." });
        startFailureAnimation();
        return;
      }
      if (!aiTabTopics.length) {
        ns.showRuntimeToast?.({ message: "No clear groups found; tabs were left unchanged." });
        return;
      }

      const recordedTabs = new Set(requestLayout.tabs.map((row) => row.tab));
      const currentOrder = ns.getFilteredTabs(currentWorkspaceId, { includeGrouped: true })
        .filter((tab) => recordedTabs.has(tab));
      const presentTabs = new Set(currentOrder);
      const previousOrder = requestLayout.tabs.map((row) => row.tab)
        .filter((tab) => presentTabs.has(tab));
      if (currentOrder.some((tab, index) => tab !== previousOrder[index])) {
        ns.showRuntimeToast?.({ message: "Tab order changed while sorting. Tabs were left unchanged." });
        return;
      }

      // Resolve only the exact destinations captured in this request.
      const existingGroups = new Map();
      const managedGroups = new Set();
      const liveGroups = new Set(ns.getWorkspaceGroups(currentWorkspaceId));
      for (const [id, saved] of context.existingWorkspaceGroups) {
        const group = saved.element;
        if (liveGroups.has(group) && group.isConnected && group.id === saved.nativeId &&
            !ns.isGroupLocked(group) && ns.isOrdinaryGroup(group) &&
            group.getAttribute("label") === saved.name &&
            [...group.querySelectorAll("tab")].every((tab) =>
              tab.getAttribute("zen-workspace-id") === currentWorkspaceId)) existingGroups.set(id, saved);
      }
      for (const group of liveGroups) if (ns.isManagedGroup(group)) managedGroups.add(group);
      const eligibleTabs = new Set(ns.getSortableTabs(currentWorkspaceId, mode));
      const requestTabs = new Set(initialTabsToSort);
      const isEligible = (tab) => {
        const row = originalRows.get(tab);
        if (!row || !requestTabs.has(tab) || !eligibleTabs.has(tab) || !ns.isTabUnchanged(row)) return false;
        const savedGroup = requestLayout.groups.find((group) => group.element === row.group);
        return !savedGroup || (row.group.getAttribute("label") === savedGroup.label &&
          !ns.isGroupLocked(row.group));
      };
      const usableAssignments = aiTabTopics.filter((assignment) => assignment &&
        isEligible(assignment.tab) && typeof assignment.topic === "string" &&
        (!assignment.existingGroupId || existingGroups.has(assignment.existingGroupId)));
      const finalGroups = buildFinalGroupsFromAssignments(usableAssignments, existingGroups);
      if (!Object.keys(finalGroups).length) return;

      undoBefore = ns.captureWorkspaceLayout(currentWorkspaceId);
      const iconsToApply = [];
      const emptiedBySort = new Set();
      let didMutate = false;
      const noteEmptySources = (sources) => {
        for (const source of sources) if (source && !source.querySelector("tab")) emptiedBySort.add(source);
      };
      for (const groupData of Object.values(finalGroups)) {
        const topic = groupData.label;
        const tabsForThisTopic = groupData.tabs.filter(isEligible);
        const destination = groupData.existingGroupId ? existingGroups.get(groupData.existingGroupId) : null;
        let existingGroupElement = destination?.element;
        if (existingGroupElement) {
          // Recreate only a destination drained by our own synchronous moves.
          // A destination removed while the provider was responding was already rejected.
          if (emptiedBySort.has(existingGroupElement)) {
            const saved = requestLayout.groups.find((group) => group.element === existingGroupElement);
            if (!saved || !tabsForThisTopic.length) continue;
            const sources = tabsForThisTopic.map(ns.getTabGroup);
            let recreated = null;
            try {
              if (existingGroupElement.isConnected) existingGroupElement.remove();
              recreated = gBrowser.addTabGroup(tabsForThisTopic, {
                id: saved.id, label: saved.label, color: saved.color,
                insertBefore: ns.getTabGroup(tabsForThisTopic[0]) || tabsForThisTopic[0],
              });
            } catch (error) {
              console.error("[TabSort] Could not restore a destination drained by sorting:", error);
            }
            noteEmptySources(sources);
            didMutate ||= tabsForThisTopic.some((tab, index) => ns.getTabGroup(tab) !== sources[index]);
            existingGroupElement = recreated || ns.getTabGroup(tabsForThisTopic[0]);
            if (!existingGroupElement?.isConnected || existingGroupElement.id !== saved.id) continue;
            destination.element = existingGroupElement;
            existingGroupElement.collapsed = false;
            managedGroups.add(existingGroupElement);
            iconsToApply.push([existingGroupElement, groupData.iconId]);
            continue;
          }
          // Never retarget a disappeared destination by label, even when labels repeat.
          if (!existingGroupElement.isConnected || ns.isGroupLocked(existingGroupElement) ||
              !ns.isOrdinaryGroup(existingGroupElement) ||
              existingGroupElement.getAttribute("label") !== destination.name) continue;
          const movingTabs = tabsForThisTopic.filter((tab) => ns.getTabGroup(tab) !== existingGroupElement);
          if (!movingTabs.length) continue;
          const sources = movingTabs.map(ns.getTabGroup);
          try {
            if (existingGroupElement.getAttribute("collapsed") === "true") {
              existingGroupElement.setAttribute("collapsed", "false");
              existingGroupElement.querySelector(".tab-group-label")?.setAttribute("aria-expanded", "true");
              didMutate = true;
            }
            for (const tab of movingTabs) if (isEligible(tab)) {
              const source = ns.getTabGroup(tab);
              gBrowser.moveTabToExistingGroup(tab, existingGroupElement);
              didMutate = true;
              noteEmptySources([source]);
            }
            iconsToApply.push([existingGroupElement, groupData.iconId]);
          } catch (error) {
            console.error("[TabSort] Could not move tabs to existing group:", error);
            noteEmptySources(sources);
            didMutate ||= movingTabs.some((tab, index) => ns.getTabGroup(tab) !== sources[index]);
          }
          continue;
        }
        if (groupData.existingGroupId || tabsForThisTopic.length < 2) continue;
        const previousGroups = new Set(ns.getWorkspaceGroups(currentWorkspaceId));
        const sources = tabsForThisTopic.map(ns.getTabGroup);
        let newGroup = null;
        try {
          newGroup = gBrowser.addTabGroup(tabsForThisTopic, {
            label: topic,
            insertBefore: ns.getTabGroup(tabsForThisTopic[0]) || tabsForThisTopic[0],
          });
        } catch (error) {
          console.error("[TabSort] Could not create group:", error);
        }
        // Preserve Undo even when a native mutation throws after moving only some tabs.
        didMutate ||= tabsForThisTopic.some((tab, index) => ns.getTabGroup(tab) !== sources[index]);
        noteEmptySources(sources);
        for (const tab of tabsForThisTopic) {
          const candidate = ns.getTabGroup(tab);
          if (candidate?.isConnected && !previousGroups.has(candidate) &&
              candidate.getAttribute("label") === topic) managedGroups.add(candidate);
        }
        // Some Zen versions insert a group without returning it. Recover by membership.
        if (!newGroup?.isConnected || previousGroups.has(newGroup)) {
          const candidate = ns.getTabGroup(tabsForThisTopic[0]);
          newGroup = candidate?.isConnected && !previousGroups.has(candidate) &&
            candidate.getAttribute("label") === topic &&
            tabsForThisTopic.every((tab) => ns.getTabGroup(tab) === candidate) ? candidate : null;
        }
        if (!newGroup) continue;
        didMutate = true;
        noteEmptySources(sources);
        managedGroups.add(newGroup);
        iconsToApply.push([newGroup, groupData.iconId]);
        if (typeof newGroup._useFaviconColor === "function") setTimeout(() => {
          if (!state.disposed && newGroup.isConnected) {
            try { newGroup._useFaviconColor(); } catch { /* Optional ATG coloring. */ }
          }
        }, 500);
      }

      if (!didMutate) {
        undoBefore = null;
        return;
      }
      for (const group of managedGroups) {
        if (!group.querySelector("tab")) {
          if (group.isConnected) group.remove();
          ns.forgetGroupRecord(group);
        } else {
          ns.markManagedGroup(group);
        }
      }

      try {
        // Zen may place loose tabs before groups after a mutation; restore the
        // intended groups-first order once all assignments are complete.
        reorderWorkspaceChildren(getActiveWorkspaceElement());
      } catch (error) {
        console.error("Error reordering tabs (groups first):", error);
      }
      ns.rememberUndo(undoBefore);
      undoBefore = null;
      ns.updateButtonsVisibilityState?.();
      // Group moves finish synchronously before optional icon work yields.
      for (const [group, iconId] of iconsToApply) {
        if (state.disposed) break;
        await applyATGGroupIconIfNeeded(group, iconId);
      }
    } catch (error) {
      console.error("Error during overall sorting process:", error);
    } finally {
      if (state.disposed) return;
      if (undoBefore && !state.disposed) ns.rememberUndo(undoBefore);
      if (state.isPlayingFailureAnimation) {
        // Let the failure pulses finish before clearing the sorting state and
        // removing the temporary UI classes.
        setTimeout(() => {
          if (state.disposed) return;
          state.isSorting = false;
          cleanupAnimation();
          clearSortingIndicators(separatorsToSort);
          ns.updateButtonsVisibilityState?.();
        }, 1500);
      } else {
        state.isSorting = false;
        cleanupAnimation();
        clearSortingIndicators(separatorsToSort);
      }
      if (!state.disposed) ns.updateButtonsVisibilityState?.();
    }
  };

  Object.assign(ns, {
    askAIForMultipleTopics,
    cleanupAnimation,
    startFailureAnimation,
    sortTabsByTopic,
  });
})();
