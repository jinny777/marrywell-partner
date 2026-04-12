// ─────────────────────────────────────────────────
//  MARRYWELL 파트너스 — Google Apps Script 백엔드
//  배포: 웹 앱으로 배포 > 엑세스: 모든 사람 (익명 포함)
// ─────────────────────────────────────────────────

const SHEET_NAME = 'Partners';

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id','name','phone','email','sns','biz','tier','channel','msg','date','status','code','referrals','payback']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,14).setFontWeight('bold');
  }
  return sheet;
}

// ── GET: 목록 조회 / 상태 업데이트 ──────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';

  if (action === 'list') {
    return listPartners();
  }

  if (action === 'update') {
    const id     = e.parameter.id;
    const status = e.parameter.status;
    const code   = e.parameter.code;
    return updatePartner(id, status, code);
  }

  return jsonOut({ error: 'unknown action' });
}

// ── POST: 신규 신청 저장 ────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet();

    const lastRow = sheet.getLastRow();
    const newId   = Math.max(lastRow, 1); // 헤더 제외하면 행번호 = ID

    sheet.appendRow([
      newId,
      data.name    || '',
      data.phone   || '',
      data.email   || '',
      data.sns     || '',
      data.biz     || '',
      data.tier    || '5-9',
      data.channel || '',
      data.msg     || '',
      Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'),
      'pending',
      '',
      0,
      0
    ]);

    return jsonOut({ success: true, id: newId });
  } catch(err) {
    return jsonOut({ success: false, error: err.message });
  }
}

// ── 내부 함수 ───────────────────────────────────────
function listPartners() {
  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonOut([]);

  const headers = rows[0];
  const result  = rows.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  });
  return jsonOut(result);
}

function updatePartner(id, status, code) {
  const sheet   = getSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol     = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const codeCol   = headers.indexOf('code');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      if (status && statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue(status);
      if (code   && codeCol   >= 0) sheet.getRange(i + 1, codeCol   + 1).setValue(code);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'not found' });
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
