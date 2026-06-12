import dagre from '@dagrejs/dagre';
import type { FlowEdge, FlowNode } from '../types/flow';

export type LayoutDirection = 'TB' | 'LR';

// Rough fallback sizes when a node hasn't been measured yet.
function fallbackSize(node: FlowNode): { width: number; height: number } {
  if (node.type === 'choice') {
    const opts = (node.data as { options?: unknown[] }).options?.length ?? 0;
    return { width: 220, height: 90 + opts * 26 };
  }
  if (node.type === 'media') return { width: 200, height: 140 };
  return { width: 200, height: 80 };
}

// Compactly auto-arranges the graph with dagre and returns repositioned nodes.
// direction: 'TB' = top→bottom (vertical), 'LR' = left→right (horizontal).
export function layoutFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: LayoutDirection = 'TB',
): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });

  const sizes = new Map<string, { width: number; height: number }>();
  nodes.forEach((n) => {
    const measured = n.measured;
    const size =
      measured?.width && measured?.height
        ? { width: measured.width, height: measured.height }
        : fallbackSize(n);
    sizes.set(n.id, size);
    g.setNode(n.id, size);
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const size = sizes.get(n.id)!;
    // dagre gives center points; React Flow wants the top-left corner.
    return {
      ...n,
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    } as FlowNode;
  });
}
