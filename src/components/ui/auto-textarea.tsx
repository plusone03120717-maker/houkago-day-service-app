'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// SSR では useLayoutEffect が警告を出すため、サーバー側は useEffect にフォールバックする
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export interface AutoTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 何も書かれていないときに確保する行数 */
  minRows?: number
  /** これを超えたら内部スクロールにする行数（未指定なら上限なしで伸び続ける） */
  maxRows?: number
}

/**
 * 入力量に合わせて高さが自動で伸びる textarea。
 *
 * 記述量が多い項目（モニタリング記録・支援計画・アセスメント・日誌など）で使う。
 * スクロールさせずに枠そのものを広げるので、書いた内容が一望できる。
 * 画面に描画されている高さがそのまま印刷されるため、印刷時も途中で切れない。
 */
export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  function AutoTextarea({ className, minRows = 2, maxRows, style, onChange, value, ...props }, forwardedRef) {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef],
    )

    const resize = React.useCallback(() => {
      const el = innerRef.current
      if (!el) return
      const cs = window.getComputedStyle(el)
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
      const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      // box-sizing: border-box 前提。scrollHeight は padding 込み・border 抜き。
      const min = Math.max(lineHeight * minRows + padding + border, parseFloat(cs.minHeight) || 0)
      const max = maxRows ? lineHeight * maxRows + padding + border : Number.POSITIVE_INFINITY

      el.style.height = 'auto'
      const content = el.scrollHeight + border
      el.style.height = `${Math.min(Math.max(content, min), max)}px`
      el.style.overflowY = content > max ? 'auto' : 'hidden'
    }, [minRows, maxRows])

    // 値が変わったとき（AI生成・文章整形など外から入る場合も含む）に追従
    useIsomorphicLayoutEffect(resize, [resize, value, props.defaultValue])

    // 幅が変わると折り返し行数が変わるので再計算
    React.useEffect(() => {
      const el = innerRef.current
      if (!el || typeof ResizeObserver === 'undefined') return
      let lastWidth = el.clientWidth
      const observer = new ResizeObserver(() => {
        if (el.clientWidth === lastWidth) return
        lastWidth = el.clientWidth
        resize()
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [resize])

    // 印刷時は用紙幅・印刷用スタイルで折り返しが変わるため、
    // 印刷レイアウトが確定した時点で測り直して内容が切れないようにする
    React.useEffect(() => {
      window.addEventListener('beforeprint', resize)
      window.addEventListener('afterprint', resize)
      return () => {
        window.removeEventListener('beforeprint', resize)
        window.removeEventListener('afterprint', resize)
      }
    }, [resize])

    return (
      <textarea
        ref={setRefs}
        rows={minRows}
        value={value}
        onChange={(e) => {
          onChange?.(e)
          resize()
        }}
        style={{ resize: 'none', ...style }}
        className={cn('block w-full', className)}
        {...props}
      />
    )
  },
)
