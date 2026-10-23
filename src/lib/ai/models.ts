// 記録・連絡帳・支援計画の文章を書く AI のモデル。
// Haiku では入力をほぼそのまま返すことが多く「AI が弱い」と言われたため Sonnet にする。
export const WRITING_MODEL = 'claude-sonnet-5-5'

// 書く前に考えるので、考える深さを浅めにする。max_tokens も 2048 以上にとる
// （小さいと考えるだけで上限に達し、空の文章が返ることがあった）
export const WRITING_EFFORT = 'low' as const
