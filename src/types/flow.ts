import type { Edge, Node } from '@xyflow/react';

// ---- Node data shapes -------------------------------------------------

export interface StartNodeData {
  [key: string]: unknown;
  label: string;
}

export interface MessageNodeData {
  [key: string]: unknown;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  // ms to wait (typing indicator) before sending the next message
  delayMs?: number;
}

export interface MediaNodeData {
  [key: string]: unknown;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  caption?: string;
  delayMs?: number;
}

export interface DelayNodeData {
  [key: string]: unknown;
  // pause this many seconds before continuing to the next node
  seconds: number;
}

export interface WaitInputNodeData {
  [key: string]: unknown;
  // optional prompt shown while waiting; flow resumes on the next visitor message
  text?: string;
  // if set, the visitor's reply is saved under this variable name
  variable?: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceNodeData {
  [key: string]: unknown;
  text: string;
  options: ChoiceOption[];
}

export interface EndNodeData {
  [key: string]: unknown;
}

export type FlowNodeType =
  | 'start'
  | 'message'
  | 'media'
  | 'delay'
  | 'wait_input'
  | 'choice'
  | 'end';

export type FlowNode =
  | Node<StartNodeData, 'start'>
  | Node<MessageNodeData, 'message'>
  | Node<MediaNodeData, 'media'>
  | Node<DelayNodeData, 'delay'>
  | Node<WaitInputNodeData, 'wait_input'>
  | Node<ChoiceNodeData, 'choice'>
  | Node<EndNodeData, 'end'>;

export type FlowEdge = Edge;

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
