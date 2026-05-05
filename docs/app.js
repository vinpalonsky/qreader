const statusEl = document.getElementById("status");
const cameraSelect = document.getElementById("cameraSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resultEl = document.getElementById("result");
const videoEl = document.getElementById("preview");

let codeReader = null;
let lastText = "";

function setStatus(message) {
  statusEl.textContent = message;
}

function setResult(text) {
  resultEl.textContent = text || "No scan yet.";
}

async function setupReader() {
  if (!window.ZXing || !ZXing.BrowserQRCodeReader) {
    setStatus("Scanner library failed to load.");
    startBtn.disabled = true;
    return;
  }

  codeReader = new ZXing.BrowserQRCodeReader();

  try {
    const devices = await codeReader.getVideoInputDevices();
    cameraSelect.innerHTML = "";

    if (!devices.length) {
      setStatus("No cameras found.");
      startBtn.disabled = true;
      return;
    }

    devices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    setStatus("Ready to scan.");
  } catch (err) {
    setStatus("Unable to access cameras. Check permissions.");
  }
}

async function startScanning() {
  if (!codeReader) {
    return;
  }

  const deviceId = cameraSelect.value || undefined;
  setStatus("Starting camera...");
  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    await codeReader.decodeFromVideoDevice(deviceId, videoEl, (result, err) => {
      if (result) {
        const text = result.getText();
        if (text !== lastText) {
          lastText = text;
          setResult(text);
          setStatus("QR detected.");
        }
      }

      if (err && !(err instanceof ZXing.NotFoundException)) {
        setStatus("Scanner error. Try restarting.");
      }
    });
  } catch (err) {
    setStatus("Failed to start camera.");
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopScanning() {
  if (!codeReader) {
    return;
  }

  codeReader.reset();
  setStatus("Stopped.");
  startBtn.disabled = false;
  stopBtn.disabled = true;
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
