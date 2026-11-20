import { defineNs } from './define';

/**
 * 서버 코드값 이름(@tongin/shared의 *_LABEL) 번역 — codeLabel('그룹', 값, 한국어표)로 쓴다.
 * 여기 없는 값은 한국어표(서버와 같은 이름)로 보인다.
 */
export default defineNs({
  ko: {
    employmentType: {
      REGULAR: '정규직',
      CONTRACT: '계약직',
      PART_TIME: '파트타임',
      INTERN: '인턴',
    },
  },
  en: {
    employmentType: {
      REGULAR: 'Full-time',
      CONTRACT: 'Contract',
      PART_TIME: 'Part-time',
      INTERN: 'Intern',
    },
  },
  zh: {
    employmentType: {
      REGULAR: '正式员工',
      CONTRACT: '合同工',
      PART_TIME: '兼职',
      INTERN: '实习生',
    },
  },
});
