// ─────────────────────────────────────────────────────────────────
//  MARRYWELL 파트너스 — Google Apps Script 백엔드  v2.0
//  배포: 웹 앱으로 배포 > 액세스: 모든 사람 (익명 포함)
// ─────────────────────────────────────────────────────────────────

// ── 시트 이름 상수 ─────────────────────────────────────────────
const SHEET_PARTNERS    = 'Partners';
const SHEET_MATERIALS   = 'Materials';
const SHEET_REFERRALS   = 'Referrals';
const SHEET_SETTLEMENTS = 'Settlements';

// ── 관리자 토큰 (admin.html에서 자료 등록/삭제 시 사용) ─────────
const ADMIN_TOKEN = 'mw_admin_2025';

// ─────────────────────────────────────────────────────────────────
//  GET 라우터
// ─────────────────────────────────────────────────────────────────
function doGet(e) {
  const p      = (e && e.parameter) || {};
  const action = p.action || 'list';

  // 파트너 목록 조회 (기존)
  if (action === 'list')        return listPartners();

  // 파트너 상태 업데이트 (기존)
  if (action === 'update')      return updatePartner(p.id, p.status, p.code);

  // 파트너 포털 로그인
  if (action === 'partnerLogin') return partnerLogin(p.code, p.pw);

  // 마케팅 자료 목록
  if (action === 'materials')   return listMaterials(p.tier);

  // 파트너별 고객 명단 조회
  if (action === 'referrals')   return listReferrals(p.code);

  // 전체 고객 명단 조회 (관리자)
  if (action === 'allReferrals') {
    if (p.token !== ADMIN_TOKEN) return jsonOut({ error: 'unauthorized' });
    return listAllReferrals();
  }

  // 정산 내역 조회
  if (action === 'settlements') return listSettlements(p.code);

  // 고객 명단 상태 업데이트 (관리자)
  if (action === 'updateReferral') {
    if (p.token !== ADMIN_TOKEN) return jsonOut({ error: 'unauthorized' });
    return updateReferralStatus(p.id, p.status);
  }

  // 자료 노출 토글 (관리자)
  if (action === 'toggleMaterial') {
    if (p.token !== ADMIN_TOKEN) return jsonOut({ error: 'unauthorized' });
    return toggleMaterial(p.id, p.active === 'true');
  }

  // 자료 삭제 (관리자)
  if (action === 'deleteMaterial') {
    if (p.token !== ADMIN_TOKEN) return jsonOut({ error: 'unauthorized' });
    return deleteMaterial(p.id);
  }

  return jsonOut({ error: 'unknown action' });
}

// ─────────────────────────────────────────────────────────────────
//  POST 라우터
// ─────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action || '';

    // 신규 파트너 신청 (기존)
    if (action === 'apply' || !action) return applyPartner(data);

    // 고객 단건 등록
    if (action === 'submitReferral')     return submitReferral(data);

    // 고객 일괄 등록
    if (action === 'submitReferralBulk') return submitReferralBulk(data);

    // 마케팅 자료 등록 (관리자)
    if (action === 'addMaterial') {
      if (data.token !== ADMIN_TOKEN) return jsonOut({ success: false, error: 'unauthorized' });
      return addMaterial(data);
    }

    // 플라이어 이메일 발송 (관리자)
    if (action === 'sendFlyer') {
      if (data.token !== ADMIN_TOKEN) return jsonOut({ success: false, error: 'unauthorized' });
      return sendFlyerEmail(data);
    }

    return jsonOut({ success: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  PARTNERS 시트 (기존)
// ─────────────────────────────────────────────────────────────────
function getPartnersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PARTNERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PARTNERS);
    sheet.appendRow(['id','name','phone','email','sns','biz','tier','channel','msg','date','status','code','referrals','payback','pw']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,15).setFontWeight('bold');
  }
  return sheet;
}

function listPartners() {
  const sheet   = getPartnersSheet();
  const rows    = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);
  const headers = rows[0];
  return jsonOut(rows.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  }));
}

function updatePartner(id, status, code) {
  const sheet   = getPartnersSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol     = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const codeCol   = headers.indexOf('code');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      if (status && statusCol >= 0) sheet.getRange(i+1, statusCol+1).setValue(status);
      if (code   && codeCol   >= 0) sheet.getRange(i+1, codeCol+1).setValue(code);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'not found' });
}

function applyPartner(data) {
  const sheet   = getPartnersSheet();
  const lastRow = sheet.getLastRow();
  const newId   = Math.max(lastRow, 1);
  const initPw  = 'MW-' + Math.random().toString(36).substr(2,4).toUpperCase(); // 임시 비번
  sheet.appendRow([
    newId, data.name||'', data.phone||'', data.email||'', data.sns||'', data.biz||'',
    data.tier||'5-9', data.channel||'', data.msg||'',
    Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd'),
    'pending', '', 0, 0, initPw
  ]);
  return jsonOut({ success: true, id: newId });
}

