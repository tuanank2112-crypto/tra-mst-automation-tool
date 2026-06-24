const DEVICE_ID_KEY = "LICENSE_DEVICE_ID_V1";

function genDeviceId() {
  return "dev_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

chrome.runtime.onInstalled.addListener(async () => {
  const got = await chrome.storage.local.get([DEVICE_ID_KEY]);
  if (!got[DEVICE_ID_KEY]) {
    await chrome.storage.local.set({ [DEVICE_ID_KEY]: genDeviceId() });
  }
});
