(() => {
  'use strict';

  // ---------- Хранилище ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('tochka:' + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('tochka:' + key, JSON.stringify(value)); } catch { /* приватный режим */ }
    },
  };

  const state = {
    favorites: new Set(store.get('favorites', [])),
    mine: store.get('mine', []),
    chats: store.get('chats', {}),
    city: store.get('city', ''),
  };

  const allListings = () => [...state.mine, ...SEED_LISTINGS];
  const findListing = (id) => allListings().find((l) => l.id === id);
  const catById = (id) => CATEGORIES.find((c) => c.id === id);

  // ---------- Утилиты ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtPrice = (l) => {
    if (l.price === 0) return 'Бесплатно';
    const n = l.price.toLocaleString('ru-RU') + ' ₽';
    return l.unit ? `${n} <small>${esc(l.unit)}</small>` : n;
  };

  const fmtDate = (ts) => {
    const diff = Date.now() - ts;
    const day = 24 * 3600 * 1000;
    const time = new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (diff < day && new Date(ts).getDate() === new Date().getDate()) return `Сегодня ${time}`;
    if (diff < 2 * day) return `Вчера ${time}`;
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const plural = (n, forms) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  };

  const photoStyle = (l, idx = 0) => {
    const hue = (catById(l.category)?.hue ?? 200) + idx * 18 + (Number(l.id.replace(/\D/g, '')) % 7) * 6;
    return `background: linear-gradient(135deg, hsl(${hue} 70% 88%), hsl(${hue + 30} 60% 72%));`;
  };

  let toastTimer;
  const toast = (msg) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  };

  const saveFavorites = () => {
    store.set('favorites', [...state.favorites]);
    const badge = $('#favCount');
    badge.textContent = state.favorites.size;
    badge.hidden = state.favorites.size === 0;
  };

  const toggleFavorite = (id) => {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast('Удалено из избранного'); }
    else { state.favorites.add(id); toast('Добавлено в избранное'); }
    saveFavorites();
    document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle('is-active', state.favorites.has(id)));
  };

  // ---------- Шапка ----------
  function initHeader() {
    const citySelect = $('#citySelect');
    citySelect.innerHTML = `<option value="">Во всех регионах</option>` +
      CITIES.map((c) => `<option ${c === state.city ? 'selected' : ''}>${esc(c)}</option>`).join('');
    citySelect.addEventListener('change', () => {
      state.city = citySelect.value;
      store.set('city', state.city);
      render();
    });

    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const params = new URLSearchParams(currentQuery());
      const q = $('#searchInput').value.trim();
      q ? params.set('q', q) : params.delete('q');
      location.hash = '#/search?' + params.toString();
    });

    const menu = $('#catMenu');
    const toggle = $('#catToggle');
    $('#catMenuGrid').innerHTML = CATEGORIES.map((c) => `
      <div class="catmenu__col">
        <a class="catmenu__title" href="#/search?cat=${c.id}">${c.icon} ${esc(c.name)}</a>
        ${c.subs.map((s) => `<a href="#/search?cat=${c.id}&sub=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}
      </div>`).join('');
    toggle.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });

    saveFavorites();
  }

  // ---------- Роутер ----------
  const currentQuery = () => {
    const h = location.hash;
    const i = h.indexOf('?');
    return i === -1 ? '' : h.slice(i + 1);
  };

  function render() {
    const hash = location.hash || '#/';
    const [path] = hash.slice(1).split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(currentQuery());
    const app = $('#app');

    $('#searchInput').value = params.get('q') || '';
    $('#citySelect').value = state.city;

    let html;
    switch (parts[0]) {
      case undefined: html = viewHome(); break;
      case 'search': html = viewSearch(params); break;
      case 'item': html = viewItem(parts[1]); break;
      case 'favorites': html = viewFavorites(); break;
      case 'new': html = viewNew(); break;
      case 'my': html = viewMy(); break;
      case 'messages': html = viewMessages(parts[1]); break;
      default: html = viewNotFound();
    }
    app.innerHTML = html;
    afterRender(parts, params);
    window.scrollTo(0, 0);
  }

  // ---------- Компоненты ----------
  const card = (l) => `
    <article class="card">
      <a href="#/item/${esc(l.id)}" class="card__photo" style="${photoStyle(l)}">
        <span class="card__emoji">${l.emoji}</span>
        ${l.photos > 1 ? `<span class="card__count">${l.photos} фото</span>` : ''}
      </a>
      <button class="fav-btn ${state.favorites.has(l.id) ? 'is-active' : ''}" data-fav="${esc(l.id)}" aria-label="В избранное">
        <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.4 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3C20.6 5 23 8.3 21.5 11.8 19.5 16.4 12 21 12 21z"/></svg>
      </button>
      <div class="card__body">
        <a href="#/item/${esc(l.id)}" class="card__title">${esc(l.title)}</a>
        <div class="card__price">${fmtPrice(l)}</div>
        ${l.delivery ? '<span class="tag">Доставка</span>' : ''}
        <div class="card__meta">${esc(l.city)}<br>${fmtDate(l.createdAt)}</div>
      </div>
    </article>`;

  const grid = (items, empty = 'Ничего не нашлось') => items.length
    ? `<div class="grid">${items.map(card).join('')}</div>`
    : `<div class="empty"><div class="empty__icon">🔍</div><p>${empty}</p></div>`;

  const byCity = (items) => state.city ? items.filter((l) => l.city === state.city) : items;

  // ---------- Главная ----------
  function viewHome() {
    const items = byCity(allListings()).sort((a, b) => b.createdAt - a.createdAt);
    return `
      <section class="cats">
        ${CATEGORIES.map((c) => `
          <a class="cat" href="#/search?cat=${c.id}" style="--h:${c.hue}">
            <span class="cat__name">${esc(c.name)}</span>
            <span class="cat__icon">${c.icon}</span>
          </a>`).join('')}
      </section>
      <section class="promo">
        <div>
          <h2>Продайте то, что больше не нужно</h2>
          <p>Размещение бесплатно — объявление появится в ленте сразу.</p>
        </div>
        <a href="#/new" class="btn btn--accent btn--lg">Разместить объявление</a>
      </section>
      <h1 class="section-title">Рекомендации для вас${state.city ? ` · ${esc(state.city)}` : ''}</h1>
      ${grid(items)}`;
  }

  // ---------- Поиск ----------
  function viewSearch(p) {
    const q = (p.get('q') || '').toLowerCase();
    const cat = p.get('cat') || '';
    const sub = p.get('sub') || '';
    const min = Number(p.get('min')) || 0;
    const max = Number(p.get('max')) || Infinity;
    const delivery = p.get('delivery') === '1';
    const sort = p.get('sort') || 'date';

    let items = byCity(allListings()).filter((l) =>
      (!q || l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)) &&
      (!cat || l.category === cat) &&
      (!sub || l.sub === sub) &&
      l.price >= min && l.price <= max &&
      (!delivery || l.delivery));

    const sorters = {
      date: (a, b) => b.createdAt - a.createdAt,
      cheap: (a, b) => a.price - b.price,
      expensive: (a, b) => b.price - a.price,
    };
    items.sort(sorters[sort] || sorters.date);

    const c = catById(cat);
    const title = q ? `«${esc(p.get('q'))}»` : sub ? esc(sub) : c ? esc(c.name) : 'Все объявления';

    return `
      <nav class="crumbs"><a href="#/">Главная</a>${c ? ` › <a href="#/search?cat=${c.id}">${esc(c.name)}</a>` : ''}${sub ? ` › ${esc(sub)}` : ''}</nav>
      <h1 class="section-title">${title} <span class="muted">${items.length} ${plural(items.length, ['объявление', 'объявления', 'объявлений'])}</span></h1>
      <div class="layout">
        <aside class="filters">
          <form id="filtersForm">
            <label class="field">Категория
              <select name="cat">
                <option value="">Любая</option>
                ${CATEGORIES.map((x) => `<option value="${x.id}" ${x.id === cat ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
              </select>
            </label>
            ${c ? `<label class="field">Подкатегория
              <select name="sub">
                <option value="">Любая</option>
                ${c.subs.map((s) => `<option ${s === sub ? 'selected' : ''}>${esc(s)}</option>`).join('')}
              </select></label>` : ''}
            <fieldset class="field">
              <legend>Цена, ₽</legend>
              <div class="range">
                <input name="min" type="number" min="0" placeholder="от" value="${min || ''}">
                <input name="max" type="number" min="0" placeholder="до" value="${max === Infinity ? '' : max}">
              </div>
            </fieldset>
            <label class="check"><input type="checkbox" name="delivery" value="1" ${delivery ? 'checked' : ''}> С доставкой</label>
            <label class="field">Сортировка
              <select name="sort">
                <option value="date" ${sort === 'date' ? 'selected' : ''}>По дате</option>
                <option value="cheap" ${sort === 'cheap' ? 'selected' : ''}>Дешевле</option>
                <option value="expensive" ${sort === 'expensive' ? 'selected' : ''}>Дороже</option>
              </select>
            </label>
            <input type="hidden" name="q" value="${esc(p.get('q') || '')}">
            <button class="btn btn--primary btn--block" type="submit">Показать</button>
            <a class="btn btn--ghost btn--block" href="#/search">Сбросить</a>
          </form>
        </aside>
        <section>${grid(items, 'По вашему запросу ничего не нашлось. Попробуйте изменить фильтры.')}</section>
      </div>`;
  }

  // ---------- Карточка объявления ----------
  function viewItem(id) {
    const l = findListing(id);
    if (!l) return viewNotFound();
    const c = catById(l.category);
    const similar = allListings().filter((x) => x.category === l.category && x.id !== l.id).slice(0, 4);
    const isMine = state.mine.some((m) => m.id === l.id);
    return `
      <nav class="crumbs"><a href="#/">Главная</a> › <a href="#/search?cat=${c.id}">${esc(c.name)}</a> › <a href="#/search?cat=${c.id}&sub=${encodeURIComponent(l.sub)}">${esc(l.sub)}</a></nav>
      <div class="item">
        <div class="item__main">
          <h1 class="item__title">${esc(l.title)}</h1>
          <div class="item__actions">
            <button class="btn btn--ghost fav-inline ${state.favorites.has(l.id) ? 'is-active' : ''}" data-fav="${esc(l.id)}">♥ В избранное</button>
            <button class="btn btn--ghost" id="shareBtn">Поделиться</button>
          </div>
          <div class="gallery">
            <div class="gallery__main" id="galleryMain" style="${photoStyle(l)}"><span>${l.emoji}</span></div>
            <div class="gallery__thumbs">
              ${Array.from({ length: l.photos }, (_, i) => `<button class="thumb ${i === 0 ? 'is-active' : ''}" data-thumb="${i}" style="${photoStyle(l, i)}">${l.emoji}</button>`).join('')}
            </div>
          </div>
          <h2 class="h2">Расположение</h2>
          <p>${esc(l.city)}, р-н ${esc(l.district)}</p>
          <div class="map" aria-hidden="true"><span class="map__pin">📍</span></div>
          <h2 class="h2">Описание</h2>
          <p class="item__desc">${esc(l.description)}</p>
          <p class="muted">№ ${esc(l.id)} · ${fmtDate(l.createdAt)} · ${l.views} ${plural(l.views, ['просмотр', 'просмотра', 'просмотров'])}</p>
        </div>
        <aside class="item__side">
          <div class="price-box">
            <div class="price-box__price">${fmtPrice(l)}</div>
            ${isMine ? `
              <button class="btn btn--danger btn--block" id="deleteBtn">Снять с публикации</button>` : `
              <button class="btn btn--accent btn--block" id="phoneBtn">Показать телефон</button>
              <a class="btn btn--primary btn--block" href="#/messages/${esc(l.id)}">Написать продавцу</a>
              ${l.delivery ? '<div class="delivery">🚚 Доступна доставка с безопасной оплатой</div>' : ''}`}
          </div>
          <div class="seller">
            <div class="seller__avatar">${esc(l.seller.name[0])}</div>
            <div>
              <div class="seller__name">${esc(l.seller.name)}</div>
              <div class="muted">${l.seller.company ? 'Компания' : 'Частное лицо'} · на сайте с ${l.seller.since}</div>
              <div class="stars">★ ${l.seller.rating.toFixed(1)} <span class="muted">· ${l.seller.reviews} ${plural(l.seller.reviews, ['отзыв', 'отзыва', 'отзывов'])}</span></div>
            </div>
          </div>
          <div class="safety">
            <b>Будьте осторожны</b>
            Не переводите предоплату, пока не увидели товар. Не сообщайте коды из СМС.
          </div>
        </aside>
      </div>
      ${similar.length ? `<h2 class="section-title">Похожие объявления</h2>${grid(similar)}` : ''}`;
  }

  // ---------- Избранное ----------
  function viewFavorites() {
    const items = allListings().filter((l) => state.favorites.has(l.id));
    return `<h1 class="section-title">Избранное</h1>${grid(items, 'Нажмите ♥ на объявлении, чтобы сохранить его здесь.')}`;
  }

  // ---------- Мои объявления ----------
  function viewMy() {
    return `
      <div class="page-head">
        <h1 class="section-title">Мои объявления</h1>
        <a href="#/new" class="btn btn--accent">Разместить объявление</a>
      </div>
      ${grid(state.mine, 'У вас пока нет объявлений.')}`;
  }

  // ---------- Новое объявление ----------
  function viewNew() {
    return `
      <h1 class="section-title">Новое объявление</h1>
      <form class="post-form" id="postForm" novalidate>
        <label class="field">Категория
          <select name="category" required>
            <option value="">Выберите категорию</option>
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field">Подкатегория
          <select name="sub" required disabled><option value="">Сначала выберите категорию</option></select>
        </label>
        <label class="field">Название объявления
          <input name="title" maxlength="80" required placeholder="Например, велосипед горный">
        </label>
        <label class="field">Описание
          <textarea name="description" rows="5" maxlength="2000" required placeholder="Состояние, комплектация, причина продажи"></textarea>
        </label>
        <div class="form-row">
          <label class="field">Цена, ₽
            <input name="price" type="number" min="0" step="1" required placeholder="0 — бесплатно">
          </label>
          <label class="field">Город
            <select name="city" required>
              ${CITIES.map((c) => `<option ${c === state.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="field">Иконка вместо фото
          <div class="emoji-pick" id="emojiPick">
            ${['📦', '🚗', '🏠', '📱', '💻', '🛋️', '👟', '🎸', '🚲', '🐈', '🛠️', '📚'].map((e, i) => `
              <label><input type="radio" name="emoji" value="${e}" ${i === 0 ? 'checked' : ''}><span>${e}</span></label>`).join('')}
          </div>
        </label>
        <label class="check"><input type="checkbox" name="delivery"> Готов отправить с доставкой</label>
        <p class="form-error" id="formError" hidden></p>
        <button class="btn btn--accent btn--lg" type="submit">Опубликовать</button>
      </form>`;
  }

  // ---------- Сообщения ----------
  const AUTO_REPLIES = ['Здравствуйте! Да, ещё актуально.', 'Можно посмотреть сегодня вечером.', 'Небольшой торг возможен 🙂', 'Отправлю доставкой, если удобно.'];

  function viewMessages(id) {
    const ids = Object.keys(state.chats).filter(findListing)
      .sort((a, b) => (state.chats[b].at(-1)?.at || 0) - (state.chats[a].at(-1)?.at || 0));
    const active = id && findListing(id) ? id : null;
    const list = ids.length || active ? [...new Set([...(active ? [active] : []), ...ids])] : [];
    const l = active && findListing(active);
    const msgs = active ? (state.chats[active] || []) : [];
    return `
      <h1 class="section-title">Сообщения</h1>
      <div class="chat">
        <aside class="chat__list">
          ${list.length ? list.map((cid) => {
            const x = findListing(cid);
            const last = (state.chats[cid] || []).at(-1);
            return `<a href="#/messages/${esc(cid)}" class="chat__item ${cid === active ? 'is-active' : ''}">
              <span class="chat__thumb" style="${photoStyle(x)}">${x.emoji}</span>
              <span><b>${esc(x.seller.name)}</b><br><span class="muted">${esc(last ? last.text : x.title)}</span></span>
            </a>`;
          }).join('') : '<p class="muted pad">Диалогов пока нет. Напишите продавцу со страницы объявления.</p>'}
        </aside>
        <section class="chat__window">
          ${l ? `
            <a class="chat__head" href="#/item/${esc(l.id)}">
              <span class="chat__thumb" style="${photoStyle(l)}">${l.emoji}</span>
              <span><b>${esc(l.title)}</b><br>${fmtPrice(l)}</span>
            </a>
            <div class="chat__msgs" id="chatMsgs">
              ${msgs.length ? msgs.map((m) => `<div class="msg ${m.me ? 'msg--me' : ''}">${esc(m.text)}<time>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('')
                : `<div class="chat__hints">${['Здравствуйте! Ещё продаётся?', 'Торг возможен?', 'Когда можно посмотреть?'].map((t) => `<button class="chip" data-hint="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
            </div>
            <form class="chat__form" id="chatForm">
              <input name="text" placeholder="Написать сообщение…" autocomplete="off" required>
              <button class="btn btn--primary">Отправить</button>
            </form>` : '<div class="empty"><div class="empty__icon">💬</div><p>Выберите диалог</p></div>'}
        </section>
      </div>`;
  }

  function sendMessage(id, text) {
    const chat = state.chats[id] || (state.chats[id] = []);
    chat.push({ me: true, text, at: Date.now() });
    store.set('chats', state.chats);
    render();
    setTimeout(() => {
      chat.push({ me: false, text: AUTO_REPLIES[chat.filter((m) => !m.me).length % AUTO_REPLIES.length], at: Date.now() });
      store.set('chats', state.chats);
      if (location.hash === `#/messages/${id}`) render();
    }, 1200);
  }

  function viewNotFound() {
    return `<div class="empty"><div class="empty__icon">🤷</div><p>Страница не найдена или объявление снято с публикации.</p><a class="btn btn--primary" href="#/">На главную</a></div>`;
  }

  // ---------- Обработчики после рендера ----------
  function afterRender(parts, params) {
    const filters = $('#filtersForm');
    if (filters) {
      filters.addEventListener('change', (e) => {
        if (e.target.name === 'cat') filters.querySelector('[name=sub]')?.remove();
      });
      filters.addEventListener('submit', (e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        for (const [k, v] of new FormData(filters)) if (v && !(k === 'sort' && v === 'date')) p.set(k, v);
        location.hash = '#/search?' + p.toString();
      });
    }

    if (parts[0] === 'item') {
      const l = findListing(parts[1]);
      if (!l) return;
      $('#phoneBtn')?.addEventListener('click', (e) => {
        const n = Number(l.id.replace(/\D/g, '')) || 7;
        e.currentTarget.textContent = `+7 9${String(10 + (n % 90))} ${String(100 + ((n * 37) % 900))}-${String(10 + ((n * 13) % 90))}-${String(10 + ((n * 7) % 90))}`;
      });
      $('#shareBtn')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(location.href); toast('Ссылка скопирована'); }
        catch { toast('Не удалось скопировать ссылку'); }
      });
      $('#deleteBtn')?.addEventListener('click', () => {
        if (!confirm('Снять объявление с публикации?')) return;
        state.mine = state.mine.filter((m) => m.id !== l.id);
        store.set('mine', state.mine);
        toast('Объявление снято');
        location.hash = '#/my';
      });
      document.querySelectorAll('[data-thumb]').forEach((t) => t.addEventListener('click', () => {
        document.querySelectorAll('[data-thumb]').forEach((x) => x.classList.remove('is-active'));
        t.classList.add('is-active');
        $('#galleryMain').setAttribute('style', photoStyle(l, Number(t.dataset.thumb)));
      }));
    }

    const postForm = $('#postForm');
    if (postForm) {
      const subSel = postForm.querySelector('[name=sub]');
      postForm.querySelector('[name=category]').addEventListener('change', (e) => {
        const c = catById(e.target.value);
        subSel.disabled = !c;
        subSel.innerHTML = c ? c.subs.map((s) => `<option>${esc(s)}</option>`).join('') : '<option value="">Сначала выберите категорию</option>';
      });
      postForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(postForm));
        const err = $('#formError');
        const missing = [];
        if (!f.category) missing.push('категорию');
        if (!f.title?.trim()) missing.push('название');
        if (!f.description?.trim()) missing.push('описание');
        if (f.price === '' || Number(f.price) < 0) missing.push('цену');
        if (missing.length) { err.textContent = 'Укажите ' + missing.join(', ') + '.'; err.hidden = false; return; }
        const listing = {
          id: 'u' + Date.now(),
          title: f.title.trim(),
          description: f.description.trim(),
          price: Math.round(Number(f.price)),
          unit: '',
          category: f.category,
          sub: f.sub,
          emoji: f.emoji || '📦',
          city: f.city,
          district: DISTRICTS[0],
          createdAt: Date.now(),
          views: 0,
          seller: { name: 'Вы', rating: 5, reviews: 0, since: new Date().getFullYear() },
          delivery: !!f.delivery,
          photos: 1,
        };
        state.mine.unshift(listing);
        store.set('mine', state.mine);
        toast('Объявление опубликовано');
        location.hash = '#/item/' + listing.id;
      });
    }

    const chatForm = $('#chatForm');
    if (chatForm) {
      const id = parts[1];
      const msgs = $('#chatMsgs');
      msgs.scrollTop = msgs.scrollHeight;
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatForm.text.value.trim();
        if (text) sendMessage(id, text);
      });
      document.querySelectorAll('[data-hint]').forEach((b) => b.addEventListener('click', () => sendMessage(id, b.dataset.hint)));
    }
  }

  // Делегирование для кнопок избранного — работают на любой странице.
  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); toggleFavorite(fav.dataset.fav); }
  });

  initHeader();
  window.addEventListener('hashchange', render);
  render();
})();
