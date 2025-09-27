document.addEventListener("DOMContentLoaded", () => {
  const timeSelect = document.getElementById("timeSelect");
  const jobTypeSelect = document.getElementById("jobTypeSelect");
  const keywordInput = document.getElementById("keywordInput");
  const filterCitizenshipCheckbox = document.getElementById(
    "filterCitizenshipCheckbox"
  );
  const saveBtn = document.getElementById("saveBtn");

  // Load saved settings
  chrome.storage.sync.get(
    ["timeFilter", "jobTypeFilter", "keywords", "filterCitizenship"],
    (result) => {
      if (result.timeFilter) timeSelect.value = result.timeFilter;
      if (result.jobTypeFilter) jobTypeSelect.value = result.jobTypeFilter;
      if (result.keywords) keywordInput.value = result.keywords;
      if (result.filterCitizenship)
        filterCitizenshipCheckbox.checked = result.filterCitizenship;
    }
  );

  // Function to build LinkedIn search queries with Boolean operators
  function buildKeywordQuery(keywordsString, jobType) {
    if (!keywordsString.trim()) {
      // If no keywords but job type selected, return appropriate search
      if (jobType === "I") {
        return 'intern OR internship OR "co-op" OR coop OR trainee';
      }
      return "";
    }

    // Parse keywords - split by comma and clean up
    const keywords = keywordsString
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    let query = "";

    if (keywords.length === 1) {
      // Single keyword: wrap in quotes for exact phrase matching
      query = `"${keywords[0]}"`;
    } else if (keywords.length > 1) {
      // Multiple keywords: wrap each in quotes and join with OR for exact phrase matching
      const quotedKeywords = keywords.map((k) => `"${k}"`).join(" OR ");
      query = `(${quotedKeywords})`;
    }

    // Append job type modifiers for keyword search only
    if (jobType === "I") {
      query += ' AND (intern OR internship OR "co-op" OR coop OR trainee)';
    } else if (jobType === "F") {
      query += ' AND NOT (intern OR internship OR "co-op" OR coop OR trainee)';
    }

    return query;
  }

  saveBtn.addEventListener("click", () => {
    const timeValue = timeSelect.value;
    const jobTypeValue = jobTypeSelect.value;
    const keywordValue = keywordInput.value.trim();
    const filterCitizenshipValue = filterCitizenshipCheckbox.checked;

    chrome.storage.sync.set(
      {
        timeFilter: timeValue,
        jobTypeFilter: jobTypeValue,
        keywords: keywordValue,
        filterCitizenship: filterCitizenshipValue,
      },
      () => {
        // Trigger immediate filter application
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const currentTab = tabs[0];

          if (currentTab && currentTab.url.includes("linkedin.com/jobs")) {
            // Already on LinkedIn jobs - apply filters to current URL
            const url = new URL(currentTab.url);
            const params = url.searchParams;

            // Apply time filter
            if (timeValue !== "0") {
              params.set("f_TPR", `r${timeValue}`);
            } else {
              params.delete("f_TPR");
            }

            // Apply job type filter
            if (jobTypeValue) {
              params.set("f_JT", jobTypeValue);
            } else {
              params.delete("f_JT");
            }

            // Build keyword search query with Boolean operators
            const keywordQuery = buildKeywordQuery(keywordValue, jobTypeValue);

            // Set or remove keywords parameter
            if (keywordQuery) {
              params.set("keywords", keywordQuery);
            } else {
              params.delete("keywords");
            }

            const newUrl = `${url.origin}${url.pathname}?${params.toString()}`;

            chrome.tabs.update(currentTab.id, { url: newUrl });

            // Send message to content script about settings update
            chrome.tabs
              .sendMessage(currentTab.id, {
                action: "settingsUpdated",
                filterCitizenship: filterCitizenshipValue,
              })
              .catch(() => {});
          } else {
            // Not on LinkedIn jobs - create new LinkedIn search URL with filters
            const params = new URLSearchParams();

            // Apply time filter
            if (timeValue !== "0") {
              params.set("f_TPR", `r${timeValue}`);
            }

            // Apply job type filter
            if (jobTypeValue) {
              params.set("f_JT", jobTypeValue);
            }

            // Build keyword search query with Boolean operators
            const keywordQuery = buildKeywordQuery(keywordValue, jobTypeValue);

            // Set keywords parameter
            if (keywordQuery) {
              params.set("keywords", keywordQuery);
            }

            // Create default LinkedIn jobs search URL
            const defaultLinkedInUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;

            // Navigate to LinkedIn with filters applied
            chrome.tabs.update(currentTab.id, { url: defaultLinkedInUrl });

            // Send message to content script about settings update
            chrome.tabs
              .sendMessage(currentTab.id, {
                action: "settingsUpdated",
                filterCitizenship: filterCitizenshipValue,
              })
              .catch(() => {});
          }
        });
        window.close(); // close popup after saving
      }
    );
  });
});
