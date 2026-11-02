// RFC 3492 Punycode decoder: browsers expose IDN hostnames in their ASCII form.
function decodePunycode(input) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;
  const output = [];
  const delimiter = input.lastIndexOf('-');
  let index = 0;
  if (delimiter >= 0) {
    for (let j = 0; j < delimiter; j++) {
      const cp = input.charCodeAt(j);
      if (cp >= 0x80) throw new Error('Invalid punycode label');
      output.push(cp);
    }
    index = delimiter + 1;
  }
  let n = initialN, bias = initialBias, i = 0;
  const digitValue = ch => {
    const c = ch.charCodeAt(0);
    if (c >= 48 && c <= 57) return c - 22;
    if (c >= 65 && c <= 90) return c - 65;
    if (c >= 97 && c <= 122) return c - 97;
    return base;
  };
  while (index < input.length) {
    const oldI = i;
    let weight = 1;
    for (let k = base; ; k += base) {
      if (index >= input.length) throw new Error('Invalid punycode label');
      const digit = digitValue(input[index++]);
      if (digit >= base || digit > Math.floor((Number.MAX_SAFE_INTEGER - i) / weight)) throw new Error('Invalid punycode label');
      i += digit * weight;
      const threshold = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < threshold) break;
      const factor = base - threshold;
      if (weight > Math.floor(Number.MAX_SAFE_INTEGER / factor)) throw new Error('Invalid punycode label');
      weight *= factor;
    }
    const count = output.length + 1;
    let delta = i - oldI;
    let points = 0;
    delta = oldI === 0 ? Math.floor(delta / damp) : Math.floor(delta / 2);
    delta += Math.floor(delta / count);
    while (delta > Math.floor(((base - tMin) * tMax) / 2)) {
      delta = Math.floor(delta / (base - tMin));
      points += base;
    }
    bias = points + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
    n += Math.floor(i / count);
    i %= count;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error('Invalid Unicode code point');
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

function toUnicodeHost(host) {
  if (host.startsWith('[') && host.endsWith(']')) return host;
  return host.split('.').map(label => {
    if (!label.toLowerCase().startsWith('xn--')) return label;
    const decoded = decodePunycode(label.slice(4));
    if (!decoded || decoded.includes('.')) throw new Error('Invalid internationalized domain label');
    return decoded;
  }).join('.');
}

// These substitutions are compatibility mappings, not lookalike domains.
// Reference: UTS #46 and the WHATWG URL Standard's domain-to-ASCII algorithm.
const compactLabels = {
  tel: '℡', no: '№', mil: '㏕', au: '㍳', dm: '㍷', pa: '㎀',
  na: '㎁', ma: '㎃', pf: '㎊', nf: '㎋', kg: '㎏', ml: '㎖',
  fm: '㎙', fi: 'ﬁ', mm: '㎜', cm: '㎝', km: '㎞', ps: '㎰',
  ms: '㎳', mv: '㎷', pw: '㎺', mw: '㎽', cc: '㏄', cd: '㏅',
  gy: '㏉', ph: '㏗', pm: '㏘', pr: '㏚', sr: '㏛', sv: '㏜',
  sm: '℠', tm: '™', st: 'ﬆ', in: '㏌', vi: 'ⅵ', fl: 'ﬂ',
  nm: '㎚', nv: '㎵', ov: '㍵'
};

function boldCharacter(char) {
  if (/^[a-z]$/.test(char)) return String.fromCodePoint(0x1d41a + char.charCodeAt(0) - 97);
  if (/^[A-Z]$/.test(char)) return String.fromCodePoint(0x1d400 + char.charCodeAt(0) - 65);
  if (/^[0-9]$/.test(char)) return String.fromCodePoint(0x1d7ce + char.charCodeAt(0) - 48);
  return char;
}

export function normalizeInput(raw) {
  let value = raw.trim();
  if (!value) throw new Error('Enter a URL or domain name to convert.');
  if (value.startsWith('//')) value = 'https:' + value;
  else if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) && !/^[^/]+:\d+(?:[/?#]|$)/.test(value)) {
      throw new Error('Use an HTTP or HTTPS URL.');
    }
    value = 'https://' + value;
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('That doesn’t look like a valid URL.'); }
  if (!url.hostname) throw new Error('Include a domain name in the URL.');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS URL.');
  return url;
}

function assembleURL(url, host) {
  // Only replace the host in the serialized URL, preserving credentials,
  // port, path, percent-encoding, query and fragment exactly as parsed.
  const start = url.protocol.length + 2;
  const end = url.href.indexOf('/', start);
  const authority = url.href.slice(start, end);
  const hostStart = start + authority.lastIndexOf('@') + 1;
  return url.href.slice(0, hostStart) + host + url.href.slice(hostStart + url.hostname.length);
}

export function convertURL(raw) {
  const url = normalizeInput(raw);
  const ascii = url.href;
  const isIP = url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (isIP) return { unicode: ascii, ascii, changed: false, reason: 'IP addresses are left unchanged; Unicode domain styling is for names.' };
  const originalHost = toUnicodeHost(url.hostname);
  const labels = originalHost.split('.');
  const boldHost = labels.map(label => Array.from(label, boldCharacter).join('')).join('.');
  const compactHost = labels.map(label => compactLabels[label.toLowerCase()] || Array.from(label, boldCharacter).join('')).join('.');
  // Actual browser parsing is the final authority. NFKC alone is not enough
  // (for example, ß must NOT be substituted for ss in modern browsers).
  const candidates = [compactHost, boldHost, originalHost];
  for (const host of candidates) {
    const unicode = assembleURL(url, host);
    try {
      if (new URL(unicode).href === ascii) {
        return { unicode, ascii, changed: unicode !== ascii, reason: unicode === ascii ? 'No safe special-character substitution is available for this hostname.' : '' };
      }
    } catch { /* Try the next conservative representation. */ }
  }
  return { unicode: ascii, ascii, changed: false, reason: 'This hostname is left unchanged to preserve its destination.' };
}
