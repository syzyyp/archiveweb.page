import { WARCRecord, WARCSerializer } from './lib/warcio.js';

console.log("WARC Archiver background script loaded.");
// console.log(WARCRecord); // Logging the entire object can be too verbose

let capturingTabId = null;
let capturedRequests = {}; // Store for requests and responses
let mainPageHTML = null;
let mainPageURL = null;
let pageTitle = null;

// --- Helper Function: Generate WARC Filename ---
function generateWarcFilename(pageTitle) {
  const sanitizedTitle = pageTitle ? pageTitle.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') : 'untitled';
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  return `${sanitizedTitle}_${timestamp}.warc`;
}

// --- Main Function: Generate All WARC Records ---
async function generateAllWarcRecords(pageURL, pageHTML, pageTitle, allCapturedRequests) {
  const warcFilenameForInfo = generateWarcFilename(pageTitle); // Filename for warcinfo, not the final download
  console.log(`Preparing WARC records for: ${pageURL}`);

  let warcRecords = [];

  // 1. warcinfo Record
  const warcinfoRecord = await WARCRecord.createWARCInfo({ filename: warcFilenameForInfo, warcVersion: "WARC/1.1" }, {
    "software": "WARC Archiver Chrome Extension v0.1.0",
    "description": "WARC file generated from browser capture.",
    "creator": "WARC Archiver User",
    "date": new Date().toISOString(),
    "isPartOf": pageURL,
  });
  warcRecords.push(warcinfoRecord);

  // Find the main page request details from capturedRequests
  let mainPageRequestDetails = null;
  let mainPageRequestId = null; 
  for (const requestId in allCapturedRequests) {
    if (allCapturedRequests[requestId].url === pageURL && allCapturedRequests[requestId].type === "main_frame") {
      mainPageRequestDetails = allCapturedRequests[requestId];
      mainPageRequestId = requestId;
      break;
    }
  }
  if (!mainPageRequestDetails) { 
    for (const requestId in allCapturedRequests) {
        if (allCapturedRequests[requestId].url === pageURL) {
            mainPageRequestDetails = allCapturedRequests[requestId];
            mainPageRequestId = requestId; 
            if (mainPageRequestDetails.status === "completed") break; 
        }
    }
  }

  // 2. Main Page response Record
  const responseHttpStatus = mainPageRequestDetails?.statusCode || 200;
  const responseHttpStatusText = 'OK'; 
  const responseStatusLine = `HTTP/1.1 ${responseHttpStatus} ${responseHttpStatusText}\r\n`;
  
  let mainPageResponseHeadersObj = {};
  if (mainPageRequestDetails?.responseHeaders) {
    mainPageRequestDetails.responseHeaders.forEach(header => {
      mainPageResponseHeadersObj[header.name] = header.value;
    });
  } else {
    mainPageResponseHeadersObj['Content-Type'] = 'text/html; charset=utf-8';
  }
  const mainPageResponseHeadersString = Object.entries(mainPageResponseHeadersObj).map(([name, value]) => `${name}: ${value}\r\n`).join('');
  const mainPageHttpResponsePayload = responseStatusLine + mainPageResponseHeadersString + "\r\n" + pageHTML;

  const mainPageResponseRecord = await WARCRecord.create({
    url: pageURL,
    date: new Date().toISOString(),
    type: "response",
    warcVersion: "WARC/1.1",
    warcHeadersAdd: { 
        'WARC-Identified-Payload-Type': mainPageResponseHeadersObj['Content-Type'] || 'text/html',
        'Content-Type': 'application/http; msgtype=response',
        'WARC-Target-URI': pageURL,
    }
  }, async function*() {
    yield new TextEncoder().encode(mainPageHttpResponsePayload);
  });
  warcRecords.push(mainPageResponseRecord);

  // 3. Main Page request Record
  const requestHttpMethod = mainPageRequestDetails?.method || 'GET';
  const requestUrlObject = new URL(pageURL);
  const requestPath = requestUrlObject.pathname + requestUrlObject.search;
  const requestStatusLine = `${requestHttpMethod} ${requestPath} HTTP/1.1\r\n`;

  let mainPageRequestHeadersObj = {}; 
  if (mainPageRequestDetails?.requestHeaders) {
    mainPageRequestDetails.requestHeaders.forEach(header => {
      if (!header.name.startsWith(':')) {
          mainPageRequestHeadersObj[header.name] = header.value;
      }
    });
  } else {
    mainPageRequestHeadersObj['Accept'] = 'text/html,*/*';
  }
  const mainPageRequestHeadersString = Object.entries(mainPageRequestHeadersObj).map(([name, value]) => `${name}: ${value}\r\n`).join('');
  const mainPageHttpRequestPayload = requestStatusLine + mainPageRequestHeadersString + "\r\n";

  const mainPageRequestRecord = await WARCRecord.create({
    url: pageURL,
    date: new Date().toISOString(),
    type: "request",
    warcVersion: "WARC/1.1",
     warcHeadersAdd: { 
        'Content-Type': 'application/http; msgtype=request',
        'WARC-Target-URI': pageURL,
        'WARC-Concurrent-To': mainPageResponseRecord.warcHeader('WARC-Record-ID')
    }
  }, async function*() {
    yield new TextEncoder().encode(mainPageHttpRequestPayload); 
  });
  warcRecords.push(mainPageRequestRecord);

  // 4. Iterate through allCapturedRequests for sub-resources
  for (const requestId in allCapturedRequests) {
    if (requestId === mainPageRequestId) { 
      continue;
    }
    const requestData = allCapturedRequests[requestId];

    if (requestData.status !== "completed" || !requestData.responseHeaders || requestData.url.startsWith("data:")) {
      console.log(`Skipping WARC record for ${requestData.url} (status: ${requestData.status}, hasResponseHeaders: ${!!requestData.responseHeaders}, isDataURI: ${requestData.url.startsWith("data:")})`);
      continue;
    }

    const recordUrl = requestData.url;
    const recordDate = new Date(requestData.timestamp || Date.now()).toISOString(); 
    const subResponseStatusCode = requestData.statusCode;
    const subResponseStatusText = 'OK'; 
    
    const subResponseStatusLine = `HTTP/1.1 ${subResponseStatusCode} ${subResponseStatusText}\r\n`;
    const subResponseHeadersString = requestData.responseHeaders.map(h => `${h.name}: ${h.value}\r\n`).join('');
    const subResponsePayloadString = `${subResponseStatusLine}${subResponseHeadersString}\r\n\r\n[BODY FOR ${recordUrl} - NOT CAPTURED YET]`; 

    const responseRecord = await WARCRecord.create({
        url: recordUrl,
        date: recordDate,
        type: "response",
        warcVersion: "WARC/1.1",
        warcHeadersAdd: {
            'WARC-Identified-Payload-Type': requestData.responseHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value || 'application/octet-stream',
            'Content-Type': 'application/http; msgtype=response',
            'WARC-Target-URI': recordUrl,
            'WARC-Payload-Digest': 'sha256:placeholder-subresource-body' // Placeholder
        }
    }, async function*() { yield new TextEncoder().encode(subResponsePayloadString); });
    warcRecords.push(responseRecord);

    const subRequestHttpMethod = requestData.method;
    const subRequestUrlObject = new URL(recordUrl);
    const subRequestPath = subRequestUrlObject.pathname + subRequestUrlObject.search;
    const subRequestStatusLine = `${subRequestHttpMethod} ${subRequestPath} HTTP/1.1\r\n`;
    
    const subRequestHeadersString = (requestData.requestHeaders || []).map(h => `${h.name}: ${h.value}\r\n`).join('');
    const subRequestPayloadString = `${subRequestStatusLine}${subRequestHeadersString}\r\n`;

    const requestRecord = await WARCRecord.create({
        url: recordUrl,
        date: recordDate,
        type: "request",
        warcVersion: "WARC/1.1",
        warcHeadersAdd: {
            'Content-Type': 'application/http; msgtype=request',
            'WARC-Target-URI': recordUrl,
            'WARC-Concurrent-To': responseRecord.warcHeader('WARC-Record-ID'),
            'WARC-Payload-Digest': 'sha256:placeholder-subresource-request-body' // Placeholder
        }
    }, async function*() { yield new TextEncoder().encode(subRequestPayloadString); });
    warcRecords.push(requestRecord);
    // console.log(`Created request/response WARC records for sub-resource: ${recordUrl}`); // Can be too verbose
  }
  return warcRecords;
}

