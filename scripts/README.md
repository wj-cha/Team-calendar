# 팀 캘린더 변경 알림 (매일 1회)

Supabase 데이터(`members`/`schedules`/`tasks`)를 매일 1회 조회해 직전 스냅샷과
비교하고, 변경(추가·수정·삭제)이 있으면 **wjcha@cswind.com** 으로 메일을 보냅니다.

- 스크립트: `scripts/check-calendar-changes.mjs`
- 상태 저장: `scripts/snapshot.json` (스크립트가 자동 생성·갱신, 매 실행 후 커밋)
- 의존성 없음 (Node 18+ 내장 `fetch` 사용)

## 동작 방식

1. Supabase REST API 로 3개 테이블 전체 조회
2. `snapshot.json`(직전 상태)과 비교 → 변경 항목 추출
3. 변경이 있으면 Resend API 로 알림 메일 발송
4. `snapshot.json` 갱신 → 커밋/푸시

> 첫 실행에는 비교 대상이 없으므로 베이스라인 스냅샷만 만들고 메일은 보내지 않습니다.
> (두 번째 실행부터 변경 감지)

## 로컬/수동 실행

```bash
# 미리보기(메일 발송 없이 콘솔 출력) — RESEND_API_KEY 없이 실행하면 dry-run
node scripts/check-calendar-changes.mjs

# 실제 발송
RESEND_API_KEY=re_xxx node scripts/check-calendar-changes.mjs
```

## Claude Code Routine 설정

### 1) 네트워크 egress 허용 (중요)

기본 환경은 신뢰 도메인만 허용하므로, 루틴 환경의 네트워크 설정에 아래 호스트를 추가하세요.

- `bcxvunprnbhhvgpbajvp.supabase.co` (Supabase)
- `api.resend.com` (메일 발송)

### 2) 환경변수 / 시크릿

| 변수 | 필수 | 설명 |
|------|------|------|
| `RESEND_API_KEY` | ✅ | Resend API 키 (`re_...`) |
| `MAIL_TO` | | 기본 `wjcha@cswind.com` |
| `MAIL_FROM` | | 기본 `onboarding@resend.dev` (도메인 인증 전 테스트용) |
| `SUPABASE_URL` / `SUPABASE_KEY` | | 미설정 시 `index.html` 의 공개 값 사용 |

> **Resend 발송 제한**: 도메인을 인증하기 전에는 발신 주소 `onboarding@resend.dev` 로
> **본인(Resend 가입 이메일) 에게만** 보낼 수 있습니다. 회사 메일 `wjcha@cswind.com` 로
> 안정적으로 받으려면 ① 해당 메일로 Resend 가입 후 테스트하거나, ② `cswind.com`(또는
> 임의 도메인)을 Resend 에서 인증하고 `MAIL_FROM` 을 그 도메인 주소로 설정하세요.

### 3) 루틴 트리거

- **Schedule**: 매일 1회 (예: 매일 오전 8시 KST)

### 4) 루틴 프롬프트 예시

```
저장소의 scripts/check-calendar-changes.mjs 를 실행해줘.
변경이 감지되면 스크립트가 wjcha@cswind.com 으로 메일을 보낸다.
실행 후 scripts/snapshot.json 이 변경되었다면 "chore: update calendar snapshot"
메시지로 커밋하고 현재 브랜치에 푸시해줘.
```

(스냅샷을 git 에 보관해 매일의 상태를 비교합니다. 매일 1건의 작은 커밋이 생깁니다.)
