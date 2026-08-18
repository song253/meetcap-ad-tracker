() => {
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const idNodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const m = n.textContent.match(/라이브러리 ID: (\d+)/);
    if (m) idNodes.push({ node: n, id: m[1] });
  }
  for (const { node, id } of idNodes) {
    let el = node.parentElement;
    let card = null;
    for (let i = 0; i < 14 && el; i++) {
      const vid = el.querySelector('video');
      const bigImgs = Array.from(el.querySelectorAll('img')).filter(im => !im.src.includes('s60x60'));
      if (vid || bigImgs.length) { card = el; break; }
      el = el.parentElement;
    }
    let media_type = null, media_url = null, poster = null, start_date = null;

    // 카드 범위(대략 상위 3단계 컨테이너)에서 날짜 텍스트 찾기
    let dateScope = card ? card.parentElement || card : node.parentElement;
    for (let i = 0; i < 4 && dateScope; i++) {
      const dm = dateScope.textContent.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.에 게재 시작함/);
      if (dm) { start_date = `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}`; break; }
      dateScope = dateScope.parentElement;
    }

    if (card) {
      const vid = card.querySelector('video');
      if (vid) {
        media_type = 'video';
        media_url = vid.currentSrc || vid.src;
        poster = vid.poster || null;
      } else {
        const imgs = Array.from(card.querySelectorAll('img')).filter(im => !im.src.includes('s60x60'));
        if (imgs.length) { media_type = 'image'; media_url = imgs[0].src; }
      }
    }
    results.push({ id, media_type, media_url, poster, start_date });
  }
  return results;
}
