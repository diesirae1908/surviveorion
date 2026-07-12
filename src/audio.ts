/** Music tracks backed by looping audio files. */
type FileTrack = "menu" | "game" | "gameover";
/** "tutorial" is synthesized live (chill ambient loop), the rest are files. */
export type TrackName = FileTrack | "tutorial";

/**
 * Procedural Web Audio SFX + per-screen looping music tracks. Everything
 * routes through a master gain so the sound toggle is instant.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private thrustGain: GainNode | null = null;
  private tracks: Record<FileTrack, HTMLAudioElement>;
  private current: TrackName | null = null;
  // generated tutorial music (independent of the SFX chain so the Sound
  // toggle doesn't mute it — it obeys the Music toggle like the file tracks)
  private tutorialGain: GainNode | null = null;
  private tutorialTimer: number | null = null;

  soundEnabled = true;
  musicEnabled = true;

  constructor() {
    const load = (file: string, volume: number): HTMLAudioElement => {
      const a = new Audio(`${import.meta.env.BASE_URL}music/${file}`);
      a.loop = true;
      a.volume = volume;
      a.preload = "auto";
      return a;
    };
    this.tracks = {
      menu: load("empire-of-the-stars.mp3", 0.45),
      game: load("empire-of-the-stars-battle.mp3", 0.35),
      gameover: load("fallen-honor.mp3", 0.4),
    };
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.buildThrustLoop();
      this.applySoundSetting();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setSound(on: boolean): void {
    this.soundEnabled = on;
    this.applySoundSetting();
  }

  setMusic(on: boolean): void {
    this.musicEnabled = on;
    if (!on) {
      for (const t of Object.values(this.tracks)) t.pause();
      this.stopTutorialMusic();
    } else {
      this.resumeMusic();
    }
  }

  /** Switch to a screen's track (restarts it unless it's already current). */
  playTrack(name: TrackName): void {
    if (this.current !== name) {
      for (const t of Object.values(this.tracks)) t.pause();
      this.stopTutorialMusic();
      if (name !== "tutorial") this.tracks[name].currentTime = 0;
      this.current = name;
    }
    this.resumeMusic();
  }

  /** Resume the current track (e.g. unpausing) without restarting it. */
  resumeMusic(): void {
    if (!this.musicEnabled || !this.current) return;
    if (this.current === "tutorial") this.startTutorialMusic();
    else void this.tracks[this.current].play().catch(() => {});
  }

  pauseMusic(): void {
    if (this.current === "tutorial") this.stopTutorialMusic();
    else if (this.current) this.tracks[this.current].pause();
  }

  private applySoundSetting(): void {
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.soundEnabled ? 1 : 0, this.ctx.currentTime);
    }
  }

  // --- tutorial music: generated chill-epic ambient loop ---
  //
  // Slow pads over an Am9 → Fmaj7 → Cmaj7 → Gsus progression with a deep
  // bass drone and a sparse plucked arpeggio — calm enough to read the
  // lessons, epic enough to still feel like Orion.

  private startTutorialMusic(): void {
    if (!this.ctx || !this.master || this.tutorialGain) return;
    this.tutorialGain = this.ctx.createGain();
    this.tutorialGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.tutorialGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    this.tutorialGain.connect(this.master);
    this.scheduleTutorialCycle(this.ctx.currentTime + 0.1);
  }

  private stopTutorialMusic(): void {
    if (this.tutorialTimer !== null) {
      clearTimeout(this.tutorialTimer);
      this.tutorialTimer = null;
    }
    if (this.tutorialGain && this.ctx) {
      const g = this.tutorialGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      setTimeout(() => g.disconnect(), 800);
      this.tutorialGain = null;
    }
  }

  /** One voice of the tutorial loop, routed through the tutorial bus. */
  private tutorialVoice(
    freq: number,
    t0: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    attack: number,
    detune = 0,
  ): void {
    if (!this.ctx || !this.tutorialGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.setValueAtTime(peak, t0 + Math.max(attack, duration - 0.9));
    gain.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(gain).connect(this.tutorialGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** Schedule one 16s pass of the progression, then chain the next. */
  private scheduleTutorialCycle(t0: number): void {
    if (!this.ctx || !this.tutorialGain) return;
    const CHORD_SECONDS = 4;
    // [bass root, ...pad tones] per chord
    const chords: number[][] = [
      [55, 220, 261.63, 329.63, 493.88], // Am9
      [43.65, 174.61, 220, 261.63, 329.63], // Fmaj7
      [65.41, 261.63, 329.63, 392, 493.88], // Cmaj7
      [49, 196, 246.94, 293.66, 392], // Gsus feel
    ];

    chords.forEach((chord, i) => {
      const tc = t0 + i * CHORD_SECONDS;
      const [bass, ...pad] = chord;
      // deep drone an octave under the pad
      this.tutorialVoice(bass, tc, CHORD_SECONDS + 0.4, "sine", 0.09, 1.2);
      // slow pads, gently detuned pairs for width
      for (const f of pad) {
        this.tutorialVoice(f, tc, CHORD_SECONDS + 0.4, "sine", 0.028, 1.6, -4);
        this.tutorialVoice(f, tc, CHORD_SECONDS + 0.4, "triangle", 0.012, 1.6, 4);
      }
      // sparse pluck arpeggio an octave up — the "epic" glimmer
      const arp = [pad[0] * 2, pad[2] * 2, pad[1] * 2, pad[2] * 2];
      arp.forEach((f, k) => {
        this.tutorialVoice(f, tc + 0.6 + k * 0.85, 0.8, "triangle", 0.035, 0.02);
      });
      // one high shimmer swell per chord
      this.tutorialVoice(pad[1] * 4, tc + 1, CHORD_SECONDS - 1, "sine", 0.008, 1.4);
    });

    const cycle = chords.length * CHORD_SECONDS;
    const delayMs = Math.max(500, (t0 + cycle - this.ctx.currentTime - 1) * 1000);
    this.tutorialTimer = window.setTimeout(() => {
      this.scheduleTutorialCycle(t0 + cycle);
    }, delayMs);
  }

  // --- continuous thruster rumble ---

  private buildThrustLoop(): void {
    if (!this.ctx || !this.sfxGain) return;
    const noise = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;

    this.thrustGain = this.ctx.createGain();
    this.thrustGain.gain.value = 0;

    noise.connect(filter).connect(this.thrustGain).connect(this.sfxGain);
    noise.start();
  }

  /** level 0..1. */
  setThrustLevel(level: number): void {
    if (!this.thrustGain || !this.ctx) return;
    this.thrustGain.gain.setTargetAtTime(level * 0.18, this.ctx.currentTime, 0.06);
  }

  // --- one-shot SFX helpers ---

  private tone(
    freqFrom: number,
    freqTo: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private noiseBurst(duration: number, volume: number, filterFreq: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const len = Math.ceil(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t0);
  }

  pickup(): void {
    this.tone(660, 990, 0.12, "sine", 0.25);
    this.tone(990, 1320, 0.14, "sine", 0.2, 0.08);
  }

  shieldUp(): void {
    this.tone(330, 880, 0.4, "sine", 0.2);
  }

  starshellUp(): void {
    // heroic rising fifth: the "you are the weapon now" fanfare
    this.tone(440, 1320, 0.5, "sine", 0.22);
    this.tone(660, 1980, 0.35, "triangle", 0.12);
  }

  shieldDetonate(): void {
    this.noiseBurst(0.5, 0.5, 1600);
    this.tone(220, 55, 0.5, "sawtooth", 0.25);
  }

  shockwave(): void {
    this.noiseBurst(0.6, 0.5, 900);
    this.tone(110, 40, 0.6, "sine", 0.4);
  }

  pulseCharge(duration: number): void {
    this.tone(180, 720, duration, "square", 0.06);
  }

  pulseFire(): void {
    this.tone(880, 220, 0.3, "sawtooth", 0.25);
    this.noiseBurst(0.15, 0.2, 3000);
  }

  droneKill(): void {
    this.noiseBurst(0.25, 0.25, 2200);
  }

  dash(): void {
    this.noiseBurst(0.4, 0.4, 2600);
    this.tone(180, 640, 0.35, "sawtooth", 0.22);
  }

  freeze(): void {
    this.tone(1400, 350, 0.55, "sine", 0.2);
    this.tone(2100, 900, 0.45, "triangle", 0.1, 0.05);
  }

  missilesFire(): void {
    // staggered whooshes for the volley
    this.tone(500, 1500, 0.25, "sawtooth", 0.1);
    this.tone(450, 1350, 0.25, "sawtooth", 0.08, 0.07);
    this.tone(550, 1600, 0.25, "sawtooth", 0.08, 0.14);
  }

  autocannonFire(): void {
    // quick metallic pew, quiet enough to spam at 4/sec
    this.tone(1250, 420, 0.07, "square", 0.09);
    this.noiseBurst(0.05, 0.06, 5200);
  }

  meteorStrike(): void {
    this.noiseBurst(0.3, 0.3, 950);
    this.tone(150, 45, 0.32, "sine", 0.24);
  }

  vortexOpen(): void {
    // descending swallow: something heavy just tore open
    this.tone(520, 90, 0.6, "sine", 0.18);
    this.tone(260, 55, 0.8, "triangle", 0.12, 0.1);
  }

  vortexCollapse(): void {
    this.noiseBurst(0.55, 0.5, 750);
    this.tone(75, 26, 0.65, "sine", 0.4);
    this.tone(600, 1400, 0.25, "sine", 0.1, 0.05);
  }

  arcZap(): void {
    this.noiseBurst(0.12, 0.08, 4200);
    this.tone(880, 220, 0.08, "square", 0.18);
    this.tone(1320, 660, 0.06, "sine", 0.1, 0.02);
  }

  arcFizzle(): void {
    this.tone(420, 180, 0.15, "sine", 0.08);
    this.noiseBurst(0.08, 0.1, 1800);
  }

  /** Ominous two-note warning when a ring closes in around the player. */
  ringWarning(): void {
    this.tone(220, 180, 0.22, "square", 0.12);
    this.tone(165, 140, 0.3, "square", 0.12, 0.18);
  }

  chainBonus(): void {
    this.tone(523, 784, 0.1, "sine", 0.2);
    this.tone(784, 1047, 0.12, "sine", 0.2, 0.08);
    this.tone(1047, 1568, 0.18, "sine", 0.18, 0.16);
  }

  /** Mid-run personal-best fanfare: a bright rising major arpeggio + shimmer. */
  newRecord(): void {
    this.tone(523, 523, 0.14, "sine", 0.22);
    this.tone(659, 659, 0.14, "sine", 0.22, 0.1);
    this.tone(784, 784, 0.16, "sine", 0.22, 0.2);
    this.tone(1047, 1568, 0.4, "sine", 0.2, 0.3);
    this.tone(2093, 3136, 0.3, "triangle", 0.08, 0.32);
  }

  mineBoom(): void {
    this.noiseBurst(0.5, 0.55, 700);
    this.tone(90, 32, 0.55, "sine", 0.4);
  }

  death(): void {
    this.noiseBurst(1.1, 0.7, 1200);
    this.tone(160, 30, 1.0, "sawtooth", 0.35);
  }

  /**
   * Boot-cinematic score: a rising hyperspace swell that detonates into a
   * cinematic braam (low brass-style stack + sub thump) with a shimmer tail.
   * `hitAt` is when the title slams in, seconds from now.
   */
  intro(duration: number, hitAt: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;

    // swelling noise riser into the hit
    const src = this.ctx.createBufferSource();
    const len = Math.ceil(this.ctx.sampleRate * (hitAt + 0.3));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(i / len, 1.6);
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(140, t0);
    filter.frequency.exponentialRampToValueAtTime(2800, t0 + hitAt);
    const riserGain = this.ctx.createGain();
    riserGain.gain.setValueAtTime(0.0001, t0);
    riserGain.gain.exponentialRampToValueAtTime(0.5, t0 + hitAt);
    riserGain.gain.exponentialRampToValueAtTime(0.0001, t0 + hitAt + 0.3);
    src.connect(filter).connect(riserGain).connect(this.sfxGain);
    src.start(t0);

    // tension riser tones underneath
    this.tone(40, 220, hitAt, "sawtooth", 0.12);
    this.tone(160, 880, hitAt, "sine", 0.05, hitAt * 0.35);

    // THE BRAAM: detuned low sawtooth stack + sub-bass thump
    const braamLen = Math.min(2.2, duration - hitAt);
    for (const [freq, vol] of [
      [55, 0.22],
      [55.8, 0.18],
      [82.5, 0.12],
      [110, 0.08],
    ] as const) {
      this.tone(freq, freq * 0.94, braamLen, "sawtooth", vol, hitAt);
    }
    this.tone(38, 30, 1.1, "sine", 0.5, hitAt);

    // shimmer tail: high sparkle settling as the tagline appears
    this.tone(1760, 880, 1.6, "sine", 0.05, hitAt + 0.25);
    this.tone(2637, 1319, 1.9, "sine", 0.035, hitAt + 0.45);
  }

  /** Rising hyperspace surge for the launch warp. */
  warp(duration: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;

    // swelling noise pushed through a rising bandpass
    const src = this.ctx.createBufferSource();
    const len = Math.ceil(this.ctx.sampleRate * (duration + 0.5));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.min(1, (i / len) * 1.6);
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(180, t0);
    filter.frequency.exponentialRampToValueAtTime(3400, t0 + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.45, t0 + duration * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.45);

    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t0);

    // deep riser underneath + a shimmer on top
    this.tone(48, 340, duration, "sawtooth", 0.14);
    this.tone(220, 1760, duration, "sine", 0.07, duration * 0.25);
  }
}
