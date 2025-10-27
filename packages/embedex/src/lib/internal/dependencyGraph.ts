import type { DestinationPath } from "../types";
import type { DestinationMap } from "./types";

export interface DependencyGraph {
  // Map of destination path to set of destinations it depends on (must be processed before it)
  dependencies: Map<DestinationPath, Set<DestinationPath>>;
  // All destination paths
  destinations: Set<DestinationPath>;
}

interface CircularDependencyError {
  // Array of file paths forming the cycle (e.g., ["A", "B", "C", "A"])
  cycle: DestinationPath[];
}

/**
 * Builds a dependency graph from source and destination maps.
 *
 * A destination B depends on destination A if:
 * - B references A as a source in an embedex tag
 * - A is also a destination (i.e., gets content embedded from other sources)
 *
 * @example
 * // If A.ts embeds into B.md, and B.md embeds into C.md:
 * // - B depends on A (must process A before B)
 * // - C depends on B (must process B before C)
 */
export function buildDependencyGraph(
  params: Readonly<{
    destinationMap: Readonly<DestinationMap>;
  }>,
): DependencyGraph {
  const { destinationMap } = params;

  const destinations = new Set<DestinationPath>(destinationMap.keys());
  const dependencies = new Map<DestinationPath, Set<DestinationPath>>();

  // Initialize empty dependency sets for all destinations
  for (const destination of destinations) {
    dependencies.set(destination, new Set());
  }

  // Build dependencies: for each destination, find which other destinations it depends on
  for (const [destinationPath, { sources }] of destinationMap.entries()) {
    for (const sourcePath of sources) {
      // If this source is also a destination, then destinationPath depends on it
      if (destinations.has(sourcePath)) {
        dependencies.get(destinationPath)!.add(sourcePath);
      }
    }
  }

  return { dependencies, destinations };
}

/**
 * Detects if there's a circular dependency in the graph.
 *
 * Uses depth-first search with cycle detection.
 *
 * @returns CircularDependencyError if a cycle exists, undefined otherwise
 */
export function detectCircularDependency(
  graph: Readonly<DependencyGraph>,
): CircularDependencyError | undefined {
  const { dependencies, destinations } = graph;

  // Track visited state: 0 = unvisited, 1 = visiting (in current path), 2 = visited (fully processed)
  const visited = new Map<DestinationPath, 0 | 1 | 2>();
  for (const destination of destinations) {
    visited.set(destination, 0);
  }

  const path: DestinationPath[] = [];
  let cycleNode: DestinationPath | undefined;

  function hasCycle(node: DestinationPath): boolean {
    const state = visited.get(node);

    if (state === 1) {
      // Found a cycle - node is in current path
      cycleNode = node;
      return true;
    }

    if (state === 2) {
      // Already fully processed this node
      return false;
    }

    // Mark as visiting
    visited.set(node, 1);
    path.push(node);

    // Check all dependencies
    const deps = dependencies.get(node);
    /* istanbul ignore next */
    if (deps) {
      for (const dependency of deps) {
        if (hasCycle(dependency)) {
          return true;
        }
      }
    }

    // Mark as fully visited
    visited.set(node, 2);
    path.pop();

    return false;
  }

  // Check each node (to handle disconnected components)
  for (const destination of destinations) {
    if (visited.get(destination) === 0 && hasCycle(destination)) {
      // Extract the cycle from the path
      // cycleNode is the node that was already being visited when we encountered it again
      /* istanbul ignore next */
      if (!cycleNode) {
        return { cycle: [] };
      }

      // Find where this node first appeared in the path
      const cycleStart = path.indexOf(cycleNode);
      // The cycle is from cycleStart to the end, plus the cycleNode again to show the loop
      const cycle = [...path.slice(cycleStart), cycleNode];
      return { cycle };
    }
  }

  return undefined;
}

/**
 * Performs topological sort on the dependency graph using Kahn's algorithm.
 *
 * Returns destinations in an order such that if A depends on B, B appears before A.
 *
 * @throws Error if the graph has a cycle (should check with detectCircularDependency first)
 */
export function topologicalSort(graph: Readonly<DependencyGraph>): DestinationPath[] {
  const { dependencies, destinations } = graph;

  // Calculate in-degree (number of dependencies) for each node
  const inDegree = new Map<DestinationPath, number>();
  for (const destination of destinations) {
    inDegree.set(destination, dependencies.get(destination)!.size);
  }

  // Build reverse adjacency map: for each node, track which nodes depend on it
  // This allows O(out-degree) updates instead of O(E) per dequeue
  const dependents = new Map<DestinationPath, Set<DestinationPath>>();
  for (const destination of destinations) {
    dependents.set(destination, new Set());
  }

  for (const [destination, deps] of dependencies.entries()) {
    for (const dependency of deps) {
      dependents.get(dependency)!.add(destination);
    }
  }

  // Queue of nodes with no dependencies
  const queue: DestinationPath[] = [];
  for (const [destination, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(destination);
    }
  }

  const result: DestinationPath[] = [];

  // Process nodes with no dependencies
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // For each node that depends on current, decrease its in-degree
    const nodeDependents = dependents.get(current);
    /* istanbul ignore next */
    if (nodeDependents) {
      for (const dependent of nodeDependents) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  // If we didn't process all nodes, there's a cycle
  /* istanbul ignore next */
  if (result.length !== destinations.size) {
    throw new Error("Graph has a cycle - should be detected before calling topologicalSort");
  }

  return result;
}
