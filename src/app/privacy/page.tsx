import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/ui';

export const metadata: Metadata = { title: '개인정보처리방침' };
export const dynamic = 'force-dynamic';
export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  const validContact = contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : null;
  return <main className="privacy-page"><header className="privacy-header"><Link href="/" className="admin-brand"><BrandMark/><span>다음 장</span></Link><Link href="/" className="privacy-return"><ArrowLeft size={15}/>돌아가기</Link></header><article className="privacy-document"><p className="eyebrow">2026년 10월 31일 시행</p><h1>개인정보처리방침</h1><p className="privacy-intro">다음 장에서 어떤 정보를 보관하고 어떻게 사용하는지 안내합니다.</p>
    <section><h2>보관하는 정보와 사용 목적</h2><p>회원가입 시 이메일과 비밀번호를 받아 계정을 만들고 로그인에 사용합니다. 비밀번호는 인증 서비스에서 해시 형태로 보관하며 운영자가 원문을 조회할 수 없습니다. 닉네임은 직접 설정한 경우 보관합니다.</p><p>회원이 작성한 할 일, 목표, 회고, 서재, 감상, 집중 기록, 메모, 학습 자료와 첨부 사진을 저장해 기록 작성·조회·검색·내보내기 기능을 제공합니다. 함께 확인 기능을 사용하면 상대 계정과의 연결 상태와 공유 설정도 보관합니다.</p><p>가입·로그인 시각, 기능별 저장·완료 횟수, 마지막 활동 시각을 계정 관리와 이용 현황 확인에 사용합니다. 인증·호스팅 과정에서 IP 주소, 브라우저 정보와 요청 시각 등이 보안 및 장애 대응 목적으로 처리될 수 있습니다.</p></section>
    <section><h2>공유 설정과 운영자 열람</h2><p>기록은 다른 회원에게 기본 공개되지 않습니다. 함께 확인할 할 일과 사진은 회원이 각각 직접 선택한 경우에만 현재 연결된 상대에게 공유됩니다. 개인 메모와 회고는 상대에게 공유되지 않습니다.</p><p>권한이 부여된 운영자는 서비스 운영, 회원 문의 처리, 오류 확인 및 보안 대응을 위해 계정 정보와 회원이 저장한 모든 종류의 기록·첨부 사진을 열람할 수 있습니다. 비밀번호 원문과 인증 비밀키는 관리 화면에 제공하지 않습니다. 관리자 권한을 제한하고 계정·기록·사진 조회 및 계정 분류 변경 이력을 남깁니다.</p><p>운영 목적에 필요한 범위에서 열람하며, 회원의 기록을 광고나 판매 목적으로 사용하지 않습니다.</p></section>
    <section><h2>보관 기간과 삭제</h2><p>계정과 작성한 기록은 회원이 삭제하거나 탈퇴할 때까지 보관합니다. 회원 탈퇴 처리 시 운영 데이터베이스의 계정·기록과 첨부 사진을 삭제합니다. 법령에 따라 보존해야 하는 정보가 있는 경우에는 해당 근거와 기간에 따라 별도로 보관합니다.</p><p>이용 현황과 관리자 열람 이력은 최근 90일분을 관리합니다. 관리 현황 조회 시 기간이 지난 기록을 정리하며, 탈퇴 시 계정별 이용 집계는 삭제하고 열람 이력의 해당 계정 참조는 제거합니다.</p></section>
    <section><h2>서비스를 운영하는 데 사용하는 사업자</h2><div className="privacy-table-wrap"><table><thead><tr><th scope="col">사업자</th><th scope="col">처리 업무</th></tr></thead><tbody><tr><th scope="row">Supabase</th><td>회원 인증, 데이터베이스, 첨부 사진 저장. 프로젝트의 데이터 저장 리전은 서울입니다.</td></tr><tr><th scope="row">Vercel</th><td>웹 서비스 호스팅, 서버 요청 처리와 배포. 서버 실행 리전은 서울이며 서비스 전달·운영 과정에 글로벌 인프라가 사용됩니다.</td></tr></tbody></table></div><p>사업자의 운영·지원 및 하위 처리업체 이용 과정에서 국외 처리가 발생할 수 있습니다. 처리 위치와 보호 조치에 관한 사업자 문서는 <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase 개인정보 안내</a>, <a href="https://supabase.com/legal/dpa" target="_blank" rel="noreferrer">Supabase 데이터 처리 약정</a>, <a href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Vercel 개인정보 안내</a>에서 확인할 수 있습니다.</p><p>외부 작품을 검색하면 검색어가 해당 정보 제공 서비스에 전달됩니다. 학습 자료의 제목을 가져오는 경우에는 서버에서 해당 자료 주소에 요청합니다. 이때 회원의 이메일이나 개인 메모는 전달하지 않습니다.</p></section>
    <section><h2>쿠키와 접근 보호</h2><p>로그인 유지와 인증에 필요한 쿠키를 사용합니다. 브라우저에서 쿠키를 차단하거나 삭제할 수 있으며, 이 경우 로그인이 제한될 수 있습니다. 광고용 추적 쿠키는 사용하지 않습니다.</p><p>회원별 접근 권한을 확인하고 관리자 기능은 별도 권한이 있는 계정에만 제공합니다. 첨부 사진은 비공개 저장소에 보관하며 사진 요청마다 접근 권한을 확인합니다.</p></section>
    <section><h2>기록 확인·수정·삭제와 문의</h2><p>서비스에서 본인의 기록을 확인·수정·삭제할 수 있습니다. 내 계정에서 기록을 내보내거나 회원 탈퇴를 요청할 수 있습니다. 개인정보 열람, 정정·삭제, 처리 정지에 관한 요청과 문의는 아래 연락처로 보내주세요. 본인 확인 후 처리 결과를 안내합니다.</p><dl className="privacy-contact"><div><dt>개인정보 문의 담당</dt><dd>다음 장 운영자</dd></div><div><dt>이메일</dt><dd>{validContact ? <a href={'mailto:' + validContact}>{validContact}</a> : '문의처를 확인할 수 없습니다. 잠시 후 다시 확인해주세요.'}</dd></div></dl></section>
    <section><h2>방침 변경</h2><p>처리 방식이 변경되면 이 페이지에 변경 내용과 시행일을 게시합니다. 추가 안내가 필요한 변경은 관련 기준에 따라 안내합니다.</p><p className="privacy-version">최초 시행: 2026년 10월 31일</p></section>
  </article><footer className="privacy-footer"><span>다음 장</span><Link href="/">서비스로 돌아가기</Link></footer></main>;
}
