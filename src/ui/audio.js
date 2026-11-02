/** Live Web Audio synthesis. No audio files. */

const SCALE = [220, 261.63, 293.66, 329.63, 392];
const MELODY = [0, 2, 4, 2, 3, 4, 2, 0, 1, 2, 4, 3, 2, 1, 0, 2];
const BASS = [0, 0, 3, 0, 4, 4, 2, 0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let volume = 0.7;
  let themeOn = false;
  let unlocked = false;
  let nextNote = 0;
  let stepIndex = 0;

  function ensure() {
    if (!unlocked) return null;
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type, peak, when) {
    if (!ensure() || muted) return;
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * volume), t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise(dur, peak) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = (Math.floor(t * 1000) % 100000) + 17;
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + dur);
  }

  function play(type) {
    if (type === "jump") tone(540, 0.1, "square", 0.12);
    else if (type === "strike") {
      noise(0.08, 0.18);
      tone(160, 0.12, "sawtooth", 0.08);
    } else if (type === "hit" || type === "shuriken") noise(0.1, 0.22);
    else if (type === "throw") tone(780, 0.07, "square", 0.07);
    else if (type === "pickup") {
      tone(660, 0.08, "square", 0.08);
      tone(880, 0.12, "square", 0.07);
    } else if (type === "ko") {
      tone(320, 0.12, "sawtooth", 0.08);
      tone(140, 0.32, "triangle", 0.1);
    } else if (type === "drop") tone(240, 0.1, "square", 0.05);
    else if (type === "roundstart") {
      tone(523, 0.1, "square", 0.08);
      tone(659, 0.1, "square", 0.08, ensure() ? ctx.currentTime + 0.12 : undefined);
      tone(784, 0.16, "square", 0.09, ensure() ? ctx.currentTime + 0.24 : undefined);
    } else if (type === "round" || type === "match") {
      tone(523, 0.12, "square", 0.09);
      tone(659, 0.14, "square", 0.09, ensure() ? ctx.currentTime + 0.12 : undefined);
      tone(784, 0.28, "triangle", 0.1, ensure() ? ctx.currentTime + 0.24 : undefined);
    }
  }

  function tickTheme() {
    if (!themeOn || !ensure()) return;
    const now = ctx.currentTime;
    if (!nextNote) nextNote = now + 0.05;
    let guard = 0;
    while (nextNote < now + 0.25 && guard++ < 8) {
      if (!muted) {
        const note = MELODY[stepIndex % MELODY.length];
        const bass = BASS[Math.floor(stepIndex / 2) % BASS.length];
        tone(SCALE[note] * 2, 0.15, "square", 0.045, nextNote);
        if (stepIndex % 2 === 0) tone(SCALE[bass] / 2, 0.28, "triangle", 0.06, nextNote);
      }
      nextNote += 0.18;
      stepIndex += 1;
    }
  }

  return {
    unlock() {
      unlocked = true;
      const context = ensure();
      if (context && context.state === "suspended") context.resume();
    },
    play,
    tickTheme,
    startTheme() {
      themeOn = true;
      nextNote = 0;
    },
    stopTheme() {
      themeOn = false;
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      if (master && !muted) master.gain.value = volume;
    },
    setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : volume;
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
