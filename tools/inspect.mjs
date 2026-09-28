// Print the simulation's state and outputs at a moment: node tools/inspect.mjs --t=12
import { openApp, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const app = await openApp({ swiftshader: !!args.swiftshader });
try {
  await app.load(`t=${args.t ?? 0}`);
  const info = await app.page.evaluate(() => {
    const sim = window.__shishi.inspect.sim;
    return { state: sim.state, out: sim.out, mass: sim.mass };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await app.close();
}
