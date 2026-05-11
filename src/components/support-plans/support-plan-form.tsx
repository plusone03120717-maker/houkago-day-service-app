'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Wand2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { StarRating } from '@/components/ui/star-rating'

interface Props {
  childId: string
  childName: string
  diagnosis: string | null
  readOnly?: boolean
}

const AREAS = [
  {
    key: 'support_health_life',
    stateKey: 'healthLife',
    label: '① 健康・生活',
    placeholder: '手洗い・うがい・靴の脱ぎ履き・片付け・スケジュールの確認や見通しをもつことへの支援など',
  },
  {
    key: 'support_movement_sensory',
    stateKey: 'movementSensory',
    label: '② 運動・感覚',
    placeholder: '指先運動（ハサミ・ボタン掛け・ジップ・お箸）・全身運動（お散歩・かけっこ・縄跳び・自転車）への支援など',
  },
  {
    key: 'support_cognition_behavior',
    stateKey: 'cognitionBehavior',
    label: '③ 認知・行動',
    placeholder: '物の名前や色・相手の顔や動作・支援者からの指示・昨日や今日など時間の理解への支援など',
  },
  {
    key: 'support_language_communication',
    stateKey: 'languageCommunication',
    label: '④ 言語・コミュニケーション',
    placeholder: '挨拶・ちょうだい・嫌だ等の意思表示（非言語も含む）・相手の目・指差し・質問への回答への支援など',
  },
  {
    key: 'support_social_relationships',
    stateKey: 'socialRelationships',
    label: '⑤ 人間関係・社会性',
    placeholder: '友だちの認識と理解・身だしなみ・順番・時間やイベントの急遽の変更への対応への支援など',
  },
  {
    key: 'support_transition',
    stateKey: 'transition',
    label: '⑥ 移行支援',
    placeholder: '就学・進級・施設移行に向けた準備・関係機関との連携・本人の不安軽減への支援など',
  },
  {
    key: 'support_family',
    stateKey: 'family',
    label: '⑦ 家族支援',
    placeholder: '保護者への情報提供・育児相談・家庭での対応方法の共有・家族全体のウェルビーイング支援など',
  },
] as const

type AreaKey = typeof AREAS[number]['stateKey']
type AreaValues = Record<AreaKey, string>

