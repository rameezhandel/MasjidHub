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
  const tone = data.isRoot
    ? 'border-emerald-500 bg-emerald-50'
    : data.gender === 'MALE'
      ? 'border-sky-300 bg-sky-50'
      : data.gender === 'FEMALE'
        ? 'border-pink-300 bg-pink-50'
        : 'border-slate-300 bg-white';
  return (
    <div
      className={`rounded-xl border px-3 py-2 shadow-sm ${tone}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <p className="truncate text-sm font-semibold text-slate-800">{data.name}</p>
      <p className="truncate text-xs text-slate-500">
        {data.relationship || data.householdName}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
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

const labelBg = { fill: '#ffffff', fillOpacity: 0.9 };

function toEdges(tree: FamilyTree): Edge[] {
  return tree.edges.map((edge) =>
    edge.type === 'PARENT'
      ? {
          id: edge.id,
          source: edge.fromMemberId,
          target: edge.toMemberId,
          type: 'smoothstep',
          label: 'parent',
          labelStyle: { fill: '#475569', fontSize: 10 },
          labelBgStyle: labelBg,
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#64748b' },
        }
      : {
          id: edge.id,
          source: edge.fromMemberId,
          target: edge.toMemberId,
          type: 'straight',
          label: 'spouse',
          labelStyle: { fill: '#db2777', fontSize: 10 },
          labelBgStyle: labelBg,
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          animated: false,
          style: { stroke: '#db2777', strokeDasharray: '5 4' },
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
            if (d.isRoot) return '#10b981';
            if (d.gender === 'MALE') return '#7dd3fc';
            if (d.gender === 'FEMALE') return '#f9a8d4';
            return '#cbd5e1';
          }}
        />
      </ReactFlow>
    </div>
  );
}
