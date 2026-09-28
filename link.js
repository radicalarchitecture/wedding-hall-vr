// link.js — TV spectator link (no server of ours).
// Headset phone = sender, TV/laptop = receiver. Transport: PeerJS (public PeerJS cloud broker, WebRTC data
// channel) first; MQTT over secure WebSocket (public brokers) as fallback when WebRTC can't connect.
const PREFIX = 'radlobby-v1-';
const MQTT_URLS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const TOPIC = code => `radicalarchitecture/lobby-v1/${code}`;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function mqttConnect(base, onConnect) {
  await loadScript(base + 'mqtt.min.js');
  let i = 0; const opts = { clientId: 'rl' + Math.random().toString(16).slice(2, 10), clean: true, keepalive: 20, reconnectPeriod: 4000, connectTimeout: 6000 };
  let c = window.mqtt.connect(MQTT_URLS[0], opts);
  // rotate to the next public broker if the first one doesn't answer
  c.on('error', () => {}); c.on('close', () => { if (!c.connected && ++i < 6) { const url = MQTT_URLS[i % MQTT_URLS.length]; c.end(true); c = window.mqtt.connect(url, opts); wire(c); } });
  const wire = cl => cl.on('connect', () => onConnect(cl));
  wire(c);
  return () => c;
}
export function makeCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

export class LinkSender {
  constructor(code, base, onStatus = () => {}) { this.code = code; this.base = base; this.onStatus = onStatus; this.conns = new Set(); this.mqttSeen = 0; this.cl = null; this.stopped = true; }
  async start() {
    this.stopped = false; this.onStatus('starting…');
    try { await loadScript(this.base + 'peerjs.min.js'); this._peer(); } catch (e) { this.onStatus('WebRTC library failed to load — using MQTT only'); }
    try {
      await mqttConnect(this.base, cl => {
        if (this.stopped) return cl.end(true);
        this.cl = cl; cl.subscribe(TOPIC(this.code) + '/hello');
        cl.removeAllListeners('message'); cl.on('message', () => { this.mqttSeen = performance.now(); this._status(); });
        this._status();
      });
    } catch (e) {}
  }
  _peer() {
    if (this.stopped) return;
    const p = this.peer = new window.Peer(PREFIX + this.code, { debug: 0 });
    p.on('open', () => this._status());
    p.on('connection', c => { c.on('open', () => { this.conns.add(c); this._status(); }); const drop = () => { this.conns.delete(c); this._status(); }; c.on('close', drop); c.on('error', drop); });
    p.on('disconnected', () => { if (!this.stopped) setTimeout(() => { try { p.reconnect(); } catch (e) {} }, 2000); });
    p.on('error', e => { this._status(); if (e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { try { p.destroy(); } catch (x) {} setTimeout(() => this._peer(), 5000); } });
  }
  get viewers() { return this.conns.size + (performance.now() - this.mqttSeen < 8000 ? 1 : 0); }
  _status() {
    const n = this.viewers, rtc = this.peer && this.peer.open, mq = this.cl && this.cl.connected;
    this.onStatus(n ? `TV connected (${this.conns.size ? 'WebRTC' : 'MQTT'})` : `waiting for TV… (${[rtc && 'WebRTC', mq && 'MQTT'].filter(Boolean).join(' + ') || 'connecting'})`);
  }
  send(str) {
    for (const c of this.conns) { try { c.send(str); } catch (e) {} }
    if (this.cl && this.cl.connected && performance.now() - this.mqttSeen < 8000) this.cl.publish(TOPIC(this.code) + '/state', str, { qos: 0 });
  }
  stop() { this.stopped = true; try { this.peer && this.peer.destroy(); } catch (e) {} try { this.cl && this.cl.end(true); } catch (e) {} this.conns.clear(); this.cl = null; this.onStatus('off'); }
}

export class LinkReceiver {
  constructor(code, base, onMsg, onStatus = () => {}, transport = 'auto') { Object.assign(this, { code, base, onMsg, onStatus, transport }); this.last = 0; this.via = ''; }
  async start() {
    if (this.transport !== 'mqtt') { try { await loadScript(this.base + 'peerjs.min.js'); this._peer(); } catch (e) {} }
    // fall back to MQTT if no WebRTC data within 8 s (or immediately when forced)
    const fb = () => { if (!this.cl && performance.now() - this.last > 3000) this._mqtt(); };
    if (this.transport === 'mqtt') this._mqtt(); else { setTimeout(fb, 6000); setInterval(fb, 10000); }
    setInterval(() => this.onStatus(performance.now() - this.last < 2500 ? `connected · ${this.via}` : 'waiting for headset…'), 1000);
  }
  _msg(str, via) { this.last = performance.now(); this.via = via; try { this.onMsg(JSON.parse(str)); } catch (e) {} }
  _peer() {
    const p = this.peer = new window.Peer({ debug: 0 });
    const connect = () => {
      const c = p.connect(PREFIX + this.code, { serialization: 'raw', reliable: false });
      c.on('data', d => this._msg(typeof d === 'string' ? d : new TextDecoder().decode(d), 'WebRTC'));
      const retry = () => setTimeout(connect, 3000); c.on('close', retry); c.on('error', () => {});
    };
    p.on('open', connect);
    p.on('error', e => { if (e.type === 'peer-unavailable') setTimeout(() => { if (!p.destroyed) connect(); }, 3000); });
  }
  async _mqtt() {
    if (this.cl) return; this.cl = true;
    try {
      await mqttConnect(this.base, cl => {
        this.cl = cl; cl.subscribe(TOPIC(this.code) + '/state');
        cl.removeAllListeners('message'); cl.on('message', (t, m) => { if (performance.now() - this.last > 300 || this.via === 'MQTT') this._msg(m.toString(), 'MQTT'); });
        const hello = () => cl.connected && cl.publish(TOPIC(this.code) + '/hello', '1', { qos: 0 });
        hello(); clearInterval(this._h); this._h = setInterval(hello, 3000);
      });
    } catch (e) { this.cl = null; }
  }
}