// ─────────────────────────────────────────────────────────────────
//  PARTNER LOGIN
// ─────────────────────────────────────────────────────────────────
function partnerLogin(code, pw) {
  if (!code || !pw) return jsonOut({ success: false });
  const sheet   = getPartnersSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const colCode   = headers.indexOf('code');
  const colPw     = headers.indexOf('pw');
  const colName   = headers.indexOf('name');
  const colTier   = headers.indexOf('tier');
  const colEmail  = headers.indexOf('email');
  const colStatus = headers.indexOf('status');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[colCode]) === String(code).toUpperCase()) {
      // 활성 파트너인지 확인
      const status = String(row[colStatus]||'');
      if (status !== 'active' && status !== 'gold') {
        return jsonOut({ success: false, error: 'not_active' });
      }
      // 비밀번호 확인 (초기 비번 = 파트너 코드)
      const storedPw = String(row[colPw]||row[colCode]);
      if (storedPw === String(pw)) {
        return jsonOut({
          success: true,
          partner: {
            code:  String(row[colCode]),
            name:  String(row[colName]||''),
            tier:  String(row[colTier]||'5-9'),
            email: String(row[colEmail]||'')
          }
        });
      } else {
        return jsonOut({ success: false });
      }
    }
  }
  return jsonOut({ success: false });
}

// ─────────────────────────────────────────────────────────────────
//  MATERIALS 시트
// ─────────────────────────────────────────────────────────────────
function getMaterialsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_MATERIALS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MATERIALS);
    sheet.appendRow(['id','title','category','fileType','url','description','visibleTo','uploadedAt','active']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,9).setFontWeight('bold');
    // 초기 자료 5개 (IR 제외)
    const today = Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
    const initData = [
      [1,'메리웰 브로셔','brochure','html','materials/MARRYWELL_brochure.html','고객 상담용 서비스 전체 소개 브로셔','all',today,true],
      [2,'고객 배포용 플라이어','flyer','html','materials/MARRYWELL_flyer_v2.html','가격표·혜택이 담긴 고객용 1페이지 플라이어','all',today,true],
    ];
    initData.forEach(row => sheet.appendRow(row));
  }
  return sheet;
}

function listMaterials(tier) {
  const sheet   = getMaterialsSheet();
  const rows    = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);
  const headers = rows[0];

  // 등급 허용 범위: all=모두, silver=Silver+Gold, gold=Gold만
  const tierLevel = { 'basic':1,'1-4':1,'silver':2,'5-9':2,'gold':3,'10+':3 };
  const pLevel    = tierLevel[String(tier).toLowerCase()] || 1;

  const visLevel = { 'all':1, 'silver':2, 'gold':3 };

  const result = rows.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter(m => {
      if (!m.active) return false;
      const required = visLevel[String(m.visibleTo).toLowerCase()] || 1;
      return pLevel >= required;
    });

  return jsonOut(result);
}

function addMaterial(data) {
  const sheet   = getMaterialsSheet();
  const lastRow = sheet.getLastRow();
  const newId   = lastRow; // 헤더 포함 행 번호 = ID (근사치)
  sheet.appendRow([
    newId,
    data.title       || '',
    data.category    || 'brochure',
    data.fileType    || 'html',
    data.url         || '',
    data.description || '',
    data.visibleTo   || 'all',
    Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd'),
    true
  ]);
  return jsonOut({ success: true, id: newId });
}

function toggleMaterial(id, active) {
  const sheet   = getMaterialsSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol     = headers.indexOf('id');
  const activeCol = headers.indexOf('active');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i+1, activeCol+1).setValue(active);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'not found' });
}

function deleteMaterial(id) {
  const sheet   = getMaterialsSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'not found' });
}

// ─────────────────────────────────────────────────────────────────
//  REFERRALS 시트 (고객 명단)
// ─────────────────────────────────────────────────────────────────
function getReferralsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_REFERRALS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REFERRALS);
    sheet.appendRow(['id','partnerCode','partnerName','customerName','customerPhone','customerEmail','bizType','memo','submittedAt','status']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,10).setFontWeight('bold');
  }
  return sheet;
}

function listReferrals(partnerCode) {
  if (!partnerCode) return jsonOut([]);
  const sheet   = getReferralsSheet();
  const rows    = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);
  const headers = rows[0];
  const colCode = headers.indexOf('partnerCode');
  return jsonOut(
    rows.slice(1)
      .filter(row => String(row[colCode]) === String(partnerCode))
      .map(row => {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j]; });
        return obj;
      })
  );
}

