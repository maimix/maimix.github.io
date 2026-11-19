(function (global) {
  "use strict";

  const MUTE_KEY = "pomelo_sound_muted";

  let actx = null;
  let muted = false;
  let lastSwingTime = 0;

  // 缓存一段可复用的白噪声 Buffer，减少高频触发时的 GC 开销
  let sharedNoiseBuf = null;

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
      if (actx && !sharedNoiseBuf) {
        const len = actx.sampleRate * 1.0;
        sharedNoiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        const ch = sharedNoiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          ch[i] = Math.random() * 2 - 1;
        }
      }
    } catch (e) {}
  }

  function getNoiseSlice(durationSec) {
    if (!actx || !sharedNoiseBuf) return null;
    const maxOffset = Math.max(1, sharedNoiseBuf.length - Math.ceil(actx.sampleRate * durationSec) - 1);
    const offset = Math.floor(Math.random() * maxOffset);
    const src = actx.createBufferSource();
    src.buffer = sharedNoiseBuf;
    return { src, offset, duration: durationSec };
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

  /**
   * 刀痕破风声：气流底噪 + 高速刃锋啸叫
   * @param {number} speed 滑动速度（建议范围约 5 ~ 60）
   */
  function playSwing(speed = 15) {
    if (muted) return;
    const now = performance.now();
    if (now - lastSwingTime < 85) return;
    lastSwingTime = now;

    try {
      initAudio();
      if (!actx) return;

      const t = actx.currentTime;
      const normSpeed = Math.min(1, Math.max(0.1, speed / 40));
      const dur = 0.11 + normSpeed * 0.06; // 约 0.11s ~ 0.17s
      const jitter = 0.92 + Math.random() * 0.16;

      // 1. 主气流层（带通扫频，模拟空气被推开）
      const air = getNoiseSlice(dur);
      if (air) {
        const airFilter = actx.createBiquadFilter();
        airFilter.type = "bandpass";
        airFilter.Q.value = 1.6 + normSpeed * 1.4;

        const startF = (320 + normSpeed * 420) * jitter;
        const peakF = (1100 + normSpeed * 1650) * jitter;
        const endF = (450 + normSpeed * 500) * jitter;

        airFilter.frequency.setValueAtTime(startF, t);
        airFilter.frequency.exponentialRampToValueAtTime(peakF, t + dur * 0.45);
        airFilter.frequency.exponentialRampToValueAtTime(endF, t + dur);

        const airGain = actx.createGain();
        const peakVol = 0.08 + normSpeed * 0.14;
        airGain.gain.setValueAtTime(0.001, t);
        airGain.gain.linearRampToValueAtTime(peakVol, t + dur * 0.35);
        airGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        air.src.connect(airFilter);
        airFilter.connect(airGain);
        airGain.connect(actx.destination);
        air.src.start(t, air.offset, dur);
      }

      // 2. 高速刃风啸叫层（速度较快时增强“刀锋破空”感）
      if (normSpeed > 0.28) {
        const edgeDur = dur * 0.75;
        const edge = getNoiseSlice(edgeDur);
        if (edge) {
          const edgeFilter = actx.createBiquadFilter();
          edgeFilter.type = "bandpass";
          edgeFilter.Q.value = 5.5;

          const f0 = (1800 + normSpeed * 1800) * jitter;
          edgeFilter.frequency.setValueAtTime(f0 * 0.75, t);
          edgeFilter.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + edgeDur * 0.5);
          edgeFilter.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + edgeDur);

          const edgeGain = actx.createGain();
          const edgeVol = (normSpeed - 0.25) * 0.13;
          edgeGain.gain.setValueAtTime(0.001, t);
          edgeGain.gain.linearRampToValueAtTime(edgeVol, t + edgeDur * 0.3);
          edgeGain.gain.exponentialRampToValueAtTime(0.001, t + edgeDur);

          edge.src.connect(edgeFilter);
          edgeFilter.connect(edgeGain);
          edgeGain.connect(actx.destination);
          edge.src.start(t, edge.offset, edgeDur);
        }
      }
    } catch (e) {}
  }

  /**
   * 切开水果音效：瞬态脆裂 + 汁水撕裂 + 连击音阶反馈
   * @param {number} combo 连击数
   * @param {boolean} isSpecial 是否特殊水果/道具
   * @param {string} [fruitType] 可选水果类型（如 "pomelo" | "citrus" | "melon" | "berry"）
   */
  function playSlice(combo = 1, isSpecial = false, fruitType = "default") {
    if (muted) return;
    try {
      initAudio();
      if (!actx) return;

      const t = actx.currentTime;
      const jitter = 0.94 + Math.random() * 0.12;

      // 根据水果类型微调音色倾向（柚子/柑橘偏清脆多汁，瓜类偏厚实脆裂）
      let juicyCenter = 2400;
      let snapPitch = 2800;
      if (fruitType === "pomelo" || fruitType === "citrus") {
        juicyCenter = 2750;
        snapPitch = 3200;
      } else if (fruitType === "melon") {
        juicyCenter = 1850;
        snapPitch = 2200;
      }

      // 1. 瞬态入刀脆响（模拟刀刃劈开表皮/果肉的瞬间 "Snap"）
      const snapDur = 0.035;
      const snap = getNoiseSlice(snapDur);
      if (snap) {
        const hp = actx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(snapPitch * jitter, t);

        const peak = actx.createBiquadFilter();
        peak.type = "peaking";
        peak.frequency.setValueAtTime((snapPitch * 1.25) * jitter, t);
        peak.Q.value = 3.0;
        peak.gain.setValueAtTime(7, t);

        const snapGain = actx.createGain();
        snapGain.gain.setValueAtTime(isSpecial ? 0.34 : 0.28, t);
        snapGain.gain.exponentialRampToValueAtTime(0.001, t + snapDur);

        snap.src.connect(hp);
        hp.connect(peak);
        peak.connect(snapGain);
        snapGain.connect(actx.destination);
        snap.src.start(t, snap.offset, snapDur);
      }

      // 2. 果肉撕裂与汁水飞溅层（带通滤波 + 轻微包络起伏，模拟爆汁感）
      const splashDur = isSpecial ? 0.22 : 0.16;
      const splash = getNoiseSlice(splashDur);
      if (splash) {
        const bp = actx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 2.2;
        bp.frequency.setValueAtTime((juicyCenter * 1.25) * jitter, t);
        bp.frequency.exponentialRampToValueAtTime((juicyCenter * 0.65) * jitter, t + splashDur);

        // 用低频正弦 LFO 轻微调制滤波/增益，模拟汁水溅射的颗粒感
        const lfo = actx.createOscillator();
        const lfoGain = actx.createGain();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(38 + Math.random() * 18, t);
        lfoGain.gain.setValueAtTime(350, t);
        lfo.connect(lfoGain);
        lfoGain.connect(bp.frequency);

        const splashGain = actx.createGain();
        splashGain.gain.setValueAtTime(0.001, t);
        splashGain.gain.linearRampToValueAtTime(isSpecial ? 0.28 : 0.22, t + 0.015);
        splashGain.gain.exponentialRampToValueAtTime(0.001, t + splashDur);

        splash.src.connect(bp);
        bp.connect(splashGain);
        splashGain.connect(actx.destination);

        lfo.start(t);
        lfo.stop(t + splashDur);
        splash.src.start(t, splash.offset, splashDur);
      }

      // 3. 连击音阶反馈（保留原有爽感，略微收敛音量突出真实打击感）
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
      const baseFreq = scale[Math.min(Math.max(combo - 1, 0), scale.length - 1)] * (isSpecial ? 1.25 : 1);

      const osc = actx.createOscillator();
      const og = actx.createGain();
      osc.type = isSpecial ? "triangle" : "sine";
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, t + 0.14);

      og.gain.setValueAtTime(0.001, t);
      og.gain.linearRampToValueAtTime(0.14, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(og);
      og.connect(actx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
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
      osc.start(t);
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
