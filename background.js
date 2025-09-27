// Function to apply filters to LinkedIn URL
function applyFiltersToUrl(originalUrl, timeFilter, jobTypeFilter) {
  const url = new URL(originalUrl);
  const params = url.searchParams;

  // Apply time filter (f_TPR parameter)
  if (timeFilter && timeFilter !== "0" && timeFilter !== 0) {
    params.set("f_TPR", `r${timeFilter}`);
  } else if (timeFilter === "0" || timeFilter === 0) {
    params.delete("f_TPR");
  }

  // Apply job type filter (f_JT parameter)
  if (jobTypeFilter) {
    params.set("f_JT", jobTypeFilter);
  } else {
    params.delete("f_JT"); // remove filter if "Any"
  }

  return `${url.origin}${url.pathname}?${params.toString()}`;
}

// Listen for navigation events
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only process main frame navigation (not iframes)
  if (details.frameId !== 0) return;

  const url = new URL(details.url);

  if (
    url.hostname === "www.linkedin.com" &&
    (url.pathname.startsWith("/jobs/search-results/") ||
      url.pathname.startsWith("/jobs/search/"))
  ) {
    chrome.storage.sync.get(["timeFilter", "jobTypeFilter"], (result) => {
      const timeFilter =
        result.timeFilter !== undefined ? result.timeFilter : 604800; // default 1 week
      const jobTypeFilter = result.jobTypeFilter || "";

      const newUrl = applyFiltersToUrl(details.url, timeFilter, jobTypeFilter);

      if (newUrl !== details.url) {
        chrome.tabs.update(details.tabId, { url: newUrl });
      }
    });
  }
});

// Also listen for completed navigation to handle SPA changes
chrome.webNavigation.onCompleted.addListener((details) => {
  // Only process main frame navigation
  if (details.frameId !== 0) return;

  const url = new URL(details.url);

  if (
    url.hostname === "www.linkedin.com" &&
    (url.pathname.startsWith("/jobs/search-results/") ||
      url.pathname.startsWith("/jobs/search/"))
  ) {
    // Send message to content script to apply filters
    chrome.tabs
      .sendMessage(details.tabId, {
        action: "applyFilters",
      })
      .catch(() => {
        // Ignore errors if content script is not ready
      });
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateUrl") {
    chrome.storage.sync.get(["timeFilter", "jobTypeFilter"], (result) => {
      const timeFilter =
        result.timeFilter !== undefined ? result.timeFilter : 604800; // default 1 week
      const jobTypeFilter = result.jobTypeFilter || "";

      const newUrl = applyFiltersToUrl(request.url, timeFilter, jobTypeFilter);

      if (newUrl !== request.url) {
        chrome.tabs.update(sender.tab.id, { url: newUrl });
      }
    });
  } else if (request.action === "applyFiltersNow") {
    // Handle immediate filter application from popup
    chrome.storage.sync.get(["timeFilter", "jobTypeFilter"], (result) => {
      const timeFilter =
        result.timeFilter !== undefined ? result.timeFilter : 604800; // default 1 week
      const jobTypeFilter = result.jobTypeFilter || "";

      const newUrl = applyFiltersToUrl(request.url, timeFilter, jobTypeFilter);

      if (newUrl !== request.url) {
        chrome.tabs.update(request.tabId, { url: newUrl });
      }
    });
  }
});
