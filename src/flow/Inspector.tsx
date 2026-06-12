import { useRef, useState } from 'react';
import { uploadMedia, mediaKind } from '../lib/media';
import type { FlowNode, ChoiceNodeData } from '../types/flow';

interface Props {
  node: FlowNode;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  start: 'Início',
  message: 'Mensagem',
  media: 'Multimédia',
  delay: 'Esperar',
  wait_input: 'Aguardar resposta',
  choice: 'Escolha',
  end: 'Fim',
};

export default function Inspector({ node, onChange, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const data = node.data as Record<string, unknown>;

  const set = (patch: Record<string, unknown>) =>
    onChange(node.id, { ...data, ...patch });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMedia(file);
      const kind = mediaKind(file);
      set({ mediaUrl: url, mediaType: kind === 'video' ? 'video' : 'image' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha no carregamento');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function MediaPicker({ remove }: { remove?: boolean }) {
    return (
      <>
        {data.mediaUrl ? (
          <div className="col">
            {data.mediaType === 'video' ? (
              <video src={data.mediaUrl as string} controls width="100%" />
            ) : (
              <img
                src={data.mediaUrl as string}
                alt=""
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            )}
            {remove !== false && (
              <button
                className="ghost"
                onClick={() => set({ mediaUrl: undefined, mediaType: undefined })}
              >
                Remover ficheiro
              </button>
            )}
          </div>
        ) : (
          <button
            className="ghost"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'A carregar…' : 'Carregar imagem ou vídeo'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={onPickFile}
        />
      </>
    );
  }

  return (
    <div className="inspector card col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{TYPE_LABELS[node.type ?? ''] ?? node.type}</strong>
        {node.type !== 'start' && (
          <button className="danger" onClick={() => onDelete(node.id)}>
            Eliminar
          </button>
        )}
      </div>

      {node.type === 'message' && (
        <>
          <div>
            <label>Texto da mensagem</label>
            <textarea
              rows={4}
              value={(data.text as string) ?? ''}
              onChange={(e) => set({ text: e.target.value })}
            />
            <p className="muted" style={{ fontSize: 11 }}>
              Os links (https://…) ficam clicáveis no chat.
            </p>
          </div>
          <div>
            <label>Multimédia (imagem ou vídeo)</label>
            <MediaPicker />
          </div>
          <div>
            <label>Atraso antes de enviar (ms)</label>
            <input
              type="number"
              value={(data.delayMs as number) ?? 0}
              onChange={(e) => set({ delayMs: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      {node.type === 'media' && (
        <>
          <div>
            <label>Ficheiro (imagem ou vídeo)</label>
            <MediaPicker />
          </div>
          <div>
            <label>Legenda (opcional)</label>
            <textarea
              rows={2}
              value={(data.caption as string) ?? ''}
              onChange={(e) => set({ caption: e.target.value })}
            />
          </div>
          <div>
            <label>Atraso antes de enviar (ms)</label>
            <input
              type="number"
              value={(data.delayMs as number) ?? 0}
              onChange={(e) => set({ delayMs: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      {node.type === 'delay' && (
        <div>
          <label>Esperar (segundos)</label>
          <input
            type="number"
            min={0}
            value={(data.seconds as number) ?? 0}
            onChange={(e) => set({ seconds: Number(e.target.value) })}
          />
          <p className="muted" style={{ fontSize: 11 }}>
            O fluxo faz uma pausa antes de continuar. A espera decorre enquanto a
            página do utilizador estiver aberta.
          </p>
        </div>
      )}

      {node.type === 'wait_input' && (
        <>
          <div>
            <label>Mensagem enquanto aguarda (opcional)</label>
            <textarea
              rows={3}
              value={(data.text as string) ?? ''}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="ex.: Responda quando estiver pronto…"
            />
          </div>
          <div>
            <label>Guardar resposta na variável (opcional)</label>
            <input
              value={(data.variable as string) ?? ''}
              onChange={(e) => set({ variable: e.target.value })}
              placeholder="ex.: nome"
            />
          </div>
          <p className="muted" style={{ fontSize: 11 }}>
            O fluxo retoma assim que o utilizador enviar qualquer mensagem (texto
            ou multimédia). Se indicar uma variável, a resposta é guardada nela.
          </p>
        </>
      )}

      {node.type === 'choice' && (
        <ChoiceEditor data={data as ChoiceNodeData} set={set} />
      )}

      {node.type === 'end' && (
        <p className="muted" style={{ fontSize: 12 }}>
          Marca o fim da conversa. Não envia qualquer mensagem.
        </p>
      )}
    </div>
  );
}

function ChoiceEditor({
  data,
  set,
}: {
  data: ChoiceNodeData;
  set: (patch: Record<string, unknown>) => void;
}) {
  const options = data.options ?? [];
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (id: string, label: string) =>
    set({ options: options.map((o) => (o.id === id ? { ...o, label } : o)) });
  const add = () =>
    set({ options: [...options, { id: crypto.randomUUID(), label: '' }] });
  const remove = (id: string) =>
    set({ options: options.filter((o) => o.id !== id) });

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...options];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ options: next });
  }

  return (
    <>
      <div>
        <label>Texto</label>
        <textarea
          rows={2}
          value={data.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <div>
        <label>Opções (cada uma é um ramo)</label>
        <div className="col">
          {options.map((o, i) => (
            <div
              className={`row opt-row ${overIndex === i ? 'drag-over' : ''}`}
              key={o.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={() => {
                if (dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <span
                className="drag-handle"
                title="Arraste para reordenar"
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                ⠿
              </span>
              <input
                value={o.label}
                onChange={(e) => update(o.id, e.target.value)}
                placeholder="Texto da opção"
              />
              <button className="ghost" onClick={() => remove(o.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="ghost" onClick={add} style={{ marginTop: 8 }}>
          + Adicionar opção
        </button>
        <p className="muted" style={{ fontSize: 11 }}>
          Arraste pelo ⠿ para reordenar. Arraste do conetor direito de cada
          opção para o nó seguinte.
        </p>
      </div>
    </>
  );
}
