// 맥 앱 전체를 ad-hoc 서명한다(애플 개발자 인증서가 없어서).
// 서명 없이 두면 실행 파일에만 링커 서명이 남아 번들 서명이 깨지고, 인터넷에서 받은 앱을 macOS가
// "손상되었기 때문에 열 수 없습니다"로 막는다(열기 선택지 없음). ad-hoc 서명이면 "확인되지 않은 개발자"로 바뀌어
// 시스템 설정 → 개인정보 보호 및 보안 → '그래도 열기'로 열 수 있다.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
