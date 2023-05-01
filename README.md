# REAPER Control

Easily control REAPER via the network (with feedback).

Instead of manual midi mapping / OSC / ReaLearn, can use code, e.g.:
```js
midiDevice.on('midi.cc.*.21', reaper.trackVolume('MASTER'))
midiDevice.on('midi.cc.*.22', reaper.trackVolume('Guitar'))
midiDevice.on('midi.noteon.*.36', msg => reaper.toggleFx('Guitar', 'Drive'))
midiDevice.on('midi.noteon.*.37', msg => reaper.toggleFx('Guitar', 'Chorus'))
midiDevice.on('midi.noteon.*.40', msg => reaper.toggleMute('Guitar'))
```

## Install / Use

Install is easy, just copy `__startup.eel` and `__startup.lua` to
the REAPER Effects path and then open REAPER project (e.g. path on a Mac:
`~/Library/Application\ Support/REAPER/Scripts`).

Can now send commands and receive output over TCP port `9595`, e.g.
`echo 'info' | nc -c localhost 9595`
`echo 'tval 0 B_MUTE TOGGLE' | nc -c localhost 9595`

## More examples:

Toggle mute state for first (all are zero indexed) track:
```bash
echo 'tval 0 B_MUTE TOGGLE' | nc -c localhost 9595
# Ex output:
#   {"tid":0,"type":"trackVal","val":1.0,"key":"B_MUTE"}
```
`TOGGLE` is special value to toggle / invert, which is nice
since we don't need to know previous state. We can see result is that the
track became muted (REAPER's `1.0` or "true" for `B_MUTE` parameter).

Enumerate JSON info about project (e.g. to identify FX plugins and their
parameters by name and ID number):
```bash
echo 'info' | nc -c localhost 9595
# Ex output:
#   ...
#   {"name":"Guitar","tid":2,"type":"track"}
#   ...
#   {"tid":2,"fxid":3,"name":"JS: Chorus","type":"fx"}
#   ...
#   {"pid":6,"val":0.0,"tid":2,"type":"fxParam","name":"Bypass","fxid":3}
#   ...
```

Based on IDs in info above, disable ("Bypass" parameter is 7th)
the Chorus effect (4th) on the Guitar track (3rd):
```bash
echo 'fxp 2 3 6 1.0' | nc -c localhost 9595
# Ex output:
#   {"pid":6,"type":"fxParamVal","fxid":3,"tid":2,"val":1.0}
```

See also:
- [__startup.lua] for all actions currently supported
- [reaper.js] as ways to call with code (e.g. Node.js, TCP netcat above, HTTP, websockets all possible...)
- [simple-control.js] for both using MIDI device input and updating simple HTML GUI (Can be run as electron demo via `npm start`)

## Approach and reasoning

I've seen other projects that have a lot more code, set-up steps / dependencies, and potential latency / slowness.

I wanted a basic, performant way to control (and get information about) a running REAPER project
(especially headless on a Raspberry Pi). I didn't want to have to deal with MIDI or OSC mapping / learn,
nor ReaLearn (plus my projects change often).

I first tried communicating via JSFX MIDI SysEx messages, but ran into buffering and random hang problems
(possible bugs in RtMidi or some other library). But the TCP network support doesn't have this problem
and is more flexible anyway, with even less setup.

Writing EEL is too error-prone for me, so I minimized that (only its ReaScript API supports TCP / network
communication natively) by communicating back and forth with Lua (easier syntax, more of a standard lib)
over shared memory, in defer loops.

The flow is roughly:
1. TCP network input commands are sent
2. EEL (on a defer loop) receives
3.      and writes to shared memory.
4. Lua (also on a defer loop) reads shared memory
5.      performs designated API actions
6.      writes ouput to shared memory
7. EEL reads output in shared memory
8.      and sends back ouput over the TCP socket

Latency and performance (for my purposes at least) are good, since the two defer loop
ReaScript actions are lightweight, non-blocking, and can handle input and output messaging
in batches as they're performed.
