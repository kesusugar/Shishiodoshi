/**
 * Browsers only let audio start after a user gesture (PLAN.md 7章), so the page opens behind a
 * "tap / click to start" screen. The AudioContext created here is what the synthesis engine uses.
 *
 * Phones need more than a resumed context:
 * - iOS plays Web Audio in the "ambient" audio session, which the silent switch mutes (while video
 *   and <audio> still play). Asking for the "playback" session fixes that: via the Audio Session
 *   API where it exists (Safari 17+), and on older iOS by playing a silent looping <audio> element,
 *   which moves the whole page into that session.
 * - The context can be suspended or "interrupted" later (a call, another app, the screen locking),
 *   so every later touch or return to the page resumes it.
 * All of this must start inside the gesture itself (synchronously), or iOS refuses it.
 */
export function waitForStart(overlay: HTMLElement): Promise<AudioContext> {
  overlay.hidden = false;
  const hint = overlay.querySelector<HTMLElement>('.start-hint');
  if (hint && matchMedia('(pointer: coarse)').matches) hint.textContent = 'タップで開始（音が鳴ります）';
  return new Promise((resolve) => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      else playSilentLoop();
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      void ctx.resume();
      // a sample of silence through the graph, still inside the gesture, fully unlocks older WebKit
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start();
      keepRunning(ctx);
      overlay.hidden = true;
      resolve(ctx);
    };
    // touchend / pointerup / click: whichever the browser counts as the activating gesture comes first
    for (const type of ['touchend', 'pointerup', 'click']) overlay.addEventListener(type, start, { once: true });
  });
}

/** Resume the context whenever the page is touched again or comes back to the foreground. */
function keepRunning(ctx: AudioContext): void {
  const resume = () => {
    if (ctx.state !== 'running') void ctx.resume();
  };
  for (const type of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(type, resume, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
  });
}

/** A tiny silent WAV looped in an <audio> element: keeps iOS in the "playback" audio session. */
function playSilentLoop(): void {
  const rate = 8000, n = 800; // 0.1 s of 8-bit silence
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit PCM silence is the midpoint
  const el = document.createElement('audio');
  el.setAttribute('x-webkit-airplay', 'deny');
  el.preload = 'auto';
  el.loop = true;
  el.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  void el.play().catch(() => {});
  // stop it with the page, and restart it when coming back (iOS pauses it in the background)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void el.play().catch(() => {});
  });
}
