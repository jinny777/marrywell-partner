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
//  공통 유틸
// ─────────────────────────────────────────────────────────────────
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