// --- New Function: Assemble and Download WARC ---
async function assembleAndDownloadWarc(warcRecords, filename) {
  console.log(`Assembling WARC file: ${filename} from ${warcRecords.length} records.`);
  const serializedRecords = [];
  for (const record of warcRecords) {
    serializedRecords.push(await WARCSerializer.serialize(record));
  }

  const warcBlob = new Blob(serializedRecords, { type: "application/warc" });
  const warcURL = URL.createObjectURL(warcBlob);

  console.log(`Attempting to download WARC file: ${filename}`);
  chrome.downloads.download({
    url: warcURL,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Download failed:", chrome.runtime.lastError.message);
    } else {
      console.log("Download started with ID:", downloadId);
    }
    // Consider revoking URL.createObjectURL later, e.g., in chrome.downloads.onChanged
    // For now, we'll let the browser manage it or revoke it if we add a download manager UI
  });
}

// --- WebRequest Listener Functions ---
function onBeforeRequestListener(details) {
  if (details.tabId === capturingTabId && !details.url.startsWith("chrome-extension://") && !details.url.startsWith("data:")) {
    capturedRequests[details.requestId] = {
      url: details.url,
      method: details.method,
      requestHeaders: [], 
      type: details.type,
      status: "pending",
      timestamp: details.timeStamp 
    };
  }
}