function listAllReferrals() {
  const sheet   = getReferralsSheet();
  const rows    = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);
  const headers = rows[0];
  return jsonOut(rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  }));
}

function submitReferral(data) {
  const sheet = getReferralsSheet();
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const colPhone   = headers.indexOf('customerPhone');
  const colPartner = headers.indexOf('partnerCode');

  // 동일 파트너 + 동일 연락처 중복 방지
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][colPhone]) === String(data.customerPhone) &&
        String(rows[i][colPartner]) === String(data.partnerCode)) {
      return jsonOut({ success: false, error: 'duplicate' });
    }
  }

  const newId = rows.length; // 헤더 포함 행 수
  sheet.appendRow([
    newId,
    data.partnerCode    || '',
    data.partnerName    || '',
    data.customerName   || '',
    data.customerPhone  || '',
    data.customerEmail  || '',
    data.bizType        || '',
    data.memo           || '',
    data.submittedAt    || Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd'),
    'submitted'
  ]);
  return jsonOut({ success: true, id: newId });
}

function submitReferralBulk(data) {
  const sheet   = getReferralsSheet();
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const colPhone   = headers.indexOf('customerPhone');
  const colPartner = headers.indexOf('partnerCode');

  // 기존 연락처 Set
  const existingPhones = new Set(
    rows.slice(1)
      .filter(r => String(r[colPartner]) === String(data.partnerCode))
      .map(r => String(r[colPhone]))
  );

  const today   = Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  let added     = 0;
  let baseId    = rows.length;

  (data.rows || []).forEach(r => {
    if (!r.customerName || !r.customerPhone) return;
    if (existingPhones.has(String(r.customerPhone))) return;
    sheet.appendRow([
      baseId++,
      data.partnerCode || r.partnerCode || '',
      data.partnerName || r.partnerName || '',
      r.customerName  || '',
      r.customerPhone || '',
      r.customerEmail || '',
      r.bizType       || '',
      r.memo          || '',
      r.submittedAt   || today,
      'submitted'
    ]);
    existingPhones.add(String(r.customerPhone));
    added++;
  });

  return jsonOut({ success: true, added });
}

function updateReferralStatus(id, status) {
  const sheet   = getReferralsSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol     = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i+1, statusCol+1).setValue(status);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'not found' });
}

// ─────────────────────────────────────────────────────────────────
//  SETTLEMENTS 시트
// ─────────────────────────────────────────────────────────────────
function getSettlementsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SETTLEMENTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SETTLEMENTS);
    sheet.appendRow(['id','partnerCode','month','count','amount','status','payDate']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,7).setFontWeight('bold');
  }
  return sheet;
}

function listSettlements(partnerCode) {
  if (!partnerCode) return jsonOut([]);
  const sheet   = getSettlementsSheet();
  const rows    = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);
  const headers = rows[0];
  const colCode = headers.indexOf('partnerCode');
  return jsonOut(
    rows.slice(1)
      .filter(row => String(row[colCode]) === String(partnerCode))
      .map(row => {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j]; });
        return obj;
      })
      .sort((a, b) => String(b.month).localeCompare(String(a.month)))
  );
}

