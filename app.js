const form = document.querySelector('#convert-form');
const input = document.querySelector('#url-input');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
const unicodeLink = document.querySelector('#unicode-result');
const asciiOutput = document.querySelector('#ascii-result');

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

function normalizeInput(raw) {
  let value = raw.trim();
  if (!value) throw new Error('Enter a URL or domain name to convert.');
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value;
  let url;
  try { url = new URL(value); } catch { throw new Error('That doesn’t look like a valid URL.'); }
  if (!url.hostname) throw new Error('Include a domain name in the URL.');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS URL.');
  return url;
}

function assembleURL(url, host) {
  const auth = url.username ? url.username + (url.password ? ':' + url.password : '') + '@' : '';
  const port = url.port ? ':' + url.port : '';
  return url.protocol + '//' + auth + host + port + url.pathname + url.search + url.hash;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  error.hidden = true;
  try {
    const url = normalizeInput(input.value);
    const unicodeHost = toUnicodeHost(url.hostname);
    const unicodeURL = assembleURL(url, unicodeHost);
    const asciiURL = url.href;
    unicodeLink.textContent = unicodeURL;
    unicodeLink.href = asciiURL;
    unicodeLink.title = 'Open this URL';
    asciiOutput.textContent = asciiURL;
    result.hidden = false;
  } catch (err) {
    result.hidden = true;
    error.textContent = err.message || 'Unable to convert this URL.';
    error.hidden = false;
  }
});

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const text = button.dataset.copy === 'unicode' ? unicodeLink.textContent : asciiOutput.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      button.classList.add('copied');
      setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('copied'); }, 1400);
    } catch {
      button.textContent = 'Copy failed';
      setTimeout(() => { button.textContent = 'Copy'; }, 1400);
    }
  });
});
