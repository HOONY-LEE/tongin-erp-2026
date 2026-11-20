import { defineNs } from './define';

/** 상담 기록 — 통화 받아쓰기 */
export default defineNs({
  ko: {
    title: '통화 받아쓰기',
    show: '받아쓰기 보기',
    hide: '접기',
    loading: '불러오는 중…',
    empty: '받아쓴 내용이 없습니다',
    failed: '받아쓰기를 불러오지 못했습니다',
    speaker: '화자 {{n}}',
    agent: '상담원',
    customer: '고객',
    note: '화자 구분은 자동이라 상담원·고객이 바뀌어 보일 수 있습니다',
  },
  en: {
    title: 'Call transcript',
    show: 'Show transcript',
    hide: 'Hide',
    loading: 'Loading…',
    empty: 'No transcript text',
    failed: 'Could not load the transcript',
    speaker: 'Speaker {{n}}',
    agent: 'Agent',
    customer: 'Customer',
    note: 'Speakers are detected automatically and may be swapped',
  },
  zh: {
    title: '通话转写',
    show: '查看转写',
    hide: '收起',
    loading: '加载中…',
    empty: '没有转写内容',
    failed: '无法加载转写',
    speaker: '说话人 {{n}}',
    agent: '客服',
    customer: '客户',
    note: '说话人为自动识别，可能会互换',
  },
});