// ─────────────────────────────────────────────────────────────────
//  플라이어 이메일 발송
// ─────────────────────────────────────────────────────────────────
function buildFlyerHtml(flyerUrl) {
  var u = flyerUrl || 'https://partners.marrywell.co.kr';
  return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head>' +
  '<body style="margin:0;padding:0;" bgcolor="#EEF0FF">' +
  '<table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#EEF0FF"><tr><td align="center" style="padding:32px 0;">' +
  '<table border="0" cellpadding="0" cellspacing="0" width="580" bgcolor="#ffffff">' +

  '<tr><td bgcolor="#2c2c54" align="center" style="padding:40px;">' +
  '<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:10px;color:#F4C430;letter-spacing:3px;">MARRYWELL · PARTNER PROGRAM</p>' +
  '<p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:26px;font-weight:bold;color:#ffffff;line-height:1.4;">소개만 해도<br /><span style="color:#F4C430;">수익이 생깁니다.</span></p>' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#cccccc;line-height:1.8;">메리웰을 업체에 소개하고, 고객이 구매할 때마다<br /><b style="color:#ffffff;">건당 최대 페이백</b>을 받으세요.</p>' +
  '</td></tr>' +

  '<tr><td bgcolor="#f8f7ff" style="padding:24px 40px;">' +
  '<table border="0" cellpadding="8" cellspacing="0" width="100%"><tr>' +
  '<td align="center" width="33%" style="border-right:1px solid #ddd8f8;">' +
  '<p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:10px;color:#6C5CE7;font-weight:bold;">건당 최대</p>' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:34px;font-weight:bold;color:#2c2c54;">7만원</p>' +
  '</td>' +
  '<td align="center" width="33%" style="border-right:1px solid #ddd8f8;">' +
  '<p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:10px;color:#6C5CE7;font-weight:bold;">참여 비용</p>' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:28px;font-weight:bold;color:#2c2c54;">무료</p>' +
  '</td>' +
  '<td align="center" width="33%">' +
  '<p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:10px;color:#6C5CE7;font-weight:bold;">정산 주기</p>' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#2c2c54;">익월 15일</p>' +
  '</td>' +
  '</tr></table>' +
  '</td></tr>' +

  '<tr><td bgcolor="#ffffff" style="padding:28px 40px;">' +
  '<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#4B3BC7;">💰 등급별 페이백 구조</p>' +
  '<table border="0" cellpadding="12" cellspacing="4" width="100%"><tr>' +
  '<td bgcolor="#f8f9fa" align="center" width="33%">' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:#636e72;">BASIC</p>' +
  '<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#888888;">월 1~4건</p>' +
  '<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#636e72;">3만원</p>' +
  '<p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#aaaaaa;">39,900원↑ 결제 시</p>' +
  '</td>' +
  '<td bgcolor="#2c2c54" align="center" width="33%">' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:#F4C430;">SILVER ✦ 추천</p>' +
  '<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#aaaaaa;">월 5~9건</p>' +
  '<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#F4C430;">5만원</p>' +
  '<p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#888888;">59,800원↑ 결제 시</p>' +
  '</td>' +
  '<td bgcolor="#f8f9fa" align="center" width="33%">' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:#d68910;">GOLD ⭐</p>' +
  '<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#888888;">월 10건↑</p>' +
  '<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#e17055;">7만원</p>' +
  '<p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#aaaaaa;">99,000원↑ 결제 시</p>' +
  '</td>' +
  '</tr></table>' +
  '</td></tr>' +

  '<tr><td bgcolor="#f0efff" style="padding:24px 40px;">' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#333333;line-height:2.2;">' +
  '✅ &nbsp;참여 비용 없음 (완전 무료)<br />' +
  '✅ &nbsp;최소 실적 조건 없음<br />' +
  '✅ &nbsp;언제든 자유롭게 탈퇴 가능<br />' +
  '✅ &nbsp;24시간 내 전용 코드 발급' +
  '</p>' +
  '</td></tr>' +

  '<tr><td bgcolor="#ffffff" align="center" style="padding:28px 40px;">' +
  '<p style="margin:0 0 14px 0;">' +
  '<a href="' + u + '" style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;background-color:#4B3BC7;text-decoration:none;padding:12px 28px;display:inline-block;">📋 상세 내용 보기 →</a>' +
  '</p>' +
  '<p style="margin:0;">' +
  '<a href="https://partners.marrywell.co.kr/apply.html" style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#2c2c54;background-color:#F4C430;text-decoration:none;padding:14px 40px;display:inline-block;">무료로 파트너 신청하기 →</a>' +
  '</p>' +
  '</td></tr>' +

  '<tr><td bgcolor="#2c2c54" align="center" style="padding:16px 40px;">' +
  '<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#888888;">© MARRYWELL · AI Wedding Studio · partners.marrywell.co.kr</p>' +
  '</td></tr>' +

  '</table></td></tr></table></body></html>';
}

function sendFlyerEmail(data) {
  const recipients = data.recipients || [];
  const subject    = data.subject   || '[MARRYWELL] 파트너 제안서';
  const flyerUrl   = data.flyerUrl;
  const flyerType  = data.flyerType;
  const htmlBody   = data.htmlBody;

  if (!recipients.length) return jsonOut({ success: false, error: '수신자가 없습니다.' });

  try {
    var html;
    if (htmlBody) {
      html = htmlBody;
    } else {
      var url = flyerUrl || (flyerType == 2
        ? 'https://jinny777.github.io/marrywell-partner/materials/MARRYWELL_partner_flyer_A4.html'
        : 'https://jinny777.github.io/marrywell-partner/materials/MARRYWELL_partners_flyer.html');
      html = buildFlyerHtml(url);
    }

    const sent = [], failed = [];
    recipients.forEach(function(email) {
      email = String(email).trim();
      if (!email || !email.includes('@')) return;
      try {
        MailApp.sendEmail({
          to:       email,
          subject:  subject,
          body:     '파트너 수익 프로그램 안내입니다. HTML 이메일을 지원하는 클라이언트에서 확인해주세요.',
          htmlBody: html,
          name:     'MARRYWELL 파트너스'
        });
        sent.push(email);
      } catch(e) {
        failed.push(email);
      }
    });
    return jsonOut({ success: true, sent: sent.length, failed: failed.length, failedList: failed });
  } catch(e) {
    return jsonOut({ success: false, error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  공통 유틸
// ─────────────────────────────────────────────────────────────────
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
