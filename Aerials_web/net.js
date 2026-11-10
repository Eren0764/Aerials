/**
 * Aerials online networking (PeerJS / WebRTC, host-authoritative star topology).
 *
 *  NetHost     createRoom(), broadcast(msg, exceptId), sendTo(id, msg), kick(id, reason), close()
 *              events: 'join' {id, name, hello}, 'leave' {id, reason}, 'message' (id, msg), 'error' {code, text}
 *  NetSession  joinRoom(code, hello), send(msg), close()
 *              events: 'message' (msg), 'closed' {reason, text}, 'error' {code, text}, 'ping' (ms)
 *
 * PeerJS is loaded on demand from a CDN the first time online play is opened, so offline play needs no network.
 */
(function (root) {
  'use strict';

  const GAME_ID = 'aerials';
  const NET_VERSION = 1;              // bump whenever the protocol or gameplay-affecting constants change
  const MAX_PLAYERS = 8;              // host + 7 guests
  const PEER_PREFIX = `${GAME_ID}-v${NET_VERSION}-`;
  const PING_INTERVAL = 2000;         // ms
  const SILENCE_TIMEOUT = 7000;       // ms without any message = connection lost
  const JOIN_TIMEOUT = 20000;         // ms to get an open data channel to the host
  const PEERJS_URLS = [
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function log() { /* console.log.apply(console, ['[net]'].concat([].slice.call(arguments))); */ }

  // Exactly 4 digits from anything typed or pasted ("12-34", invite links...)
  function cleanCode(text) {
    return String(text || '').replace(/\D/g, '').slice(0, 4);
  }

  function randomCode() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  function cleanName(text) {
    const s = String(text || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14);
    return s || 'PILOT';
  }

  let peerJsPromise = null;
  function loadPeerJS() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (peerJsPromise) return peerJsPromise;
    peerJsPromise = new Promise((resolve, reject) => {
      let i = 0;
      const tryNext = () => {
        if (i >= PEERJS_URLS.length) {
          peerJsPromise = null;
          reject({ code: 'network', text: 'Could not load the online library. Check your internet connection and try again.' });
          return;
        }
        const s = document.createElement('script');
        s.src = PEERJS_URLS[i++];
        s.async = true;
        s.onload = () => (root.Peer ? resolve(root.Peer) : tryNext());
        s.onerror = () => { s.remove(); tryNext(); };
        document.head.appendChild(s);
      };
      tryNext();
    });
    return peerJsPromise;
  }

  // STUN + Open Relay TURN (static-auth REST credentials made in the browser) so phones on mobile data can connect
  let iceCache = null;
  async function getIceServers() {
    if (iceCache && iceCache.expires > Date.now() + 3600 * 1000) return iceCache.servers;
    const stun = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' }
    ];
    try {
      if (!root.crypto || !root.crypto.subtle) throw new Error('no webcrypto');
      const expiry = Math.floor(Date.now() / 1000) + 12 * 3600;
      const username = `${expiry}:${GAME_ID}`;
      const enc = new TextEncoder();
      const key = await root.crypto.subtle.importKey('raw', enc.encode('openrelayprojectsecret'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const sig = await root.crypto.subtle.sign('HMAC', key, enc.encode(username));
      let bin = '';
      new Uint8Array(sig).forEach(b => { bin += String.fromCharCode(b); });
      const credential = btoa(bin);
      const host = 'staticauth.openrelay.metered.ca';
      const servers = stun.concat([{
        urls: [`turn:${host}:80`, `turn:${host}:80?transport=tcp`, `turn:${host}:443`, `turns:${host}:443?transport=tcp`],
        username,
        credential
      }]);
      iceCache = { servers, expires: expiry * 1000 };
      return servers;
    } catch (e) {
      return stun; // STUN only: most home networks still connect
    }
  }

  // Keep the screen awake while online (a dimmed / locked phone suspends the page and the room disappears)
  const wake = { lock: null, wanted: false };
  async function acquireWake() {
    wake.wanted = true;
    try {
      if (navigator.wakeLock && !wake.lock && document.visibilityState === 'visible') {
        wake.lock = await navigator.wakeLock.request('screen');
        wake.lock.addEventListener('release', () => { wake.lock = null; });
      }
    } catch (e) { /* not supported / denied */ }
  }
  function releaseWake() {
    wake.wanted = false;
    try { if (wake.lock) wake.lock.release(); } catch (e) {}
    wake.lock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wake.wanted) acquireWake();
  });

  // Friendly text for PeerJS error types
  function peerErrorText(err, code) {
    const type = err && err.type;
    switch (type) {
      case 'peer-unavailable':
        return { code: 'notfound', text: `Room ${code} was not found. Check the code. The host must keep the game open with the screen on.` };
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return { code: 'network', text: 'Could not reach the online server. Check your internet connection and try again.' };
      case 'browser-incompatible':
        return { code: 'browser', text: 'This browser does not support online play (WebRTC). Try Chrome, Edge, Firefox or Safari.' };
      case 'unavailable-id':
        return { code: 'taken', text: 'That room code is already in use.' };
      case 'ssl-unavailable':
        return { code: 'network', text: 'A secure connection to the online server is not available here.' };
      case 'disconnected':
        return { code: 'network', text: 'Lost the connection to the online server.' };
      default:
        return { code: type || 'error', text: 'An online error happened' + (type ? ` (${type})` : '') + '. Try again.' };
    }
  }

  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
    off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter(f => f !== fn); return this; }
    emit(ev, a, b) { (this._h[ev] || []).slice().forEach(fn => { try { fn(a, b); } catch (e) { console.error(e); } }); }
  }

  // Reconnect the signaling socket after it drops; detect a destroyed peer when the page comes back
  function watchPeer(peer, onLost) {
    peer.on('disconnected', () => {
      if (!peer.destroyed) { try { peer.reconnect(); } catch (e) {} }
    });
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (peer.destroyed) onLost();
      else if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }

  // ---------------------------------------------------------------------------
  // HOST
  // ---------------------------------------------------------------------------
  class NetHost extends Emitter {
    constructor() {
      super();
      this.peer = null;
      this.code = null;
      this.guests = new Map(); // id -> { conn, name, lastSeen, rtt, welcomed }
      this.nextId = 1;
      this.maxPlayers = MAX_PLAYERS;
      this.acceptJoins = true;
      this._timer = null;
      this._unwatch = null;
      this.closed = false;
    }

    async createRoom() {
      const Peer = await loadPeerJS();
      const iceServers = await getIceServers();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        try {
          const peer = await new Promise((resolve, reject) => {
            const p = new Peer(PEER_PREFIX + code, { config: { iceServers }, debug: 0 });
            const fail = (err) => { p.off('open', ok); try { p.destroy(); } catch (e) {} reject(err); };
            const ok = () => { p.off('error', fail); resolve(p); };
            p.once('open', ok);
            p.once('error', fail);
          });
          this.peer = peer;
          this.code = code;
          this._wire();
          acquireWake();
          return code;
        } catch (err) {
          if (err && err.type === 'unavailable-id') continue; // code taken: silently try another
          throw peerErrorText(err, code);
        }
      }
      throw { code: 'taken', text: 'Could not get a free room code. Try again.' };
    }

    _wire() {
      const peer = this.peer;
      peer.on('connection', conn => this._onConnection(conn));
      peer.on('error', err => {
        if (err && err.type === 'peer-unavailable') return; // a guest vanished: handled by heartbeat
        this.emit('error', peerErrorText(err, this.code));
      });
      this._unwatch = watchPeer(peer, () => {
        this.emit('error', { code: 'lost', fatal: true, text: 'Connection was lost while the game was in the background. Create a new room.' });
      });
      this._timer = setInterval(() => this._heartbeat(), PING_INTERVAL);
    }

    _onConnection(conn) {
      let guestId = null;
      const helloTimer = setTimeout(() => { if (!guestId) try { conn.close(); } catch (e) {} }, 10000);
      conn.on('data', raw => {
        const msg = raw;
        if (!msg || typeof msg !== 'object') return;
        if (!guestId) {
          if (msg.t !== 'hello') return;
          clearTimeout(helloTimer);
          if (msg.v !== NET_VERSION) {
            this._reject(conn, 'version', 'The host is using a different version — both refresh the page.');
            return;
          }
          if (!this.acceptJoins || this.guests.size + 1 >= this.maxPlayers) {
            this._reject(conn, 'full', `Room ${this.code} is full (${this.maxPlayers} players).`);
            return;
          }
          guestId = 'g' + (this.nextId++);
          const g = { conn, name: cleanName(msg.name), lastSeen: performance.now(), rtt: 0 };
          this.guests.set(guestId, g);
          this._send(conn, { t: 'welcome', id: guestId, code: this.code });
          this.emit('join', { id: guestId, name: g.name, hello: msg });
          return;
        }
        const g = this.guests.get(guestId);
        if (!g) return;
        g.lastSeen = performance.now();
        if (msg.t === 'pong') {
          g.rtt = Math.max(0, Math.round(performance.now() - msg.ts));
          return;
        }
        if (msg.t === 'bye') { this._drop(guestId, 'left'); return; }
        this.emit('message', guestId, msg);
      });
      conn.on('close', () => { if (guestId) this._drop(guestId, 'closed'); });
      conn.on('error', () => { if (guestId) this._drop(guestId, 'error'); });
    }

    _reject(conn, reason, text) {
      this._send(conn, { t: 'error', reason, text });
      setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
    }

    _send(conn, msg) {
      try { if (conn && conn.open) conn.send(msg); } catch (e) {}
    }

    _heartbeat() {
      const now = performance.now();
      for (const [id, g] of this.guests) {
        if (now - g.lastSeen > SILENCE_TIMEOUT) { this._drop(id, 'timeout'); continue; }
        this._send(g.conn, { t: 'ping', ts: now, rtt: g.rtt });
      }
    }

    _drop(id, reason) {
      const g = this.guests.get(id);
      if (!g) return;
      this.guests.delete(id);
      try { g.conn.close(); } catch (e) {}
      this.emit('leave', { id, name: g.name, reason });
    }

    broadcast(msg, exceptId) {
      for (const [id, g] of this.guests) if (id !== exceptId) this._send(g.conn, msg);
    }

    sendTo(id, msg) {
      const g = this.guests.get(id);
      if (g) this._send(g.conn, msg);
    }

    rttOf(id) { const g = this.guests.get(id); return g ? g.rtt : 0; }

    kick(id, reason) {
      const g = this.guests.get(id);
      if (!g) return;
      this._send(g.conn, { t: 'kicked', text: reason || 'The host removed you from the room.' });
      setTimeout(() => this._drop(id, 'kicked'), 300);
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.broadcast({ t: 'closed', text: 'The host closed the room.' });
      clearInterval(this._timer);
      if (this._unwatch) this._unwatch();
      const peer = this.peer;
      setTimeout(() => {
        for (const g of this.guests.values()) { try { g.conn.close(); } catch (e) {} }
        this.guests.clear();
        try { if (peer) peer.destroy(); } catch (e) {}
      }, 250);
      releaseWake();
    }
  }

  // ---------------------------------------------------------------------------
  // GUEST
  // ---------------------------------------------------------------------------
  class NetSession extends Emitter {
    constructor() {
      super();
      this.peer = null;
      this.conn = null;
      this.id = null;
      this.code = null;
      this.rtt = 0;
      this.lastSeen = 0;
      this._timer = null;
      this._unwatch = null;
      this.closed = false;
    }

    async joinRoom(code, hello) {
      code = cleanCode(code);
      if (code.length !== 4) throw { code: 'badcode', text: 'Enter the 4-digit room code.' };
      this.code = code;
      const Peer = await loadPeerJS();
      const iceServers = await getIceServers();

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, val) => {
          if (settled) return;
          settled = true;
          clearTimeout(openTimer);
          if (err) { this._teardown(); reject(err); } else resolve(val);
        };
        const openTimer = setTimeout(() => {
          finish({ code: 'timeout', text: `Room ${code} exists, but the devices could not connect (network blocks direct connections). Try again or switch one device between Wi-Fi and mobile data.` });
        }, JOIN_TIMEOUT);

        const peer = new Peer(undefined, { config: { iceServers }, debug: 0 });
        this.peer = peer;
        peer.on('error', err => {
          const e = peerErrorText(err, code);
          if (!settled) finish(e);
          else if (err && (err.type === 'network' || err.type === 'server-error')) { /* signaling only: data channel may still live */ }
          else this.emit('error', e);
        });
        this._unwatch = watchPeer(peer, () => this._lost('Connection was lost while the game was in the background. Create a new room.'));
        peer.on('open', () => {
          const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
          this.conn = conn;
          conn.on('open', () => {
            this.lastSeen = performance.now();
            conn.send(Object.assign({ t: 'hello', v: NET_VERSION }, hello || {}));
          });
          conn.on('data', msg => {
            if (!msg || typeof msg !== 'object') return;
            this.lastSeen = performance.now();
            if (!settled) {
              if (msg.t === 'welcome') {
                this.id = msg.id;
                this._timer = setInterval(() => this._watchdog(), 1000);
                acquireWake();
                finish(null, { id: msg.id });
              } else if (msg.t === 'error') {
                finish({ code: msg.reason || 'error', text: msg.text || 'The host refused the connection.' });
              }
              return;
            }
            if (msg.t === 'ping') {
              this.rtt = msg.rtt || this.rtt;
              this.send({ t: 'pong', ts: msg.ts });
              this.emit('ping', this.rtt);
              return;
            }
            if (msg.t === 'closed') { this._lost(msg.text || 'The host closed the room.', 'closed'); return; }
            if (msg.t === 'kicked') { this._lost(msg.text || 'The host removed you from the room.', 'kicked'); return; }
            this.emit('message', msg);
          });
          conn.on('close', () => {
            if (!settled) finish({ code: 'closed', text: 'The host closed the connection.' });
            else this._lost('The host closed the room.', 'closed');
          });
          conn.on('error', () => { if (!settled) finish({ code: 'error', text: 'Could not connect to the host.' }); });
        });
      });
    }

    _watchdog() {
      if (performance.now() - this.lastSeen > SILENCE_TIMEOUT) {
        this._lost('Lost the connection to the host.', 'timeout');
      }
    }

    send(msg) {
      try { if (this.conn && this.conn.open) this.conn.send(msg); } catch (e) {}
    }

    _lost(text, reason) {
      if (this.closed) return;
      this._teardown();
      this.emit('closed', { reason: reason || 'lost', text });
    }

    _teardown() {
      this.closed = true;
      clearInterval(this._timer);
      if (this._unwatch) this._unwatch();
      try { if (this.conn) this.conn.close(); } catch (e) {}
      try { if (this.peer) this.peer.destroy(); } catch (e) {}
      releaseWake();
    }

    close() {
      if (this.closed) return;
      this.send({ t: 'bye' });
      setTimeout(() => this._teardown(), 150);
      this.closed = true;
      releaseWake();
    }
  }

  root.AerialsNet = {
    GAME_ID, NET_VERSION, MAX_PLAYERS,
    NetHost, NetSession,
    cleanCode, cleanName, loadPeerJS, acquireWake, releaseWake
  };
}(typeof window !== 'undefined' ? window : this));
