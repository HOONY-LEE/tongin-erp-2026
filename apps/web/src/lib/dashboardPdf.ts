/**
 * 대시보드를 PDF 파일로 받기 — 화면 그대로 그림으로 떠서 A4 가로에 맞춰 넣는다(길면 여러 쪽).
 * 받은 PDF를 열어 인쇄하면 된다. 라이브러리는 누를 때만 불러온다(첫 화면 크기에 안 들어감).
 */
export async function downloadDashboardPdf(el: HTMLElement, title: string) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
  const canvas = await toCanvas(el, {
    pixelRatio: 2,
    backgroundColor: bg,
    cacheBust: true,
    // 버튼(새로고침·설정·받기)은 종이에 필요 없다
    filter: (node) => !(node instanceof HTMLElement && node.dataset.pdfSkip !== undefined),
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const w = pageW - margin * 2;
  const h = pageH - margin * 2;
  // 그림 1mm에 해당하는 픽셀 — 한 쪽 높이만큼씩 잘라 넣는다
  const pxPerMm = canvas.width / w;
  const slicePx = Math.floor(h * pxPerMm);
  for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = Math.min(slicePx, canvas.height - y);
    const ctx = part.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, -y);
    if (page > 0) pdf.addPage();
    pdf.addImage(
      part.toDataURL('image/jpeg', 0.92),
      'JPEG',
      margin,
      margin,
      w,
      part.height / pxPerMm,
    );
  }
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  pdf.save(`${title}-${ymd}.pdf`);
}
