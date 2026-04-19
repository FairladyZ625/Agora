import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { CcConnectBridgeClient } from './cc-connect-bridge-client.js';

class BridgeSocketStub extends EventEmitter {
  sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.emit('close');
  }
}

describe('CcConnectBridgeClient', () => {
  it('registers over websocket and emits reply events', async () => {
    const socket = new BridgeSocketStub();
    let connectedUrl = '';
    const events: Array<Record<string, unknown>> = [];
    const client = new CcConnectBridgeClient({
      webSocketFactory: (url) => {
        connectedUrl = url;
        return socket;
      },
    });

    client.onEvent((event) => {
      events.push(event);
    });

    const connectPromise = client.connect({
      baseUrl: 'http://127.0.0.1:9810',
      token: 'bridge-secret',
      platform: 'agora-discord',
      capabilities: ['text', 'preview'],
      metadata: { version: '1.0.0' },
    });

    socket.emit('open');
    socket.emit('message', JSON.stringify({ type: 'register_ack', ok: true, error: '' }));
    await connectPromise;

    expect(connectedUrl).toBe('ws://127.0.0.1:9810/bridge/ws?token=bridge-secret');
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      type: 'register',
      platform: 'agora-discord',
      capabilities: ['text', 'preview'],
      metadata: { version: '1.0.0' },
    });

    socket.emit('message', JSON.stringify({
      type: 'reply',
      session_key: 'agora-discord:thread-1:participant-1',
      reply_ctx: 'ctx-1',
      content: 'hello from cc-connect',
      format: 'text',
    }));

    expect(events).toContainEqual({
      type: 'reply',
      session_key: 'agora-discord:thread-1:participant-1',
      reply_ctx: 'ctx-1',
      content: 'hello from cc-connect',
      format: 'text',
    });
  });

  it('sends bridge message payloads after connect', async () => {
    const socket = new BridgeSocketStub();
    const client = new CcConnectBridgeClient({
      webSocketFactory: () => socket,
    });

    const connectPromise = client.connect({
      baseUrl: 'ws://127.0.0.1:9810',
      token: 'bridge-secret',
      platform: 'agora-discord',
      capabilities: ['text'],
    });

    socket.emit('open');
    socket.emit('message', JSON.stringify({ type: 'register_ack', ok: true, error: '' }));
    await connectPromise;

    await client.sendMessage({
      msg_id: 'msg-1',
      session_key: 'agora-discord:thread-1:participant-1',
      user_id: 'discord-user-1',
      user_name: 'Tester',
      content: 'route this to the agent',
      reply_ctx: 'discord:thread-1:msg-1',
    });

    expect(JSON.parse(socket.sent[1] ?? '{}')).toEqual({
      type: 'message',
      msg_id: 'msg-1',
      session_key: 'agora-discord:thread-1:participant-1',
      user_id: 'discord-user-1',
      user_name: 'Tester',
      content: 'route this to the agent',
      reply_ctx: 'discord:thread-1:msg-1',
      images: [],
      files: [],
      audio: null,
    });
  });
});
