export function createStoryView(C, timers) {
  const $ = id => document.getElementById(id);
  const H = {
    bars(on) { document.body.classList.toggle('cine', on); },
    fade(v, sec = 1.5) {
      const f = $('fade'); f.style.transition = `opacity ${sec}s`; f.style.opacity = v;
      H._black = { v, until: performance.now() + sec * 1000 };   // main.js skips 3D rendering while the screen is fully black
      return sec;
    },
    chapter(jp, en, meta = '') { const c = $('chapter'); c.querySelector('.jp').textContent = jp; c.querySelector('.en').textContent = en; c.querySelector('.meta').textContent = meta; c.classList.add('show'); },
    chapterOff() { $('chapter').classList.remove('show'); },
    // q: the line (Chinese narration / novel quote, or Japanese when spoken in Japanese), t: English, z: Chinese under Japanese
    sub(q, t = '', sec = 5, z = '') {
      const s = $('sub'); s.querySelector('.q').textContent = q || ''; s.querySelector('.z').textContent = z || ''; s.querySelector('.t').textContent = t || ''; s.classList.add('show');
      delete timers.sub; if (sec) timers.sub = { t: sec, fn: () => s.classList.remove('show') };
      return sec;
    },
    subOff() { $('sub').classList.remove('show'); },
    note(main, small = '', sec = 6) {   // Erii's notebook
      const n = $('note'); n.querySelector('.page').innerHTML = `${main}${small ? `<br><span class="small">${small}</span>` : ''}`; n.classList.add('show');
      delete timers.note; if (sec) timers.note = { t: sec, fn: () => n.classList.remove('show') };
      if (C.audio) C.audio.sfx('pageFlip');
      return sec;
    },
    noteOff() { $('note').classList.remove('show'); },
    prompt(text) {
      if (text && C.TOUCH) text = text.replace(/^Space: /, 'Tap: ').replace(/N: skip/, 'Skip ⏭');
      const p = $('prompt'); p.textContent = text || ''; p.classList.toggle('show', !!text);
    },
  };
  return H;
}
