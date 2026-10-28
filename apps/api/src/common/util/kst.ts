/**
 * 한국 날짜(Asia/Seoul) 'YYYYMMDD' — 문서번호(견적·계약·접수·결제)에 붙이는 날짜.
 * 서버(Render)는 UTC라 그냥 getDate()를 쓰면 00~09시(KST)에 만든 번호가 전날 날짜가 된다.
 */
export function kstYmd(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(/-/g, '');
}
