/**
 * SVG width parser for VCV Rack module panels.
 *
 * Extracts HP (horizontal pitch) from SVG panel files.
 * 1 HP = 5.08mm = ~15px in VCV Rack convention.
 */

/**
 * Parse module width in HP from SVG content.
 * Reads the width attribute from the first 1KB.
 *
 * @param svgContent - Raw SVG file content (or first 1KB)
 * @returns Width in HP units, defaults to 10 if unparseable.
 */
export function parseSvgWidth(svgContent: string): number {
  const chunk = svgContent.slice(0, 1024);

  // Match width="123.456mm" or width="123.456"
  const match = chunk.match(/width="(\d+\.?\d*)(mm)?"/);
  if (!match) return 10; // default fallback

  const value = parseFloat(match[1]);
  if (!isFinite(value) || value <= 0) return 10;

  const unit = match[2];

  if (unit === "mm") {
    // mm → HP: 1 HP = 5.08mm
    return Math.round(value / 5.08);
  }

  // px → HP: 1 HP ≈ 15px in VCV Rack
  return Math.round(value / 15);
}
