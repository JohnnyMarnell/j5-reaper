const nodeEvents = require('events')
const net = require('net')

class Reaper {
    constructor(opts = {}) {
        this.project = {}
        this.events = new nodeEvents.EventEmitter()
        this.on = this.events.on.bind(this.events)
        this.cache = {}
        this.volumeLookUpTable = JSON.parse(require('fs').readFileSync(`${__dirname}/reaperMidiFaderValues.json`))
        this.volumeLookUpTableReversed = Object.fromEntries(Object.entries(this.volumeLookUpTable)
            .map(([key, val]) => [val, key]))
        this.socket = null

        this.bindEvents()
        this.connect(opts)
        this.sync()
    }
    bindEvents() {
        const track = e => this.project.tracks[e.tid] || (console.log('**** TRACK MISSING FOR', e) || {})
        const handlers = {
            infoStart: e => this.project = { tracks: {} },
            track: e => this.project.tracks[e.tid] = {...e, fx: [], sends: []},
            fx: e => track(e).fx[e.fxid] = {...e, params: []},
            fxParam: e => track(e).fx[e.fxid].params[e.pid] = {...e, },
            send: e => track(e).sends[e.sid] = {...e, },
            trackVal: e => track(e)[e.key] = e.val,
            sendVal: e => track(e).sends[e.sid][e.key] = e.val,
            fxParamVal: e => track(e).fx[e.fxid].params[e.pid].val = e.val,
            infoEnd: e => console.log(`Finished loading project, ${
                Object.keys(this.project.tracks).length} tracks`),
        }
        Object.entries(handlers).forEach(([event, handler]) => this.on(event, handler))
        this.events.once('infoEnd', e => this.events.emit('ready', e))
    }
    connect(opts) {
        this.socket = new net.Socket()
        this.socket.connect(opts.port || 9595, opts.ip || '127.0.0.1', () => console.log('Connected'))
        this.socket.on('data', msg => this.handleMessage(msg))
        this.socket.on('close', () => console.log('Disconnected'))
    }
    sync() {
        this.send('info')
    }
    handleMessage(msg) {
        msg.toString('utf8').trim().split('\n')
            .map(line => JSON.parse(line))
            .forEach(event => this.events.emit(event.type, event))
    }
    trackVal(track, param, val) {
        const key = this.cacheTrack(track)
        this.send(`tval ${key.tid} ${param} ${val}`)
    }
    fxVal(track, fx, param, val) {
        const key = this.cacheFxParam(track, fx, param)
        this.send(`fxp ${key.tid} ${key.fxid} ${key.pid} ${this.coerceVal(val)}`)
    }
    sendVal(track, send, param, val) {
        const key = this.cacheSend(track, send)
        this.send(`sval ${key.tid} ${key.sid} ${param} ${this.coerceVal(val)}`)
    }
    tempo(bpm) {
        this.send(`tempo ${bpm}`)
    }
    enableFx(track, fx, enabled = true) {
        this.fxVal(track, fx, 'Bypass', enabled)
    }
    toggleFx(track, fx) {
        this.fxVal(track, fx, 'Bypass', 'TOGGLE')
    }
    toggleMute(name) {
        this.muteTrack(name, 'TOGGLE')
    }
    toggleMuteSend(track, send) {
        this.sendVal(track, send, 'B_MUTE', 'TOGGLE')
    }
    muteTrack(name, muted = true) {
        this.trackVal(name, 'B_MUTE', muted)
    }
    unmuteTrack(name, unmuted = true) {
        this.muteTrack(name, !unmuted)
    }
    tempo(bpm) {
        this.send(`tempo ${bpm}`)
    }
    trackVolumeAbsolute(name, val = 1.0 /* unity gain, +0 dB */) {
        this.trackVal(name, 'D_VOL', val)
    }
    trackVolumePercent(name, pct) {
        this.trackVolumeAbsolute(name, this.volumeLookUpTable[Math.floor(pct * 127)])
    }
    volume(name) {
        return msg => this.trackVolumePercent(name, msg.value / 127)
    }
    fxParamMidiHandler(track, fx, param) {
        return msg => this.fxVal(track, fx, param, msg.value / 127)
    }
    coerceVal(val) {
        return val === true ? `1.0` : val === false ? `0.0` : val
    }
    send(str) {
        this.socket.write(str + '\n')
    }

    cacheTrack(track) {
        const key = `t.${track}`
        return this.cache[key] || (this.cache[key] = Object.values(this.project.tracks)
            .filter(t => t.name.includes(track))[0])
    }
    cacheFxParam(track, fx, param) {
        const key = `t.${track}.fx.${fx}.p.${param}`
        return this.cache[key] || (this.cache[key] = Object.values(this.project.tracks)
            .filter(t => t.name.includes(track))
            .flatMap(t => t.fx).filter(f => f.name.includes(fx))
            .flatMap(f => f.params).filter(p => p.name.includes(param))[0])
    }
    cacheSend(track, send) {
        const key = `t.${track}.s.${send}`
        return this.cache[key] || (this.cache[key] = Object.values(this.project.tracks)
            .filter(t => t.name.includes(track))
            .flatMap(t => t.sends).filter(s => s.name.includes(send))[0])
    }
}

module.exports = Reaper