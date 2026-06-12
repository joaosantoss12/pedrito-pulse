import { supabase } from './supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushStatus =
  | 'granted'
  | 'denied'
  | 'default'
  | 'ios-needs-install'
  | 'unsupported';

export function pushStatus(): PushStatus {
  if (!pushSupported()) return 'unsupported';
  if (isIosNonStandalone()) return 'ios-needs-install';
  return Notification.permission as 'granted' | 'denied' | 'default';
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// On iOS, push only works once the site is installed to the Home Screen (PWA).
export function isIosNonStandalone(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const standalone =
    // @ts-expect-error — non-standard iOS Safari flag
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

// Asks permission, subscribes this browser, and stores the subscription
// against the conversation so a broadcast can reach it later.
// Returns true if the browser is now subscribed.
export async function enablePush(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC) return { ok: false, reason: 'missing-vapid-key' };
  if (isIosNonStandalone()) return { ok: false, reason: 'ios-needs-install' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await registerSW();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      endpoint: json.endpoint!,
      subscription: json,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Has this browser already granted + subscribed?
export async function pushAlreadyEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
