const YAML = require('yaml')
const Reaper = require('./reaper')

window.addEventListener('DOMContentLoaded', () => {
    const reaper = new Reaper()
    
    reaper.on('ready', () => {
        const yaml = YAML.stringify(reaper.project)
        console.log("Loaded project:\n", yaml)
        document.querySelector("pre").innerHTML = yaml
    })

    // Simple midi knob actions
    const {MidiIn, MidiOut, Midi} = require('j5-midi')
    const midiDevice = new MidiIn({pattern: /Novation|Launchkey.*MIDI|Korg|M-Audio/ig})
    midiDevice.on('midi.cc.*.21', reaper.volume('MASTER'))
    midiDevice.on('midi.cc.*.22', reaper.volume('Guitar'))
    midiDevice.on('midi.noteon.*.36', msg => reaper.toggleFx('Guitar', 'Drive'))
    midiDevice.on('midi.noteon.*.37', msg => reaper.toggleFx('Guitar', 'Chorus'))
    midiDevice.on('midi.noteon.*.40', msg => reaper.toggleMute('MASTER'))
    midiDevice.on('midi.noteon.*.41', msg => reaper.toggleMute('Guitar'))

    // Simple GUI button and slider actions
    const $masterMute = document.getElementById('masterMute'),
        $guitarMute = document.getElementById('guitarMute'),
        $masterVol = document.getElementById('masterVolume'),
        $guitarVol = document.getElementById('guitarVolume')

    $guitarMute.addEventListener('click', e => reaper.toggleMute("Guitar"))
    $masterMute.addEventListener('click', e => reaper.toggleMute("MASTER"))

    $masterVol.addEventListener('input', e => reaper.volumeMidi("MASTER", parseInt(e.target.value)))
    $guitarVol.addEventListener('input', e => reaper.volumeMidi("Guitar", parseInt(e.target.value)))

    // Simple GUI update feedback
    reaper.on('trackVal', event => {
        if (event.key === 'D_VOL') {
            const el = document.getElementById(event.tid === -1 ? "masterGain" : "guitarGain")
            el.innerHTML = event.val
        } else if (event.key === 'B_MUTE') {
            const el = event.tid === -1 ? $masterMute : $guitarMute
            el.style.background = event.val === 0 ? 'none' : 'red'
        }
    })
})
