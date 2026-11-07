import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenManyLink (오픈매니링크) | 오픈소스 인스타그램 댓글→자동 DM & 링크 트래킹 솔루션',
  description:
    'Meta 공식 무료 Graph API 기반 오픈소스 인스타그램 댓글/스토리 자동 DM, 팔로우 여부 검증, 랜덤 답글 로테이션, 단축 링크 클릭(CTR) 분석 플랫폼',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F172A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
