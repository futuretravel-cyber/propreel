// Strict-CSP ALTCHA setup: the external build injects no <style> and no bundled
// worker, so the page CSP (style-src without 'unsafe-inline') stays intact.
// The server issues PBKDF2/SHA-256 challenges (lib/altcha.ts), so only that worker is registered.
import 'altcha/external';
import 'altcha/altcha.css';
import Pbkdf2Worker from 'altcha/workers/pbkdf2?worker';

const altchaGlobal = (globalThis as unknown as {
  $altcha?: { algorithms: { set: (name: string, factory: () => Worker) => void } };
}).$altcha;

altchaGlobal?.algorithms.set('PBKDF2/SHA-256', () => new Pbkdf2Worker());
