#!/usr/bin/env node
/*
 * Team-calendar 변경 감지 (매일 1회 폴링)
 * --------------------------------------------------------------
 * 동작:
 *  1. Supabase REST API 로 members / schedules / tasks 전체 조회
 *  2. 직전 스냅샷(scripts/snapshot.json)과 비교해 추가/수정/삭제 추출
 *  3. 변경 내역을 표준출력으로 요약 (루틴이 이 출력을 메일 알림으로 전송)
 *  4. 스냅샷 파일 갱신 (루틴이 이후 커밋 & 푸시)
 *
 * 메일 발송은 Claude Routine 의 "알림 → 이메일"(계정 이메일로 전송) 기능이 담당합니다.
 * 따라서 이 스크립트는 변경 내역을 출력만 하고, 별도 메일 발송은 하지 않습니다.
 *
 * 환경변수(선택):
 *  SUPABASE_URL / SUPABASE_KEY  (미설정 시 index.html 의 공개 값 사용)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'snapshot.json');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bcxvunprnbhhvgpbajvp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjeHZ1bnBybmJoaHZncGJhanZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTEzMzMsImV4cCI6MjA5Mzk2NzMzM30.NtXnwMyV3afOi2a7jtpykBal-kKGMV1PagYJpibmmWY';

const TABLES = ['members', 'schedules', 'tasks'];

// 사람이 읽기 좋은 한글 라벨
const TABLE_LABEL = { members: '팀원', schedules: '일정', tasks: '업무' };
const FIELD_LABEL = {
  name: '이름', role: '역할', color: '색상',
  member_id: '담당자', type: '유형', start_date: '시작일', end_date: '종료일', memo: '메모',
  title: '제목', cat: '분류', pri: '우선순위', due_date: '마감일', assignees: '담당자', done: '완료',
};

async function sbGet(tbl) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tbl}?order=id`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${tbl} 조회 실패 (${r.status}): ${await r.text()}`);
  return r.json();
}

function indexById(rows) {
  const m = new Map();
  for (const row of rows) m.set(String(row.id), row);
  return m;
}

// 한 행을 사람이 읽기 좋은 문자열로 (담당자 id → 이름 치환)
function describeRow(tbl, row, memberName) {
  if (tbl === 'members') return `${row.name}${row.role ? ` (${row.role})` : ''}`;
  if (tbl === 'schedules')
    return `${memberName(row.member_id)} · ${row.type} · ${row.start_date}~${row.end_date}`;
  if (tbl === 'tasks') return `${row.title} [${row.cat}] (마감 ${row.due_date || '-'})`;
  return JSON.stringify(row);
}

function fieldValue(field, value, memberName) {
  if (value === null || value === undefined || value === '') return '(없음)';
  if (field === 'member_id') return memberName(value);
  if (field === 'assignees') {
    try {
      const ids = JSON.parse(value || '[]');
      return ids.map(memberName).join(', ') || '(없음)';
    } catch { return String(value); }
  }
  if (field === 'done') return value ? '완료' : '미완료';
  return String(value);
}

function diffTable(tbl, oldRows, newRows, memberName) {
  const oldIdx = indexById(oldRows || []);
  const newIdx = indexById(newRows || []);
  const added = [], removed = [], modified = [];

  for (const [id, row] of newIdx) if (!oldIdx.has(id)) added.push(row);
  for (const [id, row] of oldIdx) if (!newIdx.has(id)) removed.push(row);
  for (const [id, newRow] of newIdx) {
    if (!oldIdx.has(id)) continue;
    const oldRow = oldIdx.get(id);
    const changes = [];
    const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    for (const k of keys) {
      if (k === 'id') continue;
      if (JSON.stringify(oldRow[k]) !== JSON.stringify(newRow[k])) {
        changes.push({
          field: k,
          from: fieldValue(k, oldRow[k], memberName),
          to: fieldValue(k, newRow[k], memberName),
        });
      }
    }
    if (changes.length) modified.push({ row: newRow, changes });
  }
  return { added, removed, modified };
}

function renderText(diffs, memberName) {
  const lines = [];
  for (const tbl of TABLES) {
    const d = diffs[tbl];
    if (!d.added.length && !d.removed.length && !d.modified.length) continue;
    lines.push(`\n■ ${TABLE_LABEL[tbl]}`);
    for (const row of d.added) lines.push(`  [추가] ${describeRow(tbl, row, memberName)}`);
    for (const row of d.removed) lines.push(`  [삭제] ${describeRow(tbl, row, memberName)}`);
    for (const m of d.modified) {
      lines.push(`  [수정] ${describeRow(tbl, m.row, memberName)}`);
      for (const c of m.changes)
        lines.push(`         · ${FIELD_LABEL[c.field] || c.field}: ${c.from} → ${c.to}`);
    }
  }
  return lines.join('\n');
}

async function loadSnapshot() {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const [members, schedules, tasks] = await Promise.all(TABLES.map(sbGet));
  const current = { members, schedules, tasks };

  const memberNameMap = new Map(members.map((m) => [String(m.id), m.name]));
  const memberName = (id) => memberNameMap.get(String(id)) || `#${id}`;

  const prev = await loadSnapshot();

  if (!prev) {
    await writeFile(SNAPSHOT_PATH, JSON.stringify(current, null, 2));
    console.log('NO_CHANGES: 첫 실행 — 베이스라인 스냅샷을 생성했습니다.');
    return;
  }

  const diffs = {};
  let changed = 0;
  for (const tbl of TABLES) {
    diffs[tbl] = diffTable(tbl, prev[tbl], current[tbl], memberName);
    changed += diffs[tbl].added.length + diffs[tbl].removed.length + diffs[tbl].modified.length;
  }

  if (changed === 0) {
    console.log('NO_CHANGES: 변경 사항 없음.');
    return;
  }

  // 루틴이 이 출력을 읽어 이메일 알림 본문으로 사용합니다.
  console.log(`CHANGES: 팀 캘린더에 ${changed}건의 변경이 있었습니다.`);
  console.log(renderText(diffs, memberName));

  await writeFile(SNAPSHOT_PATH, JSON.stringify(current, null, 2));
}

main().catch((e) => {
  console.error('오류:', e.message);
  process.exit(1);
});
