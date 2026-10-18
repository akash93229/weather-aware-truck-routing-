/**
 * Procedural ambient storm sound engine using Web Audio API.
 * Synthesizes continuous filtered brown/pink noise (rain + wind) and
 * intermittent low-frequency rumble thunder bursts with randomized timing.
 * Master gain: 0.35 with 1.2s fade-in / fade-out. Zero external files or dependencies.
 */

export function createAmbientAudioEngine() {
  let audioCtx = null;
  let masterGain = null;
  let isPlaying = false;
  let thunderTimeout = null;
  let noiseNode = null;

  function initContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function createNoiseBuffer(ctx, durationSec = 5) {
    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;

    // Pink / Brown noise filter for natural rain texture
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.025 * white) / 1.025;
      data[i] = lastOut * 3.5;
    }
    return buffer;
  }

  function triggerThunder(ctx, targetNode) {
    if (!isPlaying || !ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Deep rumble pitch: 45Hz down to 22Hz
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(48, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 3.2);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(90, now);
      filter.frequency.linearRampToValueAtTime(40, now + 3.5);

      oscGain.gain.setValueAtTime(0.001, now);
      oscGain.gain.linearRampToValueAtTime(0.28, now + 0.35);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(targetNode);

      osc.start(now);
      osc.stop(now + 4.0);
    } catch {
      // Ignore audio synthesis errors
    }

    // Schedule next thunder in 8-20 seconds with random jitter
    const nextIntervalMs = 8000 + Math.random() * 12000;
    thunderTimeout = setTimeout(() => {
      if (isPlaying && audioCtx) {
        triggerThunder(audioCtx, targetNode);
      }
    }, nextIntervalMs);
  }

  function start() {
    if (isPlaying) return;
    const ctx = initContext();
    if (!ctx) return;

    isPlaying = true;

    masterGain = ctx.createGain();
    const now = ctx.currentTime;
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.35, now + 1.2); // 1.2s smooth fade in
    masterGain.connect(ctx.destination);

    // Continuous Rain/Wind Noise
    const rainBuffer = createNoiseBuffer(ctx, 4);
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = rainBuffer;
    noiseNode.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.setValueAtTime(650, now);
    rainFilter.Q.setValueAtTime(1.1, now);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.65, now);

    noiseNode.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(masterGain);

    noiseNode.start(now);

    // Start intermittent thunder
    triggerThunder(ctx, masterGain);
  }

  function stop() {
    if (!isPlaying) return;
    isPlaying = false;

    if (thunderTimeout) {
      clearTimeout(thunderTimeout);
      thunderTimeout = null;
    }

    if (audioCtx && masterGain) {
      try {
        const now = audioCtx.currentTime;
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.2); // 1.2s fade out

        setTimeout(() => {
          if (noiseNode) {
            try {
              noiseNode.stop();
              noiseNode.disconnect();
            } catch {}
            noiseNode = null;
          }
          if (masterGain) {
            try {
              masterGain.disconnect();
            } catch {}
            masterGain = null;
          }
        }, 1300);
      } catch {
        // Fallback immediate stop
        if (noiseNode) {
          try { noiseNode.stop(); } catch {}
          noiseNode = null;
        }
      }
    }
  }

  function close() {
    stop();
    if (audioCtx) {
      try {
        audioCtx.close().catch(() => {});
      } catch {}
      audioCtx = null;
    }
  }

  return {
    start,
    stop,
    close,
    isRunning: () => isPlaying,
  };
}
