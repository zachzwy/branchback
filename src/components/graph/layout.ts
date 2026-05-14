import dagre from "dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

// Tuned to roughly match the mock's left-to-right card density.
const NODE_WIDTH = 232;
const NODE_HEIGHT = 78;

export function layoutDagre(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 28,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const positionedNodes: Node[] = nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  return { nodes: positionedNodes, edges };
}

export const GRAPH_NODE_DIMENSIONS = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
};
