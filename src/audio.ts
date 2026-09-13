import { musicBedForActiveMutators } from "./mutators";

export {
  DEFAULT_GAME_TRACK,
  MUTATOR_GAME_TRACK,
  musicBedForActiveMutators,
  musicBedForMutator,
  musicBedForMutators,
} from "./mutators";

/** Music tracks backed by looping audio files. */
type StaticFileTrack = "menu" | "gameover" | "training";
/** "tutorial" aliases the Training Ground bed. */
export type TrackName = StaticFileTrack | "game" | "tutorial";

export const GAME_BED_VOLUME = 0.35;
export const GAMEOVER_TRACK = "imperial-procession.mp3";
export const GAMEOVER_VOLUME = 0.4;
export const TRAINING_TRACK = "training-ground.mp3";
export const TRAINING_VOLUME = 0.35;
export const PATROL_COMPLETE_TRACK = "patrol-complete.mp3";
/** One-shot sting. Master is quieter than the looping beds; 0.5 reads over them. */
export const PATROL_COMPLETE_VOLUME = 0.5;

/**
 * Procedural Web Audio SFX + per-screen looping music tracks. Everything
 * routes through a master gain so the sound toggle is instant.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private thrustGain: GainNode | null = null;
  private tracks: Record<StaticFileTrack, HTMLAudioElement>;
  /** Lazy cache: only the beds this session actually plays. */
  private gameBeds = new Map<string, HTMLAudioElement>();
  private currentGameFile: string | null = null;
  private current: TrackName | null = null;
  /** Boot-cinematic score bus, so skipping the intro can silence it at once. */
  private introGain: GainNode | null = null;

  soundEnabled = true;
  musicEnabled = true;

  constructor() {
    this.tracks = {
      menu: this.loadAudio("empire-of-the-stars.mp3", 0.45),
      gameover: this.loadAudio(GAMEOVER_TRACK, GAMEOVER_VOLUME),
      training: this.loadAudio(TRAINING_TRACK, TRAINING_VOLUME),
    };
  }

  private loadAudio(file: string, volume: number): HTMLAudioElement {
    const a = new Audio(`${import.meta.env.BASE_URL}music/${file}`);
    a.loop = true;
    a.volume = volume;
    a.preload = "auto";
    return a;
  }

  private gameElement(file: string): HTMLAudioElement {
    let el = this.gameBeds.get(file);
    if (!el) {
      el = this.loadAudio(file, GAME_BED_VOLUME);
      this.gameBeds.set(file, el);
    }
    return el;
  }

  private pauseFileTracks(): void {
    for (const t of Object.values(this.tracks)) t.pause();
    for (const t of this.gameBeds.values()) t.pause();
  }

  private currentFileEl(): HTMLAudioElement | null {
    if (this.current === "menu" || this.current === "gameover" || this.current === "training") {
      return this.tracks[this.current];
    }
    if (this.current === "game" && this.currentGameFile) {
      return this.gameBeds.get(this.currentGameFile) ?? null;
    }
    return null;
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
      this.pauseFileTracks();
    } else {
      this.resumeMusic();
    }
  }

  /** Switch to a screen's track (restarts it unless it's already current). */
  playTrack(name: TrackName): void {
    const resolved: Exclude<TrackName, "tutorial"> = name === "tutorial" ? "training" : name;
    if (resolved === "game") {
      const file = musicBedForActiveMutators();
      const same = this.current === "game" && this.currentGameFile === file;
      if (!same) {
        this.pauseFileTracks();
        const el = this.gameElement(file);
        el.currentTime = 0;
        this.currentGameFile = file;
        this.current = "game";
      }
      this.resumeMusic();
      return;
    }
    if (this.current !== resolved) {
      this.pauseFileTracks();
      this.tracks[resolved].currentTime = 0;
      this.currentGameFile = null;
      this.current = resolved;
    }
    this.resumeMusic();
  }

  /**
   * One-shot music sting. Not part of the looping FileTrack set, so it
   * never replaces the current bed (menu / gameover keep playing under it).
   */
  playOneShot(file: string, volume: number): void {
    if (!this.musicEnabled) return;
    const a = new Audio(`${import.meta.env.BASE_URL}music/${file}`);
    a.loop = false;
    a.volume = volume;
    a.preload = "auto";
    void a.play().catch(() => {});
  }

  /** Resume the current track (e.g. unpausing) without restarting it. */
  resumeMusic(): void {
    if (!this.musicEnabled || !this.current) return;
    void this.currentFileEl()?.play().catch(() => {});
  }

  pauseMusic(): void {
    this.currentFileEl()?.pause();
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
    destination?: AudioNode,
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
    osc.connect(gain).connect(destination ?? this.sfxGain);
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

  /** Soft high tick for a graze — audible reward without cluttering the mix. */
  graze(): void {
    this.tone(1560, 2080, 0.06, "sine", 0.1);
  }

  missileBlast(): void {
    this.noiseBurst(0.22, 0.22, 1200);
    this.tone(190, 60, 0.22, "sine", 0.18);
  }

  /** Low warning drone when a swarm locks into an assembly shape. */
  assemblyForm(): void {
    this.tone(180, 320, 0.35, "square", 0.1);
    this.tone(120, 240, 0.45, "sawtooth", 0.08, 0.08);
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

  /** Bright light-ray beam on THUNDER fire. Not Arc's square crackle. */
  thunderRay(): void {
    this.tone(1860, 2840, 0.16, "sine", 0.16);
    this.tone(2480, 3720, 0.12, "triangle", 0.08, 0.02);
    this.tone(3200, 4200, 0.18, "sine", 0.05, 0.03);
  }

  /** Same family as thunderRay, short so a long hop chain does not clip. */
  thunderHop(): void {
    this.tone(2100, 2800, 0.055, "sine", 0.07);
    this.tone(3000, 3600, 0.04, "triangle", 0.035, 0.01);
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

    // everything routes through a dedicated gain so an early skip can cut
    // the whole score (including the braam still scheduled in the future)
    this.stopIntro();
    const out = this.ctx.createGain();
    out.connect(this.sfxGain);
    this.introGain = out;

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
    src.connect(filter).connect(riserGain).connect(out);
    src.start(t0);

    // tension riser tones underneath
    this.tone(40, 220, hitAt, "sawtooth", 0.12, 0, out);
    this.tone(160, 880, hitAt, "sine", 0.05, hitAt * 0.35, out);

    // THE BRAAM: detuned low sawtooth stack + sub-bass thump
    const braamLen = Math.min(2.2, duration - hitAt);
    for (const [freq, vol] of [
      [55, 0.22],
      [55.8, 0.18],
      [82.5, 0.12],
      [110, 0.08],
    ] as const) {
      this.tone(freq, freq * 0.94, braamLen, "sawtooth", vol, hitAt, out);
    }
    this.tone(38, 30, 1.1, "sine", 0.5, hitAt, out);

    // shimmer tail: high sparkle settling as the tagline appears
    this.tone(1760, 880, 1.6, "sine", 0.05, hitAt + 0.25, out);
    this.tone(2637, 1319, 1.9, "sine", 0.035, hitAt + 0.45, out);
  }

  /** Silence the intro score (an early skip would otherwise leave the braam scheduled). */
  stopIntro(): void {
    if (!this.introGain || !this.ctx) return;
    const g = this.introGain;
    this.introGain = null;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => g.disconnect(), 500);
  }

  /** Rising hyperspace surge for the launch warp (stargate). Soft envelope. */
  warp(duration: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const fade = Math.min(0.28, duration * 0.22);

    const src = this.ctx.createBufferSource();
    const len = Math.ceil(this.ctx.sampleRate * (duration + fade));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.min(1, (i / len) * 1.4);
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.85;
    filter.frequency.setValueAtTime(260, t0);
    filter.frequency.exponentialRampToValueAtTime(2200, t0 + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + fade);

    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t0);

    this.tone(70, 280, duration * 0.85, "sine", 0.07);
    this.tone(320, 1400, duration * 0.75, "sine", 0.045, duration * 0.2);
  }
}
