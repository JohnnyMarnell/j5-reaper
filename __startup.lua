----------------------------------------------------------------------------------------
-- Global / init
----------------------------------------------------------------------------------------
reaper.gmem_attach("j5")
LOG_ENABLED = false
LOG_UNKNOWN_ACTIONS = true
g_numMessages = 0

-- Global shared mammary addressticles, LUA + JSFX constants block:
G_IN_BUF_SIZE = 8 * 1024;
G_OUT_BUF_SIZE = 128 * 1024;
gp_freeGlobalMem = 0;
gp_input_start    = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + 1;
gp_input_end      = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + 1;
gp_input_data     = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + G_IN_BUF_SIZE;
gp_output_start   = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + 1;
gp_output_end     = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + 1;
gp_output_data    = gp_freeGlobalMem ; gp_freeGlobalMem = gp_freeGlobalMem + G_OUT_BUF_SIZE;

----------------------------------------------------------------------------------------
-- Reaper project modify / actions, and broadcast consequence / output
----------------------------------------------------------------------------------------
function handleAction(str)
  local tokens = {}, repl, times
  for token in string.gmatch(str, "[^%s]+") do
    repl, times = token:gsub("\\", " ")
    table.insert(tokens, repl)
  end
  if     (tokens[1] == 'tempo') then setTempo(tonumber(tokens[2]))
  elseif (tokens[1] == 'tval')  then setTrackValue(tonumber(tokens[2]), tokens[3], tokens[4])
  elseif (tokens[1] == 'sval')  then setSendValue(tonumber(tokens[2]), tonumber(tokens[3]), tokens[4], tokens[5])
  elseif (tokens[1] == 'fxp')   then setFxParam(tonumber(tokens[2]), tonumber(tokens[3]), tonumber(tokens[4]), tokens[5])
  elseif (tokens[1] == 'fxpre') then loadFxPreset(tonumber(tokens[2]), tonumber(tokens[3]), tonumber(tokens[4]))
  elseif (tokens[1] == 'info')  then sendProjectInfo()
  elseif (LOG_UNKNOWN_ACTIONS)  then error("UNKNOWN ACTION", str)
  end
end

function setTempo(bpm)
  local position = reaper.GetPlayPosition()
  reaper.SetCurrentBPM(0, bpm, false)
  reaper.SetTempoTimeSigMarker(0, -1, position, -1, -1, bpm, 4, 4, false)
  out("tempo", {bpm = bpm, pos = position})
end
function setTrackValue(tid, key, val)
  val = toggleable(val, reaper.GetMediaTrackInfo_Value(getTrack(tid), key))
  reaper.SetMediaTrackInfo_Value(getTrack(tid), key, val)
  out("trackVal", {tid = tid, key = key, val = val})
end
function setFxParam(tid, fxid, pid, val)
  val = toggleable(val, reaper.TrackFX_GetParamNormalized(getTrack(tid), fxid, pid))
  reaper.TrackFX_SetParamNormalized(getTrack(tid), fxid, pid, val)
  out("fxParamVal", {tid = tid, fxid = fxid, fxpid = pid, val = val})
end
function loadFxPreset(tid, fxid, preid)
  reaper.TrackFX_SetPresetByIndex(getTrack(tid), fxid, preid)
  local _, prename = reaper.TrackFX_GetPreset(getTrack(tid), fxid)
  out("fxPresetActive", {tid = tid, fxid = fxid, preid = preid, prename = prename})
end
function setSendValue(tid, sid, key, val)
  val = toggleable(val, reaper.GetTrackSendInfo_Value(getTrack(tid), 0, sid, key))
  reaper.SetTrackSendInfo_Value(getTrack(tid), 0, sid, key, val)
  out("sendVal", {tid = tid, sid = sid, key = key, val = newVal})
end
function getTrack(tid)
  if tid == -1 then return reaper.GetMasterTrack(0) else return reaper.GetTrack(0, tid) end
end

-- serialize and send basically all the project info
function sendProjectInfo()
  local TRACK_INFO = {'D_VOL', 'B_MUTE', 'D_PAN'}
  local SEND_INFO = {'D_VOL', 'B_MUTE', 'D_PAN'}

  out("infoStart", {})
  for tid = -1, reaper.CountTracks(0) - 1 do
    local track, val = getTrack(tid)
    local retval1, tname, name, preid, apreid, aloaded, aname, count, _ = reaper.GetTrackName(track)
    out("track", {tid = tid, tname = tname})
    for fxid = 0, reaper.TrackFX_GetCount(track) - 1 do
      local retval2, fname = reaper.TrackFX_GetFXName(track, fxid)
      out("fx", {tid = tid, fxid = fxid, fxname = fname})
      for pid = 0, reaper.TrackFX_GetNumParams(track, fxid) - 1 do
        local retval3, pname = reaper.TrackFX_GetParamName(track, fxid, pid)
        val = reaper.TrackFX_GetParamNormalized(track, fxid, pid)
        out("fxParam", {tid = tid, fxid = fxid, fxpid = pid, fxpname = pname, val = val})
      end
      -- Boy the preset API seems janky...
      aloaded, aname = reaper.TrackFX_GetPreset(track, fxid)
      apreid, count = reaper.TrackFX_GetPresetIndex(track, fxid)
      reaper.Undo_BeginBlock2(0)
      for preid = 0, count - 1 do
        reaper.TrackFX_SetPresetByIndex(track, fxid, preid)
        _, name = reaper.TrackFX_GetPreset(track, fxid)
        if _ ~= true then reaper.MB("FX Preset error", "error", 1) end
        out("fxPreset", {tid = tid, fxid = fxid, preid = preid, prename = name})
      end
      reaper.Undo_EndBlock2(0, "Boy the preset API seems janky...", 2) -- track FX flag == 2
      reaper.Undo_DoUndo2(0)
      if aloaded == true and apreid ~= -1 and aname ~= "" then
        out("fxPresetActive", {tid = tid, fxid = fxid, preid = apreid, prename = aname})
      end
    end
    for i,key in pairs(TRACK_INFO) do
        val = reaper.GetMediaTrackInfo_Value(track, key)
        out("trackVal", {tid = tid, key = key, val = val })
    end
    for sid = 0, reaper.GetTrackNumSends(track, 0) - 1 do
      local retval7, sname = reaper.GetTrackSendName(track, sid)
      out("send", {tid = tid, sid = sid, sname = sname})
      for i,key in pairs(SEND_INFO) do
        val = reaper.GetTrackSendInfo_Value(track, 0, sid, key)
        out("sendVal", {tid = tid, sid = sid, key = key, val = val})
      end
    end
  end
  out("infoEnd", {})
