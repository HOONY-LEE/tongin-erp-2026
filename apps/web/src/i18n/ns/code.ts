import { defineNs } from './define';

/**
 * 서버 코드값 이름(@tongin/shared의 *_LABEL) 번역 — codeLabel('그룹', 값, 한국어표)로 쓴다.
 * 여기 없는 값은 한국어표(서버와 같은 이름)로 보인다.
 */
export default defineNs({
  ko: {
    /** 반려·취소 형태 — 서버에는 한국어 그대로 저장, 화면 이름만 번역 */
    reason: {
      '지점 마감': '지점 마감',
      '지점 견적 거부': '지점 견적 거부',
      '서비스 지역 아님': '서비스 지역 아님',
      '일정 불가': '일정 불가',
      '중복 접수': '중복 접수',
      '고객 취소': '고객 취소',
      '이사일 마감': '이사일 마감',
      '타사 계약': '타사 계약',
      '연락 불가': '연락 불가',
      기타: '기타',
    },
    employmentType: {
      REGULAR: '정규직',
      CONTRACT: '계약직',
      PART_TIME: '파트타임',
      INTERN: '인턴',
    },
  },
  en: {
    reason: {
      '지점 마감': 'Branch closed',
      '지점 견적 거부': 'Branch declined to quote',
      '서비스 지역 아님': 'Outside service area',
      '일정 불가': 'Schedule unavailable',
      '중복 접수': 'Duplicate lead',
      '고객 취소': 'Customer canceled',
      '이사일 마감': 'Moving day full',
      '타사 계약': 'Signed with another company',
      '연락 불가': 'Unreachable',
      기타: 'Other',
    },
    employmentType: {
      REGULAR: 'Full-time',
      CONTRACT: 'Contract',
      PART_TIME: 'Part-time',
      INTERN: 'Intern',
    },
  },
  zh: {
    reason: {
      '지점 마감': '分店已满',
      '지점 견적 거부': '分店拒绝报价',
      '서비스 지역 아님': '不在服务区域',
      '일정 불가': '日程无法安排',
      '중복 접수': '重复受理',
      '고객 취소': '客户取消',
      '이사일 마감': '搬家日已满',
      '타사 계약': '与他司签约',
      '연락 불가': '无法联系',
      기타: '其他',
    },
    employmentType: {
      REGULAR: '正式员工',
      CONTRACT: '合同工',
      PART_TIME: '兼职',
      INTERN: '实习生',
    },
  },
});
