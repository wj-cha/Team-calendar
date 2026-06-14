# 팀 캘린더 변경 알림 (매일 1회)

Supabase 데이터(`members`/`schedules`/`tasks`)를 매일 1회 조회해 직전 스냅샷과
비교하고, 변경(추가·수정·삭제)이 있으면 **Claude Routine 의 이메일 알림**으로
계정 이메일에 요약을 보냅니다. (별도 메일 서비스 불필요)

- 스크립트: `scripts/check-calendar-changes.mjs`
- 상태 저장: `scripts/snapshot.json` (스크립트가 자동 생성·갱신, 매 실행 후 커밋)
- 의존성 없음 (Node 18+ 내장 `fetch` 사용)

## 동작 방식

1. Supabase REST API 로 3개 테이블 전체 조회
2. `snapshot.json`(직전 상태)과 비교 → 변경 항목 추출
3. 변경이 있으면 `CHANGES: ...` 형식으로 변경 내역을 출력
   (변경이 없으면 `NO_CHANGES: ...`)
4. `snapshot.json` 갱신 → 루틴이 커밋/푸시
5. 메일 발송은 루틴의 **알림 → 이메일** 기능이 담당 (스크립트 출력을 요약해 전송)

> 첫 실행에는 비교 대상이 없으므로 베이스라인 스냅샷만 만들고 알림은 보내지 않습니다.
> (두 번째 실행부터 변경 감지)

## 로컬/수동 실행

```bash
node scripts/check-calendar-changes.mjs
```

## Claude Code Routine 설정

### 1) 네트워크 egress 허용 (필수)

기본 환경은 신뢰 도메인만 허용하므로, 루틴 환경의 네트워크 설정에 아래 호스트를 추가하세요.

- `bcxvunprnbhhvgpbajvp.supabase.co` (Supabase)

### 2) 트리거

- **스케줄**: 매일 1회 (예: 매일 오전 8시 KST)

### 3) 알림 탭

- **이메일** 체크 → 계정 이메일 주소로 요약 전송
  (조건 감시 루틴이므로 변경이 있을 때만 메일이 옵니다)
- 푸시 알림도 원하면 함께 체크

> 메일은 **계정 이메일** 로 전송됩니다. 다른 주소(예: 회사 메일)로 받으려면
> Resend 같은 외부 메일 발송이 별도로 필요합니다.

### 4) 루틴 프롬프트 예시

```
저장소의 scripts/check-calendar-changes.mjs 를 실행해줘.
- 출력이 "CHANGES:" 로 시작하면, 그 변경 내역을 보기 좋게 요약해서 알려줘.
- 출력이 "NO_CHANGES:" 면 변경 없음으로 처리하고 별도 보고는 하지 마.
실행 후 scripts/snapshot.json 이 변경되었다면 "chore: update calendar snapshot"
메시지로 커밋하고 현재 브랜치에 푸시해줘.
```

(스냅샷을 git 에 보관해 매일의 상태를 비교합니다. 변경이 있는 날만 작은 커밋이 생깁니다.)
