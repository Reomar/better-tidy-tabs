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
    getFilteredTabs,
    normalizeTopicKey,
    buildFinalGroupsFromAssignments,
    applyATGGroupIconIfNeeded,
    findGroupElement,
    getTabTitle,
  } = ns;

  // Route tab grouping through the selected provider and fall back to local AI.
  const askAIForMultipleTopics = async (tabs) => {
    // Build one provider-neutral snapshot so every provider sees the same tabs
    // and existing-group context.
    const context = buildProviderContext(tabs);
    if (context.tabs.length === 0) {
      return [];
    }

    // Local AI is required because it is the final fallback for unavailable or
    // failed cloud providers.
    const localProvider = ns.getProvider(PROVIDERS.FIREFOX_LOCAL);
    if (!localProvider) {
      console.error("[TabSort] Local provider is not registered.");
      return [];
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

        if (preferredProvider.id === PROVIDERS.OPENROUTER) {
          feedback = {
            providerId: preferredProvider.id,
            title: formatProviderLabel(preferredProvider.id),
            message:
              error?.userMessage ||
              "OpenRouter failed. Using Firefox local AI instead.",
          };
        }
      }

      if (Array.isArray(cloudAssignments)) {
        return cloudAssignments;
      }

      // Providers can publish a user-facing failure message without throwing.
      // Consume it before falling back so the UI does not fail silently.
      feedback ||= consumeProviderFeedback();
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

    return localProvider.assignTopics(context);
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
          if (state.sortAnimationId === null) return;

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
  const sortTabsByTopic = async () => {
    if (state.isSorting) return;
    state.isSorting = true;

    let separatorsToSort = [];

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

      const existingGroupNameMap = new Map();
      const groupSelector = `tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;

      // Normalize only for lookup. The original label is retained so provider
      // output can reuse the exact spelling/casing already shown in the UI.
      document.querySelectorAll(groupSelector).forEach((groupEl) => {
        const label = groupEl.getAttribute("label");
        if (label) {
          existingGroupNameMap.set(normalizeTopicKey(label), label);
        }
      });

      const initialTabsToSort = getFilteredTabs(currentWorkspaceId, {
        includeGrouped: false,
        includeSelected: true,
        includePinned: false,
        includeEmpty: false,
        includeGlance: false,
      }).filter((tab) => {
        // Exclude tabs already inside a group in this workspace. This keeps the
        // sort operation additive and avoids moving existing grouped tabs.
        const groupParent = tab.closest("tab-group");
        const isInGroupInCorrectWorkspace = groupParent
          ? groupParent.matches(groupSelector)
          : false;
        return !isInGroupInCorrectWorkspace;
      });

      if (initialTabsToSort.length === 0) {
        return;
      }

      // Provider assignments are converted into final group buckets while
      // preserving the provider's topic decisions.
      const aiTabTopics = (await askAIForMultipleTopics(initialTabsToSort)) || [];
      const finalGroups = buildFinalGroupsFromAssignments(
        aiTabTopics,
        existingGroupNameMap
      );

      const assignedTabsCount = aiTabTopics.length;
      const sortingFailed =
        assignedTabsCount === 0 && initialTabsToSort.length > 1;

      // A single unassigned tab is not treated as a failure; there is no useful
      // group to create for it. Multiple unassigned tabs get visible feedback.
      if (sortingFailed) {
        startFailureAnimation();
        return;
      }

      if (Object.keys(finalGroups).length === 0) {
        return;
      }

      const existingGroupElementsMap = new Map();
      // Store actual elements separately from normalized names because the DOM
      // lookup needs the provider-selected label used by finalGroups.
      document.querySelectorAll(groupSelector).forEach((groupEl) => {
        const label = groupEl.getAttribute("label");
        if (label) {
          existingGroupElementsMap.set(label, groupEl);
        }
      });

      for (const topic in finalGroups) {
        const groupData = finalGroups[topic];
        // A tab may have changed groups while the provider request was running;
        // re-check connectivity and workspace membership before moving it.
        const tabsForThisTopic = groupData.tabs.filter((tab) => {
          const groupParent = tab.closest("tab-group");
          const isInGroupInCorrectWorkspace = groupParent
            ? groupParent.matches(groupSelector)
            : false;
          return tab && tab.isConnected && !isInGroupInCorrectWorkspace;
        });

        if (tabsForThisTopic.length === 0) {
          continue;
        }

        const existingGroupElement = existingGroupElementsMap.get(topic);

        if (existingGroupElement && existingGroupElement.isConnected) {
          try {
            // Reusing a collapsed group should reveal it so the newly assigned
            // tabs are immediately visible to the user.
            if (existingGroupElement.getAttribute("collapsed") === "true") {
              existingGroupElement.setAttribute("collapsed", "false");
              const groupLabelElement =
                existingGroupElement.querySelector(".tab-group-label");
              if (groupLabelElement) {
                groupLabelElement.setAttribute("aria-expanded", "true");
              }
            }

            for (const tab of tabsForThisTopic) {
              const groupParent = tab.closest("tab-group");
              const isInGroupInCorrectWorkspace = groupParent
                ? groupParent.matches(groupSelector)
                : false;
              if (tab && tab.isConnected && !isInGroupInCorrectWorkspace) {
                gBrowser.moveTabToExistingGroup(tab, existingGroupElement);
              } else {
                console.warn(
                  ` -> Tab "${getTabTitle(tab) || "Unknown"}" skipped moving to "${topic}" (already grouped or invalid).`
                );
              }
            }

            await applyATGGroupIconIfNeeded(existingGroupElement, groupData.iconId);
          } catch (error) {
            console.error(
              `Error moving tabs to existing group "${topic}":`,
              error,
              existingGroupElement
            );
          }
          continue;
        }

        if (tabsForThisTopic.length === 0) {
          continue;
        }

        const firstValidTabForGroup = tabsForThisTopic[0];
        const groupOptions = {
          label: topic,
          insertBefore: firstValidTabForGroup,
        };

        try {
          // Insert the new group at the first assigned tab so the workspace
          // keeps a stable, predictable position after grouping.
          const newGroup = gBrowser.addTabGroup(tabsForThisTopic, groupOptions);
          if (newGroup && newGroup.isConnected) {
            existingGroupElementsMap.set(topic, newGroup);

            try {
              if (typeof newGroup._useFaviconColor === "function") {
                setTimeout(() => newGroup._useFaviconColor(), 500);
              }
            } catch {
              // Ignore ATG-specific coloring failures.
            }

            await applyATGGroupIconIfNeeded(newGroup, groupData.iconId);
          } else {
            // Some Zen/ATG versions do not return the created element even when
            // creation succeeds, so recover it from the workspace DOM.
            const newGroupElFallback = findGroupElement(topic, currentWorkspaceId);
            if (newGroupElFallback && newGroupElFallback.isConnected) {
              existingGroupElementsMap.set(topic, newGroupElFallback);

              try {
                if (typeof newGroupElFallback._useFaviconColor === "function") {
                  setTimeout(() => newGroupElFallback._useFaviconColor(), 500);
                }
              } catch {
                // Ignore ATG-specific coloring failures.
              }

              await applyATGGroupIconIfNeeded(
                newGroupElFallback,
                groupData.iconId
              );
            } else {
              console.error(
                ` -> Failed to find the newly created group element for "${topic}" even with fallback.`
              );
            }
          }
        } catch (error) {
          console.error(
            `Error calling gBrowser.addTabGroup for topic "${topic}":`,
            error
          );

          const groupAfterError = findGroupElement(topic, currentWorkspaceId);
          if (groupAfterError && groupAfterError.isConnected) {
            // Treat a thrown addTabGroup call as recoverable if the group was
            // actually inserted before the API reported the error.
            existingGroupElementsMap.set(topic, groupAfterError);

            try {
              if (typeof groupAfterError._useFaviconColor === "function") {
                setTimeout(() => groupAfterError._useFaviconColor(), 500);
              }
            } catch {
              // Ignore ATG-specific coloring failures.
            }

            await applyATGGroupIconIfNeeded(groupAfterError, groupData.iconId);
          } else {
            console.error(` -> Failed to find group "${topic}" after creation error.`);
          }
        }
      }

      try {
        // Zen may place loose tabs before groups after a mutation; restore the
        // intended groups-first order once all assignments are complete.
        reorderWorkspaceChildren(getActiveWorkspaceElement());
      } catch (error) {
        console.error("Error reordering tabs (groups first):", error);
      }
    } catch (error) {
      console.error("Error during overall sorting process:", error);
    } finally {
      if (state.isPlayingFailureAnimation) {
        // Let the failure pulses finish before clearing the sorting state and
        // removing the temporary UI classes.
        setTimeout(() => {
          state.isSorting = false;
          cleanupAnimation();
          clearSortingIndicators(separatorsToSort);
        }, 1500);
      } else {
        state.isSorting = false;
        cleanupAnimation();
        clearSortingIndicators(separatorsToSort);
      }
    }
  };

  Object.assign(ns, {
    askAIForMultipleTopics,
    cleanupAnimation,
    startFailureAnimation,
    sortTabsByTopic,
  });
})();