function onSendHeadersListener(details) {
  if (details.tabId === capturingTabId && capturedRequests[details.requestId]) {
    capturedRequests[details.requestId].requestHeaders = details.requestHeaders;
  }
}

function onHeadersReceivedListener(details) {
  if (details.tabId === capturingTabId && capturedRequests[details.requestId]) {
    capturedRequests[details.requestId].responseHeaders = details.responseHeaders;
    capturedRequests[details.requestId].statusCode = details.statusCode;
  }
}

function onCompletedListener(details) {
  if (details.tabId === capturingTabId && capturedRequests[details.requestId]) {
    capturedRequests[details.requestId].status = "completed";
    capturedRequests[details.requestId].statusCode = details.statusCode;
    if (details.responseHeaders) { 
       capturedRequests[details.requestId].responseHeaders = details.responseHeaders;
    }
  }
}

function onErrorOccurredListener(details) {
  if (details.tabId === capturingTabId && capturedRequests[details.requestId]) {
    capturedRequests[details.requestId].status = "error";
    capturedRequests[details.requestId].error = details.error;
  }
}

// --- Functions to Add/Remove Listeners ---
function addWebRequestListeners() {
  if (!capturingTabId) {
    console.error("Cannot add WebRequest listeners without a capturingTabId.");
    return;
  }
  console.log(`Adding WebRequest listeners for tabId: ${capturingTabId}`);
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestListener, { urls: ["<all_urls>"] }, ["requestBody"]);
  chrome.webRequest.onSendHeaders.addListener(onSendHeadersListener, { urls: ["<all_urls>"] }, ["requestHeaders"]);
  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceivedListener, { urls: ["<all_urls>"] }, ["responseHeaders", "blocking"]);
  chrome.webRequest.onCompleted.addListener(onCompletedListener, { urls: ["<all_urls>"] }, ["responseHeaders"]);
  chrome.webRequest.onErrorOccurred.addListener(onErrorOccurredListener, { urls: ["<all_urls>"] });
  console.log("WebRequest listeners added.");
}

