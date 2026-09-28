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
// connect to BOTH public brokers at once (whichever works carries the data; duplicates are dropped by sequence number)
async function mqttConnect(base, onConnect) {
  await loadScript(base + 'mqtt.min.js');
  return MQTT_URLS.map(url => {
    const cl = window.mqtt.connect(url, { clientId: 'rl' + Math.random().toString(16).slice(2, 10), clean: true, keepalive: 20, reconnectPeriod: 5000, connectTimeout: 8000 });
    cl.on('error', () => {}); cl.on('connect', () => onConnect(cl)); return cl;
  });
}
export function makeCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

export class LinkSender {
  constructor(code, base, onStatus = () => {}) { this.code = code; this.base = base; this.onStatus = onStatus; this.conns = new Set(); this.mqttSeen = 0; this.cls = []; this.stopped = true; this.seq = 0; }
  async start() {
    this.stopped = false; this.onStatus('starting…');
    try { await loadScript(this.base + 'peerjs.min.js'); this._peer(); } catch (e) { this.onStatus('WebRTC library failed to load — using MQTT only'); }
    try {
      this.cls = await mqttConnect(this.base, cl => {
        if (this.stopped) return cl.end(true);
        cl.subscribe(TOPIC(this.code) + '/hello');
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
    const n = this.viewers, rtc = this.peer && this.peer.open, mq = this.cls.some(c => c.connected);
    this.onStatus(n ? `TV connected (${this.conns.size ? 'WebRTC' : 'MQTT'})` : `waiting for TV… (${[rtc && 'WebRTC', mq && 'MQTT'].filter(Boolean).join(' + ') || 'connecting'})`);
  }
  send(str) {
    str = str.slice(0, -1) + `,"s":${++this.seq}}`;
    for (const c of this.conns) { try { c.send(str); } catch (e) {} }
    if (performance.now() - this.mqttSeen < 8000) for (const cl of this.cls) if (cl.connected) cl.publish(TOPIC(this.code) + '/state', str, { qos: 0 });
  }
  stop() { this.stopped = true; try { this.peer && this.peer.destroy(); } catch (e) {} for (const cl of this.cls) { try { cl.end(true); } catch (e) {} } this.conns.clear(); this.cls = []; this.onStatus('off'); }
}

export class LinkReceiver {
  constructor(code, base, onMsg, onStatus = () => {}, transport = 'auto') { Object.assign(this, { code, base, onMsg, onStatus, transport }); this.last = 0; this.via = ''; this.seq = 0; }
  async start() {
    if (this.transport !== 'mqtt') { try { await loadScript(this.base + 'peerjs.min.js'); this._peer(); } catch (e) {} }
    // fall back to MQTT if no WebRTC data within 8 s (or immediately when forced)
    const fb = () => { if (!this.cl && performance.now() - this.last > 3000) this._mqtt(); };
    if (this.transport === 'mqtt') this._mqtt(); else { setTimeout(fb, 6000); setInterval(fb, 10000); }
    setInterval(() => this.onStatus(performance.now() - this.last < 2500 ? `connected · ${this.via}` : 'waiting for headset…'), 1000);
  }
  _msg(str, via) {
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    const now = performance.now();
    if (m.s && m.s <= this.seq && now - this.last < 3000) return;   // duplicate / out-of-order copy from the other path
    if (m.s) this.seq = m.s; this.last = now; this.via = via; this.onMsg(m);
  }
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
      this.cl = await mqttConnect(this.base, cl => {
        cl.subscribe(TOPIC(this.code) + '/state');
        cl.removeAllListeners('message'); cl.on('message', (t, m) => this._msg(m.toString(), 'MQTT'));
        const hello = () => cl.connected && cl.publish(TOPIC(this.code) + '/hello', '1', { qos: 0 });
        hello(); clearInterval(cl._h); cl._h = setInterval(hello, 3000);
      });
    } catch (e) { this.cl = null; }
  }
}
