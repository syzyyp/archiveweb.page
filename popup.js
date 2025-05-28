console.log("WARC Archiver popup script loaded.");

document.addEventListener('DOMContentLoaded', () => {
  const captureButton = document.getElementById('captureButton');
  const stopCaptureButton = document.getElementById('stopCaptureButton');
  const statusMessage = document.getElementById('statusMessage');

  // Initial UI state
  if (statusMessage) statusMessage.textContent = 'Ready to capture.';
  if (captureButton) captureButton.disabled = false;
  if (stopCaptureButton) {
    stopCaptureButton.style.display = 'none';
    stopCaptureButton.disabled = true;
  }

  if (captureButton) {
    captureButton.addEventListener('click', () => {
      // Update UI for capture in progress
      captureButton.disabled = true;
      if (stopCaptureButton) {
        stopCaptureButton.style.display = 'inline-block';
        stopCaptureButton.disabled = false;
      }
      if (statusMessage) statusMessage.textContent = 'Capture initiated...';
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const tabId = tabs[0].id;
          chrome.runtime.sendMessage({ type: "CAPTURE_PAGE", tabId: tabId }, (response) => {
            if (chrome.runtime.lastError) {
              if (statusMessage) statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
              console.error(chrome.runtime.lastError.message);
              // Reset UI on error during initiation
              captureButton.disabled = false;
              if (stopCaptureButton) {
                stopCaptureButton.style.display = 'none';
                stopCaptureButton.disabled = true;
              }
              return;
            }
            // Initial response from background script (e.g., "Capture process started...")
            if (statusMessage && response) {
              statusMessage.textContent = response.status;
            }
          });
        } else {
          if (statusMessage) statusMessage.textContent = 'Error: No active tab found.';
          console.error('Error: No active tab found.');
          // Reset UI if no active tab
          captureButton.disabled = false;
          if (stopCaptureButton) {
            stopCaptureButton.style.display = 'none';
            stopCaptureButton.disabled = true;
          }
        }
      });
    });
  } else {
    if (statusMessage) statusMessage.textContent = 'Error: Capture button not found.';
    console.error('Error: Capture button not found.');
  }

  if (stopCaptureButton) {
    stopCaptureButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }, (response) => {
            if (chrome.runtime.lastError) {
                if (statusMessage) statusMessage.textContent = 'Error stopping: ' + chrome.runtime.lastError.message;
                console.error(chrome.runtime.lastError.message);
            } else if (response) {
                if (statusMessage) statusMessage.textContent = response.status || 'Capture stopped by user.';
            } else {
                if (statusMessage) statusMessage.textContent = 'Capture stopped by user.';
            }
            // Reset UI
            if (captureButton) captureButton.disabled = false;
            stopCaptureButton.style.display = 'none';
            stopCaptureButton.disabled = true;
        });
    });
  }

  // Listen for status updates from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CAPTURE_STATUS") {
      if (statusMessage) {
        statusMessage.textContent = message.status;
      }
      console.log("CAPTURE_STATUS:", message.status);

      // Reset UI elements after capture completion or error
      if (captureButton) captureButton.disabled = false;
      if (stopCaptureButton) {
        stopCaptureButton.style.display = 'none';
        stopCaptureButton.disabled = true;
      }

      // Optional: Add specific messages for successful completion
      if (message.status && message.status.includes("Download initiated")) {
          // statusMessage.textContent = "Capture complete! Download started."; // Or similar
      } else if (message.error) { // Assuming background script might send an error field
          if (statusMessage) statusMessage.textContent = "Error: " + message.error;
      }
    }
  });
});
