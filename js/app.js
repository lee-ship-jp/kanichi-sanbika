/* 韓日讃頌歌 PWA */
(() => {
'use strict';

const GROUP_SIZE = 50;
const LS = {
  bookmarks: 'kjh.bookmarks',
  history: 'kjh.history',
  fontSize: 'kjh.fontSize',
};

let songs = [];            // [{no, title, firstLine, lyrics, sheets:[...]}]
let songByNo = new Map();
let currentNo = null;
let lyricsMode = false;

const $ = (id) => document.getElementById(id);

const views = {
  home: $('view-home'),
  song: $('view-song'),
  sub: $('view-sub'),
};

/* ---------- 저장소 ---------- */
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};

const getBookmarks = () => store.get(LS.bookmarks, []);
const getHistory = () => store.get(LS.history, []);

function toggleBookmark(no) {
  let list = getBookmarks();
  if (list.includes(no)) list = list.filter(n => n !== no);
  else list.unshift(no);
  store.set(LS.bookmarks, list);
  return list.includes(no);
}

function pushHistory(no) {
  let list = getHistory().filter(n => n !== no);
  list.unshift(no);
  if (list.length > 100) list = list.slice(0, 100);
  store.set(LS.history, list);
}

/* ---------- 검색 정규화 (가타카나→히라가나, 소문자) ---------- */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

/* ---------- 데이터 로드 ---------- */
async function loadSongs() {
  const res = await fetch('data/songs.json');
  songs = await res.json();
  songs.sort((a, b) => a.no - b.no);
  songByNo = new Map(songs.map(s => [s.no, s]));
  songs.forEach(s => {
    s._title = normalize(s.title);
    s._titleKo = normalize(s.titleKo);
    s._lyrics = normalize(s.lyrics);
  });
}

/* ---------- 홈: 목록 렌더 ---------- */
function songRow(s, action) {
  const li = document.createElement('li');
  li.innerHTML =
    `<span class="num">${s.no}番</span>
     <div class="info">
       <div class="title"></div>
       <div class="first-line"></div>
     </div>`;
  li.querySelector('.title').textContent = s.title;
  li.querySelector('.first-line').textContent = s.titleKo || s.firstLine || '';
  if (action) li.appendChild(action);
  li.addEventListener('click', () => { location.hash = `#/song/${s.no}`; });
  return li;
}

function renderList(filter) {
  const listEl = $('song-list');
  const rangeEl = $('range-label');
  const jumpEl = $('quick-jump');
  listEl.innerHTML = '';
  jumpEl.innerHTML = '';

  if (filter) {
    rangeEl.textContent = '';
    const q = normalize(filter);
    const numQ = /^\d+$/.test(filter.trim()) ? parseInt(filter.trim(), 10) : null;
    const results = songs.filter(s =>
      (numQ !== null && (s.no === numQ || String(s.no).startsWith(filter.trim()))) ||
      s._title.includes(q) ||
      s._titleKo.includes(q) ||
      (s._lyrics && s._lyrics.includes(q))
    );
    if (!results.length) {
      listEl.innerHTML = '<div class="empty-msg">検索結果がありません</div>';
      return;
    }
    results.slice(0, 200).forEach(s => listEl.appendChild(songRow(s)));
    return;
  }

  // 전체 목록: 50곡 단위 그룹 헤더
  rangeEl.textContent = '';
  let currentGroup = -1;
  songs.forEach(s => {
    const g = Math.floor((s.no - 1) / GROUP_SIZE);
    if (g !== currentGroup) {
      currentGroup = g;
      const start = g * GROUP_SIZE + 1;
      const end = Math.min((g + 1) * GROUP_SIZE, songs[songs.length - 1].no);
      const label = document.createElement('div');
      label.className = 'range-label';
      label.id = `group-${start}`;
      label.textContent = `${start} ~ ${end}`;
      listEl.appendChild(label);
    }
    listEl.appendChild(songRow(s));
  });

  // 우측 빠른 이동
  const maxNo = songs.length ? songs[songs.length - 1].no : 0;
  for (let start = 1; start <= maxNo; start += GROUP_SIZE) {
    const b = document.createElement('button');
    b.textContent = start;
    b.addEventListener('click', () => {
      const t = $(`group-${start}`);
      if (t) t.scrollIntoView({ block: 'start' });
    });
    jumpEl.appendChild(b);
  }
}

/* ---------- 곡 보기 ---------- */
function openSong(no) {
  const s = songByNo.get(no);
  if (!s) { location.hash = '#/'; return; }
  currentNo = no;
  pushHistory(no);

  $('song-title').textContent = `${no}番. ${s.title}`;

  // 악보
  const imgWrap = $('sheet-images');
  imgWrap.innerHTML = '';
  if (s.sheets && s.sheets.length) {
    s.sheets.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${no}番 楽譜`;
      img.loading = 'lazy';
      imgWrap.appendChild(img);
    });
  } else {
    imgWrap.innerHTML =
      `<div class="sheet-placeholder">
        <svg viewBox="0 0 24 24"><path d="M9 18.5V5l10-2v12.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="18.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/></svg>
        <div>楽譜は準備中です。<br>下のピンクのボタンで歌詞を表示できます。</div>
      </div>`;
  }

  // 가사 (가사 데이터가 없는 곡은 토글 버튼 숨김)
  $('lyrics-text').textContent = s.lyrics || '歌詞は準備中です。';
  $('fab-toggle').classList.toggle('hidden', !s.lyrics);
  if (!s.lyrics && lyricsMode) lyricsMode = false;

  // 즐겨찾기 상태
  $('fab-bookmark').classList.toggle('active', getBookmarks().includes(no));

  // 이전/다음
  const idx = songs.findIndex(x => x.no === no);
  $('nav-prev').disabled = idx <= 0;
  $('nav-next').disabled = idx >= songs.length - 1;

  setLyricsMode(lyricsMode, true);
  $('sheet-area').scrollTop = 0;
  $('lyrics-area').scrollTop = 0;
  showView('song');
}

function setLyricsMode(on, keep) {
  lyricsMode = on;
  $('sheet-area').classList.toggle('hidden', on);
  $('lyrics-area').classList.toggle('hidden', !on);
  $('font-slider-bar').classList.toggle('hidden', !on);
  $('fab-toggle-doc').classList.toggle('hidden', on);
  $('fab-toggle-note').classList.toggle('hidden', !on);
  if (!keep) {
    $('sheet-area').scrollTop = 0;
    $('lyrics-area').scrollTop = 0;
  }
}

function stepSong(delta) {
  const idx = songs.findIndex(x => x.no === currentNo);
  const next = songs[idx + delta];
  if (next) location.hash = `#/song/${next.no}`;
}

/* ---------- 서브 화면 ---------- */
function renderSub(route) {
  const titleEl = $('sub-title');
  const content = $('sub-content');
  content.innerHTML = '';

  if (route === 'bookmarks' || route === 'history') {
    titleEl.textContent = route === 'bookmarks' ? 'お気に入り' : '履歴';
    const nos = route === 'bookmarks' ? getBookmarks() : getHistory();
    const ul = document.createElement('ul');
    ul.className = 'song-list';
    if (!nos.length) {
      content.innerHTML = `<div class="empty-msg">${route === 'bookmarks' ? 'お気に入りはまだありません。<br>曲のページで★ボタンを押すと追加されます。' : '閲覧履歴はまだありません。'}</div>`;
      return;
    }
    nos.forEach(no => {
      const s = songByNo.get(no);
      if (!s) return;
      let action = null;
      if (route === 'bookmarks') {
        action = document.createElement('button');
        action.className = 'row-action';
        action.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.5 5.4 5.9.6-4.4 4 1.2 5.8L12 16l-5.2 3 1.2-5.8-4.4-4 5.9-.6z" fill="#ffd944" stroke="#e0b400" stroke-width="1"/></svg>';
        action.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleBookmark(no);
          renderSub('bookmarks');
        });
      }
      ul.appendChild(songRow(s, action));
    });
    content.appendChild(ul);
    return;
  }

  if (route === 'about') {
    titleEl.textContent = 'アプリ紹介';
    content.innerHTML =
      `<div class="about-box">
        <h2>韓日讃頌歌</h2>
        <p>「韓日讃頌歌」（한일찬송가）の楽譜を、いつでもどこでも見ることができるアプリです。</p>
        <p>番号・日本語タイトル・韓国語タイトルからすばやく検索でき、お気に入り登録や閲覧履歴にも対応しています。</p>
        <p>ホーム画面に追加すると、アプリのようにオフラインでもご利用いただけます。</p>
      </div>`;
    return;
  }

  if (route === 'settings') {
    titleEl.textContent = '設定';
    content.innerHTML =
      `<ul class="settings-list">
        <li><span>歌詞の文字サイズをリセット</span><button id="reset-font">リセット</button></li>
        <li><span>閲覧履歴を削除</span><button id="clear-history" class="danger">削除</button></li>
        <li><span>お気に入りをすべて削除</span><button id="clear-bookmarks" class="danger">削除</button></li>
      </ul>`;
    $('reset-font').addEventListener('click', () => {
      store.set(LS.fontSize, 24);
      applyFontSize(24);
      alert('文字サイズをリセットしました。');
    });
    $('clear-history').addEventListener('click', () => {
      if (confirm('閲覧履歴を削除しますか？')) store.set(LS.history, []);
    });
    $('clear-bookmarks').addEventListener('click', () => {
      if (confirm('お気に入りをすべて削除しますか？')) store.set(LS.bookmarks, []);
    });
  }
}

