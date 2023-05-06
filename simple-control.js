const YAML = require('yaml')
const Reaper = require('./reaper')
const {MidiIn, MidiOut, Midi} = require('j5-midi')

window.addEventListener('DOMContentLoaded', () => {
    const reaper = new Reaper({echo: true})
    
    /************** Easy MIDI mapping **************/
    const midiDevice = new MidiIn({pattern: /Novation|Launchkey.*MIDI|Korg|M-Audio/ig})

    // MIDI cc knobs controling volume, buttons toggling mute
    midiDevice.on('midi.cc.*.21', reaper.volume('MASTER'))
    midiDevice.on('midi.cc.*.22', reaper.volume('Guitar'))
    midiDevice.on('midi.noteon.9.40', _ => reaper.toggleMute('Keys'))
    midiDevice.on('midi.noteon.9.41', _ => reaper.toggleMute('Guitar'))

    // MIDI cc knob changing transpose amount, button cycling thru presets (Spitfire Labs patches / instruments)
    midiDevice.on('midi.cc.*.23', msg => reaper.fxParam('Keys', 'Transpose', 'Semitones',
                                         0.5 + (Math.floor(12 * msg.value / 128)) * 1/128))
    let keysPatchIndex = 0
    const keysPatches = [ 'Electric Piano: Chorus', 'Soft Piano', 'Strings: Ensemble' ]
    midiDevice.on('midi.noteon.9.42', _ => reaper.switchFxPreset('Keys', 'Spitfire',
                                            keysPatches[++keysPatchIndex % keysPatches.length]))

    // MIDI buttons toggling FX enable / bypass
    midiDevice.on('midi.noteon.9.36', _ => reaper.toggleFx('Guitar', 'Distortion'))
    midiDevice.on('midi.noteon.9.37', _ => reaper.toggleFx('Guitar', 'Chorus'))
    
    
    /************** Example of UI (actions and feedback) **************/
    const $masterMute = document.getElementById('masterMute'),
        $guitarMute = document.getElementById('guitarMute'),
        $masterVol = document.getElementById('masterVolume'),
        $guitarVol = document.getElementById('guitarVolume')

    $guitarMute.addEventListener('click', _ => reaper.toggleMute("Guitar"))
    $masterMute.addEventListener('click', _ => reaper.toggleMute("MASTER"))

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

    reaper.on('change', e => {
        let msg = null
        if (e.key === 'D_VOL') msg = `${e.tname} volume: ${e.val}`
        if (e.key === 'B_MUTE') msg = `${e.tname} ${e.val === 0 ? 'unmuted' : 'muted'}`
        if (e.key === 'D_PAN') msg = `${e.tname} is panned ${e.val === 0 ? 'center' : e.val > 0.0 ? 'right' : 'left'}`
        if (e.type === 'fxPresetActive') msg = `${e.tname} loaded preset: ${e.prename}`
        if (e.type === 'fxParamVal') msg = `${e.fxname} ${e.fxpname} is: ${e.val}`
        if (e.type === 'fxParamVal' && e.fxpname === 'Bypass') msg = `${e.fxname} is ${e.val === 0 ? 'ON' : 'OFF'}`
        if (e.fxpname && e.fxpname.includes('Semitones')) msg = `Transpose amount: ${(e.val - 0.5) / (1/128)}`
        if (msg) document.getElementById("events").innerHTML = msg
    })

    reaper.on('ready', () => {
        const yaml = YAML.stringify(reaper.project)
        console.log("Loaded project:\n", yaml)
        document.querySelector("pre").innerHTML = yaml
    })
})
