const Reaper = require('./reaper')
const reaper = new Reaper()

// Simple midi knob actions
const {MidiIn, MidiOut, Midi} = require('j5-midi')
const midiDevice = new MidiIn({pattern: /Novation|Launchkey.*MIDI|Korg|M-Audio/ig})
midiDevice.on('midi.cc.*.21', reaper.volume('MASTER'))
midiDevice.on('midi.cc.*.22', reaper.volume('Guitar'))
midiDevice.on('midi.noteon.*.36', msg => reaper.toggleFx('Guitar', 'Drive'))
midiDevice.on('midi.noteon.*.37', msg => reaper.toggleFx('Guitar', 'Chorus'))
midiDevice.on('midi.noteon.*.40', msg => reaper.toggleMute('MASTER'))
midiDevice.on('midi.noteon.*.41', msg => reaper.toggleMute('Guitar'))

// Simple GUI button actions
window.addEventListener('DOMContentLoaded', () => {
    const $masterMute = document.getElementById('masterMute'),
        $guitarMute = document.getElementById('guitarMute'),
        $masterVol = document.getElementById('masterVol'),
        $guitarVol = document.getElementById('guitarVol')

    // Simple GUI update feedback
    // TODO WIP flesh out more
    reaper.on('trackVal', event => {
        if (event.key === 'D_VOL') {
            console.log('todo vol', event)
        } else if (event.key === 'B_MUTE') {
            console.log('mute event for track', event.tid)
            const button = event.tid === -1 ? $masterMute : $guitarMute
            button.style.background = event.val === 0 ? 'none' : 'red'
        }
    })

    // setInterval(() => reaper.send('tval 0 B_MUTE TOGGLE'), 500)
})


reaper.on('ready', () => console.log("Loaded project", reaper.project))