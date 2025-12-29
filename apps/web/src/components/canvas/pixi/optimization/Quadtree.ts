/**
 * Quadtree spatial index for efficient viewport culling
 *
 * Performance: O(log n) insert/remove, O(log n + k) query where k = results
 * Use case: Only render annotations visible in viewport (massive perf boost)
 */

export interface AABB {
  x: number
  y: number
  width: number
  height: number
}

interface QuadtreeNode {
  bounds: AABB
  annotations: Map<string, AABB> // annotation ID -> bounding box
  children: QuadtreeNode[] | null
  divided: boolean
}

export class Quadtree {
  private root: QuadtreeNode
  private capacity: number
  private maxDepth: number
  private annotationToNode: Map<string, QuadtreeNode> // Fast lookup for updates

  constructor(bounds: AABB, capacity = 8, maxDepth = 8) {
    this.capacity = capacity
    this.maxDepth = maxDepth
    this.annotationToNode = new Map()

    this.root = {
      bounds,
      annotations: new Map(),
      children: null,
      divided: false,
    }
  }

  /**
   * Insert annotation with its bounding box
   */
  insert(id: string, bounds: AABB): void {
    this._insert(this.root, id, bounds, 0)
  }

  private _insert(node: QuadtreeNode, id: string, bounds: AABB, depth: number): boolean {
    // Check if bounds intersects with node
    if (!this.intersects(node.bounds, bounds)) {
      return false
    }

    // If node has capacity and not at max depth, add here
    if (node.annotations.size < this.capacity && !node.divided) {
      node.annotations.set(id, bounds)
      this.annotationToNode.set(id, node)
      return true
    }

    // Subdivide if needed
    if (!node.divided && depth < this.maxDepth) {
      this.subdivide(node)
    }

    // If subdivided, try to insert into children
    if (node.divided && node.children) {
      for (const child of node.children) {
        if (this._insert(child, id, bounds, depth + 1)) {
          return true
        }
      }
    }

    // Fallback: add to this node even if over capacity (max depth reached)
    node.annotations.set(id, bounds)
    this.annotationToNode.set(id, node)
    return true
  }

  /**
   * Remove annotation by ID
   */
  remove(id: string): void {
    const node = this.annotationToNode.get(id)
    if (node) {
      node.annotations.delete(id)
      this.annotationToNode.delete(id)
    }
  }

  /**
   * Update annotation position (remove + insert)
   */
  update(id: string, newBounds: AABB): void {
    this.remove(id)
    this.insert(id, newBounds)
  }

  /**
   * Query all annotation IDs within viewport bounds
   * This is the key performance optimization!
   */
  query(viewport: AABB): string[] {
    const results: string[] = []
    this._query(this.root, viewport, results)
    return results
  }

  private _query(node: QuadtreeNode, viewport: AABB, results: string[]): void {
    // Check if viewport intersects with node bounds
    if (!this.intersects(node.bounds, viewport)) {
      return
    }

    // Add all annotations in this node that intersect viewport
    for (const [id, bounds] of node.annotations) {
      if (this.intersects(bounds, viewport)) {
        results.push(id)
      }
    }

    // Recursively query children
    if (node.divided && node.children) {
      for (const child of node.children) {
        this._query(child, viewport, results)
      }
    }
  }

  /**
   * Clear all annotations
   */
  clear(): void {
    this.root.annotations.clear()
    this.root.children = null
    this.root.divided = false
    this.annotationToNode.clear()
  }

  /**
   * Subdivide node into 4 quadrants
   */
  private subdivide(node: QuadtreeNode): void {
    const { x, y, width, height } = node.bounds
    const halfWidth = width / 2
    const halfHeight = height / 2

    const nw: QuadtreeNode = {
      bounds: { x, y, width: halfWidth, height: halfHeight },
      annotations: new Map(),
      children: null,
      divided: false,
    }

    const ne: QuadtreeNode = {
      bounds: { x: x + halfWidth, y, width: halfWidth, height: halfHeight },
      annotations: new Map(),
      children: null,
      divided: false,
    }

    const sw: QuadtreeNode = {
      bounds: { x, y: y + halfHeight, width: halfWidth, height: halfHeight },
      annotations: new Map(),
      children: null,
      divided: false,
    }

    const se: QuadtreeNode = {
      bounds: { x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight },
      annotations: new Map(),
      children: null,
      divided: false,
    }

    node.children = [nw, ne, sw, se]
    node.divided = true
  }

  /**
   * Check if two AABBs intersect
   */
  private intersects(a: AABB, b: AABB): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    )
  }

  /**
   * Get statistics for debugging
   */
  getStats(): {
    totalAnnotations: number
    treeDepth: number
    nodeCount: number
  } {
    const totalAnnotations = this.annotationToNode.size
    const { depth, nodeCount } = this._getDepthStats(this.root, 0)

    return {
      totalAnnotations,
      treeDepth: depth,
      nodeCount,
    }
  }

  private _getDepthStats(node: QuadtreeNode, currentDepth: number): { depth: number; nodeCount: number } {
    let maxDepth = currentDepth
    let nodeCount = 1

    if (node.divided && node.children) {
      for (const child of node.children) {
        const stats = this._getDepthStats(child, currentDepth + 1)
        maxDepth = Math.max(maxDepth, stats.depth)
        nodeCount += stats.nodeCount
      }
    }

    return { depth: maxDepth, nodeCount }
  }
}

/**
 * Helper: Convert annotation to AABB bounds
 */
export function getAnnotationBounds(annotation: {
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  points?: { x: number; y: number }[]
}): AABB {
  if (annotation.type === 'rectangle' && annotation.x !== undefined && annotation.y !== undefined) {
    return {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width || 0,
      height: annotation.height || 0,
    }
  } else if (annotation.type === 'polygon' && annotation.points) {
    // Calculate bounding box from polygon points
    const xs = annotation.points.map(p => p.x)
    const ys = annotation.points.map(p => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  // Fallback: zero-size AABB
  return { x: 0, y: 0, width: 0, height: 0 }
}
