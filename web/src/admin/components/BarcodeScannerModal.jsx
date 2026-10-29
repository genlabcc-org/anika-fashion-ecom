import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { TbBarcode, TbScan } from "react-icons/tb";
import { FiCamera, FiCheck, FiX, FiZap } from "react-icons/fi";
import { playScannerBeep } from "../utils/scannerAudio";
import "./BarcodeScannerModal.css";

const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || (window.innerWidth <= 768 && navigator.maxTouchPoints > 0)
  );
};

function BarcodeScannerModalContent({
  onClose,
  onScan,
  title,
  initialMode,
}) {
  const isMobile = isMobileDevice();
  const [activeTab, setActiveTab] = useState(
    initialMode || (isMobile ? "camera" : "dedicated")
  );
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scannedResult, setScannedResult] = useState(null);

  const html5QrCodeRef = useRef(null);
  const mountedRef = useRef(true);

  const stopCameraScanner = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch (err) {
      console.warn("Camera cleanup warning:", err);
    } finally {
      if (mountedRef.current) {
        setIsScanningActive(false);
        setIsStartingCamera(false);
        setTorchOn(false);
        setHasTorch(false);
      }
    }
  }, []);

  const handleSuccessfulScan = useCallback(async (rawCode, source) => {
    const clean = (rawCode || "").replace(/[\s\r\n]+/g, "").trim();
    if (!clean) return;

    playScannerBeep("success");
    setScannedResult({ code: clean, source });

    await stopCameraScanner();

    if (typeof onScan === "function") {
      onScan(clean, source);
    }

    setTimeout(() => {
      if (mountedRef.current) {
        onClose();
      }
    }, 700);
  }, [onScan, onClose, stopCameraScanner]);

  const startCameraWithId = useCallback(async (cameraId) => {
    if (!cameraId) return;

    await stopCameraScanner();

    if (!mountedRef.current) return;
    setIsStartingCamera(true);
    setCameraError("");

    try {
      const qrScanner = new Html5Qrcode("bsm-camera-viewport", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });

      html5QrCodeRef.current = qrScanner;

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const w = Math.min(Math.floor(viewfinderWidth * 0.88), 340);
          const h = Math.min(Math.floor(viewfinderHeight * 0.55), 180);
          return { width: Math.max(w, 200), height: Math.max(h, 120) };
        },
        aspectRatio: 1.33333,
      };

      await qrScanner.start(
        cameraId,
        config,
        (decodedText) => {
          handleSuccessfulScan(decodedText, "camera");
        },
        () => {
          // Frame pass without barcode detected
        }
      );

      if (mountedRef.current) {
        setIsScanningActive(true);
        setIsStartingCamera(false);

        try {
          const capabilities = qrScanner.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          } else {
            setHasTorch(false);
          }
        } catch (_) {
          setHasTorch(false);
        }
      }
    } catch (err) {
      console.error("Failed to start camera scanner:", err);
      if (mountedRef.current) {
        setCameraError(
          err.message ||
            "Unable to start camera video stream. Please ensure camera access is granted."
        );
        setIsStartingCamera(false);
        setIsScanningActive(false);
      }
    }
  }, [stopCameraScanner, handleSuccessfulScan]);

  // Handle camera lifecycle
  useEffect(() => {
    mountedRef.current = true;

    if (activeTab !== "camera") {
      stopCameraScanner();
      return;
    }

    let isSubscribed = true;

    async function initCamera() {
      setIsStartingCamera(true);
      setCameraError("");

      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isSubscribed) return;

        if (!devices || devices.length === 0) {
          setCameraError(
            "No camera detected on this device. You can connect a USB camera or use a dedicated USB barcode scanner gun."
          );
          setIsStartingCamera(false);
          return;
        }

        setCameras(devices);

        // Prefer back camera on mobile
        let chosenId = devices[0].id;
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("environment") ||
            d.label.toLowerCase().includes("rear")
        );
        if (backCamera) {
          chosenId = backCamera.id;
        }
        setSelectedCameraId(chosenId);

        startCameraWithId(chosenId);
      } catch (err) {
        if (!isSubscribed) return;
        console.error("Camera detection error:", err);
        setCameraError(
          "Camera permission denied or camera unavailable. Please check browser permissions."
        );
        setIsStartingCamera(false);
      }
    }

    initCamera();

    return () => {
      isSubscribed = false;
      mountedRef.current = false;
      stopCameraScanner();
    };
  }, [activeTab, startCameraWithId, stopCameraScanner]);

  const handleToggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Failed to toggle torch:", err);
    }
  };

  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    await startCameraWithId(newId);
  };

  const handleManualDedicatedInput = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val) {
        handleSuccessfulScan(val, "dedicated-manual");
      }
    }
  };

  return (
    <div className="bsm-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bsm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bsm-header">
          <div className="bsm-title-wrap">
            <span className="bsm-icon-badge">
              <TbScan size={18} />
            </span>
            <div>
              <h3 className="bsm-title">{title}</h3>
              <p className="bsm-subtitle">
                {activeTab === "camera"
                  ? "Point camera at courier AWB barcode or QR code"
                  : "Ready for USB / Bluetooth handheld barcode scanner gun"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="bsm-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Mode Selector Tabs (Mobile vs Dedicated Scanner) */}
        <div className="bsm-tabs">
          <button
            type="button"
            className={`bsm-tab ${activeTab === "camera" ? "bsm-tab--active" : ""}`}
            onClick={() => setActiveTab("camera")}
          >
            <FiCamera size={14} />
            <span>Mobile / Camera</span>
            {isMobile && <span className="bsm-pill">Auto</span>}
          </button>
          <button
            type="button"
            className={`bsm-tab ${activeTab === "dedicated" ? "bsm-tab--active" : ""}`}
            onClick={() => setActiveTab("dedicated")}
          >
            <TbBarcode size={15} />
            <span>PC Scanner Gun</span>
            {!isMobile && <span className="bsm-pill">Auto</span>}
          </button>
        </div>

        {/* Body Content */}
        <div className="bsm-body">
          {scannedResult ? (
            <div className="bsm-success-card">
              <div className="bsm-success-icon">
                <FiCheck size={28} />
              </div>
              <h4>Barcode Scanned Successfully!</h4>
              <div className="bsm-scanned-code">{scannedResult.code}</div>
              <p className="bsm-success-note">
                Auto-inserted into Tracking ID field...
              </p>
            </div>
          ) : activeTab === "camera" ? (
            /* ── Camera Scanner View ── */
            <div className="bsm-camera-section">
              {cameraError ? (
                <div className="bsm-error-box">
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className="bsm-btn-secondary"
                    onClick={() => setActiveTab("dedicated")}
                  >
                    Switch to PC Barcode Scanner Gun
                  </button>
                </div>
              ) : (
                <>
                  <div className="bsm-viewport-container">
                    <div id="bsm-camera-viewport" className="bsm-viewport" />
                    {isStartingCamera && (
                      <div className="bsm-loading-overlay">
                        <div className="bsm-spinner" />
                        <span>Starting camera feed...</span>
                      </div>
                    )}
                    {isScanningActive && (
                      <div className="bsm-target-overlay">
                        <div className="bsm-reticle">
                          <div className="bsm-laser-line" />
                        </div>
                        <span className="bsm-target-tip">
                          Center barcode within box
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Camera Controls */}
                  <div className="bsm-camera-controls">
                    {cameras.length > 1 && (
                      <div className="bsm-control-group">
                        <label htmlFor="bsm-camera-select">Camera:</label>
                        <select
                          id="bsm-camera-select"
                          value={selectedCameraId}
                          onChange={handleCameraChange}
                          className="bsm-select"
                        >
                          {cameras.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label || `Camera ${c.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {hasTorch && (
                      <button
                        type="button"
                        className={`bsm-torch-btn ${torchOn ? "bsm-torch-btn--active" : ""}`}
                        onClick={handleToggleTorch}
                        title={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                      >
                        <FiZap size={14} />
                        <span>{torchOn ? "Torch On" : "Torch"}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── Dedicated Hardware Scanner Gun View ── */
            <div className="bsm-dedicated-section">
              <div className="bsm-gun-card">
                <div className="bsm-gun-icon-pulse">
                  <TbBarcode size={44} />
                  <div className="bsm-pulse-ring" />
                </div>
                <h4>Dedicated Barcode Scanner Active</h4>
                <p className="bsm-gun-tip">
                  Pull the trigger on your USB or Bluetooth barcode scanner gun
                  aimed at the parcel label. The scanned code will be
                  automatically entered into the Tracking ID field.
                </p>

                <div className="bsm-status-indicator">
                  <span className="bsm-status-dot" />
                  <span>Listening for barcode scanner keystrokes...</span>
                </div>

                <div className="bsm-test-box">
                  <label htmlFor="bsm-test-input">Test / Direct Input Focus:</label>
                  <input
                    id="bsm-test-input"
                    type="text"
                    className="bsm-test-input"
                    placeholder="Scan barcode here or press Enter to accept..."
                    autoFocus
                    onKeyDown={handleManualDedicatedInput}
                  />
                  <span className="bsm-test-hint">
                    Scanner guns transmit input instantly and press Enter
                    automatically.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bsm-footer">
          <span className="bsm-footer-text">
            Supports Code 128, Code 39, EAN, UPC, QR & 2D Courier Barcodes
          </span>
          <button type="button" className="bsm-btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Barcode & Tracking Scanner",
  initialMode = null,
}) {
  if (!isOpen) return null;

  return (
    <BarcodeScannerModalContent
      onClose={onClose}
      onScan={onScan}
      title={title}
      initialMode={initialMode}
    />
  );
}
