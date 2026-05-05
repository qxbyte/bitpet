export type AnimationName =
  | 'idle'
  | 'walk_right' | 'walk_left'
  | 'thinking' | 'launch' | 'exit'
  | 'sleeping' | 'active'
  | 'click' | 'deep_sleep' | 'play';

interface AnimationDef {
  start: number;
  end: number;
  fps: number;
}

interface Manifest {
  frameWidth: number;
  frameHeight: number;
  animations: Record<AnimationName, AnimationDef>;
}

export class PixelSprite {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private manifest: Manifest | null = null;
  private current: AnimationName = 'idle';
  private pending: AnimationName | null = null;
  private frame = 0;
  private lastFrameTime = 0;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  async load(spriteSrc: string, manifestSrc: string) {
    const [img, manifest] = await Promise.all([
      loadImage(spriteSrc),
      fetch(manifestSrc).then(r => r.json()) as Promise<Manifest>,
    ]);
    this.img = img;
    this.manifest = manifest;
    this.start();
  }

  setState(name: AnimationName, immediate = false) {
    if (this.current === name) return;
    if (immediate) {
      this.pending = null;
      this.current = name;
      this.frame = 0;
      this.drawCurrentFrame();
    } else {
      this.pending = name;
    }
  }

  getCurrentState(): AnimationName {
    return this.current;
  }

  getPendingState(): AnimationName | null {
    return this.pending;
  }

  private start() {
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(ts => this.tick(ts));
  }

  private tick(ts: number) {
    this.rafId = requestAnimationFrame(t => this.tick(t));
    if (!this.img || !this.manifest) return;

    const anim = this.manifest.animations[this.current];
    if (!anim) return;

    const mspf = 1000 / anim.fps;
    if (ts - this.lastFrameTime < mspf) return;
    this.lastFrameTime = ts;

    this.draw(anim.start + this.frame);

    const totalFrames = anim.end - anim.start + 1;
    this.frame = (this.frame + 1) % totalFrames;

    // Switch pending animation at loop boundary.
    if (this.frame === 0 && this.pending !== null) {
      this.current = this.pending;
      this.pending = null;
      this.drawCurrentFrame();
    }
  }

  private drawCurrentFrame() {
    if (!this.manifest) return;
    const anim = this.manifest.animations[this.current];
    if (!anim) return;
    this.draw(anim.start + this.frame);
  }

  private draw(frameIndex: number) {
    if (!this.img || !this.manifest) return;
    const { frameWidth, frameHeight } = this.manifest;
    const framesPerRow = Math.floor(this.img.width / frameWidth);
    const col = frameIndex % framesPerRow;
    const row = Math.floor(frameIndex / framesPerRow);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.img,
      col * frameWidth, row * frameHeight, frameWidth, frameHeight,
      0, 0, this.canvas.width, this.canvas.height,
    );
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
