import type { DependencyGraph } from "./dependencyGraph";
import { buildDependencyGraph, detectCircularDependency, topologicalSort } from "./dependencyGraph";
import type { DestinationMap } from "./types";

describe("dependencyGraph", () => {
  describe("buildDependencyGraph", () => {
    it("creates empty graph when no destinations", () => {
      const destinationMap = createDestinationMap([]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph).toEqual({
        dependencies: new Map(),
        destinations: new Set(),
      });
    });

    it("creates graph with no dependencies for single destination", () => {
      const destinationMap = createDestinationMap([["B", ["A"]]]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph).toEqual({
        dependencies: new Map([["B", new Set()]]),
        destinations: new Set(["B"]),
      });
    });

    it("creates simple chain A -> B -> C", () => {
      // A embeds into B, B embeds into C
      const destinationMap = createDestinationMap([
        ["B", ["A"]],
        ["C", ["B"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph).toEqual({
        dependencies: new Map([
          ["B", new Set()], // B has no dependencies (A is not a destination)
          ["C", new Set(["B"])], // C depends on B
        ]),
        destinations: new Set(["B", "C"]),
      });
    });

    it("creates chain where all files are both source and destination", () => {
      // A embeds into B, B embeds into C, C embeds into D
      // All are both sources and destinations
      const destinationMap = createDestinationMap([
        ["A", ["X"]], // A receives from X (not in this test)
        ["B", ["A"]],
        ["C", ["B"]],
        ["D", ["C"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph.dependencies).toEqual(
        new Map([
          ["A", new Set()], // A has no dependencies in the destination set
          ["B", new Set(["A"])], // B depends on A
          ["C", new Set(["B"])], // C depends on B
          ["D", new Set(["C"])], // D depends on C
        ]),
      );
    });

    it("creates diamond dependency: A -> B, A -> C, B -> D, C -> D", () => {
      const destinationMap = createDestinationMap([
        ["A", ["X"]],
        ["B", ["A"]],
        ["C", ["A"]],
        ["D", ["B", "C"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph.dependencies).toEqual(
        new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["B", "C"])],
        ]),
      );
    });

    it("handles multiple independent chains", () => {
      // Chain 1: A -> B -> C
      // Chain 2: X -> Y
      const destinationMap = createDestinationMap([
        ["A", ["Z"]],
        ["B", ["A"]],
        ["C", ["B"]],
        ["X", ["Z"]],
        ["Y", ["X"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph.dependencies).toEqual(
        new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
          ["X", new Set()],
          ["Y", new Set(["X"])],
        ]),
      );
    });

    it("handles fan-out: one source to multiple destinations", () => {
      // A -> B, A -> C, A -> D
      const destinationMap = createDestinationMap([
        ["A", ["X"]],
        ["B", ["A"]],
        ["C", ["A"]],
        ["D", ["A"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph.dependencies).toEqual(
        new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["A"])],
        ]),
      );
    });

    it("handles fan-in: multiple sources to one destination", () => {
      // A -> D, B -> D, C -> D
      const destinationMap = createDestinationMap([
        ["A", ["X"]],
        ["B", ["Y"]],
        ["C", ["Z"]],
        ["D", ["A", "B", "C"]],
      ]);

      const graph = buildDependencyGraph({ destinationMap });

      expect(graph.dependencies).toEqual(
        new Map([
          ["A", new Set()],
          ["B", new Set()],
          ["C", new Set()],
          ["D", new Set(["A", "B", "C"])],
        ]),
      );
    });
  });

  describe("detectCircularDependency", () => {
    it("returns undefined for empty graph", () => {
      const graph: DependencyGraph = {
        dependencies: new Map(),
        destinations: new Set(),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeUndefined();
    });

    it("returns undefined for graph with no dependencies", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set()],
        ]),
        destinations: new Set(["A", "B"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeUndefined();
    });

    it("returns undefined for simple chain without cycles", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
        ]),
        destinations: new Set(["A", "B", "C"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeUndefined();
    });

    it("detects self-reference: A -> A", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([["A", new Set(["A"])]]),
        destinations: new Set(["A"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toEqual({ cycle: ["A", "A"] });
    });

    it("detects 2-node cycle: A -> B -> A", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set(["B"])],
          ["B", new Set(["A"])],
        ]),
        destinations: new Set(["A", "B"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeDefined();
      expect(result!.cycle).toHaveLength(3);
      // Cycle could be [A, B, A] or [B, A, B] depending on traversal order
      expect([
        ["A", "B", "A"],
        ["B", "A", "B"],
      ]).toContainEqual(result!.cycle);
    });

    it("detects 3-node cycle: A -> B -> C -> A", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set(["C"])],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
        ]),
        destinations: new Set(["A", "B", "C"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeDefined();
      expect(result!.cycle).toHaveLength(4);
      // Could start from any node in the cycle
      const first = result!.cycle[0];
      expect(result!.cycle.at(-1)).toBe(first);
    });

    it("detects cycle in larger graph with non-cyclic parts", () => {
      // D -> E -> F (no cycle)
      // A -> B -> C -> A (cycle)
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set(["C"])],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
          ["D", new Set()],
          ["E", new Set(["D"])],
          ["F", new Set(["E"])],
        ]),
        destinations: new Set(["A", "B", "C", "D", "E", "F"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeDefined();
      expect(result!.cycle.length).toBeGreaterThan(2);
    });

    it("returns undefined for diamond dependency (not a cycle)", () => {
      // A -> B, A -> C, B -> D, C -> D
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["B", "C"])],
        ]),
        destinations: new Set(["A", "B", "C", "D"]),
      };

      const result = detectCircularDependency(graph);

      expect(result).toBeUndefined();
    });
  });

  describe("topologicalSort", () => {
    it("returns empty array for empty graph", () => {
      const graph: DependencyGraph = {
        dependencies: new Map(),
        destinations: new Set(),
      };

      const result = topologicalSort(graph);

      expect(result).toEqual([]);
    });

    it("returns single node for graph with one destination", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([["A", new Set()]]),
        destinations: new Set(["A"]),
      };

      const result = topologicalSort(graph);

      expect(result).toEqual(["A"]);
    });

    it("sorts simple chain A -> B -> C", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
        ]),
        destinations: new Set(["A", "B", "C"]),
      };

      const result = topologicalSort(graph);

      expect(result).toEqual(["A", "B", "C"]);
    });

    it("sorts 5-level chain correctly", () => {
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["B"])],
          ["D", new Set(["C"])],
          ["E", new Set(["D"])],
        ]),
        destinations: new Set(["A", "B", "C", "D", "E"]),
      };

      const result = topologicalSort(graph);

      expect(result).toEqual(["A", "B", "C", "D", "E"]);
    });

    it("sorts diamond dependency correctly", () => {
      // A -> B, A -> C, B -> D, C -> D
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["B", "C"])],
        ]),
        destinations: new Set(["A", "B", "C", "D"]),
      };

      const result = topologicalSort(graph);

      // A must come first, D must come last
      // B and C can be in any order as long as both come after A and before D
      expect(result[0]).toBe("A");
      expect(result[3]).toBe("D");
      expect(result.slice(1, 3)).toContain("B");
      expect(result.slice(1, 3)).toContain("C");
    });

    it("sorts multiple independent chains", () => {
      // Chain 1: A -> B
      // Chain 2: X -> Y
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["X", new Set()],
          ["Y", new Set(["X"])],
        ]),
        destinations: new Set(["A", "B", "X", "Y"]),
      };

      const result = topologicalSort(graph);

      // Within each chain, order must be preserved
      const aIndex = result.indexOf("A");
      const bIndex = result.indexOf("B");
      const xIndex = result.indexOf("X");
      const yIndex = result.indexOf("Y");

      expect(aIndex).toBeLessThan(bIndex);
      expect(xIndex).toBeLessThan(yIndex);
    });

    it("sorts fan-out correctly", () => {
      // A -> B, A -> C, A -> D
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["A"])],
        ]),
        destinations: new Set(["A", "B", "C", "D"]),
      };

      const result = topologicalSort(graph);

      // A must be first, others can be in any order
      expect(result[0]).toBe("A");
      expect(result.slice(1)).toContain("B");
      expect(result.slice(1)).toContain("C");
      expect(result.slice(1)).toContain("D");
    });

    it("sorts fan-in correctly", () => {
      // A -> D, B -> D, C -> D
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set()],
          ["C", new Set()],
          ["D", new Set(["A", "B", "C"])],
        ]),
        destinations: new Set(["A", "B", "C", "D"]),
      };

      const result = topologicalSort(graph);

      // D must be last, others can be in any order
      expect(result[3]).toBe("D");
      expect(result.slice(0, 3)).toContain("A");
      expect(result.slice(0, 3)).toContain("B");
      expect(result.slice(0, 3)).toContain("C");
    });

    it("sorts complex graph with mixed patterns", () => {
      // A -> B -> D
      // A -> C -> D
      // E (independent)
      const graph: DependencyGraph = {
        dependencies: new Map([
          ["A", new Set()],
          ["B", new Set(["A"])],
          ["C", new Set(["A"])],
          ["D", new Set(["B", "C"])],
          ["E", new Set()],
        ]),
        destinations: new Set(["A", "B", "C", "D", "E"]),
      };

      const result = topologicalSort(graph);

      const aIndex = result.indexOf("A");
      const bIndex = result.indexOf("B");
      const cIndex = result.indexOf("C");
      const dIndex = result.indexOf("D");

      // A comes before B and C
      expect(aIndex).toBeLessThan(bIndex);
      expect(aIndex).toBeLessThan(cIndex);

      // B and C come before D
      expect(bIndex).toBeLessThan(dIndex);
      expect(cIndex).toBeLessThan(dIndex);

      // E can be anywhere
      expect(result).toContain("E");
    });
  });
});

function createDestinationMap(
  entries: Array<[destination: string, sources: string[]]>,
): DestinationMap {
  return new Map(
    entries.map(([destination, sources]) => [
      destination,
      { content: `content of ${destination}`, sources: new Set(sources) },
    ]),
  );
}
