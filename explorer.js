import { normalizeInput, toUnicodeHost, assembleURL } from './conversion.js';

export function createExplorer(raw, data, styles) {
  const url = normalizeInput(raw);
  const ascii = url.href;
  const host = toUnicodeHost(url.hostname);
  const isIP = url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  const matchesOriginal = candidate => {
    try { return new URL(candidate).href === ascii; } catch { return false; }
  };
  const lengths = [...new Set(Object.keys(data.mappings).map(s => s.length))].sort((a,b)=>a-b);
  const options = new Map();
  // Only retain substitutions that work at this specific position in this host.
  // Still revalidate combinations: context can change IDNA validity.
  if (!isIP) {
    for (let i = 0; i < host.length;) {
      const char = String.fromCodePoint(host.codePointAt(i));
      const choices = [{text:char, end:i+char.length, special:false}];
      const unique = new Set();
      for (const length of lengths) {
        if (i + length > host.length) break;
        const target = host.slice(i,i+length);
        for (const replacement of data.mappings[target] || []) {
          if (replacement === target || unique.has(replacement)) continue;
          const candidate = assembleURL(url,host.slice(0,i)+replacement+host.slice(i+length));
          if (!matchesOriginal(candidate)) continue;
          unique.add(replacement);
          choices.push({text:replacement,end:i+length,special:true});
        }
      }
      options.set(i, choices);
      i += char.length;
    }
  }
  const counts = new Map([[host.length,1n]]);
  const positions = [...options.keys()];
  for (let j=positions.length-1;j>=0;j--) {
    const i=positions[j];
    counts.set(i,options.get(i).reduce((sum,c)=>sum+(counts.get(c.end)||0n),0n));
  }
  const candidateCount = isIP ? 0n : (counts.get(0)||1n) - (assembleURL(url,host) === ascii ? 1n : 0n);
  const seen = new Set([ascii]);
  function accept(candidateHost, name) {
    const unicode = assembleURL(url,candidateHost);
    if (seen.has(unicode) || !matchesOriginal(unicode)) return null;
    seen.add(unicode);
    return {unicode,name};
  }
  function* generate() {
    if (isIP) return;
    // Readable families first; each uses only published mapped characters.
    for (const style of styles) {
      const styled = Array.from(host,c => style.characters[c] || c).join('');
      const item = accept(styled,style.name);
      if (item) yield item;
    }
    const base = accept(host,'Native Unicode');
    if (base) yield base;
    // Greedy multi-letter mappings make compact symbols and ligatures visible early.
    let compact = '';
    for (let i=0;i<host.length;) {
      const opts=options.get(i);
      const choice=opts.filter(c=>c.special && c.end-i>1).sort((a,b)=>b.end-a.end)[0] || opts[0];
      compact+=choice.text; i=choice.end;
    }
    const compressed=accept(compact,'Compact symbols & ligatures');
    if (compressed) yield compressed;
    // All single substitutions, including every alternate compact symbol.
    for (const [i,choices] of options) {
      for (const c of choices) {
        if (!c.special) continue;
        const item=accept(host.slice(0,i)+c.text+host.slice(c.end),
          'U+'+c.text.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')+' substitution');
        if (item) yield item;
      }
    }
    // Exhaustive finite traversal of all combinations of included mapping rules.
    // An explicit stack avoids recursive depth limits for long hostnames.
    const stack=[{pos:0,index:0,prefix:''}];
    while (stack.length) {
      const frame=stack[stack.length-1];
      if (frame.pos===host.length) {
        stack.pop();
        const item=accept(frame.prefix,'Mixed Unicode');
        // Yield null too so the UI can time-slice rejected/duplicate candidates.
        yield item;
        continue;
      }
      const choices=options.get(frame.pos);
      if (!choices || frame.index>=choices.length) {stack.pop();continue;}
      const c=choices[frame.index++];
      stack.push({pos:c.end,index:0,prefix:frame.prefix+c.text});
    }
  }
  return {ascii,host,candidateCount,iterator:generate(),isIP};
}
