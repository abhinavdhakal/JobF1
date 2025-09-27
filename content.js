// Content script for LinkedIn JobF1 - Fixed Keyword Matching
(function () {
  "use strict";

  console.log("🚀 JobF1 loaded");

  let lastUrl = location.href;
  let currentJobId = null;
  let lastCheckedJobId = null;

  // Main URL checking function
  function checkUrl() {
    const currentUrl = location.href;
    if (currentUrl === lastUrl) return;

    lastUrl = currentUrl;
    const urlParams = new URLSearchParams(location.search);
    const newJobId =
      urlParams.get("currentJobId") || extractJobIdFromUrl(currentUrl);

    if (newJobId && newJobId !== currentJobId) {
      console.log("🆕 Job changed:", currentJobId, "→", newJobId);
      currentJobId = newJobId;

      if (newJobId !== lastCheckedJobId) {
        lastCheckedJobId = newJobId;
        setTimeout(() => checkJobSponsorshipStatus(), 1000);
      }
    }
  }

  function extractJobIdFromUrl(url) {
    const match = url.match(/\/jobs\/view\/(\d+)/);
    return match ? match[1] : null;
  }

  function checkJobSponsorshipStatus() {
    // Check if visa sponsorship filtering is enabled
    chrome.storage.sync.get(["filterCitizenship"], (result) => {
      if (!result.filterCitizenship) {
        console.log("⏸️ Visa sponsorship checking is disabled");
        return;
      }

      console.log("🔍 Starting job analysis...");
      performSponsorshipCheck();
    });
  }

  function performSponsorshipCheck() {
    let attempts = 0;
    const maxAttempts = 5;

    function tryCheck() {
      attempts++;
      console.log(`🔄 Attempt ${attempts}/${maxAttempts}`);

      // Get job description
      const descriptionSelectors = [
        ".jobs-description-content__text",
        ".jobs-box__html-content",
        ".jobs-description",
        '[data-view-name="job-description"]',
      ];

      let description = "";
      let originalDescription = "";
      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element?.textContent) {
          originalDescription = element.textContent.trim();
          // Normalize text: remove extra spaces, normalize quotes, etc.
          description = originalDescription
            .toLowerCase()
            .replace(/[""'']/g, '"') // Normalize quotes
            .replace(/\s+/g, " ") // Normalize whitespace
            .replace(/\n+/g, " "); // Replace newlines with spaces
          console.log(`📄 Found description with: ${selector}`);
          break;
        }
      }

      // Get job title and company
      const title = getJobTitle();
      const company = getJobCompany();

      console.log("📊 Analysis results:");
      console.log("- Title:", title);
      console.log("- Company:", company);
      console.log("- Description length:", description.length);
      console.log("- First 300 chars:", description.substring(0, 300));

      if (!description && attempts < maxAttempts) {
        console.log("⚠️ No description found, retrying...");
        setTimeout(tryCheck, 1500);
        return;
      }

      // Analyze sponsorship
      const sponsorshipStatus = analyzeSponsorship(description);

      console.log("🎯 Sponsorship Status:", sponsorshipStatus);

      showJobStatusPopup(
        sponsorshipStatus,
        title || "Job Title",
        company || "Company"
      );

      if (sponsorshipStatus.isRestricted) {
        console.log("🚨 No visa sponsorship -", sponsorshipStatus.reason);
      } else {
        console.log(
          "✅ Visa friendly",
          sponsorshipStatus.reason ? `- ${sponsorshipStatus.reason}` : ""
        );
      }
    }

    tryCheck();
  }

  function getJobTitle() {
    const selectors = [
      ".jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title",
      "h1",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }
    return "Job Title Not Found";
  }

  function getJobCompany() {
    const selectors = [
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-company__name",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }
    return "Company Not Found";
  }

  function getCleanDetectedPhrase(matchedPhrase, fullDescription) {
    // First, try to get a cleaner version of the matched phrase
    let cleanPhrase = matchedPhrase.trim();

    // If it's too long (more than 50 chars), try to extract key parts
    if (cleanPhrase.length > 50) {
      // Look for specific patterns and extract the key part

      // For ITAR patterns
      if (cleanPhrase.toLowerCase().includes("itar")) {
        return "ITAR requirement";
      }

      // For citizenship patterns
      if (cleanPhrase.toLowerCase().includes("citizen")) {
        if (cleanPhrase.toLowerCase().includes("only")) {
          return "US citizens only";
        }
        return "US citizenship required";
      }

      // For sponsorship patterns
      if (cleanPhrase.toLowerCase().includes("sponsor")) {
        if (
          cleanPhrase.toLowerCase().includes("not") ||
          cleanPhrase.toLowerCase().includes("no")
        ) {
          return "No visa sponsorship";
        }
        return cleanPhrase.substring(0, 47) + "...";
      }

      // For security clearance
      if (cleanPhrase.toLowerCase().includes("clearance")) {
        return "Security clearance required";
      }

      // For permanent resident
      if (cleanPhrase.toLowerCase().includes("permanent")) {
        return "Permanent resident required";
      }

      // For student visa restrictions
      if (
        cleanPhrase.toLowerCase().includes("cpt") ||
        cleanPhrase.toLowerCase().includes("opt")
      ) {
        return cleanPhrase.length > 30
          ? cleanPhrase.substring(0, 27) + "..."
          : cleanPhrase;
      }

      // Generic fallback - just truncate
      return cleanPhrase.substring(0, 47) + "...";
    }

    return cleanPhrase;
  }

  function analyzeSponsorship(description) {
    console.log("🔍 Starting keyword analysis...");

    // Keywords that clearly indicate sponsorship availability
    const positiveKeywords = [
      "will sponsor",
      "can sponsor",
      "sponsors visa",
      "sponsors h1b",
      "sponsors h-1b",
      "h1b sponsorship available",
      "h-1b sponsorship available",
      "visa sponsorship available",
      "provides sponsorship",
      "offers sponsorship",
      "sponsorship provided",
      "able to sponsor",
      "willing to sponsor",
      "open to sponsoring",
      "supports visa sponsorship",
    ];

    // ITAR/Export Control patterns (highest priority)
    const itarPatterns = [
      /itar requirement/i,
      /itar requirements/i,
      /subject to.*itar/i,
      /international traffic.*arms.*regulations/i,
      /export administration regulations/i,
      /subject to.*compliance.*international traffic/i,
      /qualify as.*u\.?s\.?\s*person/i,
      /applicants must qualify as.*u\.?s\.?\s*person/i,
      /must qualify as.*u\.?s\.?\s*person/i,
    ];

    // Citizenship requirement patterns
    const citizenshipPatterns = [
      /must be.*us\s*citizen/i,
      /must be.*u\.?s\.?\s*citizen/i,
      /us\s*citizens?\s*only/i,
      /u\.?s\.?\s*citizens?\s*only/i,
      /citizens?\s*only/i,
      /require.*us\s*citizenship/i,
      /require.*u\.?s\.?\s*citizenship/i,
      /us\s*citizenship\s*required/i,
      /u\.?s\.?\s*citizenship\s*required/i,
      /citizenship\s*required/i,
      /need.*us\s*citizenship/i,
      /need.*u\.?s\.?\s*citizenship/i,
      /current.*u\.?s\.?\s*citizenship/i,
      /some positions.*require.*current.*u\.?s\.?\s*citizenship/i,
    ];

    // Security clearance patterns
    const clearancePatterns = [
      /security clearance.*required/i,
      /requires.*security clearance/i,
      /active.*security clearance/i,
      /secret.*clearance/i,
      /top secret.*clearance/i,
      /security.*cleared/i,
      /obtain.*security clearance/i,
      /eligible.*security clearance/i,
    ];

    // Direct no sponsorship patterns
    const noSponsorPatterns = [
      /do not sponsor/i,
      /does not sponsor/i,
      /will not sponsor/i,
      /cannot sponsor/i,
      /unable to sponsor/i,
      /not sponsoring/i,
      /no.*h-?1b.*sponsorship/i,
      /no.*visa.*sponsorship/i,
      /no.*sponsorship/i,
      /sponsorship.*not.*available/i,
      /sponsorship.*will not.*provided/i,
    ];

    // Student visa restriction patterns
    const studentVisaPatterns = [
      /cpt.*not.*eligible/i,
      /opt.*not.*eligible/i,
      /f-?1.*not.*eligible/i,
      /j-?1.*not.*eligible/i,
      /students.*cpt.*not.*eligible/i,
      /students.*opt.*not.*eligible/i,
      /students.*f-?1.*not.*eligible/i,
      /does not support.*students.*visa/i,
      /not support.*students.*visa/i,
    ];

    // Permanent residency patterns
    const permanentResidencyPatterns = [
      /must be.*permanent resident/i,
      /permanent resident.*required/i,
      /permanent residency.*required/i,
      /need.*permanent residency/i,
    ];

    // Combine all restrictive patterns
    const allRestrictivePatterns = [
      ...itarPatterns,
      ...citizenshipPatterns,
      ...clearancePatterns,
      ...noSponsorPatterns,
      ...studentVisaPatterns,
      ...permanentResidencyPatterns,
    ];

    // Check for positive indicators first
    const foundPositive = positiveKeywords.find((keyword) => {
      const found = description.includes(keyword);
      if (found) {
        console.log(`✅ Found positive keyword: "${keyword}"`);
      }
      return found;
    });

    // Check for restrictive patterns
    let foundRestrictive = null;
    let restrictiveType = null;

    for (const pattern of allRestrictivePatterns) {
      const match = description.match(pattern);
      if (match) {
        foundRestrictive = match[0];

        // Determine the type of restriction
        if (itarPatterns.includes(pattern)) {
          restrictiveType = "ITAR/Export Control";
        } else if (citizenshipPatterns.includes(pattern)) {
          restrictiveType = "US Citizenship Required";
        } else if (clearancePatterns.includes(pattern)) {
          restrictiveType = "Security Clearance Required";
        } else if (noSponsorPatterns.includes(pattern)) {
          restrictiveType = "No Visa Sponsorship";
        } else if (studentVisaPatterns.includes(pattern)) {
          restrictiveType = "Student Visa Restriction";
        } else if (permanentResidencyPatterns.includes(pattern)) {
          restrictiveType = "Permanent Residency Required";
        }

        console.log(
          `🚨 Found restrictive pattern: "${foundRestrictive}" (Type: ${restrictiveType})`
        );
        break;
      }
    }

    // Decision logic
    if (foundPositive && !foundRestrictive) {
      return {
        isRestricted: false,
        reason: `"${foundPositive}"`,
      };
    }

    if (foundRestrictive) {
      // Extract a clean, short snippet around the detected phrase
      const cleanReason = getCleanDetectedPhrase(foundRestrictive, description);
      return {
        isRestricted: true,
        reason: `"${cleanReason}"`,
        type: restrictiveType,
      };
    }

    // Check for work authorization patterns (contextual)
    const workAuthPatterns = [
      /legally authorized to work/i,
      /authorized to work.*us/i,
      /work authorization.*required/i,
      /must be authorized to work/i,
      /employment authorization.*required/i,
    ];

    for (const pattern of workAuthPatterns) {
      const match = description.match(pattern);
      if (match) {
        const foundWorkAuth = match[0];
        console.log(
          `ℹ️ Found work authorization requirement: "${foundWorkAuth}"`
        );

        // Check context around the match for exclusions
        const matchIndex = description.indexOf(foundWorkAuth.toLowerCase());
        const contextStart = Math.max(0, matchIndex - 200);
        const contextEnd = Math.min(
          description.length,
          matchIndex + foundWorkAuth.length + 200
        );
        const context = description.substring(contextStart, contextEnd);

        const exclusionPatterns = [
          /no.*sponsorship/i,
          /cannot sponsor/i,
          /will not sponsor/i,
          /cpt.*not.*eligible/i,
          /opt.*not.*eligible/i,
          /f-?1.*not.*eligible/i,
          /citizens?.*only/i,
        ];

        for (const exclusionPattern of exclusionPatterns) {
          const exclusionMatch = context.match(exclusionPattern);
          if (exclusionMatch) {
            console.log(
              `🚨 Found exclusion in context: "${exclusionMatch[0]}"`
            );
            return {
              isRestricted: true,
              reason: `"${exclusionMatch[0]}"`,
              type: "Work Authorization Restriction",
            };
          }
        }

        // Work authorization alone is not restrictive
        return {
          isRestricted: false,
          reason: "Work authorization required, no restrictions found",
        };
      }
    }

    // No clear indicators found
    return {
      isRestricted: false,
      reason: "No visa restrictions detected",
    };
  }

  function showJobStatusPopup(sponsorshipStatus, title, company) {
    console.log("🎨 Creating main popup...");

    // Remove any existing popups
    document.querySelectorAll('[id^="jobf1-"]').forEach((el) => el.remove());

    const popup = document.createElement("div");
    popup.id = sponsorshipStatus.isRestricted
      ? "jobf1-warning"
      : "jobf1-friendly";

    const bgColor = sponsorshipStatus.isRestricted ? "#dc3545" : "#28a745";
    const icon = sponsorshipStatus.isRestricted ? "⚠️" : "✅";
    const statusText = sponsorshipStatus.isRestricted
      ? "No Visa Sponsorship"
      : "Visa Friendly";

    popup.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 999999 !important;
      background: ${bgColor} !important;
      color: white !important;
      padding: 16px !important;
      border-radius: 12px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      font-size: 14px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
      max-width: 320px !important;
      animation: slideIn 0.3s ease-out !important;
    `;

    // Prepare reason text - just show the matched phrase, limit length
    let reasonText = sponsorshipStatus.reason;
    if (reasonText.length > 100) {
      reasonText = reasonText.substring(0, 97) + "...";
    }

    popup.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
        <span style="font-weight: 600; flex: 1;">${statusText}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none; border: none; color: white; font-size: 18px; 
          cursor: pointer; padding: 0; margin-left: 10px; opacity: 0.8;
        ">×</button>
      </div>
      <div style="margin-bottom: 8px;">
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div style="opacity: 0.9;">${company}</div>
      </div>
      <div style="font-size: 12px; opacity: 0.9; line-height: 1.3;">
        ${
          sponsorshipStatus.isRestricted
            ? `This position may require US citizenship or restrict visa holders.<br><strong>Found: ${reasonText}</strong>`
            : `${reasonText}`
        }
      </div>
    `;

    // Add slide-in animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(popup);
    console.log("✅ Popup added to DOM");

    // Auto-remove after delay
    setTimeout(
      () => {
        if (popup.parentNode) {
          popup.remove();
          console.log("⏰ Popup auto-removed");
        }
      },
      sponsorshipStatus.isRestricted ? 12000 : 8000
    );
  }

  // Start monitoring
  setInterval(checkUrl, 1000);
  checkUrl();

  // Listen for messages
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === "applyFilters") {
        checkUrl();
      } else if (request.action === "settingsUpdated") {
        // If citizenship filtering was just enabled and we have a current job, re-analyze
        if (request.filterCitizenship && currentJobId) {
          setTimeout(() => checkJobSponsorshipStatus(), 500);
        }
      }
    });
  }

  console.log("✅ JobF1 ready");
})();
