import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '../../lib/supabase';
import { DEFAULT_DATA, nodeTypes } from '../../flow/nodes';
import { layoutFlow, type LayoutDirection } from '../../flow/layout';
import Inspector from '../../flow/Inspector';
import type { Flow } from '../../types/database';
import type { FlowEdge, FlowNode, FlowNodeType } from '../../types/flow';

const PALETTE: { type: FlowNodeType; label: string }[] = [
  { type: 'message', label: '💬 Mensagem' },
  { type: 'media', label: '🖼️ Multimédia' },
  { type: 'delay', label: '⏱️ Esperar' },
  { type: 'wait_input', label: '⏳ Aguardar resposta' },
  { type: 'choice', label: '🔀 Escolha' },
  { type: 'end', label: '🏁 Fim' },
];

function Builder() {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [layoutDir, setLayoutDir] = useState<LayoutDirection>('TB');
  const [palettePos, setPalettePos] = useState({ x: 14, y: 14 });

  // Drag the palette container around the canvas via its header.
  function startPaletteDrag(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...palettePos };
    const move = (ev: PointerEvent) => {
      setPalettePos({
        x: Math.max(0, origin.x + (ev.clientX - startX)),
        y: Math.max(0, origin.y + (ev.clientY - startY)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function autoLayout(direction: LayoutDirection) {
    setLayoutDir(direction);
    setNodes((ns) => layoutFlow(ns, edges, direction));
    dirty.current = true;
    // re-center the view after the new positions settle
    requestAnimationFrame(() => fitView({ duration: 300 }));
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('flows')
        .select('*')
        .eq('id', flowId)
        .single();
      if (error || !data) {
        alert('Fluxo não encontrado');
        navigate('/admin');
        return;
      }
      const f = data as Flow;
      setFlow(f);
      setNodes((f.definition?.nodes ?? []) as FlowNode[]);
      setEdges((f.definition?.edges ?? []) as FlowEdge[]);
    })();
  }, [flowId, navigate]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns) as FlowNode[]);
    dirty.current = true;
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es) as FlowEdge[]);
    dirty.current = true;
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    setEdges((es) => addEdge(conn, es) as FlowEdge[]);
    dirty.current = true;
  }, []);

  function addNode(type: FlowNodeType, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    const node = {
      id,
      type,
      position:
        position ?? {
          x: 360 + Math.random() * 120,
          y: 120 + Math.random() * 200,
        },
      data: structuredClone(DEFAULT_DATA[type]),
    } as FlowNode;
    setNodes((ns) => [...ns, node]);
    setSelectedId(id);
    dirty.current = true;
  }

  // Drag-and-drop from the palette onto the canvas.
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(
        'application/reactflow',
      ) as FlowNodeType;
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, position);
    },
    // addNode is stable enough for this use; screenToFlowPosition is stable.
    [screenToFlowPosition],
  );

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? ({ ...n, data } as FlowNode) : n)),
    );
    dirty.current = true;
  }

  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    dirty.current = true;
  }

  // Pressing Delete/Backspace removes the selected nodes/edges, but never the
  // Start node (it's the flow entry point). Returning the filtered set lets
  // React Flow delete everything else, including connected edges.
  const onBeforeDelete = useCallback(
    async ({
      nodes: toDelete,
      edges: edgesToDelete,
    }: {
      nodes: FlowNode[];
      edges: FlowEdge[];
    }) => {
      const nodes = toDelete.filter((n) => n.type !== 'start');
      if (nodes.length === 0 && edgesToDelete.length === 0) return false;
      return { nodes, edges: edgesToDelete };
    },
    [],
  );

  const onNodesDelete = useCallback((deleted: FlowNode[]) => {
    setSelectedId((prev) =>
      prev && deleted.some((d) => d.id === prev) ? null : prev,
    );
    dirty.current = true;
  }, []);

  const save = useCallback(async () => {
    if (!flow) return;
    setSaving(true);
    const { error } = await supabase
      .from('flows')
      .update({
        name: flow.name,
        definition: { nodes, edges },
        updated_at: new Date().toISOString(),
      })
      .eq('id', flow.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    dirty.current = false;
    setSavedAt(new Date().toLocaleTimeString());
  }, [flow, nodes, edges]);

  // Autosave every 4s if there are unsaved changes.
  useEffect(() => {
    const t = setInterval(() => {
      if (dirty.current) save();
    }, 4000);
    return () => clearInterval(t);
  }, [save]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  if (!flow) return <div className="center muted">A carregar fluxo…</div>;

  return (
    <div className="builder">
      <div className="toolbar">
        <div className="row">
          <button className="ghost" onClick={() => navigate('/admin')}>
            ← Fluxos
          </button>
          <input
            className="flow-name-input"
            value={flow.name}
            onChange={(e) => {
              setFlow({ ...flow, name: e.target.value });
              dirty.current = true;
            }}
            placeholder="Nome do fluxo"
            title="Clique para editar o nome"
          />
          <span className={`badge ${flow.published ? 'live' : ''}`}>
            {flow.published ? 'publicado' : 'rascunho'}
          </span>
        </div>
        <div className="row">
          <button
            className="ghost"
            onClick={() => autoLayout(layoutDir)}
            title="Alinhar os nós de forma compacta"
          >
            ✨ Organizar
          </button>
          <button
            className="ghost"
            onClick={() => autoLayout(layoutDir === 'TB' ? 'LR' : 'TB')}
            title="Alternar orientação vertical/horizontal"
          >
            {layoutDir === 'TB' ? '↕ Vertical' : '↔ Horizontal'}
          </button>
          {savedAt && (
            <span className="muted" style={{ fontSize: 12 }}>
              guardado {savedAt}
            </span>
          )}
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="builder-canvas">
        <div className="palette" style={{ left: palettePos.x, top: palettePos.y }}>
          <div className="palette-head" onPointerDown={startPaletteDrag}>
            ⠿ Blocos
          </div>
          <small>
            Arraste um bloco para a tela (ou clique para adicionar). Ligue os
            nós pelos conetores.
          </small>
          {PALETTE.map((p) => (
            <button
              key={p.type}
              className="palette-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', p.type);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => addNode(p.type)}
            >
              + {p.label}
            </button>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={(instance) => {
            instance.fitView();
            // Start ~2 zoom-out clicks further out than fit (1.2 per click).
            instance.zoomTo(instance.getZoom() / 1.44, { duration: 0 });
          }}
          deleteKeyCode={['Delete', 'Backspace']}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {selectedNode && (
          <Inspector
            node={selectedNode}
            onChange={updateNodeData}
            onDelete={deleteNode}
          />
        )}
      </div>
    </div>
  );
}

export default function FlowBuilder() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}
