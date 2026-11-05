/**
 * 서버가 HTML로 그려 주는 문서(견적서·계약서, 고객 공개 링크 포함)의 CSP.
 * 스크립트는 인쇄 버튼(onclick="window.print()") 하나만 해시로 허락한다 — 고객·직원이 넣은 글자가
 * 이스케이프를 빠져나가도 다른 스크립트는 돌지 않는다. 같은 사이트 화면(미리보기 iframe)에서만 띄우고,
 * 그림은 서명(data:)·직인(https)만, 스타일은 문서 안 <style>.
 */
const PRINT_HANDLER_HASH = "'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='"; // window.print()
export const HTML_DOC_CSP =
  `default-src 'none'; script-src 'unsafe-hashes' ${PRINT_HANDLER_HASH}; ` +
  "img-src data: https:; style-src 'unsafe-inline'; font-src data: https:; " +
  "frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