export function SupportPlanForm({ childId, childName, diagnosis, readOnly }: Props) {
  if (readOnly) return null
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10))
  const [reviewDate, setReviewDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 6)
    return d.toISOString().slice(0, 10)
  })
  const [familyWishes, setFamilyWishes] = useState('')
  const [supportPolicy, setSupportPolicy] = useState('')
  const [longTermGoals, setLongTermGoals] = useState('')
  const [shortTermGoals, setShortTermGoals] = useState('')
  const [longTermGoalRating, setLongTermGoalRating] = useState<number | null>(null)
  const [shortTermGoalRating, setShortTermGoalRating] = useState<number | null>(null)
  const [areaValues, setAreaValues] = useState<AreaValues>({
    healthLife: '',
    movementSensory: '',
    cognitionBehavior: '',
    languageCommunication: '',
    socialRelationships: '',
    transition: '',
    family: '',
  })
  const [monitoringNotes, setMonitoringNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setArea = (stateKey: AreaKey, value: string) =>
    setAreaValues((prev) => ({ ...prev, [stateKey]: value }))

  const refineField = async (fieldType: string, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return
    setRefining(fieldType)
    try {
      const res = await fetch('/api/support-plans/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType, content: value }),
      })
      const json = await res.json()
      if (json.refined) setter(json.refined)
    } finally {
      setRefining(null)
    }
  }

  const handleGenerateAI = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/support-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId,
          childName,
          diagnosis,
          existing: { longTermGoals, shortTermGoals },
        }),
      })
      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`
        try { const j = await res.json(); errorMsg = j.error ?? errorMsg } catch { /* ignore */ }
        alert(`AI生成に失敗しました: ${errorMsg}`)
        return
      }
      const json = await res.json()
      if (json.familyWishes) setFamilyWishes(json.familyWishes)
      if (json.supportPolicy) setSupportPolicy(json.supportPolicy)
      if (json.longTermGoals) setLongTermGoals(json.longTermGoals)
      if (json.shortTermGoals) setShortTermGoals(json.shortTermGoals)
      if (json.supportHealthLife) setArea('healthLife', json.supportHealthLife)
      if (json.supportMovementSensory) setArea('movementSensory', json.supportMovementSensory)
      if (json.supportCognitionBehavior) setArea('cognitionBehavior', json.supportCognitionBehavior)
      if (json.supportLanguageCommunication) setArea('languageCommunication', json.supportLanguageCommunication)
      if (json.supportSocialRelationships) setArea('socialRelationships', json.supportSocialRelationships)
      if (json.supportTransition) setArea('transition', json.supportTransition)
      if (json.supportFamily) setArea('family', json.supportFamily)
    } catch (e) {
      alert('AI生成中にエラーが発生しました')
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async (status: 'draft' | 'active') => {
    setSaving(true)
    await supabase.from('support_plans').insert({
      child_id: childId,
      plan_date: planDate,
      review_date: reviewDate || null,
      status,
      long_term_goals: longTermGoals || null,
      short_term_goals: shortTermGoals || null,
      support_health_life: areaValues.healthLife || null,
      support_movement_sensory: areaValues.movementSensory || null,
      support_cognition_behavior: areaValues.cognitionBehavior || null,
      support_language_communication: areaValues.languageCommunication || null,
      support_social_relationships: areaValues.socialRelationships || null,
      support_transition: areaValues.transition || null,
      support_family: areaValues.family || null,
      family_wishes: familyWishes || null,
      support_policy: supportPolicy || null,
      monitoring_notes: monitoringNotes || null,
      long_term_goal_rating: longTermGoalRating || null,
      short_term_goal_rating: shortTermGoalRating || null,
    })
    setSaving(false)
    setOpen(false)
    setLongTermGoals('')
    setShortTermGoals('')
    setAreaValues({ healthLife: '', movementSensory: '', cognitionBehavior: '', languageCommunication: '', socialRelationships: '', transition: '', family: '' })
    setFamilyWishes('')
    setSupportPolicy('')
    setMonitoringNotes('')
    setLongTermGoalRating(null)
    setShortTermGoalRating(null)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-600" />
            新しい支援計画を作成
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">計画作成日</label>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">見直し予定日</label>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* AI下書き生成 */}
          <Button
            onClick={handleGenerateAI}
            disabled={generating}
            variant="outline"
            size="sm"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'AI生成中...' : 'AIで下書きを生成'}
          </Button>

          {/* 家族の意向 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">家族の意向</label>
              <button
                type="button"
                onClick={() => refineField('family_wishes', familyWishes, setFamilyWishes)}
                disabled={refining === 'family_wishes' || !familyWishes.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'family_wishes' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={familyWishes}
              onChange={(e) => setFamilyWishes(e.target.value)}
              rows={3}
              placeholder="例：集団の中でも自分らしく過ごせるようになってほしい"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* 支援の方針 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">支援の方針</label>
              <button
                type="button"
                onClick={() => refineField('support_policy', supportPolicy, setSupportPolicy)}
                disabled={refining === 'support_policy' || !supportPolicy.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'support_policy' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={supportPolicy}
              onChange={(e) => setSupportPolicy(e.target.value)}
              rows={3}
              placeholder="例：本人のペースを尊重し、安心できる環境の中で主体的な活動参加を促す"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* 長期目標 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">長期目標（6ヶ月〜1年）</label>
              <button
                type="button"
                onClick={() => refineField('long_term_goals', longTermGoals, setLongTermGoals)}
                disabled={refining === 'long_term_goals' || !longTermGoals.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'long_term_goals' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={longTermGoals}
              onChange={(e) => setLongTermGoals(e.target.value)}
              rows={3}
              placeholder="例：自分の気持ちを言葉で伝えられるようになる"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">達成度評価:</span>
              <StarRating value={longTermGoalRating} onChange={(v) => setLongTermGoalRating(v || null)} />
            </div>
          </div>

          {/* 短期目標 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">短期目標（3〜6ヶ月）</label>
              <button
                type="button"
                onClick={() => refineField('short_term_goals', shortTermGoals, setShortTermGoals)}
                disabled={refining === 'short_term_goals' || !shortTermGoals.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'short_term_goals' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={shortTermGoals}
              onChange={(e) => setShortTermGoals(e.target.value)}
              rows={3}
              placeholder="例：スタッフに要求を伝えるサインを使える"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">達成度評価:</span>
              <StarRating value={shortTermGoalRating} onChange={(v) => setShortTermGoalRating(v || null)} />
            </div>
          </div>

          {/* 支援内容（7領域） */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-600 border-b border-gray-100 pb-1">支援内容・方法（7領域）</p>
            {AREAS.map((area) => (
              <div key={area.key} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">{area.label}</label>
                  <button
                    type="button"
                    onClick={() => refineField(area.key, areaValues[area.stateKey], (v) => setArea(area.stateKey, v))}
                    disabled={refining === area.key || !areaValues[area.stateKey].trim()}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="h-3 w-3" />
                    {refining === area.key ? '整えています...' : '文章を整える'}
                  </button>
                </div>
                <textarea
                  value={areaValues[area.stateKey]}
                  onChange={(e) => setArea(area.stateKey, e.target.value)}
                  rows={2}
                  placeholder={area.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none bg-white"
                />
              </div>
            ))}
          </div>

          {/* モニタリング記録 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">モニタリング記録</label>
              <button
                type="button"
                onClick={() => refineField('monitoring_notes', monitoringNotes, setMonitoringNotes)}
                disabled={refining === 'monitoring_notes' || !monitoringNotes.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'monitoring_notes' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={monitoringNotes}
              onChange={(e) => setMonitoringNotes(e.target.value)}
              rows={3}
              placeholder="目標の達成状況・今後の課題など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleSave('draft')}
              disabled={saving}
              variant="outline"
              size="sm"
            >
              下書き保存
            </Button>
            <Button
              onClick={() => handleSave('active')}
              disabled={saving}
              size="sm"
            >
              {saving ? '保存中...' : '計画を確定'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
