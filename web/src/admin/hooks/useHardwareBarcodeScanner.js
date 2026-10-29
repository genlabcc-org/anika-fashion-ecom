import { useEffect, useRef, useState } from "react";
import { playScannerBeep } from "../utils/scannerAudio";

/**
 * Hook to listen for USB / Bluetooth hardware barcode scanner input.
 * Hardware scanners act as high-speed keyboard input (keystroke delta < 50ms)
 * followed by an Enter or Tab keypress.
 *
 * @param {Object} options
 * @param {Function} options.onScan - Callback invoked when a complete barcode is scanned: (barcode) => void
 * @param {boolean} [options.enabled=true] - Whether the listener is active
 * @param {number} [options.maxInterval=50] - Max milliseconds between keystrokes to qualify as scanner
 * @param {number} [options.minLength=4] - Minimum characters for a valid barcode
 * @param {boolean} [options.playSound=true] - Whether to play beep on scan
 */
export function useHardwareBarcodeScanner({
  onScan,
  enabled = true,
  maxInterval = 55,
  minLength = 4,
  playSound = true,
}) {
  const [lastScanned, setLastScanned] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  const bufferRef = useRef([]);
  const lastKeyTimeRef = useRef(0);
  const isScanningTimeoutRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Ignore modifier keys like Shift, Ctrl, Alt, Meta alone
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter or Tab typically terminates the barcode scan
      if (e.key === "Enter" || e.key === "Tab") {
        if (bufferRef.current.length >= minLength) {
          const rawScanned = bufferRef.current.join("");
          // Sanitize: strip whitespace and common barcode delimiters
          const clean = rawScanned.replace(/[\s\r\n]+/g, "").trim();

          if (clean.length >= minLength) {
            // Prevent the enter key from submitting surrounding form
            e.preventDefault();
            e.stopPropagation();

            if (playSound) {
              playScannerBeep("success");
            }

            setLastScanned(clean);
            setIsScanning(true);

            if (isScanningTimeoutRef.current) {
              clearTimeout(isScanningTimeoutRef.current);
            }
            isScanningTimeoutRef.current = setTimeout(() => {
              setIsScanning(false);
            }, 1800);

            if (typeof onScan === "function") {
              onScan(clean);
            }
          }
        }
        bufferRef.current = [];
        return;
      }

      // Single printable character
      if (e.key.length === 1) {
        // If the gap between keys is too large, it was probably manual human typing.
        // Reset the buffer to only keep the latest key.
        if (timeDiff > maxInterval) {
          bufferRef.current = [e.key];
        } else {
          bufferRef.current.push(e.key);
        }
      }
    };

    // Use capture phase so we can intercept before form submits
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (isScanningTimeoutRef.current) {
        clearTimeout(isScanningTimeoutRef.current);
      }
    };
  }, [enabled, maxInterval, minLength, playSound, onScan]);

  return {
    lastScanned,
    isScanning,
  };
}

export default useHardwareBarcodeScanner;
