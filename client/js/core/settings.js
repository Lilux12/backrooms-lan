// Настройки игрока (сохраняются в localStorage)

export const settings = Object.assign({ sens: 1, fov: 75, vol: 0.85, br: 1, q: 1 }, (() => { try { return JSON.parse(localStorage.getItem('br_set') || '{}'); } catch (e) { return {}; } })());
export const saveSettings = () => { try { localStorage.setItem('br_set', JSON.stringify(settings)); } catch (e) { /* ok */ } };
