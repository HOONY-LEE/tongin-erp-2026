// 중복 접수 확인 창(접수 화면·상담 화면 공통)
import { defineNs } from './define';

export default defineNs({
  ko: {
    title: '중복 접수 확인',
    found: '같은 출발지·같은 서비스 요청일로 먼저 들어온 접수가 {{n}}건 있습니다.',
    customer: '고객',
    scriptTitle: '고객 안내',
    script:
      '“{{name}} 님께서도 같은 건으로 먼저 전화 주셨는데, {{name}} 님 맞으실까요? 먼저 접수된 내용으로 진행할지, 오늘 말씀하신 내용으로 할지 하나로 진행해 드리겠습니다.”',
    existing: '먼저 접수된 건으로',
    replace: '지금 내용으로 새로 접수',
    separate: '다른 건 · 따로 접수',
    linked: '먼저 접수된 {{v0}}에 이었습니다.',
    replacedOld: '먼저 들어온 접수(중복 접수로 취소)',
    replacedBy: '이 접수 대신 진행하는 접수',
  },
  en: {
    title: 'Possible duplicate',
    found: '{{n}} lead(s) already exist with the same origin address and service date.',
    customer: 'Customer',
    scriptTitle: 'What to tell the customer',
    script:
      '“{{name}} already called us about the same move — is that right? We can go with that request or with what you told us today, but only one of them.”',
    existing: 'Use existing lead',
    replace: 'Register this one instead',
    separate: 'Different case · register',
    linked: 'Linked to existing lead {{v0}}.',
    replacedOld: 'Earlier lead (canceled as duplicate)',
    replacedBy: 'Lead that replaced this one',
  },
  zh: {
    title: '重复受理确认',
    found: '已有 {{n}} 条相同出发地址、相同服务日期的受理。',
    customer: '客户',
    scriptTitle: '客户说明',
    script:
      '“{{name}} 已就同一件事来电，请问是 {{name}} 吗？我们可以按先前受理的内容，或按您今天所说的内容办理，只办理其中一项。”',
    existing: '按先前受理办理',
    replace: '按当前内容重新受理',
    separate: '不同事项 · 另行受理',
    linked: '已关联到先前受理 {{v0}}。',
    replacedOld: '先前受理（因重复已取消）',
    replacedBy: '替代本受理的受理',
  },
});
