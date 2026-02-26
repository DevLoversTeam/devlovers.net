'use client';

const AUTH_CHANNEL_NAME = 'devlovers-auth-sync';
const AUTH_UPDATED_EVENT = 'AUTH_UPDATED';

type AuthSyncMessage = {
  type: typeof AUTH_UPDATED_EVENT;
};

export function broadcastAuthUpdated() {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return;
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  const message: AuthSyncMessage = { type: AUTH_UPDATED_EVENT };
  channel.postMessage(message);
  channel.close();
}

export function subscribeToAuthUpdates(onUpdate: () => void): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }

  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);

  channel.onmessage = event => {
    const message = event.data as AuthSyncMessage | undefined;
    if (message?.type === AUTH_UPDATED_EVENT) {
      onUpdate();
    }
  };

  return () => {
    channel.close();
  };
}
