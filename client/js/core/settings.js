// Настройки игрока (сохраняются в localStorage)

// Пресеты качества: масштаб разрешения, постобработка, bloom, тени фонаря, PBR-материалы, декоративный свет
export const PRESETS = {
  low:    { q: 0.6, post: false, bloom: false, shadows: false, pbr: false, fxLights: false, label: 'Низкое' },
  medium: { q: 0.85, post: true, bloom: false, shadows: false, pbr: false, fxLights: true, label: 'Среднее' },
  high:   { q: 1, post: true, bloom: true, shadows: true, pbr: true, fxLights: true, shadowSize: 512, label: 'Высокое' },
  ultra:  { q: 1.4, post: true, bloom: true, shadows: true, pbr: true, fxLights: true, shadowSize: 1024, label: 'Ультра' },
};
// Клавиши, которые можно переназначить
export const DEFAULT_KEYS = { use: 'KeyE', torch: 'KeyF', sprint: 'ShiftLeft', crouch: 'KeyC', jump: 'Space', map: 'KeyM', journal: 'KeyJ' };

const saved = (() => { try { return JSON.parse(localStorage.getItem('br_set') || '{}'); } catch (e) { return {}; } })();
export const settings = Object.assign({
  sens: 1, fov: 75, vol: 0.85, br: 1, preset: 'high', q: 1,
  post: true, bloom: true, vign: true, ca: true, grain: true, vhs: false, shadows: true, pbr: true, fxLights: true, dynres: true,
  subs: false, tips: true, keys: {},
}, saved);
settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys || {});
export const saveSettings = () => { try { localStorage.setItem('br_set', JSON.stringify(settings)); } catch (e) { /* ok */ } };
// Применить пресет (флажки эффектов можно потом поменять по одному)
export function applyPreset(name) {
  const p = PRESETS[name] || PRESETS.high;
  settings.preset = name;
  Object.assign(settings, { q: p.q, post: p.post, bloom: p.bloom, shadows: p.shadows, pbr: p.pbr, fxLights: p.fxLights });
  saveSettings();
}
export const shadowSize = () => (PRESETS[settings.preset] || PRESETS.high).shadowSize || 512;
// Клавиша действия (с учётом переназначения)
export const key = (action) => settings.keys[action] || DEFAULT_KEYS[action];
