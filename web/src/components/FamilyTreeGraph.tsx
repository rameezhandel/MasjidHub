'use client';

import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type { FamilyTree } from '@/lib/types';

const NODE_W = 190;
const NODE_H = 64;

interface PersonData extends Record<string, unknown> {
  name: string;
  relationship: string | null;
  householdName: string;
  gender: 'MALE' | 'FEMALE' | null;
  isRoot: boolean;
}

/** A single person card. Parent edges enter the top, leave the bottom. */
function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  const tone =
    data.gender === 'MALE'
      ? 'bg-[#DCE9F5] dark:bg-[#16324f]'
      : data.gender === 'FEMALE'
        ? 'bg-[#F6E1E7] dark:bg-[#42202e]'
        : 'bg-card';
  return (
    <div
      className={`box-border rounded-xl border px-3 py-2 shadow-sm ${tone} ${
        data.isRoot ? 'border-2 border-gold' : 'border-border'
      }`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <p className="truncate text-sm font-bold text-foreground">{data.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {data.relationship || data.householdName}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

function layout(tree: FamilyTree): Node<PersonData>[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 45, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of tree.nodes) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  // Only PARENT edges drive the vertical hierarchy; spouses stay on their rank.
  for (const edge of tree.edges) {
    if (edge.type === 'PARENT') g.setEdge(edge.fromMemberId, edge.toMemberId);
  }
  dagre.layout(g);

  return tree.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: 'person',
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: {
        name: `${node.firstName} ${node.lastName}`,
        relationship: node.relationship,
        householdName: node.householdName,
        gender: node.gender,
        isRoot: node.householdId === tree.rootHouseholdId,
      },
    };
  });
}

// Pill labels + theme-var strokes: parent = solid primary, spouse = dashed gold.
const labelBg = { fill: 'var(--card)', fillOpacity: 0.92 };

function toEdges(tree: FamilyTree): Edge[] {
  return tree.edges.map((edge) =>
    edge.type === 'PARENT'
      ? {
          id: edge.id,
          source: edge.fromMemberId,
          target: edge.toMemberId,
          type: 'smoothstep',
          label: 'parent',
          labelStyle: { fill: 'var(--muted-foreground)', fontSize: 10 },
          labelBgStyle: labelBg,
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 6,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: 'var(--primary)' },
        }
      : {
          id: edge.id,
          source: edge.fromMemberId,
          target: edge.toMemberId,
          type: 'straight',
          label: 'spouse',
          labelStyle: { fill: 'var(--gold)', fontSize: 10 },
          labelBgStyle: labelBg,
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 6,
          animated: false,
          style: { stroke: 'var(--gold)', strokeDasharray: '5 4' },
        },
  );
}

export function FamilyTreeGraph({ tree }: { tree: FamilyTree }) {
  const nodes = useMemo(() => layout(tree), [tree]);
  const edges = useMemo(() => toEdges(tree), [tree]);

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-xl border border-border bg-muted">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as PersonData;
            if (d.isRoot) return '#B98A2E';
            if (d.gender === 'MALE') return '#7ea8cd';
            if (d.gender === 'FEMALE') return '#d99aac';
            return '#9aa39a';
          }}
        />
      </ReactFlow>
    </div>
  );
}
