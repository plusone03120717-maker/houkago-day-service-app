'use client'

import { useCallback, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { DailyRecordForm } from './daily-record-form'
import { RecordsDayLayout, nextUnrecorded, recordHref, type RosterItem } from './records-day-layout'

type FormProps = Omit<ComponentProps<typeof DailyRecordForm>, 'onDirtyChange' | 'onSaveNext' | 'nextName' | 'positionLabel'>

/**
 * 日々の記録の1画面（左に一覧・右に入力）。
 * 保存すると、次の未記録の子を開く。子を変えるとフォームを作り直すので、前の子の文は残らない。
 */
export function RecordsDayView({ roster, form }: { roster: RosterItem[]; form: FormProps }) {
  const router = useRouter()
  const [dirty, setDirty] = useState(false)
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])
  const current = { childId: form.child.id, unitId: form.unitId }
  // 今の子は保存したら「済」になるので、次の子は今の子を外して探す
  const next = nextUnrecorded(roster, current)
  const index = roster.findIndex((r) => r.childId === current.childId && r.unitId === current.unitId)

  const onSaveNext = () => {
    setDirty(false)
    // 全員済みなら、今の子の画面のまま（左の一覧で全員「済」と分かる）
    if (next) router.push(recordHref(next, form.date))
  }

  return (
    <RecordsDayLayout roster={roster} date={form.date} current={current} dirty={dirty}>
      <DailyRecordForm
        key={`${form.child.id}:${form.unitId}:${form.date}`}
        {...form}
        onDirtyChange={onDirtyChange}
        onSaveNext={onSaveNext}
        nextName={next?.name ?? null}
        positionLabel={index >= 0 ? `${index + 1}人目 / ${roster.length}名` : undefined}
      />
    </RecordsDayLayout>
  )
}
