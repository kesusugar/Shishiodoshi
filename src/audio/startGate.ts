/**
 * Browsers only let audio start after a user gesture (PLAN.md 7章), so the page opens behind a
 * "click to start" screen. The AudioContext created here is what the synthesis engine will use from P2.
 */
export function waitForStart(overlay: HTMLElement): Promise<AudioContext> {
  overlay.hidden = false;
  return new Promise((resolve) => {
    overlay.addEventListener(
      'click',
      async () => {
        const ctx = new AudioContext({ latencyHint: 'interactive' });
        await ctx.resume();
        overlay.hidden = true;
        resolve(ctx);
      },
      { once: true },
    );
  });
}
