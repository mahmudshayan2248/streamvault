(function(){
  'use strict';

  const CACHE_KEY = 'streamvault:fifa-live:last-real:v1';
  const FAST_PAST_MATCH_LIMIT = 6;
  const FAST_FORWARD_MATCH_LIMIT = 12;

  function clean(value){
    const text = String(value == null ? '' : value).trim();
    return text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined' ? text : '';
  }

  function esc(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function hasRealData(payload){
    return !!payload && ['liveMatches','upcomingMatches','recentResults','standings','headlines'].some(name=>Array.isArray(payload[name]) && payload[name].length);
  }

  function cachedPayload(){
    try{
      const payload = window.__svFifaCachedPayload || JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if(!hasRealData(payload))return null;
      return {
        ...payload,
        stale:true,
        source:payload.source || 'cache',
        message:payload.message || 'Showing cached football data while the live feed refreshes'
      };
    }catch(_err){
      return null;
    }
  }

  function writeCache(payload){
    try{
      if(hasRealData(payload))localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    }catch(_err){}
  }

  function provider(match){
    const raw = clean(match && match.provider || window.__svFifaFastPayload && window.__svFifaFastPayload.source).toLowerCase();
    if(raw === 'api-football' || raw.indexOf('api') !== -1)return 'api-football';
    return 'espn';
  }

  function matchKey(match){
    if(!match || !match.id)return '';
    return [provider(match), match.id, match.leagueSlug || ''].filter(Boolean).join(':');
  }

  function status(match){
    const raw = clean(match && (match.status || match.state || match.statusType)).toUpperCase();
    if(raw === 'LIVE' || raw === 'IN' || raw === 'IN_PROGRESS' || raw === 'HT')return { label:'LIVE', className:'is-live' };
    if(raw === 'FT' || raw === 'FINAL' || raw === 'STATUS_FINAL')return { label:'FINAL', className:'is-result', extraClass:'is-final' };
    return { label:'UPCOMING', className:'is-upcoming' };
  }

  function updateLiveShortcut(payload){
    const live = Array.isArray(payload && payload.liveMatches) && payload.liveMatches.some(match=>status(match).className === 'is-live');
    document.documentElement.classList.toggle('sv-fifa-match-live', !!live);
    const btn = document.getElementById('bnLiveMatch');
    if(btn){
      btn.classList.toggle('is-live', !!live);
      btn.dataset.fifaLive = live ? '1' : '0';
    }
  }

  function score(value){
    return value === 0 || value ? String(value) : '-';
  }

  function timeLabel(value){
    const text = clean(value);
    if(!text)return '';
    const date = new Date(text);
    if(Number.isNaN(date.getTime()))return text;
    return date.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function matchTime(match){
    const state = status(match);
    if(state.className === 'is-live')return clean(match && (match.minute || match.clock || match.displayClock || match.statusText)) || 'Live';
    if(state.className === 'is-result')return timeLabel(match && (match.startTime || match.kickoff)) || 'FT';
    return timeLabel(match && (match.startTime || match.kickoff));
  }

  function matchMeta(match){
    return [
      clean(match && (match.competition || match.league || match.stage || match.group)),
      clean(match && match.venue),
      matchTime(match)
    ].filter(Boolean).join(' / ');
  }

  function countdownText(match){
    if(!match)return '';
    const state = status(match);
    if(state.className === 'is-live'){
      const start = new Date((match && (match.startTime || match.kickoff)) || '');
      if(!Number.isNaN(start.getTime())){
        const hours = Math.max(0, (Date.now() - start.getTime()) / 3600000);
        return `${hours.toFixed(2)} Live`;
      }
      const rawClock = clean(match && (match.minute || match.clock || match.displayClock || match.time));
      const clock = rawClock.match(/(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/);
      if(clock){
        const minutes = Number(clock[1]) + Number(clock[2] || 0);
        return `${Math.max(0, minutes / 60).toFixed(2)} Live`;
      }
      return '--.-- Live';
    }
    if(state.className === 'is-result')return 'Final';
    const start = new Date((match && (match.startTime || match.kickoff)) || '');
    if(Number.isNaN(start.getTime()))return '--.-- hours left';
    const hours = Math.max(0, (start.getTime() - Date.now()) / 3600000);
    return `${hours.toFixed(2)} hours left`;
  }

  function startCountdown(match){
    if(window.__svFifaFastCountdownTimer){
      clearInterval(window.__svFifaFastCountdownTimer);
      window.__svFifaFastCountdownTimer = null;
    }
    const el = document.querySelector('[data-fifa-feature-timer]');
    if(!el)return;
    if(!match){
      el.textContent = '';
      el.hidden = true;
      return;
    }
    const update = ()=>{
      el.textContent = countdownText(match);
      el.hidden = !el.textContent;
    };
    update();
    const state = status(match);
    if(state.className === 'is-live' || state.className === 'is-upcoming'){
      window.__svFifaFastCountdownTimer = setInterval(update, 30000);
    }
  }

  function uniqueMatches(list, limit, seen){
    const out = [];
    const used = seen || new Set();
    (Array.isArray(list) ? list : []).some(match=>{
      const key = matchKey(match) || [teamName(match, 'home', ''), teamName(match, 'away', ''), match && (match.startTime || match.kickoff)].join(':');
      if(!key || used.has(key))return false;
      used.add(key);
      out.push(match);
      return limit && out.length >= limit;
    });
    return out;
  }

  function carouselMatches(payload){
    const seen = new Set();
    const live = Array.isArray(payload && payload.liveMatches) ? payload.liveMatches : [];
    const upcoming = Array.isArray(payload && payload.upcomingMatches) ? payload.upcomingMatches : [];
    const recent = Array.isArray(payload && payload.recentResults) ? payload.recentResults : [];
    const forward = uniqueMatches(live.concat(upcoming), FAST_FORWARD_MATCH_LIMIT, seen);
    const past = uniqueMatches(recent, FAST_PAST_MATCH_LIMIT, seen).reverse();
    if(forward.length){
      return { matches:past.concat(forward), startIndex:past.length, pastCount:past.length, forwardCount:forward.length };
    }
    const fallback = uniqueMatches(recent, FAST_PAST_MATCH_LIMIT, new Set());
    return { matches:fallback, startIndex:0, pastCount:fallback.length, forwardCount:0 };
  }

  function teamName(match, side, fallback){
    return clean(match && (match[side + 'Team'] || match[side] && (match[side].name || match[side].team))) || fallback || 'Team';
  }

  const COUNTRY_CODES = {
    algeria:'DZ',argentina:'AR',australia:'AU',austria:'AT',belgium:'BE','bosnia herzegovina':'BA',bosnia:'BA',brazil:'BR',canada:'CA',colombia:'CO',croatia:'HR',curacao:'CW','curaçao':'CW',
    czechia:'CZ','czech republic':'CZ',denmark:'DK',ecuador:'EC',england:'GB-ENG',france:'FR',germany:'DE',ghana:'GH',haiti:'HT',iraq:'IQ',
    egypt:'EG',iran:'IR',italy:'IT','ivory coast':'CI','cote d ivoire':'CI',japan:'JP',jordan:'JO',mexico:'MX',morocco:'MA',netherlands:'NL','new zealand':'NZ',norway:'NO',panama:'PA',paraguay:'PY',
    portugal:'PT',qatar:'QA','saudi arabia':'SA',scotland:'GB-SCT',senegal:'SN','south africa':'ZA','south korea':'KR',spain:'ES',sweden:'SE',switzerland:'CH',tunisia:'TN',
    turkiye:'TR',turkey:'TR','united states':'US',usa:'US',uruguay:'UY','cape verde':'CV',wales:'GB-WLS',uzbekistan:'UZ'
  };
  const THREE_LETTER_CODES = {ARG:'AR',AUS:'AU',BEL:'BE',BRA:'BR',CAN:'CA',COL:'CO',CIV:'CI',CUW:'CW',CZE:'CZ',DEN:'DK',ECU:'EC',ENG:'GB-ENG',FRA:'FR',GER:'DE',GHA:'GH',HAI:'HT',ITA:'IT',JPN:'JP',KOR:'KR',MAR:'MA',MEX:'MX',NED:'NL',NOR:'NO',PAR:'PY',POR:'PT',QAT:'QA',RSA:'ZA',SCO:'GB-SCT',SEN:'SN',ESP:'ES',SWE:'SE',SUI:'CH',TUR:'TR',USA:'US',UZB:'UZ',WAL:'GB-WLS'};
  const SUBDIVISION_FLAGS = {
    'GB-ENG':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0065,0xe006e,0xe0067,0xe007f),
    'GB-SCT':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0073,0xe0063,0xe0074,0xe007f),
    'GB-WLS':String.fromCodePoint(0x1f3f4,0xe0067,0xe0062,0xe0077,0xe006c,0xe0073,0xe007f)
  };

  function flagFromCode(code){
    const raw = clean(code).toUpperCase();
    const value = THREE_LETTER_CODES[raw] || raw;
    if(SUBDIVISION_FLAGS[value])return SUBDIVISION_FLAGS[value];
    if(!/^[A-Z]{2}$/.test(value))return '';
    return value.split('').map(ch=>String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join('');
  }

  function isFlagEmoji(value){
    const chars = Array.from(clean(value));
    if(chars.includes(String.fromCodePoint(0x1f3f4)))return true;
    return chars.length >= 2 && chars.slice(0,2).every(ch=>ch.codePointAt(0) >= 0x1f1e6 && ch.codePointAt(0) <= 0x1f1ff);
  }

  function teamFlag(match, side){
    const raw = clean(match && (match[side + 'Flag'] || match[side] && match[side].flag));
    if(raw && !/^https?:\/\//i.test(raw)){
      if(isFlagEmoji(raw))return raw;
      const fromRaw = flagFromCode(raw);
      if(fromRaw)return fromRaw;
    }
    const code = clean(match && (match[side + 'CountryCode'] || match[side] && (match[side].countryCode || match[side].code)));
    return flagFromCode(code) || flagFromCode(COUNTRY_CODES[teamName(match, side, '').toLowerCase()]);
  }

  function teamHtml(match, side, fallback){
    const flag = teamFlag(match, side);
    const flagHtml = flag
      ? `<span class="fifa-team-flag emoji" data-fifa-flag="1" aria-hidden="true">${esc(flag)}</span>`
      : '<span class="fifa-team-flag fifa-team-flag-blank" data-fifa-flag="0" aria-hidden="true"></span>';
    return `<span class="fifa-team-name">${flagHtml}<span>${esc(teamName(match, side, fallback))}</span></span>`;
  }

  function renderFeatured(match, key){
    const state = status(match);
    return `
      <article class="fifa-featured-card-inner ${state.className} ${state.extraClass || ''} is-clickable" role="button" tabindex="0" data-fifa-match-key="${esc(key)}" aria-label="View details for ${esc(teamName(match,'home','home'))} versus ${esc(teamName(match,'away','away'))}">
        <div class="fifa-feature-scoreboard">
          <div class="fifa-feature-team fifa-feature-team-home">${teamHtml(match, 'home', 'Home')}</div>
          <div class="fifa-feature-score" aria-label="Featured match score">
            <span>${esc(score(match && match.homeScore))}</span>
            <b>-</b>
            <span>${esc(score(match && match.awayScore))}</span>
          </div>
          <div class="fifa-feature-team fifa-feature-team-away">${teamHtml(match, 'away', 'Away')}</div>
        </div>
        <div class="fifa-match-meta fifa-feature-meta">${esc(matchMeta(match) || state.label)}</div>
      </article>
    `;
  }

  function renderCard(match, key, options){
    const state = status(match);
    const kind = options && options.kind ? options.kind : (state.className === 'is-result' ? 'past' : 'forward');
    const startAttr = options && options.start ? ' data-fifa-carousel-start="1"' : '';
    return `
      <article class="fifa-match-card ${state.className} ${state.extraClass || ''} is-clickable" role="button" tabindex="0" data-fifa-match-key="${esc(key)}" data-fifa-card-kind="${esc(kind)}"${startAttr} aria-label="View details for ${esc(teamName(match,'home','home'))} versus ${esc(teamName(match,'away','away'))}">
        <div class="fifa-card-label ${state.className}">
          ${state.className === 'is-live' ? '<span class="fifa-live-dot"></span>' : ''}${esc(state.label)}
          <span>${esc(matchTime(match))}</span>
        </div>
        <div class="fifa-scoreboard">
          <div class="fifa-team-line"><span>${teamHtml(match, 'home', 'Home')}</span><strong>${esc(score(match && match.homeScore))}</strong></div>
          <div class="fifa-team-line"><span>${teamHtml(match, 'away', 'Away')}</span><strong>${esc(score(match && match.awayScore))}</strong></div>
        </div>
        <div class="fifa-match-meta">${esc(matchMeta(match))}</div>
        <div class="fifa-detail-cta">View details</div>
      </article>
    `;
  }

  function renderStandings(rows){
    const list = Array.isArray(rows) ? rows.slice(0, 6) : [];
    if(!list.length)return '';
    const groupName = clean(list[0] && list[0].group) || 'Group';
    return `
      <div class="fifa-table-title">${esc(groupName)}</div>
      <div class="fifa-table-head"><span>Team</span><span>MP</span><span>GD</span><span>PTS</span></div>
      ${list.map(row=>`
        <div class="fifa-table-row">
          <span><b>${esc(row.rank || '')}</b>${teamHtml(row, '', clean(row.team) || 'Team')}</span>
          <span>${esc(row.played == null ? 0 : row.played)}</span>
          <span>${esc(row.goalDifference == null ? 0 : row.goalDifference)}</span>
          <strong>${esc(row.points == null ? 0 : row.points)}</strong>
        </div>
      `).join('')}
    `;
  }

  function signature(payload){
    const carousel = carouselMatches(payload || {});
    const matches = carousel.matches.map(match=>[match && match.id, match && match.homeScore, match && match.awayScore, match && match.status, match && match.startTime].join(':'));
    return [payload.generatedAt || '', payload.source || '', !!payload.stale, matches.join('|')].join('::');
  }

  function positionStrip(stripEl, startIndex){
    if(!stripEl)return;
    stripEl.dataset.svFifaCarouselStartIndex = String(startIndex || 0);
    if(!startIndex)return;
    requestAnimationFrame(()=>{
      const target = stripEl.querySelector('[data-fifa-carousel-start="1"]');
      if(!target)return;
      stripEl.scrollLeft = Math.max(0, target.offsetLeft - stripEl.offsetLeft - 8);
    });
  }

  function render(payload, source){
    if(!hasRealData(payload))return false;
    const root = document.getElementById('fifaLiveRoot');
    if(!root)return false;
    const live = Array.isArray(payload.liveMatches) ? payload.liveMatches : [];
    const upcoming = Array.isArray(payload.upcomingMatches) ? payload.upcomingMatches : [];
    const recent = Array.isArray(payload.recentResults) ? payload.recentResults : [];
    const standings = Array.isArray(payload.standings) ? payload.standings : [];
    const carousel = carouselMatches(payload);
    const matches = carousel.matches;
    const featured = live[0] || upcoming[0] || recent[0] || null;
    const sig = signature(payload);
    updateLiveShortcut(payload);
    if(root.dataset.svFifaFastSignature === sig)return true;

    root.classList.remove('is-loading');
    root.classList.toggle('is-stale', !!payload.stale);
    root.classList.toggle('is-error', !payload.ok && !matches.length && !standings.length);
    root.classList.toggle('is-empty', !matches.length && !standings.length);
    root.classList.toggle('has-standings', standings.length > 0);
    root.dataset.svFifaFastRendered = '1';
    root.dataset.svFifaFastSource = source || (payload.stale ? 'local-cache' : 'early-api');
    root.dataset.svFifaFastSignature = sig;
    root.dataset.svFifaPastCount = String(carousel.pastCount || 0);
    root.dataset.svFifaForwardCount = String(carousel.forwardCount || 0);

    const featuredEl = document.getElementById('fifaFeaturedMatch');
    if(featuredEl){
      const isLive = featured && status(featured).className === 'is-live';
      featuredEl.classList.toggle('is-live-featured', !!isLive);
      featuredEl.classList.toggle('is-live', !!isLive);
      featuredEl.innerHTML = featured
        ? renderFeatured(featured, matchKey(featured))
        : '<div class="fifa-featured-empty"><div class="fifa-card-label">Real data</div><div class="fifa-empty-title">No live matches right now</div><div class="fifa-match-meta">Waiting for the next real fixture update</div></div>';
    }

    const standingsEl = document.getElementById('fifaStandingsCard');
    if(standingsEl){
      standingsEl.innerHTML = renderStandings(standings);
      standingsEl.hidden = !standings.length;
    }

    const stripEl = document.getElementById('fifaMatchStrip');
    if(stripEl){
      stripEl.innerHTML = matches.map((match, index)=>renderCard(match, matchKey(match), {
        kind:index < carousel.startIndex ? 'past' : 'forward',
        start:index === carousel.startIndex
      })).join('');
      stripEl.hidden = !matches.length;
      positionStrip(stripEl, carousel.startIndex);
    }
    const stripWrapEl = document.getElementById('fifaMatchStripWrap');
    if(stripWrapEl)stripWrapEl.hidden = !matches.length;

    const headlinesEl = document.getElementById('fifaHeadlineStrip');
    if(headlinesEl)headlinesEl.hidden = true;

    window.__svFifaFastPayload = payload;
    window.__svFifaFastRenderAt = (window.performance && performance.now) ? performance.now() : Date.now();
    startCountdown(featured);
    return true;
  }

  const cached = cachedPayload();
  if(cached)render(cached, 'local-cache');

  const earlyPromise = window.__svFifaLiveEarlyPromise || fetch('/api/fifa-live?priority=1', {
    cache:'no-store',
    headers:{ Accept:'application/json' }
  }).then(response=>response.ok ? response.json() : null).catch(()=>null);

  window.__svFifaFastReady = Promise.resolve(earlyPromise).then(payload=>{
    if(!hasRealData(payload))return null;
    writeCache(payload);
    render(payload, 'early-api');
    return payload;
  });
})();
