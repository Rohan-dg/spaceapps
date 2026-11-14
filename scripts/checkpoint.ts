import { skyAt } from '../src/lib/ephemeris';
const sites = [
  { name: 'Shackleton connecting ridge', lat: -89.45, lon: 222.69 },
  { name: 'Apollo 11', lat: 0.67408, lon: 23.47297 },
];
for (const s of sites) for (const iso of ['2027-03-01T00:00:00Z', '2027-09-15T12:00:00Z']) {
  const k = skyAt(s, new Date(iso));
  console.log(`${s.name.padEnd(28)} ${iso}  Sun az ${k.sun.az.toFixed(3)} el ${k.sun.el.toFixed(3)} | Earth az ${k.earth.az.toFixed(3)} el ${k.earth.el.toFixed(3)} (r=${k.earth.radiusDeg.toFixed(3)}°)`);
}