/* ---------- 화면 전환 / 라우팅 ---------- */
function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

function route() {
  const hash = location.hash || '#/';
  closeDrawer();
  const songMatch = hash.match(/^#\/song\/(\d+)/);
  if (songMatch) { openSong(parseInt(songMatch[1], 10)); return; }
  const sub = hash.match(/^#\/(bookmarks|history|about|settings)/);
  if (sub) { renderSub(sub[1]); showView('sub'); return; }
  showView('home');
}

/* ---------- 드로어 ---------- */
function openDrawer() {
  $('drawer').classList.add('open');
  $('drawer-overlay').classList.remove('hidden');
}
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawer-overlay').classList.add('hidden');
}

/* ---------- 글자 크기 ---------- */
function applyFontSize(px) {
  $('lyrics-text').style.fontSize = px + 'px';
  $('font-slider').value = px;
}

/* ---------- 이벤트 바인딩 ---------- */
function bindEvents() {
  // 검색
  const input = $('search-input');
  input.addEventListener('input', () => {
    input.closest('.search-box').classList.toggle('has-text', !!input.value);
    renderList(input.value.trim());
  });
  $('search-clear').addEventListener('click', () => {
    input.value = '';
    input.closest('.search-box').classList.remove('has-text');
    renderList('');
    input.focus();
  });

  // 드로어
  ['home-menu-btn', 'song-menu-btn', 'sub-menu-btn'].forEach(id =>
    $(id).addEventListener('click', openDrawer));
  $('drawer-overlay').addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.route;
      closeDrawer();
      location.hash = r === 'home' ? '#/' : `#/${r}`;
    });
  });

  // 곡 화면
  $('song-back-btn').addEventListener('click', () => history.back());
  $('sub-back-btn').addEventListener('click', () => { location.hash = '#/'; });
  $('song-search-btn').addEventListener('click', () => {
    location.hash = '#/';
    setTimeout(() => $('search-input').focus(), 50);
  });
  $('fab-toggle').addEventListener('click', () => setLyricsMode(!lyricsMode));
  $('fab-bookmark').addEventListener('click', () => {
    const active = toggleBookmark(currentNo);
    $('fab-bookmark').classList.toggle('active', active);
  });
  $('nav-prev').addEventListener('click', () => stepSong(-1));
  $('nav-next').addEventListener('click', () => stepSong(1));

  // 글자 크기 슬라이더
  $('font-slider').addEventListener('input', (e) => {
    const px = parseInt(e.target.value, 10);
    applyFontSize(px);
    store.set(LS.fontSize, px);
  });

  window.addEventListener('hashchange', route);
}

/* ---------- 시작 ---------- */
async function init() {
  bindEvents();
  applyFontSize(store.get(LS.fontSize, 24));
  try {
    await loadSongs();
  } catch (e) {
    $('song-list').innerHTML = '<div class="empty-msg">曲データを読み込めませんでした。</div>';
    return;
  }
  renderList('');
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
})();