function removeWebRequestListeners() {
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestListener);
  chrome.webRequest.onSendHeaders.removeListener(onSendHeadersListener);
  chrome.webRequest.onHeadersReceived.removeListener(onHeadersReceivedListener);
  chrome.webRequest.onCompleted.removeListener(onCompletedListener);
  chrome.webRequest.onErrorOccurred.removeListener(onErrorOccurredListener);
  console.log("WebRequest listeners removed.");
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_PAGE") {
    capturingTabId = message.tabId; 
    capturedRequests = {}; 
    mainPageHTML = null; // Reset for new capture
    mainPageURL = null;
    pageTitle = null;
    addWebRequestListeners(); 

    console.log(`Received CAPTURE_PAGE message for tabId: ${capturingTabId}`);

    chrome.tabs.get(capturingTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(`Error getting tab details: ${chrome.runtime.lastError.message}`);
        sendResponse({ status: `Error: ${chrome.runtime.lastError.message}` });
        removeWebRequestListeners();
        capturingTabId = null;
        return;
      }
      console.log(`Tab details: URL=${tab.url}, Title=${tab.title}`);

      chrome.scripting.executeScript(
        {
          target: { tabId: capturingTabId },
          files: ["content_script.js"],
        },
        (injectionResults) => {
          if (chrome.runtime.lastError) {
            console.error(`Error injecting content script: ${chrome.runtime.lastError.message}`);
            sendResponse({ status: `Error injecting script: ${chrome.runtime.lastError.message}` });
            removeWebRequestListeners();
            capturingTabId = null;
            return;
          }
          if (injectionResults && injectionResults.length > 0) {
            console.log("Content script injected successfully.");
            sendResponse({ status: "Capture process started. Content script injected. WebRequest listeners active." });
          } else {
            console.warn("Content script injection did not return results.");
            sendResponse({ status: "Injection status unknown." });
            removeWebRequestListeners();
            capturingTabId = null;
          }
        }
      );
    });
    return true; 
  } else if (message.type === "PAGE_CONTENT") {
    console.log("Received PAGE_CONTENT message from content script.");
    mainPageURL = message.pageUrl;
    mainPageHTML = message.content;
    pageTitle = message.title; 

    console.log(`Page URL: ${mainPageURL}`);
    console.log(`Page Title: ${pageTitle}`);
    // console.log(`HTML content length: ${mainPageHTML.length}`); // Can be too verbose

    if (message.assets) {
      console.log("Assets received (not yet processed for WARC):");
      console.log(`  Stylesheets: ${message.assets.styles.length}`);
      console.log(`  Scripts: ${message.assets.scripts.length}`);
      console.log(`  Images: ${message.assets.images.length}`);
    } else {
      console.log("No assets object received.");
    }

    // Generate WARC records and initiate download
    (async () => {
      try {
        const generatedFilename = generateWarcFilename(pageTitle);
        const allWarcRecords = await generateAllWarcRecords(mainPageURL, mainPageHTML, pageTitle, capturedRequests);
        
        console.log(`Total WARC records generated: ${allWarcRecords.length}`);
        // allWarcRecords.forEach(record => { // Can be too verbose
        //   let id = record.warcHeader('WARC-Record-ID');
        //   console.log(`  - Type: ${record.warcType}, URI: ${record.warcTargetURI || record.warcHeader('WARC-Filename') || 'N/A'}, ID: ${id}`);
        // });

        await assembleAndDownloadWarc(allWarcRecords, generatedFilename);
        
        chrome.runtime.sendMessage({ type: "CAPTURE_STATUS", status: `WARC generated: ${generatedFilename}. Download initiated.` });

      } catch (error) {
        console.error("Error generating or downloading WARC:", error);
        chrome.runtime.sendMessage({ type: "CAPTURE_STATUS", status: `Error: ${error.message}` });
      } finally {
        // Clean up after processing this page capture
        removeWebRequestListeners();
        capturingTabId = null;
        capturedRequests = {};
        mainPageHTML = null;
        mainPageURL = null;
        pageTitle = null;
        console.log("Cleaned up after capture session.");
      }
    })();

    sendResponse({ status: "Page content received. WARC generation and download process started." });
    return true; // Keep channel open for async operations in this handler

  } else if (message.type === "STOP_CAPTURE") { // This might be redundant if PAGE_CONTENT triggers cleanup
    console.log("Received STOP_CAPTURE message.");
    removeWebRequestListeners(); 
    capturingTabId = null;
    capturedRequests = {};
    mainPageHTML = null;
    mainPageURL = null;
    pageTitle = null;
    console.log("Capture manually stopped. All states reset.");
    sendResponse({ status: "Capture manually stopped.", count: Object.keys(capturedRequests).length });
  } else if (message.type === "DYNAMIC_CONTENT_UPDATE") {
    console.log(`Received DYNAMIC_CONTENT_UPDATE from ${message.url}`);
    console.log(`New HTML length: ${message.newHtml.length}, New Title: ${message.title}`);
    // For now, just acknowledge. Future tasks will handle WARC record creation for this.
    // TODO: In a future task, create a new WARC 'revisit' or 'response' record with this updated HTML.
    // This might involve comparing it to the previously captured mainPageHTML to see if it's substantially different.
    sendResponse({ status: "Dynamic content update received by background." });
  }
});
