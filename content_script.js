// Get the full HTML of the current page
const pageHTML = document.documentElement.outerHTML;

// Function to extract static asset URLs
function extractAssetUrls() {
  const assets = {
    styles: [],
    scripts: [],
    images: [],
  };

  // Extract CSS URLs from <link rel="stylesheet">
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    if (link.href) {
      assets.styles.push(link.href);
    }
  });

  // Extract JS URLs from <script src="...">
  document.querySelectorAll('script[src]').forEach(script => {
    if (script.src) {
      assets.scripts.push(script.src);
    }
  });

  // Extract image URLs from <img src="...">
  document.querySelectorAll('img[src]').forEach(img => {
    if (img.src) {
      assets.images.push(img.src);
    }
  });

  // Extract image URLs from <source srcset="...">
  document.querySelectorAll('source[srcset]').forEach(source => {
    if (source.srcset) {
      const srcsetEntries = source.srcset.split(',').map(entry => entry.trim().split(' ')[0]);
      assets.images.push(...srcsetEntries);
    }
  });


  // TODO: Add more selectors for other types of assets if needed (e.g., video, audio, fonts)

  return assets;
}

const assetUrls = extractAssetUrls();

// Send a message to the background script with the page content and asset URLs
chrome.runtime.sendMessage(
  {
    type: "PAGE_CONTENT",
    content: pageHTML,
    assets: assetUrls,
    pageUrl: window.location.href, // Send the page URL for context
    title: document.title // Send the page title
  },
  (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error sending PAGE_CONTENT:", chrome.runtime.lastError.message);
    } else if (response) {
      console.log("Response from background script for PAGE_CONTENT:", response.status);
    }
  }
);

console.log("Content script has sent the page HTML and asset URLs to the background script.");
console.log("Assets found:", assetUrls);

// --- Dynamic Content Handling with MutationObserver ---
let debounceTimeout = null;
const observer = new MutationObserver((mutationsList, observer) => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    console.log("Sending dynamic content update due to DOM changes.");
    chrome.runtime.sendMessage(
      {
        type: "DYNAMIC_CONTENT_UPDATE",
        newHtml: document.documentElement.outerHTML,
        url: document.URL,
        title: document.title
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending DYNAMIC_CONTENT_UPDATE:", chrome.runtime.lastError.message);
        } else if (response) {
          console.log("Response from background for DYNAMIC_CONTENT_UPDATE:", response.status);
        }
      }
    );
  }, 2000); // 2-second debounce
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true
});
console.log("MutationObserver started for dynamic content.");

// --- Dynamic Content Handling with MutationObserver ---
let debounceTimeout = null;
const observer = new MutationObserver((mutationsList, observer) => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    console.log("Sending dynamic content update due to DOM changes.");
    chrome.runtime.sendMessage(
      {
        type: "DYNAMIC_CONTENT_UPDATE",
        newHtml: document.documentElement.outerHTML,
        url: document.URL,
        title: document.title
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending DYNAMIC_CONTENT_UPDATE:", chrome.runtime.lastError.message);
        } else if (response) {
          console.log("Response from background for DYNAMIC_CONTENT_UPDATE:", response.status);
        }
      }
    );
  }, 2000); // 2-second debounce
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true
});
console.log("MutationObserver started for dynamic content.");
