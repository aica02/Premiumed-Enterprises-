import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import "../styles/Barcode.css";

const BarcodeScanner = ({ onScanSuccess, scannerId }) => {
  const html5QrCodeRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const containerId = scannerId || "barcode-reader";

  useEffect(() => {
    startScanner();

    return () => stopScanner();
  }, []);

  const startScanner = async () => {
    if (html5QrCodeRef.current || scanning) return;

    try {
      const html5QrCode = new Html5Qrcode(containerId);
      html5QrCodeRef.current = html5QrCode;

      // Force back camera on mobile
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 64,
          qrbox: { width: 180, height: 150 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
        },

        (decodedText) => {
          setScanned(true);
          if (onScanSuccess) onScanSuccess(decodedText);

          setTimeout(() => setScanned(false), 1000);
        },
      );

      setScanning(true);
    } catch (err) {
      console.error("Camera start failed:", err);
      alert(
        "Camera access failed. Make sure you are using HTTPS and allowed camera permissions. Open in Chrome if possible.",
      );
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === "STARTED") {
          await html5QrCodeRef.current.stop();
          await html5QrCodeRef.current.clear();
        }
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      html5QrCodeRef.current = null;
      setScanning(false);
    }
  };
  return (
    <div className={`camera-crop ${scanned ? "scanned" : ""}`}>
      <div id={containerId} style={{ width: 200, height: 150 }} />
    </div>
  );
};

export default BarcodeScanner;
