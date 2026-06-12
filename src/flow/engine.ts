import { supabase } from '../lib/supabase';
import type { Conversation, Flow } from '../types/database';
import type {
  ChoiceNodeData,
  DelayNodeData,
  FlowDefinition,
  FlowNode,
  MediaNodeData,
  MessageNodeData,
  WaitInputNodeData,
} from '../types/flow';

// The runtime that drives a visitor through a flow. It runs client-side in
// the visitor's browser: it writes bot messages to the DB and advances
// `conversations.current_node_id`. Admin messages are inserted separately and
// never touch flow state, so an operator can chime in without interrupting.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findNode(def: FlowDefinition, id: string | null | undefined): FlowNode | undefined {
  if (!id) return undefined;
  return def.nodes.find((n) => n.id === id);
}

function startNode(def: FlowDefinition): FlowNode | undefined {
  return def.nodes.find((n) => n.type === 'start') ?? def.nodes[0];
}

// Next node following an edge out of `nodeId`. `handle` narrows to a specific
// source handle (used by choice options).
function nextNodeId(
  def: FlowDefinition,
  nodeId: string,
  handle?: string,
): string | undefined {
  const edge = def.edges.find(
    (e) => e.source === nodeId && (handle ? e.sourceHandle === handle : true),
  );
  return edge?.target;
}

async function emitBotMessage(
  conversationId: string,
  nodeId: string,
  opts: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' },
) {
  const hasMedia = !!opts.mediaUrl;
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender: 'bot',
    type: hasMedia ? opts.mediaType ?? 'image' : 'text',
    content: opts.text || null,
    media_url: hasMedia ? opts.mediaUrl : null,
    node_id: nodeId,
  });
}

async function setConversation(
  conversationId: string,
  patch: Partial<Conversation>,
) {
  await supabase.from('conversations').update(patch).eq('id', conversationId);
}

interface RunResult {
  // node we are now parked on, waiting for visitor input (question/choice),
  // or null if the flow finished.
  waitingNodeId: string | null;
  finished: boolean;
}

// Walk the flow from `fromNodeId` until we reach a node that needs visitor
// input, or the flow ends. Emits bot messages along the way.
async function walk(
  conversation: Conversation,
  def: FlowDefinition,
  fromNodeId: string | undefined,
): Promise<RunResult> {
  let currentId = fromNodeId;
  let variables = conversation.variables ?? {};
  let guard = 0;

  while (currentId && guard++ < 100) {
    const node = findNode(def, currentId);
    if (!node) break;

    if (node.type === 'start') {
      currentId = nextNodeId(def, node.id);
      continue;
    }

    if (node.type === 'message') {
      const d = node.data as MessageNodeData;
      if (d.delayMs) await sleep(Math.min(d.delayMs, 4000));
      await emitBotMessage(conversation.id, node.id, {
        text: d.text,
        mediaUrl: d.mediaUrl,
        mediaType: d.mediaType,
      });
      currentId = nextNodeId(def, node.id);
      continue;
    }

    if (node.type === 'media') {
      const d = node.data as MediaNodeData;
      if (d.delayMs) await sleep(Math.min(d.delayMs, 4000));
      await emitBotMessage(conversation.id, node.id, {
        text: d.caption,
        mediaUrl: d.mediaUrl,
        mediaType: d.mediaType,
      });
      currentId = nextNodeId(def, node.id);
      continue;
    }

    if (node.type === 'delay') {
      const d = node.data as DelayNodeData;
      const secs = Math.max(0, Number(d.seconds) || 0);
      if (secs > 0) await sleep(secs * 1000);
      currentId = nextNodeId(def, node.id);
      continue;
    }

    if (node.type === 'wait_input') {
      const d = node.data as WaitInputNodeData;
      if (d.text) await emitBotMessage(conversation.id, node.id, { text: d.text });
      await setConversation(conversation.id, {
        current_node_id: node.id,
        variables,
      });
      return { waitingNodeId: node.id, finished: false };
    }

    if (node.type === 'choice') {
      const d = node.data as ChoiceNodeData;
      // Render the prompt; options are shown by the chat UI as buttons.
      await emitBotMessage(conversation.id, node.id, { text: d.text });
      await setConversation(conversation.id, {
        current_node_id: node.id,
        variables,
      });
      return { waitingNodeId: node.id, finished: false };
    }

    if (node.type === 'end') {
      // End is a silent terminator (like Start) — no message.
      await setConversation(conversation.id, {
        current_node_id: node.id,
        status: 'completed',
        variables,
      });
      return { waitingNodeId: null, finished: true };
    }

    // Unknown node type: just try to move on.
    currentId = nextNodeId(def, (node as FlowNode).id);
  }

  await setConversation(conversation.id, {
    status: 'completed',
    variables,
  });
  return { waitingNodeId: null, finished: true };
}

// Kick off a brand-new conversation from its start node.
export async function startFlow(
  conversation: Conversation,
  flow: Flow,
): Promise<RunResult> {
  const def = flow.definition;
  const start = startNode(def);
  const first = start ? nextNodeId(def, start.id) : undefined;
  return walk(conversation, def, first);
}

// Visitor sent a message while parked on a "wait for answer" node — resume,
// optionally saving their reply to the node's variable.
export async function continueAfterInput(
  conversation: Conversation,
  flow: Flow,
  answer?: string,
): Promise<RunResult | null> {
  const def = flow.definition;
  const node = findNode(def, conversation.current_node_id);
  if (!node || node.type !== 'wait_input') return null;

  const d = node.data as WaitInputNodeData;
  let variables = conversation.variables ?? {};
  if (d.variable && answer != null) {
    variables = { ...variables, [d.variable]: answer };
  }
  const updated: Conversation = { ...conversation, variables };
  return walk(updated, def, nextNodeId(def, node.id));
}

// Visitor picked a choice option while parked on a choice node.
export async function pickChoice(
  conversation: Conversation,
  flow: Flow,
  optionId: string,
): Promise<RunResult | null> {
  const def = flow.definition;
  const node = findNode(def, conversation.current_node_id);
  if (!node || node.type !== 'choice') return null;
  return walk(conversation, def, nextNodeId(def, node.id, optionId));
}

// Is the conversation currently parked on a node awaiting visitor input?
export function pendingChoice(
  conversation: Conversation,
  flow: Flow,
): ChoiceNodeData | null {
  const node = findNode(flow.definition, conversation.current_node_id);
  if (node?.type === 'choice') return node.data as ChoiceNodeData;
  return null;
}

// Is the flow currently parked on a "wait for answer" node?
export function isWaitingForInput(
  conversation: Conversation,
  flow: Flow,
): boolean {
  const node = findNode(flow.definition, conversation.current_node_id);
  return node?.type === 'wait_input';
}