end

-- Allow special value "TOGGLE" to ...toggle things
function toggleable(specified, current)
  if (specified == "TOGGLE") then
    if (current == 0.0 or current == nil) then return 1.0
    elseif (current == 1.0) then return 0.0
    elseif (current == false) then return true
    elseif (current == true) then return false
    else error("Can't toggle param val from:", current) ; return nil
    end
  elseif (specified == "false") then return false
  elseif (specified == "true") then return true
  else
    local numVal = tonumber(specified)
    if (numVal == nil) then error("Can't handle value:", specified) end
    return numVal
  end
end

----------------------------------------------------------------------------------------
-- Main process loop and behaviors, read inputs / commands from, and write outputs to
-- shared global gmem, TCP Bridge EEL script acts as I/O layer
----------------------------------------------------------------------------------------

-- main loop, on notify / run of this action, read the input message
-- received and written to shared mammary from EEL, and perform tasks
function handleInput()
  local inputStart, msg, numMsgs, msgs, nextByte, nextChar = reaper.gmem_read(gp_input_start), '', 0, {}
  local index = inputStart
  if (index ~= nil and index < reaper.gmem_read(gp_input_end)) then
    log("LUA IN: Reading", reaper.gmem_read(gp_input_end) - inputStart, "input bytes from", inputStart, "to", reaper.gmem_read(gp_input_end))
    while (index < reaper.gmem_read(gp_input_end)) do
      nextByte = reaper.gmem_read(gp_input_data + (index % G_IN_BUF_SIZE)) ; index = index + 1
      if nextByte == nil or nextByte < 0 or nextByte > 255 then
        error("LUA IN: Illegal character byte was read from global memory:", nextByte)
      else
        nextChar = string.char(nextByte)
        if (nextChar ~= '\n') then msg = msg .. nextChar
        else
          msgs[numMsgs] = msg
          numMsgs = numMsgs + 1
          msg = ''
          reaper.gmem_write(gp_input_start, index)
        end
      end
    end
    
    log("LUA IN: Finished reading input bytes", index - inputStart, "from", inputStart, "and advanced next read start to", index, ", will now perform", numMsgs, "actions")
    for i = 0, numMsgs - 1 do handleAction(msgs[i]) end
  end
end

-- Write output to shared memory and update index, EEL TCP bridge will read and send to client socket
function out(kind, msg)
  local index, json = reaper.gmem_read(gp_output_end), nil
  msg["type"] = kind
  json = serializeJson(msg)
  for c in json:gmatch"." do
    reaper.gmem_write(gp_output_data + (index % G_OUT_BUF_SIZE), string.byte(c)) ; index = index + 1
  end
  reaper.gmem_write(gp_output_data + (index % G_OUT_BUF_SIZE), string.byte('\n')) ; index = index + 1
  reaper.gmem_write(gp_output_end, index)
  if g_numMessages < 50 then log("out:", json)
  elseif g_numMessages == 50 then log("out: Truncating output logging this loop...") end
  g_numMessages = g_numMessages + 1
end

-- Basic unoptimized subset of, non bulletproof JSON, scalars, objects (Lua tables), arrays (Lua table 1-index keys)
function serializeJson(val)
  local valType, ARRAY, OBJECT, tableType, out = type(val), 1, 0, nil
  if (valType == "table") then
      for key,value in pairs(val) do
          if (tableType == nil) then
              if (type(key) == "string") then tableType = OBJECT ;  out = '{"' .. key .. '":' .. serializeJson(value)
              else tableType = ARRAY ;  out = '[' .. serializeJson(value) end
          elseif (tableType == OBJECT) then out = out .. ',"' .. key .. '":' .. serializeJson(value)
          else out = out .. ',' .. serializeJson(value) end
      end
      if (tableType == OBJECT) then out = out .. "}"
      elseif (tableType == ARRAY) then out = out .. "]"
      else out = "[]" end
      return out
  elseif (val == nil) then return 'null'
  elseif (valType == "string") then return '"' .. val .. '"'
  else return tostring(val) end
end

-- Easier log helper
function log(...)
  if (LOG_ENABLED ~= true) then return end
  local args, str = table.pack(...), ""
  for i = 1, args.n do
    str = str .. (args[i] == nil and "*nil*"
                  or type(args[i]) == "number" and string.format("%d", args[i])
                  or tostring(args[i])) .. " "
  end
  reaper.ShowConsoleMsg(str .. "\n")
end
function error(...)
  local old = LOG_ENABLED; LOG_ENABLED = true; log("\n\n\n *********");
  log(...); log("********* \n\n\n"); LOG_ENABLED = old;
end

-- Start main defer loop
function main()
  g_numMessages = 0
  handleInput()
  reaper.defer(main)
end
log("Lua bridge started, input range:", reaper.gmem_read(gp_input_start), reaper.gmem_read(gp_input_end))
main()
