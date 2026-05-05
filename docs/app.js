const statusEl = document.getElementById("status");
const cameraSelect = document.getElementById("cameraSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resultEl = document.getElementById("result");
const videoEl = document.getElementById("preview");
const logsEl = document.getElementById("logs");
const copyLogsBtn = document.getElementById("copyLogs");

let codeReader = null;
let lastText = "";
let lastError = "";

function setStatus(message) {
  statusEl.textContent = message;
}

function setResult(text) {
  resultEl.textContent = text || "No scan yet.";
}

function formatError(err) {
  if (!err) {
    return "Unknown error";
  }
  if (typeof err === "string") {
    return err;
  }
  const parts = [];
  if (err.name) {
    parts.push(`name=${err.name}`);
  }
  if (err.message) {
    parts.push(`message=${err.message}`);
  }
  if (err.code) {
    parts.push(`code=${err.code}`);
  }
  if (err.constraint) {
    parts.push(`constraint=${err.constraint}`);
  }
  if (!parts.length) {
    try {
      return JSON.stringify(err);
    } catch (_err) {
      return "Unserializable error";
    }
  }
  return parts.join(", ");
}

function logEvent(message, detail) {
  if (!logsEl) {
    return;
  }
  const timestamp = new Date().toLocaleTimeString();
  const line = detail ? `[${timestamp}] ${message} - ${detail}` : `[${timestamp}] ${message}`;
  logsEl.textContent = logsEl.textContent
    ? `${logsEl.textContent}\n${line}`
    : line;
  logsEl.scrollTop = logsEl.scrollHeight;
  console.log(line);
}

async function setupReader() {
  if (!window.ZXing || !ZXing.BrowserQRCodeReader) {
    setStatus("Scanner library failed to load.");
    logEvent("ZXing library missing");
    startBtn.disabled = true;
    return;
  }

  codeReader = new ZXing.BrowserQRCodeReader();
  console.log("App started");
  logEvent("ZXing initialized");

  if (!window.isSecureContext) {
    logEvent("Insecure context", window.location.origin);
  }

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "camera" })
      .then((status) => {
        logEvent("Camera permission", status.state);
      })
      .catch((err) => {
        logEvent("Permission query failed", formatError(err));
      });
  }

  try {
    const devices = await codeReader.getVideoInputDevices();
    cameraSelect.innerHTML = "";

    if (!devices.length) {
      setStatus("No cameras found.");
      logEvent("No cameras found");
      startBtn.disabled = true;
      return;
    }

    let missingIds = 0;
    devices.forEach((device, index) => {
      const option = document.createElement("option");
      const deviceId = device.deviceId || "";
      option.value = deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      if (!deviceId) {
        missingIds += 1;
      }
      cameraSelect.appendChild(option);
    });

    const preferred = pickPreferredDevice(devices);
    if (preferred) {
      cameraSelect.value = preferred;
      logEvent("Preferred camera", preferred);
    } else if (devices[0]) {
      cameraSelect.value = devices[0].deviceId;
    }

    logEvent("Cameras detected", `${devices.length}`);
    if (missingIds) {
      logEvent("DeviceId missing", `${missingIds}/${devices.length}`);
    }

    setStatus("Ready to scan.");
  } catch (err) {
    setStatus("Unable to access cameras. Check permissions.");
    logEvent("Camera enumeration failed", formatError(err));
  }
}

async function startScanning() {
  if (!codeReader) {
    return;
  }

  const rawDeviceId = cameraSelect.value || "";
  const deviceId = normalizeDeviceId(rawDeviceId);
  setStatus("Starting camera...");
  startBtn.disabled = true;
  stopBtn.disabled = false;
  lastError = "";
  logEvent(
    "Starting scan",
    deviceId ? `device=${deviceId}` : rawDeviceId ? `device=${rawDeviceId}` : "device=default"
  );

  if (codeReader.reset) {
    codeReader.reset();
  }

  const attempts = [];
  if (deviceId) {
    attempts.push({
      label: `deviceId=${deviceId}`,
      constraints: { video: { deviceId: { exact: deviceId } } },
    });
  }
  attempts.push({
    label: "facingMode=environment",
    constraints: { video: { facingMode: { ideal: "environment" } } },
  });
  attempts.push({
    label: "video=true",
    constraints: { video: true },
  });

  try {
    if (typeof codeReader.decodeFromConstraints !== "function") {
      logEvent("Decoder fallback", "decodeFromVideoDevice");
      await codeReader.decodeFromVideoDevice(deviceId || undefined, videoEl, (result, err) => {
        handleDecodeResult(result, err);
      });
      return;
    }

    for (const attempt of attempts) {
      logEvent("Trying constraints", attempt.label);
      try {
        await codeReader.decodeFromConstraints(attempt.constraints, videoEl, (result, err) => {
          handleDecodeResult(result, err);
        });
        return;
      } catch (err) {
        const detail = formatError(err);
        logEvent("Start failed", `${attempt.label} - ${detail}`);
        if (err && err.name === "NotAllowedError") {
          setStatus("Camera permission denied.");
          break;
        }
        if (err && err.name === "NotReadableError") {
          setStatus("Camera is already in use.");
          break;
        }
      }
    }
  } catch (err) {
    setStatus("Failed to start camera.");
    logEvent("Failed to start camera", formatError(err));
    console.error("Camera start error", err);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function stopScanning() {
  if (!codeReader) {
    return;
  }

  codeReader.reset();
  setStatus("Stopped.");
  logEvent("Stopped scanning");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

if (copyLogsBtn) {
  copyLogsBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(logsEl.textContent || "");
      setStatus("Log copied.");
    } catch (err) {
      setStatus("Unable to copy log.");
      logEvent("Copy log failed", formatError(err));
    }
  });
}

startBtn.addEventListener("click", () => {
  startScanning();
});

stopBtn.addEventListener("click", () => {
  stopScanning();
});

window.addEventListener("beforeunload", () => {
  stopScanning();
});

setupReader();
setResult("");

function normalizeDeviceId(value) {
  if (!value) {
    return "";
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }
  return trimmed;
}

function handleDecodeResult(result, err) {
  if (result) {
    const text = result.getText();
    if (text !== lastText) {
      lastText = text;
      setResult(text);
      setStatus("QR detected.");
    }
  }

  if (err && !(err instanceof ZXing.NotFoundException)) {
    const detail = formatError(err);
    if (detail !== lastError) {
      lastError = detail;
      logEvent("Scan error", detail);
    }
    setStatus("Scanner error. Try restarting.");
  }
}

function pickPreferredDevice(devices) {
  const preferred = devices.find((device) => {
    const label = (device.label || "").toLowerCase();
    return (
      device.deviceId &&
      (label.includes("back") || label.includes("rear") || label.includes("environment"))
    );
  });
  return preferred ? preferred.deviceId : "";
}
