(function (global) {
  "use strict";

  const MUTE_KEY = "pomelo_sound_muted";

  let actx = null;
  let muted = false;
  let lastSwingTime = 0;

  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {}

  function initAudio() {
    try {
      if (!actx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (AudioCtx) actx = new AudioCtx();
      }
      if (actx && actx.state === "suspended") {
        actx.resume();
      }
    } catch (e) {}
  }

  function isMuted() {
    return muted;
  }

  function setMuted(val) {
    muted = Boolean(val);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) {}
    if (!muted) initAudio();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function playSwing(speed = 15) {
    if (muted) return;
    const now = performance.now();
    if (now - lastSwingTime < 100) return;
    lastSwingTime = now;

    try {
      initAudio();
      if (!actx) return;
      const dur = 0.12;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI);
      }
      const src = actx.createBufferSource();
      const flt = actx.createBiquadFilter();
      const g = actx.createGain();

      src.buffer = buf;
      flt.type = "bandpass";
      flt.Q.value = 2.5;

      const baseF = Math.min(2000, 600 + speed * 25);
      flt.frequency.setValueAtTime(baseF * 0.5, actx.currentTime);
      flt.frequency.exponentialRampToValueAtTime(baseF * 1.4, actx.currentTime + dur);

      g.gain.setValueAtTime(0.12, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);

      src.connect(flt);
      flt.connect(g);
      g.connect(actx.destination);
      src.start();
    } catch (e) {}
  }

  function playSlice(combo = 1, isSpecial = false) {
    if (muted) return;
    try {
      initAudio();
      if (!actx) return;
      const t = actx.currentTime;

      const dur = 0.15;
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.04));
      }
      const src = actx.createBufferSource();
      const flt = actx.createBiquadFilter();
      const ng = actx.createGain();
      src.buffer = buf;
      flt.type = "highpass";
      flt.frequency.value = 1300;
      ng.gain.setValueAtTime(0.25, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(flt);
      flt.connect(ng);
      ng.connect(actx.destination);
      src.start();

      const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
      const freq = scale[Math.min(Math.max(combo - 1, 0), scale.length - 1)] * (isSpecial ? 1.25 : 1);
      const osc = actx.createOscillator();
      const og = actx.createGain();
      osc.type = isSpecial ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, t + 0.16);
      og.gain.setValueAtTime(0.2, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(og);
      og.connect(actx.destination);
      osc.start();
      osc.stop(t + 0.18);
    } catch (e) {}
  }

  function playBomb() {
    if (muted) return;
    try {
      initAudio();
      if (!actx) return;
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g);
      g.connect(actx.destination);
      osc.start();
      osc.stop(t + 0.42);
    } catch (e) {}
  }

  global.PomeloSound = {
    initAudio,
    isMuted,
    setMuted,
    toggleMute,
    playSwing,
    playSlice,
    playBomb
  };
})(window);