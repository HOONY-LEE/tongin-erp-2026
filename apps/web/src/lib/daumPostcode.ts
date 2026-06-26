// 카카오(다음) 우편번호 서비스 — 무료·키 불필요. 스크립트를 지연 로드해 팝업 검색.
const SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export interface PostcodeResult {
  zonecode: string; // 우편번호(5자리)
  roadAddress: string; // 도로명주소
  jibunAddress: string; // 지번주소
  sido: string; // 시/도
  sigungu: string; // 시/군/구
  bname: string; // 법정동/리
  buildingName: string; // 건물명
}

interface DaumWindow {
  daum?: { Postcode: new (opts: unknown) => { open: () => void } };
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if ((window as unknown as DaumWindow).daum?.Postcode) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('우편번호 서비스를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
  return loading;
}

/** 우편번호 팝업을 열고, 선택 결과를 반환(취소 시 null). */
export async function openPostcode(): Promise<PostcodeResult | null> {
  await loadScript();
  const Postcode = (window as unknown as DaumWindow).daum!.Postcode;
  return new Promise<PostcodeResult | null>((resolve) => {
    let result: PostcodeResult | null = null;
    new Postcode({
      oncomplete: (data: PostcodeResult) => {
        result = data;
      },
      onclose: () => resolve(result),
    }).open();
  });
}
