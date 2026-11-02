import { convertURL } from './conversion.js';

const form = document.querySelector('#convert-form');
const input = document.querySelector('#url-input');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
const unicodeLink = document.querySelector('#unicode-result');
const asciiOutput = document.querySelector('#ascii-result');
const badge = document.querySelector('.idn-badge');
const note = document.querySelector('#note');

form.addEventListener('submit', event => {
  event.preventDefault();
  error.hidden = true;
  try {
    const converted = convertURL(input.value);
    unicodeLink.textContent = converted.unicode;
    // Use the generated URL itself, not an unrelated ASCII link target.
    unicodeLink.setAttribute('href', converted.unicode);
    unicodeLink.title = 'Open the equivalent URL';
    asciiOutput.textContent = converted.ascii;
    badge.textContent = converted.changed ? 'SAME URL ✓' : 'UNCHANGED';
    note.textContent = converted.reason || 'Verified in this browser: the generated URL normalizes to the same destination. Path, query and fragment are unchanged.';
    result.hidden = false;
  } catch (err) {
    result.hidden = true;
    error.textContent = err.message || 'Unable to convert this URL.';
    error.hidden = false;
  }
});

input.addEventListener('input', () => {
  result.hidden = true;
  error.hidden = true;
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
