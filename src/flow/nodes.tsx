import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  ChoiceNodeData,
  DelayNodeData,
  MediaNodeData,
  MessageNodeData,
  StartNodeData,
  WaitInputNodeData,
} from '../types/flow';

// Renderizadores personalizados dos nós do React Flow. Cada um mostra uma
// pré-visualização compacta dos dados que o operador introduziu no inspetor.

function StartNode({ selected }: NodeProps) {
  return (
    <div className={`fnode start ${selected ? 'selected' : ''}`}>
      <div className="fnode-head">Início</div>
      <div className="fnode-body muted">Ponto de entrada do fluxo</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function MessageNode({ data, selected }: NodeProps) {
  const d = data as MessageNodeData;
  return (
    <div className={`fnode message ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">Mensagem</div>
      <div className="fnode-body">
        {d.mediaUrl && (
          <div className="muted" style={{ fontSize: 11 }}>
            📎 {d.mediaType === 'video' ? 'vídeo' : 'imagem'}
          </div>
        )}
        {d.text || <span className="muted">vazio</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function MediaNode({ data, selected }: NodeProps) {
  const d = data as MediaNodeData;
  return (
    <div className={`fnode media ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">
        {d.mediaType === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}
      </div>
      <div className="fnode-body">
        {d.mediaUrl ? (
          d.mediaType === 'video' ? (
            <video src={d.mediaUrl} className="fnode-thumb" muted />
          ) : (
            <img src={d.mediaUrl} alt="" className="fnode-thumb" />
          )
        ) : (
          <span className="muted">sem ficheiro</span>
        )}
        {d.caption && <div style={{ marginTop: 4 }}>{d.caption}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function DelayNode({ data, selected }: NodeProps) {
  const d = data as DelayNodeData;
  return (
    <div className={`fnode delay ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">⏱️ Esperar</div>
      <div className="fnode-body">
        {d.seconds ? `${d.seconds} segundo(s)` : <span className="muted">0 s</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function WaitInputNode({ data, selected }: NodeProps) {
  const d = data as WaitInputNodeData;
  return (
    <div className={`fnode waitinput ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">
        ⏳ Aguardar resposta{d.variable ? ` → ${d.variable}` : ''}
      </div>
      <div className="fnode-body">
        {d.text || (
          <span className="muted">Retoma quando o utilizador responder</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ChoiceNode({ data, selected }: NodeProps) {
  const d = data as ChoiceNodeData;
  const options = d.options ?? [];
  return (
    <div className={`fnode choice ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">Escolha</div>
      <div className="fnode-body">
        {d.text || <span className="muted">vazio</span>}
      </div>
      {options.map((opt, i) => (
        <div className="opt" key={opt.id}>
          {opt.label || `Opção ${i + 1}`}
          {/* um conetor de saída por opção, id = id da opção */}
          <Handle
            type="source"
            position={Position.Right}
            id={opt.id}
            style={{ top: 'auto', bottom: 10 }}
          />
        </div>
      ))}
    </div>
  );
}

function EndNode({ selected }: NodeProps) {
  return (
    <div className={`fnode end ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="fnode-head">Fim</div>
      <div className="fnode-body muted">A conversa termina</div>
    </div>
  );
}

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  media: MediaNode,
  delay: DelayNode,
  wait_input: WaitInputNode,
  choice: ChoiceNode,
  end: EndNode,
};

export const DEFAULT_DATA: Record<string, unknown> = {
  start: { label: 'Início' } as StartNodeData,
  message: { text: 'Nova mensagem' } as MessageNodeData,
  media: { caption: '' } as MediaNodeData,
  delay: { seconds: 3 } as DelayNodeData,
  wait_input: { text: '', variable: '' } as WaitInputNodeData,
  choice: {
    text: 'Escolha uma opção:',
    options: [
      { id: crypto.randomUUID(), label: 'Sim' },
      { id: crypto.randomUUID(), label: 'Não' },
    ],
  } as ChoiceNodeData,
  end: {},
};
