export type TrackName = "menu" | "game" | "gameover";

/**
 * Procedural Web Audio SFX + per-screen looping music tracks. Everything
 * routes through a master gain so the sound toggle is instant.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private thrustGain: GainNode | null = null;
  private tracks: Record<TrackName, HTMLAudioElement>;
  private current: TrackName | null = null;

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
    } else {
      this.resumeMusic();
    }
  }

  /** Switch to a screen's track (restarts it unless it's already current). */
  playTrack(name: TrackName): void {
    if (this.current !== name) {
      for (const t of Object.values(this.tracks)) t.pause();
      this.tracks[name].currentTime = 0;
      this.current = name;
    }
    this.resumeMusic();
  }

  /** Resume the current track (e.g. unpausing) without restarting it. */
  resumeMusic(): void {
    if (this.musicEnabled && this.current) {
      void this.tracks[this.current].play().catch(() => {});
    }
  }

  pauseMusic(): void {
    if (this.current) this.tracks[this.current].pause();
  }

  private applySoundSetting(): void {
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.soundEnabled ? 1 : 0, this.ctx.currentTime);
    }
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

  /** level 0..1, boosting raises pitch/volume. */
  setThrustLevel(level: number, boosting: boolean): void {
    if (!this.thrustGain || !this.ctx) return;
    const target = level * (boosting ? 0.4 : 0.18);
    this.thrustGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
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

  boostStart(): void {
    this.tone(140, 420, 0.35, "sawtooth", 0.12);
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

  mineBoom(): void {
    this.noiseBurst(0.5, 0.55, 700);
    this.tone(90, 32, 0.55, "sine", 0.4);
  }

  death(): void {
    this.noiseBurst(1.1, 0.7, 1200);
    this.tone(160, 30, 1.0, "sawtooth", 0.35);
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
