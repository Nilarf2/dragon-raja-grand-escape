export function resetWorldUI() {
  document.body.classList.remove('story', 'wander', 'cine', 'photo');
  for (const id of ['chapter', 'sub', 'note', 'prompt', 'cards', 'toast', 'joy']) document.getElementById(id)?.classList.remove('show');
  const fade = document.getElementById('fade')!; fade.style.transition = 'none'; fade.style.opacity = '0';
  document.getElementById('cards')?.replaceChildren();
  document.getElementById('toast')?.replaceChildren();
  document.getElementById('goto')?.replaceChildren();
  document.getElementById('goto')?.classList.add('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  document.getElementById('title')?.classList.remove('fade');
}
