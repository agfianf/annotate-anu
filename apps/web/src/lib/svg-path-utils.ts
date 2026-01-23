/**
 * SVG Path Utilities
 * Converts SVG path data to polygon points for annotation
 */

export interface Point {
  x: number
  y: number
}

/**
 * Parse SVG path data string into an array of polygon points
 * Supports basic SVG commands: M, L, H, V, Z, m, l, h, v, z
 *
 * @param pathData - SVG path data string (e.g., "M 100 100 L 200 100 L 200 200 Z")
 * @param imageWidth - Image width for denormalization (if coords are normalized 0-1)
 * @param imageHeight - Image height for denormalization (if coords are normalized 0-1)
 * @param normalized - Whether the coordinates in the path are normalized (0-1)
 * @returns Array of polygon points
 */
export function svgPathToPolygon(
  pathData: string,
  imageWidth: number,
  imageHeight: number,
  normalized = false
): Point[] {
  if (!pathData || !pathData.trim()) {
    return []
  }

  const points: Point[] = []
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  // Tokenize the path data
  // Regex to match commands and numbers (including negative and decimal)
  const tokens = pathData.match(/[MmLlHhVvZzCcSsQqTtAa]|-?[\d.]+/g) || []

  let i = 0
  while (i < tokens.length) {
    const command = tokens[i]

    switch (command) {
      case 'M': // Move to (absolute)
        i++
        currentX = parseFloat(tokens[i++])
        currentY = parseFloat(tokens[i++])
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        // After M, implicit L commands
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX = parseFloat(tokens[i++])
          currentY = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'm': // Move to (relative)
        i++
        currentX += parseFloat(tokens[i++])
        currentY += parseFloat(tokens[i++])
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        // After m, implicit l commands
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX += parseFloat(tokens[i++])
          currentY += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'L': // Line to (absolute)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX = parseFloat(tokens[i++])
          currentY = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'l': // Line to (relative)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX += parseFloat(tokens[i++])
          currentY += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'H': // Horizontal line (absolute)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'h': // Horizontal line (relative)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentX += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'V': // Vertical line (absolute)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentY = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'v': // Vertical line (relative)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          currentY += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'Z': // Close path
      case 'z':
        // Only add the start point if we're not already there
        if (currentX !== startX || currentY !== startY) {
          points.push({ x: startX, y: startY })
        }
        currentX = startX
        currentY = startY
        i++
        break

      case 'C': // Cubic Bezier (absolute) - approximate with line to endpoint
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          // Skip control points, just use endpoint
          i += 4 // Skip x1, y1, x2, y2
          currentX = parseFloat(tokens[i++])
          currentY = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'c': // Cubic Bezier (relative)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          i += 4 // Skip control points
          currentX += parseFloat(tokens[i++])
          currentY += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'Q': // Quadratic Bezier (absolute)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          i += 2 // Skip control point
          currentX = parseFloat(tokens[i++])
          currentY = parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      case 'q': // Quadratic Bezier (relative)
        i++
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          i += 2 // Skip control point
          currentX += parseFloat(tokens[i++])
          currentY += parseFloat(tokens[i++])
          points.push({ x: currentX, y: currentY })
        }
        break

      default:
        // Skip unknown commands
        i++
        break
    }
  }

  // Denormalize if needed
  if (normalized) {
    return points.map((p) => ({
      x: p.x * imageWidth,
      y: p.y * imageHeight,
    }))
  }

  return points
}

/**
 * Convert polygon points to SVG path data
 *
 * @param points - Array of polygon points
 * @returns SVG path data string
 */
export function polygonToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''

  const commands: string[] = []

  points.forEach((point, index) => {
    if (index === 0) {
      commands.push(`M ${point.x} ${point.y}`)
    } else {
      commands.push(`L ${point.x} ${point.y}`)
    }
  })

  commands.push('Z')

  return commands.join(' ')
}

/**
 * Simplify polygon by reducing number of points
 * Uses Ramer-Douglas-Peucker algorithm
 *
 * @param points - Original polygon points
 * @param epsilon - Simplification tolerance
 * @returns Simplified polygon points
 */
export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points

  // Find the point with the maximum distance
  let dmax = 0
  let index = 0
  const end = points.length - 1

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end])
    if (d > dmax) {
      index = i
      dmax = d
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (dmax > epsilon) {
    const recResults1 = simplifyPolygon(points.slice(0, index + 1), epsilon)
    const recResults2 = simplifyPolygon(points.slice(index), epsilon)

    // Build the result list
    return [...recResults1.slice(0, -1), ...recResults2]
  }

  // Return the endpoints
  return [points[0], points[end]]
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  // Normalize
  const mag = Math.hypot(dx, dy)
  if (mag === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)

  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag)

  const closestX = lineStart.x + u * dx
  const closestY = lineStart.y + u * dy

  return Math.hypot(point.x - closestX, point.y - closestY)
}

/**
 * Convert normalized bounding box to pixel coordinates
 *
 * @param bbox - Normalized bbox { x_min, y_min, x_max, y_max } (0-1 range)
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Pixel bbox { x, y, width, height }
 */
export function normalizedBboxToPixels(
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number },
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: bbox.x_min * imageWidth,
    y: bbox.y_min * imageHeight,
    width: (bbox.x_max - bbox.x_min) * imageWidth,
    height: (bbox.y_max - bbox.y_min) * imageHeight,
  }
}

/**
 * Convert pixel bounding box to normalized coordinates
 *
 * @param bbox - Pixel bbox { x, y, width, height }
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Normalized bbox { x_min, y_min, x_max, y_max } (0-1 range)
 */
export function pixelBboxToNormalized(
  bbox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): { x_min: number; y_min: number; x_max: number; y_max: number } {
  return {
    x_min: bbox.x / imageWidth,
    y_min: bbox.y / imageHeight,
    x_max: (bbox.x + bbox.width) / imageWidth,
    y_max: (bbox.y + bbox.height) / imageHeight,
  }
}
