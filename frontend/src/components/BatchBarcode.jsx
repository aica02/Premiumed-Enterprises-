import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// Code 128 barcode of a batch code. The Picking and Dispose scanners look
// batches up by batch code, so this barcode scans in those flows as is.
const BatchBarcode = ({ value }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, String(value), {
        format: "CODE128",
        // Narrow bars keep the whole barcode (about 200-250px) inside the
        // mobile scanner's frame; at width 2 it was too wide to read.
        width: 1.3,
        height: 60,
        margin: 0,
        // Room under the printed code so its bottom isn't clipped.
        marginBottom: 6,
        displayValue: true,
        font: "monospace",
        fontSize: 14,
        textMargin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (err) {
      console.error("Failed to render batch barcode:", err);
    }
  }, [value]);

  if (!value) return null;

  return (
    <div className="batch-barcode">
      <div className="batch-barcode-image">
        <svg ref={svgRef} role="img" aria-label={`Barcode for batch ${value}`} />
      </div>
    </div>
  );
};

export default BatchBarcode;
