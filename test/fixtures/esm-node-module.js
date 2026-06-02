// Imports a modern, ESM-only published package (@texel/color) by its bare
// specifier. The package is authored as native ES modules and uses modern
// syntax such as the nullish coalescing operator (??) and non-ASCII
// identifiers, which the bundler must be able to handle.
import { convert, sRGB, OKLCH } from '@texel/color';

const oklch = convert([1, 0.5, 0], sRGB, OKLCH);
console.log([typeof convert, oklch.length, Math.round(oklch[0] * 1000)].join(' '));
